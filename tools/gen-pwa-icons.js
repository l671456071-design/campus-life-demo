'use strict';
// tools/gen-pwa-icons.js — 生成 PWA 安装图标（纯 Node 标准库，零依赖）
// 图形：品牌蓝底（#2563EB）+ 白色包裹盒（圆角方块 + 箱缝），与 App 主色一致
// 运行：node tools/gen-pwa-icons.js → 输出 assets/icons/pwa-192.png / pwa-512.png（可重复执行覆盖）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// PNG CRC32（zlib 规范）
function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crc32.table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  // 逐行加 filter 0 前缀
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size) {
  const bg = [37, 99, 235];    // #2563EB
  const fg = [255, 255, 255];  // 白色包裹盒
  const rgba = Buffer.alloc(size * size * 4);
  const box = { x0: size * 0.24, x1: size * 0.76, y0: size * 0.30, y1: size * 0.74, r: size * 0.06 };
  const slitY = box.y0 + (box.y1 - box.y0) * 0.38;
  const slitH = size * 0.045;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inBox = false;
      if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) {
        const dx = Math.max(box.x0 + box.r - x, x - (box.x1 - box.r), 0);
        const dy = Math.max(box.y0 + box.r - y, y - (box.y1 - box.r), 0);
        inBox = dx * dx + dy * dy <= box.r * box.r;
      }
      const inSlit = inBox && Math.abs(y - slitY) <= slitH / 2;
      const c = inSlit ? bg : (inBox ? fg : bg);
      const i = (y * size + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

const outDir = path.join(__dirname, '..', 'assets', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
[192, 512].forEach(function (s) {
  const file = path.join(outDir, 'pwa-' + s + '.png');
  fs.writeFileSync(file, encodePNG(s, draw(s)));
  console.log('生成', file, fs.statSync(file).size, 'bytes');
});
