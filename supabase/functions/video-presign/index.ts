// Supabase Edge Function: video-presign
// Generates S3 SigV4 presigned URLs and manages multipart upload for Cloudflare R2 bucket 'tcl-videos'
// Runs on Deno runtime inside Supabase Edge Functions.

import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPosterKey,
  buildVideoSourceKey,
  buildSubtitleKey,
  validateVideoPresignRequest,
  escapeXml,
  getCorsHeaders,
  PUT_EXPIRATION_SECONDS,
  PLAYBACK_EXPIRATION_SECONDS,
  DEFAULT_PART_SIZE,
  WARNING_THRESHOLD_BYTES,
  ESTIMATED_COMIC_STORAGE_BYTES,
} from './validate.ts';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const corsHeaders = getCorsHeaders(origin);

  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Phương thức không được hỗ trợ', code: 'METHOD_NOT_ALLOWED' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 2. Read Secrets from Environment
    const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') || '';
    const R2_ACCESS_KEY_ID = Deno.env.get('R2_VIDEO_ACCESS_KEY_ID') || Deno.env.get('R2_ACCESS_KEY_ID') || '';
    const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_VIDEO_SECRET_ACCESS_KEY') || Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
    const R2_BUCKET = Deno.env.get('R2_VIDEO_BUCKET') || 'tcl-videos';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      return new Response(
        JSON.stringify({
          error: 'Cloudflare R2 chưa được cấu hình (thiếu biến môi trường R2)',
          code: 'R2_CONFIG_MISSING',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Authenticate User via Supabase JWT
    const authHeader = req.headers.get('Authorization') || '';
    let currentUser: any = null;
    let isUserAdmin = false;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    if (authHeader.startsWith('Bearer ')) {
      const supabaseAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });

      const { data: { user } } = await supabaseAuthClient.auth.getUser();
      if (user) {
        currentUser = user;
        // Verify admin status server-side strictly
        if (user.app_metadata?.role === 'admin') {
          isUserAdmin = true;
        } else {
          const { data: adminRow } = await supabaseAdmin
            .from('video_admins')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (adminRow) {
            isUserAdmin = true;
          }
        }
      }
    }

    // 4. Parse & Validate Request Body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Payload không phải là định dạng JSON hợp lệ', code: 'INVALID_JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = validateVideoPresignRequest(body);
    if (!validation.ok) {
      return new Response(
        JSON.stringify({ error: validation.error, code: validation.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, seriesId, episodeId } = validation.data;

    // 5. Initialize AWS S3 Client for Cloudflare R2
    const aws = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });

    const r2Endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;

    // Helper: Admin Guard
    const requireAdmin = () => {
      if (!currentUser || !isUserAdmin) {
        return new Response(
          JSON.stringify({
            error: 'Quyền truy cập bị từ chối: Yêu cầu quyền quản trị viên video.',
            code: 'FORBIDDEN',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return null;
    };

    // Helper: Abort R2 Multipart Upload session
    const abortR2Multipart = async (key: string, uploadId: string): Promise<boolean> => {
      try {
        const abortUrl = new URL(`${r2Endpoint}/${key}`);
        abortUrl.searchParams.set('uploadId', uploadId);
        const signedAbort = await aws.sign(abortUrl.toString(), { method: 'DELETE' });
        const res = await fetch(signedAbort.url, { method: 'DELETE', headers: signedAbort.headers });
        return res.ok || res.status === 204 || res.status === 404;
      } catch (abortErr) {
        console.warn('[video-presign] Failed to abort multipart on R2:', abortErr);
        return false;
      }
    };

    // Helper: List all R2 objects with S3 ListObjectsV2 pagination (IsTruncated + NextContinuationToken)
    interface R2ObjectItem {
      key: string;
      size: number;
    }

    const listAllR2Objects = async (
      prefix: string,
      maxPages = 50
    ): Promise<{ ok: boolean; objects: R2ObjectItem[]; error?: string }> => {
      const allObjects: R2ObjectItem[] = [];
      let continuationToken: string | null = null;
      let pageCount = 0;

      while (pageCount < maxPages) {
        pageCount++;
        const listUrl = new URL(r2Endpoint);
        listUrl.searchParams.set('list-type', '2');
        listUrl.searchParams.set('prefix', prefix);
        if (continuationToken) {
          listUrl.searchParams.set('continuation-token', continuationToken);
        }

        let listRes: Response;
        try {
          const signedList = await aws.sign(listUrl.toString(), { method: 'GET' });
          listRes = await fetch(signedList.url, { headers: signedList.headers });
        } catch (fetchErr: any) {
          return {
            ok: false,
            objects: allObjects,
            error: `Lỗi kết nối khi liệt kê tệp R2: ${fetchErr?.message || fetchErr}`,
          };
        }

        if (!listRes.ok) {
          const errText = await listRes.text().catch(() => '');
          return {
            ok: false,
            objects: allObjects,
            error: `R2 ListObjectsV2 thất bại (HTTP ${listRes.status}): ${errText}`,
          };
        }

        const xml = await listRes.text();

        // Extract object keys and sizes from <Contents> blocks
        const contentsMatches = xml.match(/<Contents>([\s\S]*?)<\/Contents>/g) || [];
        for (const contentXml of contentsMatches) {
          const keyMatch = contentXml.match(/<Key>(.*?)<\/Key>/);
          const sizeMatch = contentXml.match(/<Size>(\d+)<\/Size>/);
          if (keyMatch) {
            allObjects.push({
              key: keyMatch[1],
              size: sizeMatch ? parseInt(sizeMatch[1], 10) || 0 : 0,
            });
          }
        }

        // Check if there are more keys / truncated
        const isTruncatedMatch = xml.match(/<IsTruncated>(true|false)<\/IsTruncated>/i);
        const isTruncated = isTruncatedMatch ? isTruncatedMatch[1].toLowerCase() === 'true' : false;
        const nextTokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
        const nextToken = nextTokenMatch ? nextTokenMatch[1] : null;

        if (isTruncated && nextToken) {
          continuationToken = nextToken;
        } else if (isTruncated && !nextToken) {
          return {
            ok: false,
            objects: allObjects,
            error: 'R2 báo còn trang (IsTruncated=true) nhưng thiếu NextContinuationToken',
          };
        } else {
          return { ok: true, objects: allObjects };
        }
      }

      return {
        ok: false,
        objects: allObjects,
        error: `Số lượng trang liệt kê vượt quá giới hạn an toàn (${maxPages} trang)`,
      };
    };

    // --------------------------------------------------------------------------
    // ACTION: get-storage-stats
    // --------------------------------------------------------------------------
    if (action === 'get-storage-stats') {
      // 1. Get database tracked file_size sum
      const { data: episodesData, error: epErr } = await supabaseAdmin
        .from('video_episodes')
        .select('file_size')
        .eq('upload_status', 'ready');

      let dbTrackedVideoBytes = 0;
      if (!epErr && episodesData) {
        dbTrackedVideoBytes = episodesData.reduce((acc, row) => acc + (Number(row.file_size) || 0), 0);
      }

      // 2. Query R2 bucket directly via S3 ListObjectsV2 under videos/ prefix with full pagination
      let actualR2VideoBytes: number | null = null;
      let isR2ActualAvailable = false;

      const listResult = await listAllR2Objects('videos/');
      if (listResult.ok) {
        actualR2VideoBytes = listResult.objects.reduce((acc, obj) => acc + (obj.size || 0), 0);
        isR2ActualAvailable = true;
      } else {
        console.warn('[video-presign] R2 list objects for storage stats failed or incomplete:', listResult.error);
        actualR2VideoBytes = null;
        isR2ActualAvailable = false;
      }

      const comicStorageBytes = Math.round(ESTIMATED_COMIC_STORAGE_BYTES);
      const effectiveVideoBytes = isR2ActualAvailable && actualR2VideoBytes !== null ? actualR2VideoBytes : dbTrackedVideoBytes;
      const totalStorageBytesEstimated = effectiveVideoBytes + comicStorageBytes;
      const isOverThreshold = totalStorageBytesEstimated >= WARNING_THRESHOLD_BYTES;

      return new Response(
        JSON.stringify({
          dbTrackedVideoBytes,
          actualR2VideoBytes,
          isR2ActualAvailable,
          comicStorageBytesEstimated: comicStorageBytes,
          totalStorageBytesEstimated,
          warningThresholdBytes: WARNING_THRESHOLD_BYTES,
          isOverThreshold,
          bucket: R2_BUCKET,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: get-upload-url (Poster or Subtitle - Admin Only)
    // --------------------------------------------------------------------------
    if (action === 'get-upload-url') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const { targetType, ext, lang, mimeType } = validation.data;
      let key = '';
      if (targetType === 'poster') {
        key = buildPosterKey(seriesId, ext);
      } else {
        key = buildSubtitleKey(seriesId, episodeId, lang);
      }

      const url = new URL(`${r2Endpoint}/${key}`);
      url.searchParams.set('X-Amz-Expires', String(PUT_EXPIRATION_SECONDS));
      const signed = await aws.sign(url.toString(), {
        method: 'PUT',
        headers: mimeType ? { 'Content-Type': mimeType } : undefined,
        aws: { signQuery: true },
      });

      return new Response(
        JSON.stringify({
          uploadUrl: signed.url,
          r2Key: key,
          expiresIn: PUT_EXPIRATION_SECONDS,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: init-multipart-upload (Video MP4 - Admin Only)
    // --------------------------------------------------------------------------
    if (action === 'init-multipart-upload') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const { fileSize, mimeType } = validation.data;
      const key = buildVideoSourceKey(seriesId, episodeId);

      // Precondition: Verify target episode exists and belongs to seriesId
      const { data: targetEp, error: targetEpErr } = await supabaseAdmin
        .from('video_episodes')
        .select('id, series_id, upload_status')
        .eq('id', episodeId)
        .eq('series_id', seriesId)
        .maybeSingle();

      if (targetEpErr || !targetEp) {
        return new Response(
          JSON.stringify({ error: 'Tập phim không tồn tại hoặc không thuộc bộ phim này', code: 'EPISODE_NOT_FOUND' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check storage threshold warning
      const { data: epRows } = await supabaseAdmin
        .from('video_episodes')
        .select('file_size')
        .eq('upload_status', 'ready');
      const currentVideoBytes = (epRows || []).reduce((acc, r) => acc + (Number(r.file_size) || 0), 0);
      const projectedTotal = currentVideoBytes + Math.round(ESTIMATED_COMIC_STORAGE_BYTES) + fileSize;
      const isThresholdExceeded = projectedTotal >= WARNING_THRESHOLD_BYTES;

      // Initiate S3 Multipart Upload
      const initUrl = new URL(`${r2Endpoint}/${key}?uploads`);
      const signedInit = await aws.sign(initUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
      });

      const initRes = await fetch(signedInit.url, {
        method: 'POST',
        headers: signedInit.headers,
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        console.error('[R2 Init Multipart Error]:', initRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Không thể khởi tạo multipart upload trên R2: ${errText}`, code: 'R2_INIT_FAILED' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const xml = await initRes.text();
      const uploadIdMatch = xml.match(/<UploadId>(.*?)<\/UploadId>/);
      const uploadId = uploadIdMatch ? uploadIdMatch[1] : null;

      if (!uploadId) {
        return new Response(
          JSON.stringify({ error: 'R2 không trả về UploadId hợp lệ', code: 'R2_MISSING_UPLOAD_ID' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const partSize = DEFAULT_PART_SIZE;
      const totalParts = Math.max(1, Math.ceil(fileSize / partSize));

      // Record upload session in database
      const { error: sessErr } = await supabaseAdmin.from('video_upload_sessions').insert({
        series_id: seriesId,
        episode_id: episodeId,
        upload_id: uploadId,
        r2_key: key,
        part_size: partSize,
        total_parts: totalParts,
        file_size: fileSize,
        status: 'in_progress',
      });

      if (sessErr) {
        console.error('[video-presign] Failed to create upload session:', sessErr);
        // Cleanup initiated R2 multipart session
        await abortR2Multipart(key, uploadId);
        return new Response(
          JSON.stringify({
            error: `Lỗi ghi phiên upload vào cơ sở dữ liệu: ${sessErr.message}. Phiên R2 đã được dọn dẹp.`,
            code: 'SESSION_CREATE_FAILED',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update episode record
      const { error: epErr } = await supabaseAdmin
        .from('video_episodes')
        .update({
          r2_key: key,
          file_size: fileSize,
          upload_status: 'uploading',
          mime_type: mimeType,
        })
        .eq('id', episodeId);

      if (epErr) {
        console.error('[video-presign] Failed to update episode for upload:', epErr);
        // Cleanup initiated R2 multipart session and mark DB session aborted to maintain consistent state
        await abortR2Multipart(key, uploadId);
        await supabaseAdmin
          .from('video_upload_sessions')
          .update({ status: 'aborted' })
          .eq('upload_id', uploadId);

        return new Response(
          JSON.stringify({
            error: `Lỗi cập nhật tập phim trong cơ sở dữ liệu: ${epErr.message}. Phiên upload đã được hủy an toàn.`,
            code: 'DB_UPDATE_FAILED',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          uploadId,
          r2Key: key,
          partSize,
          totalParts,
          isThresholdExceeded,
          projectedTotalBytes: projectedTotal,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: get-part-url (Part Presign - Admin Only & Session Verified)
    // --------------------------------------------------------------------------
    if (action === 'get-part-url') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const { uploadId, partNumber } = validation.data;
      const key = buildVideoSourceKey(seriesId, episodeId);

      // Verify upload session in database server-side
      const { data: session, error: sessErr } = await supabaseAdmin
        .from('video_upload_sessions')
        .select('id, series_id, episode_id, upload_id, r2_key, status, total_parts, file_size')
        .eq('upload_id', uploadId)
        .maybeSingle();

      if (sessErr || !session) {
        return new Response(
          JSON.stringify({ error: 'Phiên upload không tồn tại hoặc uploadId không hợp lệ', code: 'SESSION_NOT_FOUND' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.series_id !== seriesId || session.episode_id !== episodeId) {
        return new Response(
          JSON.stringify({ error: 'Phiên upload không khớp với bộ phim hoặc tập phim được yêu cầu', code: 'SESSION_MISMATCH' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.r2_key !== key) {
        return new Response(
          JSON.stringify({ error: 'Khóa lưu trữ R2 của phiên không khớp', code: 'KEY_MISMATCH' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.status !== 'in_progress') {
        return new Response(
          JSON.stringify({ error: `Phiên upload không còn hoạt động (trạng thái: ${session.status})`, code: 'SESSION_NOT_ACTIVE' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (partNumber < 1 || partNumber > session.total_parts) {
        return new Response(
          JSON.stringify({ error: `partNumber ${partNumber} vượt quá tổng số part (${session.total_parts}) của phiên`, code: 'PART_OUT_OF_RANGE' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const partUrl = new URL(`${r2Endpoint}/${key}`);
      partUrl.searchParams.set('partNumber', String(partNumber));
      partUrl.searchParams.set('uploadId', uploadId);
      partUrl.searchParams.set('X-Amz-Expires', String(PUT_EXPIRATION_SECONDS));

      const signed = await aws.sign(partUrl.toString(), {
        method: 'PUT',
        aws: { signQuery: true },
      });

      return new Response(
        JSON.stringify({
          partUrl: signed.url,
          partNumber,
          uploadId,
          expiresIn: PUT_EXPIRATION_SECONDS,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: complete-multipart-upload (Admin Only & Verification Required)
    // --------------------------------------------------------------------------
    if (action === 'complete-multipart-upload') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const { uploadId, parts } = validation.data;
      const key = buildVideoSourceKey(seriesId, episodeId);

      // Verify upload session in database server-side
      const { data: session, error: sessErr } = await supabaseAdmin
        .from('video_upload_sessions')
        .select('id, series_id, episode_id, upload_id, r2_key, status, total_parts, file_size')
        .eq('upload_id', uploadId)
        .maybeSingle();

      if (sessErr || !session) {
        return new Response(
          JSON.stringify({ error: 'Phiên upload không tồn tại hoặc uploadId không hợp lệ', code: 'SESSION_NOT_FOUND' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.series_id !== seriesId || session.episode_id !== episodeId) {
        return new Response(
          JSON.stringify({ error: 'Phiên upload không khớp với tập phim', code: 'SESSION_MISMATCH' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.status !== 'in_progress') {
        return new Response(
          JSON.stringify({ error: `Phiên upload không ở trạng thái in_progress (trạng thái: ${session.status})`, code: 'SESSION_NOT_ACTIVE' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (parts.length !== session.total_parts) {
        return new Response(
          JSON.stringify({
            error: `Số lượng part hoàn tất (${parts.length}) không khớp với tổng số part của phiên (${session.total_parts})`,
            code: 'PARTS_COUNT_MISMATCH',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sort parts by PartNumber ascending and verify contiguous sequence 1..total_parts
      const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
      for (let i = 0; i < sortedParts.length; i++) {
        if (sortedParts[i].PartNumber !== i + 1) {
          return new Response(
            JSON.stringify({ error: `Dãy part không liên tục: thiếu part ${i + 1}`, code: 'INCOMPLETE_PARTS_SEQUENCE' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // XML body construction with safe XML escaping
      const xmlBody =
        '<CompleteMultipartUpload>' +
        sortedParts
          .map((p) => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>"${escapeXml(p.ETag)}"</ETag></Part>`)
          .join('') +
        '</CompleteMultipartUpload>';

      const completeUrl = new URL(`${r2Endpoint}/${key}`);
      completeUrl.searchParams.set('uploadId', uploadId);

      const signedComplete = await aws.sign(completeUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlBody,
      });

      const completeRes = await fetch(signedComplete.url, {
        method: 'POST',
        headers: signedComplete.headers,
        body: xmlBody,
      });

      if (!completeRes.ok) {
        const errText = await completeRes.text();
        console.error('[R2 Complete Multipart Error]:', completeRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Hoàn tất multipart upload thất bại trên R2: ${errText}`, code: 'R2_COMPLETE_FAILED' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify object exists and get actual size via HEAD
      const headUrl = `${r2Endpoint}/${key}`;
      const signedHead = await aws.sign(headUrl, { method: 'HEAD' });
      const headRes = await fetch(signedHead.url, { method: 'HEAD', headers: signedHead.headers });

      if (!headRes.ok) {
        console.error('[R2 HEAD Verify Error]:', headRes.status);
        return new Response(
          JSON.stringify({
            error: `Không thể xác minh tệp video trên R2 sau khi hoàn tất multipart (HTTP ${headRes.status}). Không đánh dấu tập phim sẵn sàng.`,
            code: 'R2_HEAD_FAILED',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const lenHeader = headRes.headers.get('content-length');
      const actualSize = lenHeader ? parseInt(lenHeader, 10) : 0;

      // Verify size matches session file_size
      if (actualSize <= 0 || (session.file_size > 0 && actualSize !== session.file_size)) {
        console.error(`[R2 Size Mismatch]: actual=${actualSize}, expected=${session.file_size}`);
        return new Response(
          JSON.stringify({
            error: `Kích thước tệp trên R2 (${actualSize} bytes) không khớp với dung lượng dự kiến của phiên (${session.file_size} bytes).`,
            code: 'FILE_SIZE_MISMATCH',
            actualSize,
            expectedSize: session.file_size,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update episode record to 'ready'
      const { error: epUpdateErr } = await supabaseAdmin
        .from('video_episodes')
        .update({
          upload_status: 'ready',
          file_size: actualSize,
        })
        .eq('id', episodeId);

      if (epUpdateErr) {
        console.error('[video-presign] Failed to update episode ready status:', epUpdateErr);
        return new Response(
          JSON.stringify({
            error: `Lỗi cập nhật trạng thái tập phim vào cơ sở dữ liệu: ${epUpdateErr.message}`,
            code: 'DB_UPDATE_FAILED',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update session record to completed
      const { error: sessUpdateErr } = await supabaseAdmin
        .from('video_upload_sessions')
        .update({ status: 'completed' })
        .eq('upload_id', uploadId);

      if (sessUpdateErr) {
        console.error('[video-presign] Failed to mark session completed:', sessUpdateErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          episodeId,
          r2Key: key,
          fileSize: actualSize,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: abort-multipart-upload (Admin Only & Session Verified)
    // --------------------------------------------------------------------------
    if (action === 'abort-multipart-upload') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const { uploadId } = validation.data;
      const expectedKey = buildVideoSourceKey(seriesId, episodeId);

      // Verify session exists and belongs to this series, episode and key
      const { data: session, error: sessErr } = await supabaseAdmin
        .from('video_upload_sessions')
        .select('id, series_id, episode_id, r2_key, status')
        .eq('upload_id', uploadId)
        .maybeSingle();

      if (sessErr || !session) {
        return new Response(
          JSON.stringify({ error: 'Phiên upload không tồn tại hoặc uploadId không hợp lệ', code: 'SESSION_NOT_FOUND' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.series_id !== seriesId || session.episode_id !== episodeId) {
        return new Response(
          JSON.stringify({ error: 'Phiên upload không khớp với bộ phim hoặc tập phim được yêu cầu', code: 'SESSION_MISMATCH' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.r2_key !== expectedKey) {
        return new Response(
          JSON.stringify({ error: 'Khóa lưu trữ R2 của phiên không khớp', code: 'KEY_MISMATCH' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if session is in an abortable status
      if (session.status !== 'in_progress') {
        return new Response(
          JSON.stringify({
            error: `Phiên upload không ở trạng thái cho phép hủy (trạng thái hiện tại: ${session.status})`,
            code: 'SESSION_NOT_ABORTABLE',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Abort multipart on Cloudflare R2
      const abortUrl = new URL(`${r2Endpoint}/${expectedKey}`);
      abortUrl.searchParams.set('uploadId', uploadId);

      let abortRes: Response;
      try {
        const signedAbort = await aws.sign(abortUrl.toString(), {
          method: 'DELETE',
        });
        abortRes = await fetch(signedAbort.url, {
          method: 'DELETE',
          headers: signedAbort.headers,
        });
      } catch (fetchErr: any) {
        return new Response(
          JSON.stringify({
            error: `Lỗi kết nối khi gửi yêu cầu hủy multipart lên R2: ${fetchErr?.message || fetchErr}`,
            code: 'R2_ABORT_FAILED',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // S3 AbortMultipartUpload returns 204 No Content on success. If already aborted or expired, 404 can be tolerated.
      if (!abortRes.ok && abortRes.status !== 204 && abortRes.status !== 404) {
        const errText = await abortRes.text().catch(() => '');
        console.error('[R2 Abort Multipart Error]:', abortRes.status, errText);
        return new Response(
          JSON.stringify({
            error: `Hủy multipart upload trên R2 thất bại (HTTP ${abortRes.status}): ${errText}`,
            code: 'R2_ABORT_FAILED',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Only update database after R2 abort succeeds
      const { error: sessUpdateErr } = await supabaseAdmin
        .from('video_upload_sessions')
        .update({ status: 'aborted' })
        .eq('upload_id', uploadId);

      if (sessUpdateErr) {
        console.error('[video-presign] Failed to update session to aborted in DB:', sessUpdateErr);
        return new Response(
          JSON.stringify({
            error: `Lỗi cập nhật phiên upload trong cơ sở dữ liệu: ${sessUpdateErr.message}`,
            code: 'DB_UPDATE_FAILED',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: epUpdateErr } = await supabaseAdmin
        .from('video_episodes')
        .update({ upload_status: 'failed' })
        .eq('id', episodeId)
        .eq('upload_status', 'uploading');

      if (epUpdateErr) {
        console.error('[video-presign] Failed to update episode to failed in DB:', epUpdateErr);
        return new Response(
          JSON.stringify({
            error: `Lỗi cập nhật trạng thái tập phim trong cơ sở dữ liệu: ${epUpdateErr.message}`,
            code: 'DB_UPDATE_FAILED',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, aborted: true, uploadId, episodeId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: get-playback-url (Presigned GET for Video + Subtitle)
    // --------------------------------------------------------------------------
    if (action === 'get-playback-url') {
      // Check permissions: non-admin must satisfy:
      // 1. Episode belongs to requested seriesId
      // 2. Episode published = true and upload_status = 'ready'
      // 3. Parent series published = true
      if (!isUserAdmin) {
        const { data: epRow, error: epErr } = await supabaseAdmin
          .from('video_episodes')
          .select('id, series_id, published, upload_status')
          .eq('id', episodeId)
          .eq('series_id', seriesId)
          .maybeSingle();

        if (epErr || !epRow || !epRow.published || epRow.upload_status !== 'ready') {
          return new Response(
            JSON.stringify({
              error: 'Tập phim không tồn tại, chưa được xuất bản hoặc chưa hoàn tất tải lên.',
              code: 'EPISODE_NOT_AVAILABLE',
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: seriesRow, error: seriesErr } = await supabaseAdmin
          .from('video_series')
          .select('id, published')
          .eq('id', seriesId)
          .maybeSingle();

        if (seriesErr || !seriesRow || !seriesRow.published) {
          return new Response(
            JSON.stringify({
              error: 'Bộ phim chưa được xuất bản công khai.',
              code: 'SERIES_NOT_PUBLISHED',
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const key = buildVideoSourceKey(seriesId, episodeId);
      const videoGetUrl = new URL(`${r2Endpoint}/${key}`);
      videoGetUrl.searchParams.set('X-Amz-Expires', String(PLAYBACK_EXPIRATION_SECONDS));

      const signedVideo = await aws.sign(videoGetUrl.toString(), {
        method: 'GET',
        aws: { signQuery: true },
      });

      // Also fetch subtitle presigned URL if subtitles exist
      const { data: subRows } = await supabaseAdmin
        .from('video_subtitles')
        .select('id, language_code, label, r2_key, is_default')
        .eq('episode_id', episodeId);

      const subtitles = [];
      if (subRows && subRows.length > 0) {
        for (const sub of subRows) {
          const subUrl = new URL(`${r2Endpoint}/${sub.r2_key}`);
          subUrl.searchParams.set('X-Amz-Expires', String(PLAYBACK_EXPIRATION_SECONDS));
          const signedSub = await aws.sign(subUrl.toString(), {
            method: 'GET',
            aws: { signQuery: true },
          });
          subtitles.push({
            id: sub.id,
            languageCode: sub.language_code,
            label: sub.label,
            url: signedSub.url,
            isDefault: sub.is_default,
          });
        }
      }

      return new Response(
        JSON.stringify({
          playbackUrl: signedVideo.url,
          r2Key: key,
          subtitles,
          expiresIn: PLAYBACK_EXPIRATION_SECONDS,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: delete-episode-media (Admin Only & Verified)
    // --------------------------------------------------------------------------
    if (action === 'delete-episode-media') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const videoKey = buildVideoSourceKey(seriesId, episodeId);
      const subPrefix = `videos/${seriesId}/${episodeId}/subtitles/`;

      // 1. Delete video file
      const delVideoUrl = `${r2Endpoint}/${videoKey}`;
      const signedDel = await aws.sign(delVideoUrl, { method: 'DELETE' });
      const delVideoRes = await fetch(signedDel.url, { method: 'DELETE', headers: signedDel.headers });

      if (!delVideoRes.ok && delVideoRes.status !== 204 && delVideoRes.status !== 404) {
        const errText = await delVideoRes.text().catch(() => '');
        return new Response(
          JSON.stringify({ error: `Xóa video trên R2 thất bại: ${errText}`, code: 'R2_DELETE_FAILED' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. List all subtitles with full S3 ListObjectsV2 pagination
      const subListResult = await listAllR2Objects(subPrefix);
      if (!subListResult.ok) {
        return new Response(
          JSON.stringify({
            error: `Liệt kê phụ đề trên R2 để xóa thất bại: ${subListResult.error}`,
            code: 'R2_LIST_FAILED',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 3. Delete each subtitle file and strictly verify response status
      const failedSubtitles: string[] = [];
      for (const item of subListResult.objects) {
        const delSubUrl = `${r2Endpoint}/${item.key}`;
        const s = await aws.sign(delSubUrl, { method: 'DELETE' });
        const delSubRes = await fetch(s.url, { method: 'DELETE', headers: s.headers });
        if (!delSubRes.ok && delSubRes.status !== 204 && delSubRes.status !== 404) {
          failedSubtitles.push(item.key);
          console.error(`[video-presign] Failed to delete subtitle ${item.key}: HTTP ${delSubRes.status}`);
        }
      }

      if (failedSubtitles.length > 0) {
        return new Response(
          JSON.stringify({
            error: `Xóa phụ đề trên R2 không hoàn tất: ${failedSubtitles.length} tệp thất bại (${failedSubtitles.join(', ')})`,
            code: 'R2_DELETE_FAILED',
            failedSubtitles,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, deleted: true, episodeId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: delete-series-media (Admin Only & Verified)
    // --------------------------------------------------------------------------
    if (action === 'delete-series-media') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const seriesPrefix = `videos/${seriesId}/`;
      const seriesListResult = await listAllR2Objects(seriesPrefix);

      if (!seriesListResult.ok) {
        return new Response(
          JSON.stringify({
            error: `Liệt kê tệp phim trên R2 để xóa thất bại: ${seriesListResult.error}`,
            code: 'R2_LIST_FAILED',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let deletedCount = 0;
      let failedCount = 0;
      const failedKeys: string[] = [];

      for (const item of seriesListResult.objects) {
        const delUrl = `${r2Endpoint}/${item.key}`;
        const s = await aws.sign(delUrl, { method: 'DELETE' });
        const delRes = await fetch(s.url, { method: 'DELETE', headers: s.headers });
        if (delRes.ok || delRes.status === 204 || delRes.status === 404) {
          deletedCount++;
        } else {
          failedCount++;
          failedKeys.push(item.key);
          console.error(`[video-presign] Failed to delete ${item.key}: HTTP ${delRes.status}`);
        }
      }

      if (failedCount > 0) {
        return new Response(
          JSON.stringify({
            error: `Xóa tệp phim trên R2 không hoàn tất: ${failedCount} tệp gặp lỗi`,
            code: 'R2_DELETE_FAILED',
            deletedCount,
            failedCount,
            failedKeys,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, deletedCount, seriesId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action không xác định', code: 'UNKNOWN_ACTION' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[video-presign Error]:', err);
    return new Response(
      JSON.stringify({
        error: 'Lỗi máy chủ khi xử lý chữ ký video Cloudflare R2',
        code: 'INTERNAL_ERROR',
        details: err?.message || String(err),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
