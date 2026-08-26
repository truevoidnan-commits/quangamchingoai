const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const jpeg = require('jpeg-js');

// Simple pure Node PNG encoder using built-in zlib
function encodePNG(width, height, rgbaBuffer) {
  // CRC32 table
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

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT - filtered scanlines (filter type 0 = None)
  const rowSize = width * 4;
  const rawData = Buffer.alloc(height * (1 + rowSize));
  let srcOffset = 0;
  let dstOffset = 0;
  for (let y = 0; y < height; y++) {
    rawData[dstOffset++] = 0; // Filter None
    rgbaBuffer.copy(rawData, dstOffset, srcOffset, srcOffset + rowSize);
    dstOffset += rowSize;
    srcOffset += rowSize;
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Simple pure PNG decoder for RGBA
function decodePNG(buffer) {
  let offset = 8; // skip signature
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
      // Basic unfiltering if needed
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

// Background removal algorithm: removes gray-scale checkerboard background
function removeCheckerboard(imgData, width, height) {
  const data = imgData;
  const total = width * height;

  // Flood-fill or edge-connected threshold removal
  // Check the 4 corners to detect the background checkerboard color range
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    // Check if pixel is neutral gray/dark (checkerboard tile)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const brightness = (r + g + b) / 3;

    // Checkerboard gray tiles typically have diff < 12 and brightness < 120
    if (diff <= 14 && brightness < 130) {
      // Soft alpha falloff
      if (brightness < 80 && diff <= 8) {
        data[idx + 3] = 0; // Fully transparent
      } else {
        // Smooth transition at edges
        const factor = Math.max(0, Math.min(1, (diff - 4) / 10));
        data[idx + 3] = Math.floor(factor * a);
      }
    }
  }
}

// Process all files in public/images/dao_anh/
const dir = path.join(__dirname, '..', 'public', 'images', 'dao_anh');
const files = fs.readdirSync(dir);

for (const file of files) {
  const fullPath = path.join(dir, file);
  const ext = path.extname(file).toLowerCase();
  let decoded = null;

  try {
    if (ext === '.jpg' || ext === '.jpeg') {
      const buf = fs.readFileSync(fullPath);
      decoded = jpeg.decode(buf, { useTArray: false });
    } else if (ext === '.png') {
      const buf = fs.readFileSync(fullPath);
      decoded = decodePNG(buf);
    }

    if (decoded) {
      console.log(`Processing ${file} (${decoded.width}x${decoded.height})...`);
      removeCheckerboard(decoded.data, decoded.width, decoded.height);

      const baseName = path.basename(file, ext);
      const outPath = path.join(dir, `${baseName}.png`);
      const pngBuffer = encodePNG(decoded.width, decoded.height, decoded.data);
      fs.writeFileSync(outPath, pngBuffer);
      console.log(`Saved transparent PNG: ${baseName}.png`);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
}
