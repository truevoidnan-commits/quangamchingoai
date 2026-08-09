/**
 * Chapter parser — Bộ phân tích và bóc tách chương thông minh cho file .txt và .epub
 * - Phân tích cấu trúc EPUB 2 / EPUB 3 chuyên sâu (Spine, NCX, Nav, Manifest, Cover image)
 * - Tách nhiều chương trong cùng 1 file HTML
 * - Chuẩn hóa tiêu đề chương (Thứ X chương, Chương X, Hồi X, Tiết X, Mã số đặc biệt)
 * - Khắc phục hoàn toàn lỗi nhận diện nhầm "ngoại" (chỉ nhận diện Phiên ngoại / Ngoại truyện khi tiêu đề bắt đầu rõ ràng)
 * - Giữ nguyên thứ tự tự nhiên của các chương trong sách
 * - Trích xuất ảnh bìa và phần giới thiệu tự động
 */
import JSZip from 'jszip';
import { normalizeVietnamese, formatChapterContent, capFirstLetters } from './textFixer';

const CHAP_LABEL = {
  "chương": "Chương",
  "chuong": "Chương",
  "chapter": "Chapter",
  "hồi": "Hồi",
  "hoi": "Hồi",
  "quyển": "Quyển",
  "quyen": "Quyển",
  "phần": "Phần",
  "phan": "Phần",
  "tiết": "Tiết",
  "tiet": "Tiết",
};

const NUM_WORD = "(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|linh|lẻ|nhất|nhị|tam|tứ|ngũ|lục|thất|bát|cửu|thập)";
const NUM_TOKEN = "(?:[0-9]+|" + NUM_WORD + "(?:\\s+" + NUM_WORD + ")*)";
const MAX_HEADER_LEN = 120;

// 1. Dạng "Thứ 1 Chương (tên truyện) (1. 1) (tên chương)" -> lấy số + tên chương, bỏ tên truyện và cặp số (x,y)
const specialRe = new RegExp("^\\s*thứ\\s+(" + NUM_TOKEN + ")\\s+(chương|chuong|chapter|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet)\\b.*?\\(\\s*\\d+[\\d\\s.,]*\\)\\s*(.*)$", "i");

// 2. Dạng "Thứ 5 Chương ..." không có cặp số phía sau
const thuRe = new RegExp("^\\s*thứ\\s+(" + NUM_TOKEN + ")\\s+(chương|chuong|chapter|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet)\\b\\s*[:\\-–.]?\\s*(.*)$", "i");

// 3. Dạng "Chương 5", "Chương thứ 5", "Chapter 5"...
const autoRe = new RegExp("^\\s*(chương|chuong|chapter|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet)\\s+(thứ\\s+)?(" + NUM_TOKEN + ")\\s*[:\\-–.]?\\s*(.*)$", "i");

// 4. Dạng "Phiên ngoại", "Phiên ngoại 1", "Ngoại truyện: ..." (Bắt buộc bắt đầu bằng phiên ngoại/ngoại truyện, KHÔNG bắt chữ "ngoại" ở giữa câu)
const extraRe = new RegExp("^\\s*(phiên\\s*ngoại|phien\\s*ngoai|ngoại\\s*truyện|ngoai\\s*truyen|extra|side\\s*story)\\b(?:\\s+(" + NUM_TOKEN + "))?\\s*[:\\-–.]?\\s*(.*)$", "i");
const EXTRA_LABEL = {
  "phiên ngoại": "Phiên ngoại",
  "phien ngoai": "Phiên ngoại",
  "ngoại truyện": "Ngoại truyện",
  "ngoai truyen": "Ngoại truyện",
  "extra": "Extra",
  "side story": "Side Story",
};

/**
 * Kiểm tra xem một tiêu đề có phải là Phiên ngoại / Ngoại truyện hay không
 * Tuyệt đối không dùng regex lỏng lẻo như /ngoại/i để tránh nhầm "Quang Âm Chi Ngoại", "Ngoại Môn", "Ngoại Cảnh"...
 */
export function isExtraChapter(title) {
  if (!title) return false;
  const trimmed = title.trim();
  return /^\s*(?:phiên\s*ngoại|phien\s*ngoai|ngoại\s*truyện|ngoai\s*truyen|extra\b|side\s*story\b)/i.test(trimmed);
}

/**
 * Thử khớp một dòng với tiêu đề chương
 */
export function tryMatchChapterHeader(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADER_LEN) return null;

  // Tránh câu hội thoại bắt đầu bằng ngoặc kép hoặc gạch đầu dòng thoại
  if (/^["'“‘«]/.test(trimmed)) return null;

  let m = trimmed.match(extraRe);
  if (m) {
    const key = normalizeVietnamese(m[1].toLowerCase()).replace(/\s+/g, " ");
    const label = EXTRA_LABEL[key] || m[1];
    const num = m[2] ? " " + m[2] : "";
    const name = normalizeVietnamese((m[3] || "").trim()).replace(/^[:\s\-–—]+/, '');
    const title = label + num + (name ? ": " + name : "");
    return { label, num: (m[2] || ""), name, title: capFirstLetters(title), extra: true };
  }

  m = trimmed.match(specialRe);
  if (m) {
    const label = CHAP_LABEL[m[2].toLowerCase()] || "Chương";
    const num = m[1];
    const name = normalizeVietnamese((m[3] || "").trim()).replace(/^[:\s\-–—]+/, '');
    const title = label + " " + num + (name ? ": " + name : "");
    return { label, num, name, title: capFirstLetters(title), extra: false };
  }

  m = trimmed.match(thuRe);
  if (m) {
    const label = CHAP_LABEL[m[2].toLowerCase()] || "Chương";
    const num = m[1];
    const name = normalizeVietnamese((m[3] || "").trim()).replace(/^[:\s\-–—]+/, '');
    const title = label + " " + num + (name ? ": " + name : "");
    return { label, num, name, title: capFirstLetters(title), extra: false };
  }

  m = trimmed.match(autoRe);
  if (m) {
    const label = CHAP_LABEL[m[1].toLowerCase()] || m[1];
    const num = m[3];
    const name = normalizeVietnamese((m[4] || "").trim()).replace(/^[:\s\-–—]+/, '');
    const title = label + " " + num + (name ? ": " + name : "");
    return { label, num, name, title: capFirstLetters(title), extra: false };
  }

  return null;
}

/**
 * Parse plain text file (.txt)
 */
export function parseTxtFile(text, filename = '') {
  text = normalizeVietnamese(text);
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const chaps = [];
  let cur = null;
  let preLines = [];

  for (const line of lines) {
    const h = tryMatchChapterHeader(line);
    if (h) {
      if (cur) chaps.push(cur);
      cur = { title: h.title, extra: h.extra, lines: [] };
      continue;
    }
    if (!cur) {
      if (line.trim()) preLines.push(line.trim());
      continue;
    }
    cur.lines.push(line);
  }
  if (cur) chaps.push(cur);

  const result = chaps.map((c, i) => ({
    title: c.title,
    content: formatChapterContent(c.lines.join("\n")),
    order: i,
    isExtra: !!c.extra,
  })).filter(c => c.content.trim().length > 0);

  const description = result.length ? normalizeVietnamese(preLines.join("\n\n").trim()) : "";
  const defaultTitle = filename ? filename.replace(/\.[^/.]+$/, '').trim() : '';

  return {
    title: defaultTitle,
    description: description || '',
    chapters: result.length ? result : [{
      title: defaultTitle || 'Nội dung',
      content: formatChapterContent(text),
      order: 0,
      isExtra: false,
    }],
  };
}

/**
 * Xử lý đường dẫn tương đối trong zip của file EPUB
 */
function resolvePath(baseDir, relativePath) {
  if (!relativePath) return '';
  if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
  const stack = baseDir ? baseDir.split('/').filter(Boolean) : [];
  const parts = relativePath.split('/');
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

/**
 * Trích xuất toàn bộ TOC từ toc.ncx hoặc nav.xhtml
 */
async function extractEpubTocMap(zip, opfDir, manifest) {
  const tocMap = new Map(); // href -> title

  // 1. Thử đọc toc.ncx
  try {
    let ncxHref = '';
    for (const [id, item] of Object.entries(manifest)) {
      if (item.mediaType === 'application/x-dtbncx+xml' || item.href.endsWith('.ncx')) {
        ncxHref = item.href;
        break;
      }
    }

    if (ncxHref) {
      const fullNcxPath = resolvePath(opfDir, ncxHref);
      const ncxFile = zip.file(fullNcxPath) || zip.file(decodeURIComponent(fullNcxPath));
      if (ncxFile) {
        const ncxXml = await ncxFile.async('string');
        const doc = new DOMParser().parseFromString(ncxXml, 'application/xml');
        doc.querySelectorAll('navPoint').forEach(np => {
          const label = np.querySelector('navLabel text')?.textContent?.trim();
          const src = np.querySelector('content')?.getAttribute('src');
          if (label && src) {
            const cleanSrc = src.split('#')[0];
            const resolvedSrc = resolvePath(opfDir, cleanSrc);
            if (!tocMap.has(resolvedSrc)) {
              tocMap.set(resolvedSrc, normalizeVietnamese(label));
            }
          }
        });
      }
    }
  } catch (e) {
    // Ignore NCX errors
  }

  // 2. Thử đọc nav.xhtml (EPUB 3)
  try {
    let navHref = '';
    for (const [id, item] of Object.entries(manifest)) {
      if (item.properties?.includes('nav') || item.href.includes('nav')) {
        navHref = item.href;
        break;
      }
    }
    if (navHref) {
      const fullNavPath = resolvePath(opfDir, navHref);
      const navFile = zip.file(fullNavPath) || zip.file(decodeURIComponent(fullNavPath));
      if (navFile) {
        const navHtml = await navFile.async('string');
        const doc = new DOMParser().parseFromString(navHtml, 'text/html');
        doc.querySelectorAll('nav[epub\\:type="toc"] a, nav.toc a, ol a').forEach(a => {
          const label = a.textContent?.trim();
          const href = a.getAttribute('href');
          if (label && href) {
            const cleanHref = href.split('#')[0];
            const resolved = resolvePath(opfDir, cleanHref);
            if (!tocMap.has(resolved)) {
              tocMap.set(resolved, normalizeVietnamese(label));
            }
          }
        });
      }
    }
  } catch (e) {
    // Ignore NAV errors
  }

  return tocMap;
}

/**
 * Trích xuất ảnh bìa tự động từ EPUB
 */
async function extractEpubCover(zip, opfDir, opfDoc, manifest) {
  try {
    let coverHref = '';

    // Cách 1: manifest item with properties="cover-image"
    for (const [id, item] of Object.entries(manifest)) {
      if (item.properties?.includes('cover-image')) {
        coverHref = item.href;
        break;
      }
    }

    // Cách 2: meta name="cover"
    if (!coverHref) {
      const coverMeta = opfDoc.querySelector('metadata meta[name="cover"]');
      const coverId = coverMeta?.getAttribute('content');
      if (coverId && manifest[coverId]) {
        coverHref = manifest[coverId].href;
      }
    }

    // Cách 3: Tìm item có id hoặc href chứa từ 'cover'
    if (!coverHref) {
      for (const [id, item] of Object.entries(manifest)) {
        if (/cover/i.test(id) || /cover/i.test(item.href)) {
          if (/image\//i.test(item.mediaType) || /\.(jpg|jpeg|png|webp)/i.test(item.href)) {
            coverHref = item.href;
            break;
          }
        }
      }
    }

    if (coverHref) {
      const fullPath = resolvePath(opfDir, coverHref);
      const imgFile = zip.file(fullPath) || zip.file(decodeURIComponent(fullPath));
      if (imgFile) {
        const base64 = await imgFile.async('base64');
        const ext = coverHref.split('.').pop().toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${base64}`;
      }
    }
  } catch (e) {
    // Ignore cover extraction error
  }
  return '';
}

/**
 * Parse .epub file siêu cấp chuẩn xác (EPUB 2 & EPUB 3)
 */
export async function parseEpubFile(arrayBuffer, filename = '') {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Tìm file OPF từ META-INF/container.xml
  let opfPath = '';
  try {
    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    if (containerXml) {
      const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
      const rootfile = containerDoc.querySelector("rootfile");
      if (rootfile) opfPath = rootfile.getAttribute("full-path") || '';
    }
  } catch (e) {}

  if (!opfPath) {
    // Fallback: Tìm file .opf trong zip
    const opfEntry = Object.keys(zip.files).find(p => p.endsWith('.opf'));
    opfPath = opfEntry || 'content.opf';
  }

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  let opfDoc = null;
  let bookTitle = '';
  let bookDesc = '';
  const manifest = {};
  const spineHrefs = [];

  const opfFile = zip.file(opfPath) || zip.file(decodeURIComponent(opfPath));
  if (opfFile) {
    const opfXml = await opfFile.async("string");
    opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");

    // Tiêu đề sách
    const metaTitle = opfDoc.querySelector("metadata title, dc\\:title, title")?.textContent;
    if (metaTitle) bookTitle = normalizeVietnamese(metaTitle.trim());

    // Mô tả / giới thiệu
    const metaDesc = opfDoc.querySelector("metadata description, dc\\:description, description")?.textContent;
    if (metaDesc) bookDesc = normalizeVietnamese(metaDesc.trim());

    // Manifest items
    opfDoc.querySelectorAll("manifest item").forEach(item => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      const mediaType = item.getAttribute("media-type") || '';
      const properties = item.getAttribute("properties") || '';
      if (id && href) {
        manifest[id] = { href, mediaType, properties };
      }
    });

    // Spine items (Thứ tự đọc chính xác của cuốn sách)
    opfDoc.querySelectorAll("spine itemref").forEach(ref => {
      const idref = ref.getAttribute("idref");
      if (manifest[idref]) {
        spineHrefs.push(manifest[idref].href);
      }
    });
  }

  // Fallback nếu không đọc được spine: Lấy tất cả file html/xhtml theo thứ tự tên file
  if (spineHrefs.length === 0) {
    Object.keys(zip.files)
      .filter(p => /\.(html|xhtml|htm)$/i.test(p) && !/nav|toc|cover/i.test(p))
      .sort()
      .forEach(p => spineHrefs.push(p.startsWith(opfDir) ? p.slice(opfDir.length) : p));
  }

  // Đọc TOC Map từ NCX / NAV
  const tocMap = await extractEpubTocMap(zip, opfDir, manifest);

  // Trích xuất ảnh bìa
  const coverUrl = opfDoc ? await extractEpubCover(zip, opfDir, opfDoc, manifest) : '';

  const parsedChapters = [];
  let currentOrder = 0;

  for (const rawHref of spineHrefs) {
    const fullPath = resolvePath(opfDir, rawHref);
    const zfile = zip.file(fullPath) || zip.file(decodeURIComponent(fullPath));
    if (!zfile) continue;

    try {
      const html = await zfile.async("string");
      const doc = new DOMParser().parseFromString(html, "text/html");

      // Xóa bỏ các thẻ rác không phải nội dung
      doc.querySelectorAll("script, style, nav, aside, svg, link, header, footer").forEach(n => n.remove());

      const body = doc.body;
      if (!body) continue;

      // Tiêu đề từ TOC Map
      const tocTitle = tocMap.get(fullPath) || tocMap.get(rawHref) || '';

      // Kiểm tra xem trang có nhiều thẻ Heading (h1, h2, h3) để tách thành nhiều chương con không
      const headings = Array.from(body.querySelectorAll('h1, h2, h3, h4'));

      if (headings.length > 1) {
        // Tách các chương con trong cùng 1 file HTML
        let currentSubTitle = '';
        let currentSubNodes = [];

        function pushSubChapter() {
          if (currentSubNodes.length > 0) {
            const rawSubText = currentSubNodes.map(n => n.textContent || '').join('\n');
            const subContent = formatChapterContent(rawSubText);
            if (subContent.trim().length >= 30) {
              const matchedHeader = tryMatchChapterHeader(currentSubTitle);
              const finalTitle = matchedHeader ? matchedHeader.title : (currentSubTitle || `Chương ${currentOrder + 1}`);
              parsedChapters.push({
                title: capFirstLetters(finalTitle),
                content: subContent,
                order: currentOrder++,
                isExtra: isExtraChapter(finalTitle),
              });
            }
          }
        }

        Array.from(body.childNodes).forEach(node => {
          if (/^H[1-4]$/i.test(node.nodeName)) {
            pushSubChapter();
            currentSubTitle = normalizeVietnamese(node.textContent?.trim() || '');
            currentSubNodes = [];
          } else {
            currentSubNodes.push(node);
          }
        });
        pushSubChapter();
      } else {
        // 1 file HTML = 1 chương
        let docTitle = tocTitle;
        if (!docTitle) {
          const h = doc.querySelector("h1, h2, h3, .chapter-title, .title");
          if (h) docTitle = normalizeVietnamese(h.textContent.trim());
        }

        const rawText = body.innerText || body.textContent || '';
        const content = formatChapterContent(rawText);

        // Bỏ qua trang bìa / trang mục lục trống không có nội dung thực tế (< 40 ký tự)
        if (content.trim().length < 40 && !docTitle) continue;

        const matchedHeader = tryMatchChapterHeader(docTitle);
        const finalTitle = matchedHeader ? matchedHeader.title : (docTitle || `Chương ${currentOrder + 1}`);

        parsedChapters.push({
          title: capFirstLetters(finalTitle),
          content: content.trim() ? content : 'Nội dung chương trống.',
          order: currentOrder++,
          isExtra: isExtraChapter(finalTitle),
        });
      }
    } catch (err) {
      // Continue next chapter
    }
  }

  // Tên truyện mặc định: Tên trong metadata hoặc tên file
  const fallbackTitle = filename ? filename.replace(/\.[^/.]+$/, '').trim() : '';
  const finalBookTitle = bookTitle || fallbackTitle;

  return {
    title: finalBookTitle,
    description: bookDesc || '',
    coverUrl: coverUrl || '',
    chapters: parsedChapters,
  };
}

/**
 * Main entry point — nhận File object
 */
export async function parseNovelFile(file) {
  if (file.name.endsWith('.txt')) {
    const text = await file.text();
    return parseTxtFile(text, file.name);
  } else if (file.name.endsWith('.epub')) {
    const buffer = await file.arrayBuffer();
    return parseEpubFile(buffer, file.name);
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
