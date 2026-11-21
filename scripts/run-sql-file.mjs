/**
 * TIỆN ÍCH THỰC THI FILE SQL AN TOÀN QUA POSTGRESQL DRIVER
 * File: scripts/run-sql-file.mjs
 * 
 * - Kết nối PostgreSQL qua connection string (hỗ trợ SSL cho Supabase Cloud)
 * - Đọc và thực thi toàn bộ nội dung file SQL
 * - Bắt notices, log kết quả dạng JSON an toàn
 * - Trả exit code 0 khi thành công, exit code 1 khi có lỗi
 */

import fs from 'node:fs';
import pg from 'pg';

const filePath = process.argv[2];
const dbUrl = process.argv[3] || process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;

if (!filePath || !fs.existsSync(filePath)) {
  console.error(`LỖI: File SQL không tồn tại: ${filePath}`);
  process.exit(1);
}

if (!dbUrl) {
  console.error('LỖI: Chưa cung cấp DATABASE_URL qua tham số hoặc biến môi trường.');
  process.exit(1);
}

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const client = new pg.Client({
  connectionString: dbUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  client.on('notice', (msg) => {
    console.log(`[PG NOTICE]: ${msg.message}`);
  });

  const sql = fs.readFileSync(filePath, 'utf8');
  const res = await client.query(sql);

  if (Array.isArray(res)) {
    for (const r of res) {
      if (r.rows && r.rows.length > 0) {
        console.log(JSON.stringify(r.rows, null, 2));
      }
    }
  } else if (res.rows && res.rows.length > 0) {
    console.log(JSON.stringify(res.rows, null, 2));
  }

  await client.end();
  console.log(`✓ Thực thi thành công: ${filePath}`);
} catch (err) {
  console.error(`LỖI THỰC THI SQL [${err.code || 'UNKNOWN'}]: ${err.message}`);
  await client.end().catch(() => {});
  process.exit(1);
}
