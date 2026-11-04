/**
 * src/lib/novelExport.js
 *
 * Module chuyên biệt xuất truyện chữ sang định dạng EPUB 3 (tương thích EPUB 2) và TXT.
 * - CHỈ ĐỌC dữ liệu có sẵn, không thay đổi dữ liệu truyện.
 * - Không ghi vào DB/localStorage/Supabase, không kích hoạt đồng bộ.
 * - Import động jszip để giữ bundle chính nhỏ gọn.
 * - Hỗ trợ AbortController và nhường luồng định kỳ cho UI mượt mà.
 */

import { isVaultSessionUnlocked, getLibrary } from './storage.js';

/**
 * Kiểm tra xem truyện có thuộc Kho Ẩn (Vault) hay không
 */
export function isNovelInVault(novel) {
  if (!novel) return false;
  if (novel.isHidden) return true;
  try {
    const library = getLibrary({ includeHidden: true });
    const item = library.find((i) => i.id === novel.id);
    return Boolean(item?.isHidden);
  } catch {
    return false;
  }
}

/**
 * Làm sạch tên file theo chuẩn hệ thống tập tin
 * - Loại bỏ ký tự cấm: \ / : * ? " < > |
 * - Loại bỏ ký tự điều khiển (ASCII 0-31, 127)
 * - Cắt tối đa ~80 ký tự cho phần tên gốc
 * - GIỮ NGUYÊN dấu tiếng Việt
 * - Fallback về "truyen" nếu tên bị rỗng
 */
export function sanitizeFilename(title, rangeSuffix = '', ext = '.epub') {
  let clean = (title || '')
    .replace(/[\\/:*?"<>|]/g, '') // Ký tự cấm trong file name
    .replace(/[\x00-\x1F\x7F]/g, '') // Ký tự điều khiển
    .trim();

  // Loại bỏ khoảng trắng thừa liên tiếp
  clean = clean.replace(/\s+/g, ' ');

  if (!clean) clean = 'truyen';

  // Tính toán độ dài tối đa cho phần tên chính sao cho tổng <= 80 ký tự
  const maxBaseLen = Math.max(20, 80 - (rangeSuffix ? rangeSuffix.length : 0));
  if (clean.length > maxBaseLen) {
    clean = clean.slice(0, maxBaseLen).trim();
  }

  return `${clean}${rangeSuffix}${ext}`;
}

/**
 * Tạo tên file xuất hoàn chỉnh
 */
export function generateExportFilename(title, rangeStart, rangeEnd, totalChapters, ext) {
  let rangeSuffix = '';
  if (
    typeof rangeStart === 'number' &&
    typeof rangeEnd === 'number' &&
    totalChapters > 0 &&
    (rangeStart > 1 || rangeEnd < totalChapters)
  ) {
    rangeSuffix = ` (Chương ${rangeStart}-${rangeEnd})`;
  }
  return sanitizeFilename(title, rangeSuffix, ext);
}

/**
 * Escape chuỗi thành XML an toàn và loại bỏ ký tự điều khiển cấm trong XML 1.0
 * Ký tự điều khiển XML 1.0 bị cấm: \x00-\x08, \x0B, \x0C, \x0E-\x1F
 */
export function escapeXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Định dạng nội dung chương thành các đoạn <p> chuẩn XHTML
 * - Tách theo dòng trống
 * - Xuống dòng đơn trong đoạn chuyển thành <br/>
 * - Escape toàn bộ ký tự XML
 */
export function formatParagraphsToXhtml(content) {
  if (!content) return '    <p>Nội dung chương trống.</p>';

  // Loại bỏ ký tự điều khiển cấm XML
  const clean = String(content).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
  const paragraphs = clean.split(/\r?\n\s*\r?\n+/);
  const pTags = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // Chuyển xuống dòng đơn thành <br/>
    const lines = trimmed.split(/\r?\n/).map((l) => escapeXml(l.trim())).filter(Boolean);
    if (lines.length > 0) {
      pTags.push(`    <p>${lines.join('<br/>\n      ')}</p>`);
    }
  }

  return pTags.length > 0 ? pTags.join('\n') : '    <p>Nội dung chương trống.</p>';
}

/**
 * Chuyển đổi coverUrl (Data URL, Blob URL hoặc URL thông thường) thành dữ liệu nhị phân cho EPUB
 */
async function resolveCoverImage(coverUrl) {
  if (!coverUrl || typeof coverUrl !== 'string') return null;

  try {
    // 1. Data URL (Base64)
    if (coverUrl.startsWith('data:')) {
      const match = coverUrl.match(/^data:([^;]+);base64,(.*)$/s);
      if (match) {
        const mimeType = match[1].toLowerCase();
        const base64Data = match[2];
        let ext = 'jpg';
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('webp')) ext = 'webp';
        else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';

        const binaryStr = typeof atob === 'function' ? atob(base64Data) : Buffer.from(base64Data, 'base64').toString('binary');
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return { data: bytes, mimeType, filename: `cover.${ext}` };
      }
    }

    // 2. HTTP/HTTPS URL hoặc Blob URL
    const resp = await fetch(coverUrl, { mode: 'cors' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const mimeType = blob.type || 'image/jpeg';
    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';

    const arrayBuffer = await blob.arrayBuffer();
    return { data: new Uint8Array(arrayBuffer), mimeType, filename: `cover.${ext}` };
  } catch (err) {
    console.warn('[novelExport] Bỏ qua ảnh bìa do không tải được (CORS hoặc lỗi mạng):', err.message);
    return null;
  }
}

/**
 * Lấy tiêu đề chuẩn cho chương
 * Không thêm "Chương N" nếu tiêu đề đã có; nếu rỗng thì dùng "Chương {order}"
 */
function resolveChapterTitle(chap, index) {
  if (chap?.title && chap.title.trim()) {
    return chap.title.trim();
  }
  const fallbackNum = chap?.order != null ? (chap.order === 0 ? 1 : chap.order) : index + 1;
  return `Chương ${fallbackNum}`;
}

/**
 * =========================================================================
 * XUẤT ĐỊNH DẠNG TXT
 * =========================================================================
 * - UTF-8, không BOM, xuống dòng \n
 * - Dùng mảng Blob parts để không cấp phát một chuỗi khổng lồ
 * - Đầu file: Tên truyện, Tác giả, Mô tả, dòng phân cách
 * - Mỗi chương: dòng tiêu đề, dòng trống, nội dung, 2 dòng trống trước chương kế
 */
export async function exportNovelToTxt(novel, chapters, options = {}) {
  const { signal, onProgress, rangeStart, rangeEnd, totalAllChapters } = options;

  if (!novel) throw new Error('Không tìm thấy thông tin truyện.');
  if (!chapters || chapters.length === 0) throw new Error('Truyện chưa có chương nào để tải về.');

  if (isNovelInVault(novel) && !isVaultSessionUnlocked()) {
    throw new Error('Phiên Mật Thất chưa mở khóa. Không thể tải truyện.');
  }

  const parts = [];

  // Header thông tin truyện
  let header = novel.title || 'Truyện Chữ';
  if (novel.author) header += `\nTác giả: ${novel.author}`;
  if (novel.description) header += `\nMô tả: ${novel.description}`;
  header += '\n--------------------------------------------------\n\n';
  parts.push(header);

  const total = chapters.length;
  const BATCH_SIZE = 150;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      throw new DOMException('Quá trình xuất đã bị hủy', 'AbortError');
    }

    const chap = chapters[i];
    const title = resolveChapterTitle(chap, i);

    // Chuẩn hóa dòng và đoạn văn
    const rawContent = (chap.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const cleanContent = rawContent
      ? rawContent
          .split(/\n\s*\n+/)
          .map((p) => p.trim())
          .filter(Boolean)
          .join('\n\n')
      : '';

    let chapterText = title + '\n\n' + cleanContent;
    if (i < total - 1) {
      // Hai dòng trống trước chương kế (\n\n\n)
      chapterText += '\n\n\n';
    } else {
      chapterText += '\n';
    }

    parts.push(chapterText);

    if (onProgress && (i % 25 === 0 || i === total - 1)) {
      onProgress({
        phase: 'processing',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      });
    }

    // Nhường luồng chính định kỳ
    if (i > 0 && i % BATCH_SIZE === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const blob = new Blob(parts, { type: 'text/plain;charset=utf-8' });
  const filename = generateExportFilename(
    novel.title,
    rangeStart,
    rangeEnd,
    totalAllChapters || total,
    '.txt'
  );

  return {
    blob,
    filename,
    sizeMB: (blob.size / (1024 * 1024)).toFixed(2),
  };
}

/**
 * =========================================================================
 * XUẤT ĐỊNH DẠNG EPUB (EPUB 3 + EPUB 2)
 * =========================================================================
 * - Mimetype ghi đầu tiên, không nén (STORE)
 * - META-INF/container.xml trỏ tới OEBPS/content.opf
 * - OEBPS/content.opf, nav.xhtml, toc.ncx, style.css, chapters/chap_xxxxx.xhtml
 * - Metadata đầy đủ, chuẩn ISO không ms
 * - Xử lý theo lô (batch), nhường luồng định kỳ
 * - Hỗ trợ AbortController
 */
export async function exportNovelToEpub(novel, chapters, options = {}) {
  const { signal, onProgress, includeCover = true, rangeStart, rangeEnd, totalAllChapters } = options;

  if (!novel) throw new Error('Không tìm thấy thông tin truyện.');
  if (!chapters || chapters.length === 0) throw new Error('Truyện chưa có chương nào để tải về.');

  if (isNovelInVault(novel) && !isVaultSessionUnlocked()) {
    throw new Error('Phiên Mật Thất chưa mở khóa. Không thể tải truyện.');
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // 1. mimetype: PHẢI là mục đầu tiên và PHẢI là STORE (không nén)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. Tải ảnh bìa nếu được yêu cầu
  let coverInfo = null;
  if (includeCover && (novel.coverUrl || novel.coverThumb)) {
    coverInfo = await resolveCoverImage(novel.coverUrl || novel.coverThumb);
  }

  const total = chapters.length;
  const bookId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'pub-' + Math.random().toString(36).slice(2) + Date.now();
  const modifiedIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const manifestItems = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="style" href="style.css" media-type="text/css"/>',
  ];
  const spineItems = ['<itemref idref="nav" linear="no"/>'];
  const navListItems = [];
  const ncxNavPoints = [];

  let playOrder = 1;

  if (coverInfo) {
    zip.file(`OEBPS/${coverInfo.filename}`, coverInfo.data);
    manifestItems.push(
      `<item id="cover-image" href="${coverInfo.filename}" media-type="${coverInfo.mimeType}" properties="cover-image"/>`
    );
    manifestItems.push('<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>');

    spineItems.unshift('<itemref idref="cover-page"/>');
    navListItems.push('      <li><a href="cover.xhtml">Bìa Sách</a></li>');
    ncxNavPoints.push(`    <navPoint id="navPoint-cover" playOrder="${playOrder++}">
      <navLabel><text>Bìa Sách</text></navLabel>
      <content src="cover.xhtml"/>
    </navPoint>`);

    const coverHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi" lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>Bìa Sách</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
  <style type="text/css">
    @page { margin: 0; }
    body { margin: 0; padding: 0; text-align: center; background-color: #121824; }
    .cover-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .cover-img { max-width: 100%; max-height: 100vh; width: auto; height: auto; object-fit: contain; }
  </style>
</head>
<body>
  <div class="cover-wrap">
    <img src="${coverInfo.filename}" alt="Bìa Sách" class="cover-img"/>
  </div>
</body>
</html>`;
    zip.file('OEBPS/cover.xhtml', coverHtml);
  }

  // 4. style.css
  const styleCss = `/* EPUB Core Stylesheet for Thiên Cơ Lâu */
@charset "utf-8";
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Times New Roman", serif;
  line-height: 1.75;
  margin: 5%;
  text-align: justify;
  color: #1a1a1a;
  background-color: #fafafa;
}
h2 {
  font-size: 1.35em;
  font-weight: 700;
  text-align: center;
  margin-top: 1.8em;
  margin-bottom: 1.2em;
  line-height: 1.4;
  color: #111111;
}
p {
  margin-top: 0;
  margin-bottom: 0.8em;
  text-indent: 1.5em;
  word-break: break-word;
}
img {
  max-width: 100%;
  height: auto;
}
`;
  zip.file('OEBPS/style.css', styleCss);

  // 5. Xử lý từng chương theo lô
  const BATCH_SIZE = 100;
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      throw new DOMException('Quá trình xuất đã bị hủy', 'AbortError');
    }

    const chap = chapters[i];
    const title = resolveChapterTitle(chap, i);
    const padded = String(i + 1).padStart(5, '0');
    const chapFileName = `chapters/chap_${padded}.xhtml`;
    const chapId = `chap-${padded}`;

    manifestItems.push(`<item id="${chapId}" href="${chapFileName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${chapId}"/>`);
    navListItems.push(`      <li><a href="${chapFileName}">${escapeXml(title)}</a></li>`);
    ncxNavPoints.push(`    <navPoint id="navPoint-${i + 1}" playOrder="${playOrder++}">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="${chapFileName}"/>
    </navPoint>`);

    const paragraphsHtml = formatParagraphsToXhtml(chap.content);
    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi" lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
  <h2>${escapeXml(title)}</h2>
${paragraphsHtml}
</body>
</html>`;

    zip.file(`OEBPS/${chapFileName}`, chapterXhtml);

    if (onProgress && (i % 20 === 0 || i === total - 1)) {
      onProgress({
        phase: 'processing',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 50), // 0-50% là pha tạo tài liệu
      });
    }

    if (i > 0 && i % BATCH_SIZE === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // 6. nav.xhtml (EPUB 3 Navigation Document)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>Mục Lục</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h2>Mục Lục</h2>
    <ol>
${navListItems.join('\n')}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // 7. toc.ncx (EPUB 2 Navigation Document)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(novel.title || 'Truyện Chữ')}</text>
  </docTitle>
  <navMap>
${ncxNavPoints.join('\n')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);

  // 8. content.opf (Package Document)
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="vi">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="pub-id">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${escapeXml(novel.title || 'Truyện Chữ')}</dc:title>
    <dc:creator id="author">${escapeXml(novel.author || 'Khuyết Danh')}</dc:creator>
    <dc:language>vi</dc:language>
    ${novel.description ? `<dc:description>${escapeXml(novel.description)}</dc:description>` : ''}
    <meta property="dcterms:modified">${modifiedIso}</meta>
    ${coverInfo ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
${manifestItems.map((item) => '    ' + item).join('\n')}
  </manifest>
  <spine toc="ncx">
${spineItems.map((item) => '    ' + item).join('\n')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  // 9. Nén zip và tạo Blob
  if (onProgress) {
    onProgress({ phase: 'compressing', percent: 50, current: total, total });
  }

  const blob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      streamFiles: true,
    },
    (meta) => {
      if (signal?.aborted) {
        throw new DOMException('Quá trình xuất đã bị hủy', 'AbortError');
      }
      if (onProgress) {
        const overall = Math.min(99, 50 + Math.round((meta.percent / 100) * 50));
        onProgress({
          phase: 'compressing',
          percent: overall,
          current: total,
          total,
        });
      }
    }
  );

  if (signal?.aborted) {
    throw new DOMException('Quá trình xuất đã bị hủy', 'AbortError');
  }

  const filename = generateExportFilename(
    novel.title,
    rangeStart,
    rangeEnd,
    totalAllChapters || total,
    '.epub'
  );

  return {
    blob,
    filename,
    sizeMB: (blob.size / (1024 * 1024)).toFixed(2),
  };
}

/**
 * Tự động kích hoạt tải file về máy
 */
export function triggerDownload(blob, filename) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Thu hồi Object URL sau 60 giây để tránh rò rỉ bộ nhớ
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 60000);

  return url;
}

/**
 * Chia sẻ file qua Web Share API nếu trình duyệt hỗ trợ
 */
export async function shareFile(blob, filename, title = '') {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;

  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: title || filename,
        text: `Tải từ Thiên Cơ Lâu: ${filename}`,
      });
      return true;
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[novelExport] navigator.share error:', err);
    }
  }
  return false;
}
