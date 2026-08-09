/**
 * Chapter parser — tự động tách chương từ file .txt hoặc .epub
 */
import JSZip from 'jszip';
import { normalizeVietnamese, formatChapterContent } from './textFixer';

// ---- Pattern nhận diện tiêu đề chương ----

const CHAPTER_PATTERNS = [
  // Chương X, Chương X:, CHƯƠNG X
  /^(chương|chuong)\s+(\d+|[ivxlcdm]+)[:\s\-–—]*(.*)?$/i,
  // Hồi X
  /^(hồi|hoi)\s+(\d+|[ivxlcdm]+)[:\s\-–—]*(.*)?$/i,
  // Quyển X / Quyển X - Phần Y
  /^(quyển|quyen)\s+(\d+|[ivxlcdm]+)[:\s\-–—]*(.*)?$/i,
  // Phần X
  /^(phần|phan)\s+(\d+|[ivxlcdm]+)[:\s\-–—]*(.*)?$/i,
  // Numbered: "1.", "01.", "1 -"
  /^(\d{1,3})\s*[\.:\-–—]\s+(.+)$/,
];

const EXTRA_PATTERNS = [
  /ngo[aà]i\s*truy[eê]n/i,
  /phi[eê]n\s*ngo[aà]i/i,
  /extra/i,
  /bonus/i,
  /side\s*story/i,
  /^(ss|ex|bn)\s*\.?\s*\d*/i,
  /ngo[aà]i\s*[ký]k/i,
  /đo[aả]n\s*v[aă]n/i,
];

/**
 * Kiểm tra một dòng có phải tiêu đề chương không
 */
function matchChapterTitle(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Must be reasonably short for a title
  if (trimmed.length > 200) return null;

  for (const pattern of CHAPTER_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) {
      return {
        title: trimmed,
        isExtra: EXTRA_PATTERNS.some(p => p.test(trimmed)),
      };
    }
  }
  // Check extra patterns even without chapter prefix
  if (EXTRA_PATTERNS.some(p => p.test(trimmed)) && trimmed.length < 100) {
    return { title: trimmed, isExtra: true };
  }
  return null;
}

/**
 * Parse plain text file thành danh sách chương
 */
export function parseTxtFile(text) {
  const normalized = normalizeVietnamese(text);
  const lines = normalized.split('\n');
  const chapters = [];
  let currentTitle = null;
  let currentIsExtra = false;
  let currentLines = [];
  let order = 0;

  function pushChapter() {
    if (currentTitle !== null && currentLines.length > 0) {
      const content = formatChapterContent(currentLines.join('\n'));
      if (content.trim()) {
        chapters.push({
          title: currentTitle,
          content,
          order: order++,
          isExtra: currentIsExtra,
        });
      }
    }
  }

  for (const line of lines) {
    const match = matchChapterTitle(line);
    if (match) {
      pushChapter();
      currentTitle = match.title;
      currentIsExtra = match.isExtra;
      currentLines = [];
    } else {
      if (currentTitle !== null) {
        currentLines.push(line);
      } else {
        // Content before any chapter heading — treat as prologue/intro
        if (line.trim()) {
          currentLines.push(line);
        }
      }
    }
  }
  // Push last chapter
  if (currentTitle !== null) {
    pushChapter();
  } else if (currentLines.some(l => l.trim())) {
    // Entire file has no chapter headings — treat as single chapter
    chapters.push({
      title: 'Nội dung',
      content: formatChapterContent(currentLines.join('\n')),
      order: 0,
      isExtra: false,
    });
  }

  // Sort: main chapters first, extras last
  const main = chapters.filter(c => !c.isExtra);
  const extra = chapters.filter(c => c.isExtra);
  return [...main, ...extra].map((c, i) => ({ ...c, order: i }));
}

/**
 * Parse .epub file thành danh sách chương
 */
export async function parseEpubFile(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Read container.xml to find OPF file
  let opfPath = '';
  try {
    const container = await zip.file('META-INF/container.xml').async('text');
    const m = container.match(/full-path="([^"]+\.opf)"/i);
    if (m) opfPath = m[1];
  } catch {
    // Try common paths
    opfPath = 'content.opf';
  }

  // Read OPF to get spine order
  let spine = [];
  let manifest = {};
  try {
    const opfText = await zip.file(opfPath).async('text');
    const parser = new DOMParser();
    const opfDoc = parser.parseFromString(opfText, 'text/xml');

    // Build manifest
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    // Get spine order
    opfDoc.querySelectorAll('spine itemref').forEach(ref => {
      const id = ref.getAttribute('idref');
      if (manifest[id]) spine.push(manifest[id]);
    });
  } catch {
    // Fallback: just get all HTML files
    Object.keys(zip.files).forEach(path => {
      if (path.endsWith('.html') || path.endsWith('.xhtml')) spine.push(path);
    });
  }

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // Extract text content from each spine item
  const chapters = [];
  let order = 0;

  for (const href of spine) {
    const fullPath = opfDir + href;
    try {
      const html = await zip.file(fullPath).async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Get title from h1/h2/h3 or <title>
      const titleEl = doc.querySelector('h1, h2, h3');
      let title = titleEl ? titleEl.textContent.trim() : '';
      if (!title) {
        const titleTag = doc.querySelector('title');
        title = titleTag ? titleTag.textContent.trim() : `Chương ${order + 1}`;
      }

      // Remove script, style tags
      doc.querySelectorAll('script, style, nav, aside').forEach(el => el.remove());

      // Get text content
      const body = doc.querySelector('body');
      if (!body) continue;

      const rawText = body.innerText || body.textContent || '';
      const content = formatChapterContent(rawText);

      if (content.trim().length < 50) continue; // Skip very short/empty chapters

      const isExtra = EXTRA_PATTERNS.some(p => p.test(title));

      chapters.push({ title, content, order: order++, isExtra });
    } catch {
      continue;
    }
  }

  // Sort: main first, extra last
  const main = chapters.filter(c => !c.isExtra);
  const extra = chapters.filter(c => c.isExtra);
  return [...main, ...extra].map((c, i) => ({ ...c, order: i }));
}

/**
 * Main entry point — nhận File object
 */
export async function parseNovelFile(file) {
  if (file.name.endsWith('.txt')) {
    const text = await file.text();
    return parseTxtFile(text);
  } else if (file.name.endsWith('.epub')) {
    const buffer = await file.arrayBuffer();
    return parseEpubFile(buffer);
  }
  throw new Error('Định dạng file không được hỗ trợ. Vui lòng dùng .txt hoặc .epub');
}

/**
 * Resize ảnh bìa về kích thước chuẩn (300x400)
 */
export function resizeCoverImage(file, maxWidth = 300, maxHeight = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Maintain aspect ratio, fit within maxWidth x maxHeight
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        if (ratio < 1) {
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
