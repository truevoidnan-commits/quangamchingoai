/**
 * Chapter parser — tự động tách chương từ file .txt hoặc .epub
 * Chuẩn hóa tiêu đề, hỗ trợ dạng Thứ X chương, (x. y), trích xuất giới thiệu
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
const MAX_HEADER_LEN = 120; // dòng quá dài coi là đoạn văn, không phải chương

// 1. Dạng "Thứ 1 Chương (tên truyện) (1. 1) (tên chương)" -> lấy số + tên chương, bỏ tên truyện và cặp số (x,y)
const specialRe = new RegExp("^\\s*thứ\\s+(" + NUM_TOKEN + ")\\s+(chương|chuong|chapter|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet)\\b.*?\\(\\s*\\d+[\\d\\s.,]*\\)\\s*(.*)$", "i");

// 2. Dạng "Thứ 5 Chương ..." không có cặp số phía sau
const thuRe = new RegExp("^\\s*thứ\\s+(" + NUM_TOKEN + ")\\s+(chương|chuong|chapter|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet)\\b\\s*[:\\-–.]?\\s*(.*)$", "i");

// 3. Dạng "Chương 5", "Chương thứ 5", "Chapter 5"...
const autoRe = new RegExp("^\\s*(chương|chuong|chapter|hồi|hoi|quyển|quyen|phần|phan|tiết|tiet)\\s+(thứ\\s+)?(" + NUM_TOKEN + ")\\s*[:\\-–.]?\\s*(.*)$", "i");

// 4. Dạng "Phiên ngoại", "Phiên ngoại 1", "Ngoại truyện: ..." -> chương phụ
const extraRe = new RegExp("^\\s*(phiên\\s*ngoại|phien\\s*ngoai|ngoại\\s*truyện|ngoai\\s*truyen)\\s*(" + NUM_TOKEN + ")?\\s*[:\\-–.]?\\s*(.*)$", "i");
const EXTRA_LABEL = {
  "phiên ngoại": "Phiên ngoại",
  "phien ngoai": "Phiên ngoại",
  "ngoại truyện": "Ngoại truyện",
  "ngoai truyen": "Ngoại truyện",
};

/**
 * Thử khớp một dòng với tiêu đề chương
 */
export function tryMatchChapterHeader(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADER_LEN) return null;

  // Tránh câu hội thoại bắt đầu bằng ngoặc kép hoặc gạch đầu dòng
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
 * Parse plain text file thành danh sách chương và giới thiệu
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

  // Chỉ coi phần trước chương 1 là "giới thiệu" khi thực sự đã tách được chương
  const description = result.length ? normalizeVietnamese(preLines.join("\n\n").trim()) : "";

  // Sắp xếp: chương chính trước, ngoại truyện sau
  const main = result.filter(c => !c.isExtra);
  const extra = result.filter(c => c.isExtra);
  const sortedChapters = [...main, ...extra].map((c, i) => ({ ...c, order: i }));

  const defaultTitle = filename ? filename.replace(/\.[^/.]+$/, '').trim() : '';

  return {
    title: defaultTitle,
    description: description || '',
    chapters: sortedChapters.length ? sortedChapters : [{
      title: defaultTitle || 'Nội dung',
      content: formatChapterContent(text),
      order: 0,
      isExtra: false,
    }],
  };
}

/**
 * Parse .epub file
 */
export async function parseEpubFile(arrayBuffer, filename = '') {
  const zip = await JSZip.loadAsync(arrayBuffer);

  let opfPath = '';
  try {
    const container = await zip.file("META-INF/container.xml").async("string");
    const containerDoc = new DOMParser().parseFromString(container, "application/xml");
    const root = containerDoc.querySelector("rootfile");
    if (root) opfPath = root.getAttribute("full-path");
  } catch {
    opfPath = 'content.opf';
  }

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  let opfDoc = null;
  let bookTitle = filename ? filename.replace(/\.[^/.]+$/, '').trim() : '';
  let bookDesc = '';
  let spineIds = [];
  let manifest = {};

  try {
    const opfXml = await zip.file(opfPath).async("string");
    opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");

    const metaTitle = opfDoc.querySelector("metadata title, dc\\:title")?.textContent;
    if (metaTitle && !bookTitle) bookTitle = normalizeVietnamese(metaTitle.trim());

    const metaDesc = opfDoc.querySelector("metadata description, dc\\:description")?.textContent;
    if (metaDesc) bookDesc = normalizeVietnamese(metaDesc.trim());

    opfDoc.querySelectorAll("manifest item").forEach(item => {
      manifest[item.getAttribute("id")] = item.getAttribute("href");
    });
    spineIds = Array.from(opfDoc.querySelectorAll("spine itemref")).map(n => n.getAttribute("idref"));
  } catch {
    Object.keys(zip.files).forEach(path => {
      if (path.endsWith('.html') || path.endsWith('.xhtml')) spineIds.push(path);
    });
  }

  const chapters = [];
  let order = 0;

  for (const id of spineIds) {
    const href = manifest[id] || id;
    if (!href) continue;
    const path = opfDir + href;
    const zfile = zip.file(path) || zip.file(decodeURIComponent(path));
    if (!zfile) continue;

    try {
      const html = normalizeVietnamese(await zfile.async("string"));
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,style,nav,aside").forEach(n => n.remove());

      const h = doc.querySelector("h1,h2,h3");
      const title = (h ? normalizeVietnamese(h.textContent.trim()) : "") || (`Chương ${order + 1}`);
      const body = doc.body ? doc.body.innerText || doc.body.textContent || '' : html;
      const content = formatChapterContent(body);

      if (content.trim().length < 40) continue;

      const isExtra = /ngoại|phien\s*ngoai|extra/i.test(title);
      chapters.push({ title: capFirstLetters(title), content, order: order++, isExtra });
    } catch {
      continue;
    }
  }

  const main = chapters.filter(c => !c.isExtra);
  const extra = chapters.filter(c => c.isExtra);
  const sortedChapters = [...main, ...extra].map((c, i) => ({ ...c, order: i }));

  return {
    title: bookTitle,
    description: bookDesc,
    chapters: sortedChapters,
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
