/**
 * Chapter parser — Bộ phân tích và bóc tách chương thông minh cho file .txt và .epub
 * - Nhận diện toàn diện mọi biến thể tiêu đề:
 *   + "Chương 9: ...", "Chương 9. ...", "Chương 9 - ...", "Chương 9 ..."
 *   + "Đệ 9 chương", "Thứ 9 chương", "Hồi 9", "Quyển 9", "Tập 9", "Chapter 9", "Chap 9"
 *   + "[Chương 9]...", "【Chương 9】...", "(Chương 9)..."
 *   + Số La Mã (Chương IX), số chữ (Chương chín, Đệ cửu chương)
 * - Tự động phát hiện và triệt tiêu tiêu đề kép bị dính liền nhau (Chương 9. + Chương 9:)
 * - Tách toàn bộ hàng ngàn chương trong EPUB nhiều chương/file .xhtml
 * - Tự động loại bỏ trang bìa (titlepage, cover) khỏi danh sách chương
 * - Tách bạch chuẩn xác từng đoạn văn (<p>), giữ layout thoáng đãng như ứng dụng đọc cao cấp
 */
import JSZip from 'jszip';
import { normalizeVietnamese, formatChapterContent, capFirstLetters } from './textFixer';

const CHAP_LABEL = {
  "chương": "Chương",
  "chuong": "Chương",
  "chapter": "Chapter",
  "chap": "Chương",
  "ch": "Chương",
  "hồi": "Hồi",
  "hoi": "Hồi",
  "quyển": "Quyển",
  "quyen": "Quyển",
  "phần": "Phần",
  "phan": "Phần",
  "tiết": "Tiết",
  "tiet": "Tiết",
  "tập": "Tập",
  "tap": "Tập",
  "đoạn": "Đoạn",
  "doan": "Đoạn",
};

const ROMAN_NUM = "(?:M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))";
const NUM_WORD = "(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|linh|lẻ|nhất|nhị|tam|tứ|ngũ|lục|thất|bát|cửu|thập|bách|thiên|vạn)";
const NUM_TOKEN = "(?:[0-9]+|" + NUM_WORD + "(?:\\s+" + NUM_WORD + ")*|" + ROMAN_NUM + ")";
const MAX_HEADER_LEN = 140;

// 1. Dạng "Thứ 1 Chương (tên truyện) (1. 1) (tên chương)"
const specialRe = new RegExp("^\\s*[\\[\\(【]?\\s*(?:thứ|đệ|thu|de)\\s+(" + NUM_TOKEN + ")\\s+(chương|chuong|chapter|chap|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet|tập|tap)\\b.*?\\(\\s*\\d+[\\d\\s.,]*\\)\\s*(.*)$", "i");

// 2. Dạng "Đệ 9 chương...", "Thứ 9 chương..."
const deThuRe = new RegExp("^\\s*[\\[\\(【]?\\s*(?:thứ|đệ|thu|de)\\s+(" + NUM_TOKEN + ")\\s+(chương|chuong|chapter|chap|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet|tập|tap)\\b\\s*[\\]\\)】]?\\s*([:\\-–—_.~·:：．、/]?|\\s+)\\s*(.*)$", "i");

// 3. Dạng "Chương 9", "[Chương 9]", "Chương 9.", "Chương 9:", "Chương 9 -", "Chương 9..."
const chapRe = new RegExp("^\\s*[\\[\\(【]?\\s*(chương|chuong|chapter|chap|ch|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet|tập|tap)\\s+(?:thứ\\s+|đệ\\s+)?(" + NUM_TOKEN + ")\\s*[\\]\\)】]?\\s*([:\\-–—_.~·:：．、/]?|\\s+)\\s*(.*)$", "i");

// 4. Dạng "Phiên ngoại", "Ngoại truyện", "Extra", "Side story"
const extraRe = new RegExp("^\\s*[\\[\\(【]?\\s*(phiên\\s*ngoại|phien\\s*ngoai|ngoại\\s*truyện|ngoai\\s*truyen|extra|side\\s*story)\\b(?:\\s+(" + NUM_TOKEN + "))?\\s*[\\]\\)】]?\\s*([:\\-–—_.~·:：．、/]?|\\s+)\\s*(.*)$", "i");

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
 */
export function isExtraChapter(title) {
  if (!title) return false;
  const trimmed = title.trim();
  return /^\s*[\\[\\(【]?(?:phiên\\s*ngoại|phien\\s*ngoai|ngoại\\s*truyện|ngoai\\s*truyen|extra\\b|side\\s*story\\b)/i.test(trimmed);
}

/**
 * Thử khớp một dòng với tiêu đề chương
 */
export function tryMatchChapterHeader(line) {
  const trimmed = line ? line.trim() : '';
  if (!trimmed || trimmed.length > MAX_HEADER_LEN) return null;

  // Tránh câu hội thoại bắt đầu bằng ngoặc kép hoặc gạch thoại
  if (/^["'“‘«—\-]/.test(trimmed) && !/^—\s*chương/i.test(trimmed)) return null;

  // 1. Phiên ngoại
  let m = trimmed.match(extraRe);
  if (m) {
    const key = normalizeVietnamese(m[1].toLowerCase()).replace(/\s+/g, " ");
    const label = EXTRA_LABEL[key] || m[1];
    const num = m[2] ? " " + m[2] : "";
    const name = normalizeVietnamese((m[4] || "").trim()).replace(/^[:\s\-–—_.~·:：．、/]+/, '');
    const title = label + num + (name ? ": " + name : "");
    return { label, num: (m[2] || "").trim(), name, title: capFirstLetters(title), extra: true };
  }

  // 2. Special format có cặp số (x. y)
  m = trimmed.match(specialRe);
  if (m) {
    const label = CHAP_LABEL[m[2].toLowerCase()] || "Chương";
    const num = m[1].trim();
    const name = normalizeVietnamese((m[3] || "").trim()).replace(/^[:\s\-–—_.~·:：．、/]+/, '');
    const title = label + " " + num + (name ? ": " + name : "");
    return { label, num, name, title: capFirstLetters(title), extra: false };
  }

  // 3. Đệ X chương / Thứ X chương
  m = trimmed.match(deThuRe);
  if (m) {
    const label = CHAP_LABEL[m[2].toLowerCase()] || "Chương";
    const num = m[1].trim();
    const name = normalizeVietnamese((m[4] || "").trim()).replace(/^[:\s\-–—_.~·:：．、/]+/, '');
    const title = label + " " + num + (name ? ": " + name : "");
    return { label, num, name, title: capFirstLetters(title), extra: false };
  }

  // 4. Chương X, Chương X., Chương X:, Chương X -
  m = trimmed.match(chapRe);
  if (m) {
    const label = CHAP_LABEL[m[1].toLowerCase()] || "Chương";
    const num = m[2].trim();
    const name = normalizeVietnamese((m[4] || "").trim()).replace(/^[:\s\-–—_.~·:：．、/]+/, '');
    const title = label + " " + num + (name ? ": " + name : "");
    return { label, num, name, title: capFirstLetters(title), extra: false };
  }

  return null;
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
  const fileItemsMap = new Map();
  const directMap = new Map();

  function addTocEntry(rawSrc, rawLabel) {
    if (!rawSrc || !rawLabel) return;
    const label = normalizeVietnamese(rawLabel.trim());
    const cleanSrc = rawSrc.split('#')[0];
    const hash = rawSrc.includes('#') ? rawSrc.split('#')[1] : '';

    const resolvedClean = resolvePath(opfDir, cleanSrc);
    const resolvedFull = hash ? `${resolvedClean}#${hash}` : resolvedClean;

    directMap.set(resolvedFull, label);

    if (!fileItemsMap.has(resolvedClean)) {
      fileItemsMap.set(resolvedClean, []);
    }
    fileItemsMap.get(resolvedClean).push({ id: hash, label, src: resolvedFull });
  }

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
          const label = np.querySelector('navLabel text')?.textContent;
          const src = np.querySelector('content')?.getAttribute('src');
          if (label && src) addTocEntry(src, label);
        });
      }
    }
  } catch (e) {}

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
          const label = a.textContent;
          const href = a.getAttribute('href');
          if (label && href) addTocEntry(href, label);
        });
      }
    }
  } catch (e) {}

  return { fileItemsMap, directMap };
}

/**
 * Trích xuất ảnh bìa tự động từ EPUB
 */
async function extractEpubCover(zip, opfDir, opfDoc, manifest) {
  try {
    let coverHref = '';

    for (const [id, item] of Object.entries(manifest)) {
      if (item.properties?.includes('cover-image')) {
        coverHref = item.href;
        break;
      }
    }

    if (!coverHref) {
      const coverMeta = opfDoc.querySelector('metadata meta[name="cover"]');
      const coverId = coverMeta?.getAttribute('content');
      if (coverId && manifest[coverId]) {
        coverHref = manifest[coverId].href;
      }
    }

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
  } catch (e) {}
  return '';
}

/**
 * Tách HTML thành danh sách các chương độc lập
 * - Quét tìm tất cả các vị trí phân tách chương (Heading, TOC anchor, regex Chương X, Đệ X chương...)
 * - Tự động bỏ qua tiêu đề kép trùng lặp (ví dụ: dòng 1 "Chương 9." và dòng 2 "Chương 9:")
 */
export function extractChaptersFromHtml(doc, defaultTocTitle = '', fileTocItems = []) {
  const body = doc.body;
  if (!body) return { chapters: [], prelude: '' };

  // 1. Loại bỏ các thẻ rác
  body.querySelectorAll('script, style, nav, aside, svg, link, header, footer, noscript, hr').forEach(n => n.remove());

  // 2. Thay thế tất cả <br> thành ký tự xuống dòng
  body.querySelectorAll('br').forEach(br => {
    br.replaceWith(document.createTextNode('\n'));
  });

  // 3. Xây dựng bảng ID -> TOC Title
  const idToTocMap = new Map();
  if (fileTocItems && fileTocItems.length > 0) {
    fileTocItems.forEach(item => {
      if (item.id) idToTocMap.set(item.id, item.label);
    });
  }

  // 4. Lấy tất cả các thẻ leaf block
  const leafBlocks = Array.from(body.querySelectorAll('p, div, blockquote, li, h1, h2, h3, h4, h5, h6, section, article')).filter(el => {
    if ((el.tagName === 'DIV' || el.tagName === 'SECTION' || el.tagName === 'ARTICLE') && el.querySelector('p, div, blockquote, li, section, article')) {
      return false;
    }
    return true;
  });

  // Helper nhận diện element có phải là Chapter Header không
  function checkElementForHeader(el) {
    if (!el) return null;

    if (el.id && idToTocMap.has(el.id)) {
      const label = idToTocMap.get(el.id);
      const matched = tryMatchChapterHeader(label);
      return { title: matched ? matched.title : label, num: matched?.num || '', isExtra: isExtraChapter(label) };
    }

    const anchor = el.querySelector('a[id], a[name], [id]');
    if (anchor) {
      const anchorId = anchor.getAttribute('id') || anchor.getAttribute('name');
      if (anchorId && idToTocMap.has(anchorId)) {
        const label = idToTocMap.get(anchorId);
        const matched = tryMatchChapterHeader(label);
        return { title: matched ? matched.title : label, num: matched?.num || '', isExtra: isExtraChapter(label) };
      }
    }

    const rawText = normalizeVietnamese(el.textContent || '').trim();
    if (!rawText) return null;

    const matched = tryMatchChapterHeader(rawText);
    if (matched) return { title: matched.title, num: matched.num || '', isExtra: matched.extra };

    if (/^H[1-3]$/i.test(el.tagName) && rawText.length <= 80) {
      return { title: capFirstLetters(rawText), num: '', isExtra: isExtraChapter(rawText) };
    }

    return null;
  }

  const chapters = [];
  let currentHeader = null;
  let currentParas = [];
  let preludeParas = [];

  function commitChapter() {
    if (currentHeader && currentParas.length > 0) {
      const content = currentParas.join('\n\n').trim();
      if (content.length >= 10 || currentHeader.title) {
        chapters.push({
          title: capFirstLetters(currentHeader.title),
          content: content || 'Nội dung chương trống.',
          isExtra: currentHeader.isExtra || isExtraChapter(currentHeader.title),
        });
      }
    }
    currentParas = [];
  }

  function handleNewHeader(newHeader) {
    // Nếu tiêu đề mới trùng số chương hoặc trùng tên với tiêu đề hiện tại (tiêu đề kép lặp lại dòng 1 & dòng 2)
    if (currentHeader && ((newHeader.num && currentHeader.num === newHeader.num) || newHeader.title === currentHeader.title)) {
      // Chỉ là dòng tiêu đề kép bị lặp, bỏ qua không cắt chương mới
      return;
    }
    commitChapter();
    currentHeader = newHeader;
  }

  if (leafBlocks.length > 0) {
    leafBlocks.forEach(el => {
      const headerInfo = checkElementForHeader(el);
      if (headerInfo) {
        handleNewHeader(headerInfo);
        return;
      }

      const raw = normalizeVietnamese(el.textContent || '').trim();
      if (!raw) return;

      const subLines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
      subLines.forEach(line => {
        const lineHeader = tryMatchChapterHeader(line);
        if (lineHeader) {
          handleNewHeader({ title: lineHeader.title, num: lineHeader.num || '', isExtra: lineHeader.extra });
          return;
        }

        if (currentHeader) {
          // Bỏ qua nếu dòng này trùng với tiêu đề chương hiện tại
          const normLine = line.toLowerCase();
          const normTitle = currentHeader.title.toLowerCase();
          if (normLine === normTitle || normTitle.includes(normLine) || normLine.includes(normTitle)) {
            return;
          }
          currentParas.push(line);
        } else {
          preludeParas.push(line);
        }
      });
    });
    commitChapter();
  }

  // Fallback nếu không có thẻ block hoặc không tìm thấy header nào
  if (chapters.length === 0) {
    const raw = normalizeVietnamese(body.textContent || '');
    const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      const lineHeader = tryMatchChapterHeader(line);
      if (lineHeader) {
        handleNewHeader({ title: lineHeader.title, num: lineHeader.num || '', isExtra: lineHeader.extra });
        continue;
      }

      if (currentHeader) {
        currentParas.push(line);
      } else {
        preludeParas.push(line);
      }
    }
    commitChapter();
  }

  // Nếu vẫn không có chương nào nhưng có defaultTocTitle hoặc nội dung
  if (chapters.length === 0) {
    const content = preludeParas.join('\n\n').trim();
    if (content.length >= 30) {
      const matched = tryMatchChapterHeader(defaultTocTitle);
      const isIntroPage = /cover|title|info|nav|toc|about|intro/i.test(defaultTocTitle);
      if (!isIntroPage && defaultTocTitle) {
        chapters.push({
          title: matched ? matched.title : defaultTocTitle,
          content: content,
          isExtra: isExtraChapter(defaultTocTitle),
        });
        preludeParas = [];
      }
    }
  }

  return {
    chapters,
    prelude: preludeParas.join('\n\n').trim(),
  };
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

  function commitTxtChapter() {
    if (cur && cur.lines.length > 0) {
      chaps.push(cur);
    }
    cur = null;
  }

  for (const line of lines) {
    const h = tryMatchChapterHeader(line);
    if (h) {
      // Nếu dòng này là tiêu đề kép lặp lại của chương hiện tại
      if (cur && ((h.num && cur.num === h.num) || h.title === cur.title)) {
        continue;
      }
      commitTxtChapter();
      cur = { title: h.title, num: h.num, extra: h.extra, lines: [] };
      continue;
    }
    if (!cur) {
      if (line.trim()) preLines.push(line.trim());
      continue;
    }
    cur.lines.push(line);
  }
  commitTxtChapter();

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
 * Parse .epub file siêu cấp chuẩn xác (EPUB 2 & EPUB 3)
 */
export async function parseEpubFile(arrayBuffer, filename = '') {
  const zip = await JSZip.loadAsync(arrayBuffer);

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

    const metaTitle = opfDoc.querySelector("metadata title, dc\\:title, title")?.textContent;
    if (metaTitle) bookTitle = normalizeVietnamese(metaTitle.trim());

    const metaDesc = opfDoc.querySelector("metadata description, dc\\:description, description")?.textContent;
    if (metaDesc) bookDesc = normalizeVietnamese(metaDesc.trim());

    opfDoc.querySelectorAll("manifest item").forEach(item => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      const mediaType = item.getAttribute("media-type") || '';
      const properties = item.getAttribute("properties") || '';
      if (id && href) {
        manifest[id] = { href, mediaType, properties };
      }
    });

    opfDoc.querySelectorAll("spine itemref").forEach(ref => {
      const idref = ref.getAttribute("idref");
      if (manifest[idref]) {
        spineHrefs.push(manifest[idref].href);
      }
    });
  }

  if (spineHrefs.length === 0) {
    Object.keys(zip.files)
      .filter(p => /\.(html|xhtml|htm)$/i.test(p) && !/nav|toc|cover/i.test(p))
      .sort()
      .forEach(p => spineHrefs.push(p.startsWith(opfDir) ? p.slice(opfDir.length) : p));
  }

  const { fileItemsMap, directMap } = await extractEpubTocMap(zip, opfDir, manifest);
  const coverUrl = opfDoc ? await extractEpubCover(zip, opfDir, opfDoc, manifest) : '';

  const parsedChapters = [];
  const preludeBlocks = [];

  for (const rawHref of spineHrefs) {
    const fullPath = resolvePath(opfDir, rawHref);
    const zfile = zip.file(fullPath) || zip.file(decodeURIComponent(fullPath));
    if (!zfile) continue;

    const tocItems = fileItemsMap.get(fullPath) || fileItemsMap.get(rawHref) || [];
    const defaultTocTitle = directMap.get(fullPath) || (tocItems.length === 1 ? tocItems[0].label : '');

    try {
      const html = await zfile.async("string");
      const doc = new DOMParser().parseFromString(html, "text/html");

      const { chapters, prelude } = extractChaptersFromHtml(doc, defaultTocTitle, tocItems);

      if (prelude && parsedChapters.length === 0) {
        preludeBlocks.push(prelude);
      }

      if (chapters.length > 0) {
        chapters.forEach(chap => {
          parsedChapters.push(chap);
        });
      }
    } catch (err) {
      // Continue next chapter
    }
  }

  // Đánh lại số thứ tự order
  const finalChapters = parsedChapters.map((c, idx) => ({
    ...c,
    order: idx,
  }));

  const fallbackTitle = filename ? filename.replace(/\.[^/.]+$/, '').trim() : '';
  const finalBookTitle = bookTitle || fallbackTitle;
  const finalDescription = bookDesc || preludeBlocks.join('\n\n').trim();

  return {
    title: finalBookTitle,
    description: finalDescription || '',
    coverUrl: coverUrl || '',
    chapters: finalChapters,
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
