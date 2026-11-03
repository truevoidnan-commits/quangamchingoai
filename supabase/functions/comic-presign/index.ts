// Supabase Edge Function: comic-presign
// Generates S3 SigV4 presigned URLs for Cloudflare R2 bucket 'tcl-comics'
// Runs on Deno runtime inside Supabase Edge Functions.

import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildObjectKey,
  validatePresignRequest,
  checkQuota,
  checkRateLimit,
  calculateEffectiveUsedBytes,
  getCorsHeaders,
  PUT_EXPIRATION_SECONDS,
  GET_EXPIRATION_SECONDS,
  MAX_HOURLY_OPS,
  MAX_USER_QUOTA_BYTES,
} from './validate.js';

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
    const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') || '';
    const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
    const R2_BUCKET = Deno.env.get('R2_BUCKET') || 'tcl-comics';
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
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Chưa đăng nhập. Thiếu token xác thực.', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authErr,
    } = await supabaseAuthClient.auth.getUser();

    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uid = user.id;

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

    const validation = validatePresignRequest(body);
    if (!validation.ok) {
      return new Response(
        JSON.stringify({ error: validation.error, code: validation.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, volumeId, pages, cover, totalBytes, totalOps = 1 } = validation.validated;

    // 5. Rate Limit Check (comic_ops_hourly via service role)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const currentHourIso = new Date().toISOString().slice(0, 13) + ':00:00.000Z';
    const { data: opRows } = await supabaseAdmin
      .from('comic_ops_hourly')
      .select('ops')
      .eq('user_id', uid)
      .eq('hour', currentHourIso)
      .maybeSingle();

    const currentOps = opRows?.ops || 0;
    const rateLimitCheck = checkRateLimit({
      currentHourlyOps: currentOps,
      incomingOps: totalOps,
      maxHourlyOps: MAX_HOURLY_OPS,
    });

    if (!rateLimitCheck.ok) {
      const nextHour = new Date(currentHourIso);
      nextHour.setHours(nextHour.getHours() + 1);
      const retryAfter = Math.max(1, Math.ceil((nextHour.getTime() - Date.now()) / 1000));

      return new Response(
        JSON.stringify({
          error: rateLimitCheck.error,
          code: rateLimitCheck.code,
          retryAfterSeconds: retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    // 6. Initialize AWS S3 Client for Cloudflare R2
    const aws = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });

    const r2Endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;

    // 7. Process Actions
    if (action === 'put') {
      // 7.1 Check User Quota (Sum total_bytes of ready + uploading volumes excluding this volumeId <= 8GB)
      const { data: volData, error: volErr } = await supabaseAdmin
        .from('comic_volumes')
        .select('id, total_bytes')
        .eq('user_id', uid)
        .is('deleted_at', null);

      if (!volErr && volData) {
        // Exclude the current volume being uploaded to prevent double-counting
        const usedBytes = calculateEffectiveUsedBytes(volData, volumeId);
        const quotaCheck = checkQuota({
          usedBytes,
          incomingBytes: totalBytes || 0,
          maxQuotaBytes: MAX_USER_QUOTA_BYTES,
        });

        if (!quotaCheck.ok) {
          return new Response(
            JSON.stringify({ error: quotaCheck.error, code: quotaCheck.code }),
            { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 7.2 Update Rate Limit Counter
      await supabaseAdmin.from('comic_ops_hourly').upsert(
        {
          user_id: uid,
          hour: currentHourIso,
          ops: currentOps + totalOps,
        },
        { onConflict: 'user_id,hour' }
      );

      // 7.3 Generate Presigned PUT URLs
      const urls: Record<number, string> = {};
      for (const pageIndex of pages) {
        const key = buildObjectKey(uid, volumeId, pageIndex);
        const url = new URL(`${r2Endpoint}/${key}`);
        url.searchParams.set('X-Amz-Expires', String(PUT_EXPIRATION_SECONDS));
        const signed = await aws.sign(url.toString(), {
          method: 'PUT',
          aws: { signQuery: true },
        });
        urls[pageIndex] = signed.url;
      }

      let coverUrl: string | null = null;
      if (cover) {
        const coverKey = buildObjectKey(uid, volumeId, 'cover');
        const url = new URL(`${r2Endpoint}/${coverKey}`);
        url.searchParams.set('X-Amz-Expires', String(PUT_EXPIRATION_SECONDS));
        const signed = await aws.sign(url.toString(), {
          method: 'PUT',
          aws: { signQuery: true },
        });
        coverUrl = signed.url;
      }

      return new Response(
        JSON.stringify({
          urls,
          coverUrl,
          expiresIn: PUT_EXPIRATION_SECONDS,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get') {
      // 7.4 Update Rate Limit Counter
      await supabaseAdmin.from('comic_ops_hourly').upsert(
        {
          user_id: uid,
          hour: currentHourIso,
          ops: currentOps + totalOps,
        },
        { onConflict: 'user_id,hour' }
      );

      // 7.5 Generate Presigned GET URLs
      const urls: Record<number, string> = {};
      for (const pageIndex of pages) {
        const key = buildObjectKey(uid, volumeId, pageIndex);
        const url = new URL(`${r2Endpoint}/${key}`);
        url.searchParams.set('X-Amz-Expires', String(GET_EXPIRATION_SECONDS));
        const signed = await aws.sign(url.toString(), {
          method: 'GET',
          aws: { signQuery: true },
        });
        urls[pageIndex] = signed.url;
      }

      let coverUrl: string | null = null;
      if (cover) {
        const coverKey = buildObjectKey(uid, volumeId, 'cover');
        const url = new URL(`${r2Endpoint}/${coverKey}`);
        url.searchParams.set('X-Amz-Expires', String(GET_EXPIRATION_SECONDS));
        const signed = await aws.sign(url.toString(), {
          method: 'GET',
          aws: { signQuery: true },
        });
        coverUrl = signed.url;
      }

      return new Response(
        JSON.stringify({
          urls,
          coverUrl,
          expiresIn: GET_EXPIRATION_SECONDS,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete-volume') {
      // 7.6 List all objects under <uid>/<volumeId>/ and delete them
      const prefix = `${uid}/${volumeId}/`;
      let deletedCount = 0;
      let continuationToken: string | null = null;

      do {
        const listUrl = new URL(r2Endpoint);
        listUrl.searchParams.set('list-type', '2');
        listUrl.searchParams.set('prefix', prefix);
        if (continuationToken) {
          listUrl.searchParams.set('continuation-token', continuationToken);
        }

        const listRes = await aws.fetch(listUrl.toString());
        if (!listRes.ok) {
          const errText = await listRes.text();
          console.error('[R2 List Error]:', errText);
          break;
        }

        const xml = await listRes.text();
        const keyMatches = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1]);

        if (keyMatches.length > 0) {
          const deleteXml = `<?xml version="1.0" encoding="UTF-8"?>
<Delete>
  <Quiet>true</Quiet>
  ${keyMatches.map((k) => `<Object><Key>${k}</Key></Object>`).join('')}
</Delete>`;

          const deleteUrl = new URL(r2Endpoint);
          deleteUrl.searchParams.set('delete', '');

          const deleteRes = await aws.fetch(deleteUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: deleteXml,
          });

          if (deleteRes.ok) {
            deletedCount += keyMatches.length;
          } else {
            console.error('[R2 Delete Error]:', await deleteRes.text());
          }
        }

        const tokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
        continuationToken = tokenMatch ? tokenMatch[1] : null;
      } while (continuationToken);

      // Record delete ops in rate limit
      const opsToRecord = Math.max(1, deletedCount);
      await supabaseAdmin.from('comic_ops_hourly').upsert(
        {
          user_id: uid,
          hour: currentHourIso,
          ops: currentOps + opsToRecord,
        },
        { onConflict: 'user_id,hour' }
      );

      return new Response(
        JSON.stringify({
          deletedCount,
          volumeId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action không hợp lệ', code: 'INVALID_ACTION' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[comic-presign Error]:', err);
    return new Response(
      JSON.stringify({
        error: 'Lỗi máy chủ khi xử lý chữ ký lưu trữ Cloud',
        code: 'INTERNAL_ERROR',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
