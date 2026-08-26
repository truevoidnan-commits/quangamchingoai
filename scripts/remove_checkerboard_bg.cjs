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

function cleanAllCheckerboardGlobally(data, width, height) {
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const brightness = (r + g + b) / 3;

    // Check if pixel is part of the checkerboard background
    // 1. Dark/gray background
    if (brightness <= 30) {
      data[idx + 3] = 0;
    } else if (brightness <= 150) {
      // Saturation check: checkerboard tiles have very low chroma
      const saturation = max > 0 ? diff / max : 0;
      if (saturation < 0.28 && diff <= 38) {
        if (brightness < 125 && diff <= 28) {
          data[idx + 3] = 0;
        } else {
          const factor = Math.max(0, Math.min(1, (diff - 10) / 25));
          data[idx + 3] = Math.floor(factor * data[idx + 3]);
        }
      }
    }
  }
}

const dir = path.join(__dirname, '..', 'public', 'images', 'dao_anh');
const brainDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/35449d0a-d3fe-41d3-ac64-3df66ece52ba';

const mapping = [
  { src: path.join(brainDir, 'hon_don_nguyen_anh_1787628936895.jpg'), dest: 'hon_don_so_khai.png' },
  { src: path.join(brainDir, 'thien_ma_nguyen_anh_1787650217202.jpg'), dest: 'nguyen_thuy_thien_ma.png' },
  { src: path.join(brainDir, 'loi_kiep_nguyen_anh_1787650240548.jpg'), dest: 'thuong_thuong_loi_kiep.png' },
  { src: path.join(brainDir, 'than_long_nguyen_anh_1787650267483.jpg'), dest: 'thai_co_than_long.png' },
  { src: path.join(brainDir, 'luan_hoi_nguyen_anh_1787650302253.jpg'), dest: 'cuu_chuyen_luan_hoi.png' },
  { src: path.join(brainDir, 'tao_hoa_nguyen_anh_1787650339025.jpg'), dest: 'tao_hoa_ngoc_diep.png' },
  { src: path.join(brainDir, 'hong_mong_nguyen_anh_1787650370021.jpg'), dest: 'hong_mong_bat_diet.png' },
  { src: path.join(brainDir, 'loi_viem_dong_anh_1787650405860.jpg'), dest: 'diet_the_loi_viem_dong.png' },
  { src: path.join(dir, 'khoi_nguyen_thoi_khong.png'), dest: 'khoi_nguyen_thoi_khong.png' },
];

for (const m of mapping) {
  if (!m.dest || !fs.existsSync(m.src)) continue;
  const ext = path.extname(m.src).toLowerCase();
  const buf = fs.readFileSync(m.src);
  let decoded = (ext === '.jpg' || ext === '.jpeg') ? jpeg.decode(buf, { useTArray: false }) : decodePNG(buf);

  if (decoded) {
    cleanAllCheckerboardGlobally(decoded.data, decoded.width, decoded.height);
    const outPath = path.join(dir, m.dest);
    const pngBuffer = encodePNG(decoded.width, decoded.height, decoded.data);
    fs.writeFileSync(outPath, pngBuffer);
    console.log(`Cleaned -> ${m.dest}`);
  }
}
