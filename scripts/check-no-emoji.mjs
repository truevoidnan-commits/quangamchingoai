import fs from 'fs';
import path from 'path';

/**
 * Verification script: Ensure ZERO OS emojis exist in src/
 *
 * Rules:
 * - Scans all .js, .jsx, .ts, .tsx, .css, .html in src/
 * - Uses Unicode Extended_Pictographic property: /\p{Extended_Pictographic}/u
 * - Exits with code 0 if 0 emojis found
 * - Exits with code 1 and prints line details if emojis are found
 */

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;
const ALLOWED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html']);

const findings = [];
let totalFilesScanned = 0;

function scanDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      totalFilesScanned++;
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        const matches = line.match(new RegExp(EMOJI_REGEX, 'gu'));
        if (matches) {
          findings.push({
            file: fullPath.replace(/\\/g, '/'),
            line: index + 1,
            count: matches.length,
            content: line.trim(),
            emojis: matches,
          });
        }
      });
    }
  }
}

console.log('--- Kiểm tra mã nguồn src/ không chứa Emoji ---');
const srcDir = path.resolve('src');
if (!fs.existsSync(srcDir)) {
  console.error(`Không tìm thấy thư mục: ${srcDir}`);
  process.exit(1);
}

scanDirectory(srcDir);

console.log(`Đã quét ${totalFilesScanned} tập tin trong src/.`);

if (findings.length > 0) {
  console.error(`\n❌ Phát hiện ${findings.length} dòng chứa emoji trong src/:\n`);
  findings.forEach(f => {
    console.error(`  ${f.file}:${f.line} (${f.count} emoji: ${f.emojis.join(' ')})`);
    console.error(`    ${f.content}`);
  });
  console.error('\nVui lòng thay thế emoji bằng Icon SVG hoặc text thuần trước khi commit!');
  process.exit(1);
}

console.log('✅ Hoàn toàn KHÔNG có emoji nào trong src/! Đạt chuẩn 100%.');
process.exit(0);
