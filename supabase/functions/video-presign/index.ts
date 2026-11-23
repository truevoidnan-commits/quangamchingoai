// Supabase Edge Function: video-presign
// Generates S3 SigV4 presigned URLs and manages multipart upload for Cloudflare R2 bucket 'tcl-videos'
// Powered by AWS SDK v3 for S3 (@aws-sdk/client-s3 & @aws-sdk/s3-request-presigner) on Deno runtime.

import {
  S3Client,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.714.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.714.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPosterKey,
  buildVideoSourceKey,
  buildSubtitleKey,
  validateVideoPresignRequest,
  cleanEtag,
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
    // 2. Read Secrets from Environment (Strict Video Scope - Zero Fallback to Comic Secrets)
    const rawAccountId = (Deno.env.get('R2_VIDEO_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || '').trim();
    const rawAccessKeyId = (Deno.env.get('R2_VIDEO_ACCESS_KEY_ID') || '').trim();
    const rawSecretAccessKey = (Deno.env.get('R2_VIDEO_SECRET_ACCESS_KEY') || '').trim();
    const rawBucket = (Deno.env.get('R2_VIDEO_BUCKET') || 'tcl-videos').trim();
    const legacyComicKeyPresent = Boolean(Deno.env.get('R2_ACCESS_KEY_ID'));

    const R2_ACCOUNT_ID = rawAccountId;
    const R2_ACCESS_KEY_ID = rawAccessKeyId;
    const R2_SECRET_ACCESS_KEY = rawSecretAccessKey;
    const R2_BUCKET = rawBucket;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Safe runtime diagnostics - Only booleans and lengths, strictly never returning secret values
    const runtimeDiagnostics = {
      hasR2AccountId: Boolean(R2_ACCOUNT_ID),
      r2AccountIdLength: R2_ACCOUNT_ID.length,
      hasR2VideoAccessKeyId: Boolean(R2_ACCESS_KEY_ID),
      r2VideoAccessKeyIdLength: R2_ACCESS_KEY_ID.length,
      hasR2VideoSecretAccessKey: Boolean(R2_SECRET_ACCESS_KEY),
      r2VideoSecretAccessKeyLength: R2_SECRET_ACCESS_KEY.length,
      hasR2VideoBucket: Boolean(R2_BUCKET),
      r2VideoBucket: R2_BUCKET,
      hasLegacyComicKeyPresent: legacyComicKeyPresent,
    };

    // 3. Authenticate User via Supabase JWT
    const authHeader = req.headers.get('Authorization') || '';
    let currentUser: any = null;
    let isUserAdmin = false;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    if (authHeader.startsWith('Bearer ')) {
      try {
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
      } catch {
        // Ignore auth inspection errors for fail-fast response
      }
    }

    // Fail-fast guard: R2_VIDEO_* secrets validation
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      const errorPayload: Record<string, any> = {
        ok: false,
        error: 'Hệ thống lưu trữ video tạm thời chưa sẵn sàng (Lỗi cấu hình dịch vụ lưu trữ).',
        code: 'R2_VIDEO_CONFIG_MISSING',
      };

      // Security Guard: runtimeDiagnostics is strictly restricted to authenticated Admins only.
      // Unauthenticated users or non-admin users must NEVER receive internal configuration, lengths, or diagnostics.
      if (currentUser && isUserAdmin) {
        errorPayload.error = 'Cloudflare R2 Video chưa được cấu hình (thiếu hoặc rỗng biến R2_VIDEO_ACCESS_KEY_ID, R2_VIDEO_SECRET_ACCESS_KEY hoặc R2_ACCOUNT_ID). Vui lòng cấu hình trong Supabase Secrets.';
        errorPayload.stage = 'CONFIG_MISSING';
        errorPayload.runtimeDiagnostics = runtimeDiagnostics;
      }

      return new Response(
        JSON.stringify(errorPayload),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // 5. Initialize S3 Client configured specifically for Cloudflare R2
    // endpoint uses Account ID format, region is 'auto', forcePathStyle ensures path-style routing
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
      maxAttempts: 2, // Limit retries to prevent unbounded backoff and worker timeouts on Supabase Edge Functions
    });

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

    // --------------------------------------------------------------------------
    // ACTION: test-r2-connection (Admin Only - Read-only Diagnostics)
    // --------------------------------------------------------------------------
    if (action === 'test-r2-connection') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const authSource = 'R2_VIDEO_ACCESS_KEY_ID';
      const keyHint = R2_ACCESS_KEY_ID
        ? `[Ẩn bảo mật - ${R2_ACCESS_KEY_ID.length} ký tự]`
        : '(chưa có)';
      const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

      try {
        // Read-only probe with MaxKeys: 1 on videos/ prefix
        const probeRes = await s3.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            Prefix: 'videos/',
            MaxKeys: 1,
          })
        );

        return new Response(
          JSON.stringify({
            ok: true,
            status: 'CONNECTED',
            message: 'Kết nối Cloudflare R2 thành công và xác thực SigV4 hợp lệ!',
            bucket: R2_BUCKET,
            endpoint,
            keyHint,
            authSource,
            runtimeDiagnostics,
            keyCount: probeRes.KeyCount || 0,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        const httpStatus = err.$metadata?.httpStatusCode;
        const errName = err.name || 'UnknownError';
        let stage = 'UNKNOWN';
        let diagnosticMessage = '';

        if (errName === 'InvalidAccessKeyId' || errName === 'SignatureDoesNotMatch') {
          stage = 'CREDENTIAL_INVALID';
          diagnosticMessage = `Khóa xác thực R2 không hợp lệ (${errName}). Vui lòng kiểm tra lại R2_VIDEO_ACCESS_KEY_ID và R2_VIDEO_SECRET_ACCESS_KEY trong Supabase Secrets.`;
        } else if (httpStatus === 403 || errName === 'AccessDenied') {
          stage = 'PERMISSIONS_OR_BUCKET_MISMATCH';
          diagnosticMessage =
            `Cloudflare R2 từ chối truy cập (HTTP 403 AccessDenied). ` +
            `Nguyên nhân: Token R2_VIDEO_ACCESS_KEY_ID (${R2_ACCESS_KEY_ID.length} ký tự) không có quyền Object Read & Write trên bucket '${R2_BUCKET}', ` +
            `hoặc Account ID '${R2_ACCOUNT_ID}' không khớp với tài khoản sở hữu token.`;
        } else if (httpStatus === 404 || errName === 'NoSuchBucket') {
          stage = 'BUCKET_NOT_FOUND';
          diagnosticMessage = `Bucket '${R2_BUCKET}' không tồn tại trên tài khoản Cloudflare R2 '${R2_ACCOUNT_ID}'.`;
        } else if (err.code === 'ENOTFOUND' || err.message?.includes('fetch failed') || err.message?.includes('getaddrinfo')) {
          stage = 'ENDPOINT_UNREACHABLE';
          diagnosticMessage = `Không thể kết nối đến endpoint R2: ${endpoint}. Vui lòng kiểm tra Account ID '${R2_ACCOUNT_ID}'.`;
        } else {
          stage = 'S3_ERROR';
          diagnosticMessage = `Lỗi từ R2 S3 API (${errName}, HTTP ${httpStatus || 'N/A'}): ${err.message}`;
        }

        return new Response(
          JSON.stringify({
            ok: false,
            status: 'FAILED',
            stage,
            error: diagnosticMessage,
            httpStatus,
            errName,
            bucket: R2_BUCKET,
            endpoint,
            keyHint,
            authSource,
            runtimeDiagnostics,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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

      // 2. Query R2 bucket directly via S3 ListObjectsV2 with full pagination
      let actualR2VideoBytes: number | null = 0;
      let isR2ActualAvailable = false;
      let continuationToken: string | undefined = undefined;

      try {
        let pageCount = 0;
        const maxPages = 50;
        do {
          pageCount++;
          const listRes = await s3.send(
            new ListObjectsV2Command({
              Bucket: R2_BUCKET,
              Prefix: 'videos/',
              ContinuationToken: continuationToken,
            })
          );

          for (const item of listRes.Contents || []) {
            actualR2VideoBytes = (actualR2VideoBytes || 0) + (item.Size || 0);
          }

          continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
        } while (continuationToken && pageCount < maxPages);

        if (!continuationToken) {
          isR2ActualAvailable = true;
        } else {
          console.warn('[video-presign] Storage stats pagination reached maxPages');
          isR2ActualAvailable = false;
          actualR2VideoBytes = null;
        }
      } catch (r2Err) {
        console.warn('[video-presign] R2 list objects for storage stats failed');
        actualR2VideoBytes = null;
        isR2ActualAvailable = false;
      }

      const comicStorageBytes = Math.round(ESTIMATED_COMIC_STORAGE_BYTES);
      const effectiveVideoBytes =
        isR2ActualAvailable && actualR2VideoBytes !== null ? actualR2VideoBytes : dbTrackedVideoBytes;
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

      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: mimeType || (targetType === 'poster' ? 'image/webp' : 'text/vtt'),
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PUT_EXPIRATION_SECONDS });

      return new Response(
        JSON.stringify({
          uploadUrl,
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

      // Initiate S3 Multipart Upload via AWS SDK v3
      let uploadId: string | undefined;
      try {
        const createRes = await s3.send(
          new CreateMultipartUploadCommand({
            Bucket: R2_BUCKET,
            Key: key,
            ContentType: mimeType,
          })
        );
        uploadId = createRes.UploadId;
      } catch (initErr: any) {
        const httpStatus = initErr.$metadata?.httpStatusCode;
        const errName = initErr.name || 'R2_INIT_FAILED';
        console.error('[R2 Init Multipart Error]:', errName, httpStatus, initErr.message);
        return new Response(
          JSON.stringify({
            error: `Không thể khởi tạo multipart upload trên R2 (${errName}): ${initErr.message}`,
            code: 'R2_INIT_FAILED',
            httpStatus,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
        console.error('[video-presign] Failed to create upload session in DB');
        // Cleanup initiated R2 multipart session
        try {
          await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }));
        } catch (_) {}
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
        console.error('[video-presign] Failed to update episode for upload');
        // Cleanup initiated R2 multipart session and mark DB session aborted to maintain consistent state
        try {
          await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }));
        } catch (_) {}
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
          JSON.stringify({
            error: `partNumber ${partNumber} vượt quá tổng số part (${session.total_parts}) của phiên`,
            code: 'PART_OUT_OF_RANGE',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const command = new UploadPartCommand({
        Bucket: R2_BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });

      const partUrl = await getSignedUrl(s3, command, { expiresIn: PUT_EXPIRATION_SECONDS });

      return new Response(
        JSON.stringify({
          partUrl,
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

      // Helper for structured logging (Requirement 2)
      // Only logs stage timing, uploadId, episodeId, error codes; strictly zero credentials or signed URLs
      const logStage = (stageName: string, meta: Record<string, any> = {}) => {
        console.log(JSON.stringify({
          stage: stageName,
          uploadId,
          seriesId,
          episodeId,
          timestamp: new Date().toISOString(),
          ...meta,
        }));
      };

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

      // Idempotent Check: If session is already completed or if R2 already has the completed file
      let actualSize = 0;
      let alreadyFinalized = false;

      logStage('HEAD_START', { phase: 'idempotent_pre_check', key });
      const preHeadStartTime = Date.now();
      try {
        const preHeadRes = await s3.send(
          new HeadObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
          }),
          { abortSignal: AbortSignal.timeout(10000) }
        );
        const preSize = preHeadRes.ContentLength || 0;
        logStage('HEAD_DONE', { phase: 'idempotent_pre_check', durationMs: Date.now() - preHeadStartTime, actualSize: preSize });

        if (preSize > 0 && (session.file_size <= 0 || preSize === session.file_size)) {
          alreadyFinalized = true;
          actualSize = preSize;
        }
      } catch (err: any) {
        logStage('HEAD_DONE', { phase: 'idempotent_pre_check', durationMs: Date.now() - preHeadStartTime, notFound: true, errName: err.name });
      }

      // If already finalized on R2, ensure DB state is updated and return success immediately
      if (alreadyFinalized) {
        logStage('DB_UPDATE_START', { phase: 'idempotent_sync', actualSize });
        const dbSyncStartTime = Date.now();

        await supabaseAdmin
          .from('video_episodes')
          .update({
            upload_status: 'ready',
            file_size: actualSize,
          })
          .eq('id', episodeId);

        await supabaseAdmin
          .from('video_upload_sessions')
          .update({ status: 'completed' })
          .eq('upload_id', uploadId);

        logStage('DB_UPDATE_DONE', { phase: 'idempotent_sync', durationMs: Date.now() - dbSyncStartTime });

        return new Response(
          JSON.stringify({
            success: true,
            idempotent: true,
            episodeId,
            r2Key: key,
            fileSize: actualSize,
            message: 'Tệp video đã hoàn tất trên R2 và đồng bộ trạng thái thành công.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If not already finalized, session must be in_progress
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

      // Complete Multipart Upload via AWS SDK v3 with strict timeout (25s)
      logStage('COMPLETE_START', { partsCount: sortedParts.length });
      const completeStartTime = Date.now();
      let completeErr: any = null;

      try {
        await s3.send(
          new CompleteMultipartUploadCommand({
            Bucket: R2_BUCKET,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
              Parts: sortedParts.map((p) => ({
                PartNumber: p.PartNumber,
                ETag: cleanEtag(p.ETag),
              })),
            },
          }),
          { abortSignal: AbortSignal.timeout(25000) }
        );
        logStage('COMPLETE_DONE', { durationMs: Date.now() - completeStartTime, status: 'ok' });
      } catch (err: any) {
        completeErr = err;
        logStage('COMPLETE_DONE', {
          durationMs: Date.now() - completeStartTime,
          status: 'error',
          errName: err.name,
          httpStatus: err.$metadata?.httpStatusCode,
        });
      }

      // Verify object exists and get actual size via HEAD (10s timeout)
      logStage('HEAD_START', { phase: 'post_complete_verify', key });
      const headStartTime = Date.now();
      let headErr: any = null;

      try {
        const headRes = await s3.send(
          new HeadObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
          }),
          { abortSignal: AbortSignal.timeout(10000) }
        );
        actualSize = headRes.ContentLength || 0;
        logStage('HEAD_DONE', { phase: 'post_complete_verify', durationMs: Date.now() - headStartTime, actualSize, status: 'ok' });
      } catch (err: any) {
        headErr = err;
        logStage('HEAD_DONE', {
          phase: 'post_complete_verify',
          durationMs: Date.now() - headStartTime,
          status: 'error',
          errName: err.name,
          httpStatus: err.$metadata?.httpStatusCode,
        });
      }

      // If Complete threw an error AND Head failed to find object:
      if (actualSize <= 0) {
        console.error('[R2 Complete Failed & HEAD Not Found]:', completeErr?.message || headErr?.message);
        return new Response(
          JSON.stringify({
            error: `Hoàn tất multipart upload thất bại trên R2 (${completeErr?.name || headErr?.name || 'UnknownError'}): ${completeErr?.message || headErr?.message}`,
            code: 'R2_COMPLETE_FAILED',
            uploadId,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify size matches session file_size
      if (session.file_size > 0 && actualSize !== session.file_size) {
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
      logStage('DB_UPDATE_START', { episodeId, actualSize });
      const dbStartTime = Date.now();

      const { error: epUpdateErr } = await supabaseAdmin
        .from('video_episodes')
        .update({
          upload_status: 'ready',
          file_size: actualSize,
        })
        .eq('id', episodeId);

      if (epUpdateErr) {
        console.error('[video-presign] Failed to update episode ready status:', epUpdateErr);
        logStage('DB_UPDATE_DONE', { durationMs: Date.now() - dbStartTime, error: epUpdateErr.message });
        return new Response(
          JSON.stringify({
            error: `Lỗi cập nhật trạng thái tập phim vào cơ sở dữ liệu: ${epUpdateErr.message}`,
            code: 'DB_UPDATE_FAILED',
            actualSize,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update session record to completed
      const { error: sessUpdateErr } = await supabaseAdmin
        .from('video_upload_sessions')
        .update({ status: 'completed' })
        .eq('upload_id', uploadId);

      logStage('DB_UPDATE_DONE', {
        durationMs: Date.now() - dbStartTime,
        hasSessError: Boolean(sessUpdateErr),
      });

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
    // ACTION: verify-episode-upload (Admin Only - Idempotent Check & State Sync)
    // --------------------------------------------------------------------------
    if (action === 'verify-episode-upload') {
      const adminErr = requireAdmin();
      if (adminErr) return adminErr;

      const key = buildVideoSourceKey(seriesId, episodeId);

      // Check R2 via HeadObject with 10s timeout
      let actualSize = 0;
      try {
        const headRes = await s3.send(
          new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }),
          { abortSignal: AbortSignal.timeout(10000) }
        );
        actualSize = headRes.ContentLength || 0;
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            ok: false,
            verified: false,
            error: `Không tìm thấy tệp video hoàn chỉnh trên Cloudflare R2 (${err.name || 'NotFound'}): ${err.message}`,
            code: 'R2_OBJECT_NOT_FOUND',
            seriesId,
            episodeId,
            key,
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (actualSize <= 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            verified: false,
            error: 'Tệp video trên Cloudflare R2 có kích thước 0 bytes.',
            code: 'R2_FILE_EMPTY',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sync episode in database to ready
      const { error: epErr } = await supabaseAdmin
        .from('video_episodes')
        .update({
          upload_status: 'ready',
          file_size: actualSize,
        })
        .eq('id', episodeId);

      if (epErr) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Tìm thấy file trên R2 (${actualSize} bytes) nhưng lỗi cập nhật CSDL: ${epErr.message}`,
            code: 'DB_UPDATE_FAILED',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark any upload session for this episode as completed
      await supabaseAdmin
        .from('video_upload_sessions')
        .update({ status: 'completed' })
        .eq('episode_id', episodeId)
        .neq('status', 'completed');

      return new Response(
        JSON.stringify({
          ok: true,
          success: true,
          verified: true,
          episodeId,
          r2Key: key,
          fileSize: actualSize,
          message: `Đã xác minh tệp video (${(actualSize / (1024 * 1024)).toFixed(2)} MB) tồn tại trên R2 và đồng bộ trạng thái thành công!`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
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
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: R2_BUCKET,
            Key: expectedKey,
            UploadId: uploadId,
          })
        );
      } catch (abortErr: any) {
        const httpStatus = abortErr.$metadata?.httpStatusCode;
        if (httpStatus !== 204 && httpStatus !== 404 && abortErr.name !== 'NoSuchUpload') {
          console.error('[R2 Abort Multipart Error]:', abortErr.name, abortErr.message);
          return new Response(
            JSON.stringify({
              error: `Hủy multipart upload trên R2 thất bại (${abortErr.name}): ${abortErr.message}`,
              code: 'R2_ABORT_FAILED',
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
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
      const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      });

      const playbackUrl = await getSignedUrl(s3, getCommand, { expiresIn: PLAYBACK_EXPIRATION_SECONDS });

      // Also fetch subtitle presigned URL if subtitles exist
      const { data: subRows } = await supabaseAdmin
        .from('video_subtitles')
        .select('id, language_code, label, r2_key, is_default')
        .eq('episode_id', episodeId);

      const subtitles = [];
      if (subRows && subRows.length > 0) {
        for (const sub of subRows) {
          const subCommand = new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: sub.r2_key,
          });
          const subUrl = await getSignedUrl(s3, subCommand, { expiresIn: PLAYBACK_EXPIRATION_SECONDS });
          subtitles.push({
            id: sub.id,
            languageCode: sub.language_code,
            label: sub.label,
            url: subUrl,
            isDefault: sub.is_default,
          });
        }
      }

      return new Response(
        JSON.stringify({
          playbackUrl,
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
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: videoKey }));
      } catch (delErr: any) {
        const httpStatus = delErr.$metadata?.httpStatusCode;
        if (httpStatus !== 204 && httpStatus !== 404 && delErr.name !== 'NoSuchKey') {
          return new Response(
            JSON.stringify({ error: `Xóa video trên R2 thất bại: ${delErr.message}`, code: 'R2_DELETE_FAILED' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 2. List all subtitles with full S3 ListObjectsV2 pagination
      const subKeys: string[] = [];
      let continuationToken: string | undefined = undefined;
      try {
        do {
          const listRes = await s3.send(
            new ListObjectsV2Command({
              Bucket: R2_BUCKET,
              Prefix: subPrefix,
              ContinuationToken: continuationToken,
            })
          );
          for (const item of listRes.Contents || []) {
            if (item.Key) subKeys.push(item.Key);
          }
          continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
        } while (continuationToken);
      } catch (listErr: any) {
        return new Response(
          JSON.stringify({
            error: `Liệt kê phụ đề trên R2 để xóa thất bại: ${listErr.message}`,
            code: 'R2_LIST_FAILED',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 3. Delete each subtitle file and strictly verify response status
      const failedSubtitles: string[] = [];
      for (const k of subKeys) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: k }));
        } catch (delSubErr: any) {
          const httpStatus = delSubErr.$metadata?.httpStatusCode;
          if (httpStatus !== 204 && httpStatus !== 404 && delSubErr.name !== 'NoSuchKey') {
            failedSubtitles.push(k);
          }
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
      const seriesKeys: string[] = [];
      let continuationToken: string | undefined = undefined;

      try {
        do {
          const listRes = await s3.send(
            new ListObjectsV2Command({
              Bucket: R2_BUCKET,
              Prefix: seriesPrefix,
              ContinuationToken: continuationToken,
            })
          );
          for (const item of listRes.Contents || []) {
            if (item.Key) seriesKeys.push(item.Key);
          }
          continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
        } while (continuationToken);
      } catch (listErr: any) {
        return new Response(
          JSON.stringify({
            error: `Liệt kê tệp phim trên R2 để xóa thất bại: ${listErr.message}`,
            code: 'R2_LIST_FAILED',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let deletedCount = 0;
      let failedCount = 0;
      const failedKeys: string[] = [];

      for (const k of seriesKeys) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: k }));
          deletedCount++;
        } catch (delErr: any) {
          const httpStatus = delErr.$metadata?.httpStatusCode;
          if (httpStatus === 204 || httpStatus === 404 || delErr.name === 'NoSuchKey') {
            deletedCount++;
          } else {
            failedCount++;
            failedKeys.push(k);
          }
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
