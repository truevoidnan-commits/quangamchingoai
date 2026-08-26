const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const jpeg = require('jpeg-js');

function encodePNG(width, height, rgbaBuffer) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.slice(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  const rowSize = width * 4;
  const rawData = Buffer.alloc(height * (1 + rowSize));
  let srcOffset = 0;
  let dstOffset = 0;
  for (let y = 0; y < height; y++) {
    rawData[dstOffset++] = 0;
    rgbaBuffer.copy(rawData, dstOffset, srcOffset, srcOffset + rowSize);
    dstOffset += rowSize;
    srcOffset += rowSize;
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function decodePNG(buffer) {
  let offset = 8;
  let width = 0, height = 0;
  let idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const rowSize = width * 4;
  const rgba = Buffer.alloc(width * height * 4);
  let srcOffset = 0;
  let dstOffset = 0;

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[srcOffset++];
    if (filterType === 0) {
      decompressed.copy(rgba, dstOffset, srcOffset, srcOffset + rowSize);
    } else {
      for (let x = 0; x < rowSize; x++) {
        let val = decompressed[srcOffset + x];
        let a = x >= 4 ? rgba[dstOffset + x - 4] : 0;
        let b = y > 0 ? rgba[dstOffset - rowSize + x] : 0;
        let c = (x >= 4 && y > 0) ? rgba[dstOffset - rowSize + x - 4] : 0;
        if (filterType === 1) val = (val + a) & 0xff;
        else if (filterType === 2) val = (val + b) & 0xff;
        else if (filterType === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
        else if (filterType === 4) {
          let p = a + b - c;
          let pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          let pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          val = (val + pr) & 0xff;
        }
        rgba[dstOffset + x] = val;
      }
    }
    srcOffset += rowSize;
    dstOffset += rowSize;
  }

  return { width, height, data: rgba };
}

// Precise checkerboard removal:
// The checkerboard has gray squares where:
// - Red, Green, Blue are close to each other: diff = max(R,G,B) - min(R,G,B) is small (< 18)
// - Total brightness is between 25 and 110 (the dark tile is ~40, the light tile is ~70).
// - BUT we must protect the character center:
//   Distance from center (cx, cy) < radius
function perfectCutout(data, width, height, isDarkChar = false) {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = width * 0.46; // Beyond 46% of width from center is definitely background

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const diff = max - min;
      const brightness = (r + g + b) / 3;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 1. Outside outer radius: pure background
      if (dist > maxR) {
        data[idx + 3] = 0;
        continue;
      }

      // 2. Identify checkerboard tile:
      // Checkerboard tiles are strictly neutral gray (diff <= 16, brightness between 25 and 110)
      if (diff <= 14 && brightness <= 110) {
        // If it's dark character (Thien Ma), protect the core body if it has red tint
        if (isDarkChar) {
          if (r > g + 8 && r > b + 5) {
            // This is Thien Ma's crimson skin/vein, keep it!
            continue;
          }
          if (dist < width * 0.22 && brightness > 15) {
            // Inside the head/chest of Thien Ma
            if (r > 30 || diff > 6) continue;
          }
        }
        data[idx + 3] = 0; // It's a checkerboard tile!
      }
    }
  }
}

const dir = path.join(__dirname, '..', 'public', 'images', 'dao_anh');
const brainDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/35449d0a-d3fe-41d3-ac64-3df66ece52ba';

const items = [
  { src: path.join(brainDir, 'hon_don_nguyen_anh_1787628936895.jpg'), dest: 'hon_don_so_khai.png', isDark: false },
  { src: path.join(brainDir, 'thien_ma_nguyen_anh_1787650217202.jpg'), dest: 'nguyen_thuy_thien_ma.png', isDark: true },
  { src: path.join(brainDir, 'loi_kiep_nguyen_anh_1787650240548.jpg'), dest: 'thuong_thuong_loi_kiep.png', isDark: false },
  { src: path.join(brainDir, 'than_long_nguyen_anh_1787650267483.jpg'), dest: 'thai_co_than_long.png', isDark: false },
  { src: path.join(brainDir, 'luan_hoi_nguyen_anh_1787650302253.jpg'), dest: 'cuu_chuyen_luan_hoi.png', isDark: false },
  { src: path.join(brainDir, 'tao_hoa_nguyen_anh_1787650339025.jpg'), dest: 'tao_hoa_ngoc_diep.png', isDark: false },
  { src: path.join(brainDir, 'hong_mong_nguyen_anh_1787650370021.jpg'), dest: 'hong_mong_bat_diet.png', isDark: false },
  { src: path.join(brainDir, 'loi_viem_dong_anh_1787650405860.jpg'), dest: 'diet_the_loi_viem_dong.png', isDark: false },
];

for (const item of items) {
  if (!fs.existsSync(item.src)) {
    console.log('Not found:', item.src);
    continue;
  }
  const buf = fs.readFileSync(item.src);
  const decoded = jpeg.decode(buf, { useTArray: false });
  console.log(`Processing pristine ${item.dest}...`);
  perfectCutout(decoded.data, decoded.width, decoded.height, item.isDark);
  const outPath = path.join(dir, item.dest);
  const pngBuf = encodePNG(decoded.width, decoded.height, decoded.data);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Successfully saved pure cutout -> ${item.dest}`);
}
