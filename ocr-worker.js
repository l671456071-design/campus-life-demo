// ocr-worker.js — OCR 预处理 Worker（独立线程，零依赖）
// 职责：接收主线程截取的扫描区域 ImageBitmap，完成 放大 + 灰度 + 二值化，
//       回传处理后的 ImageBitmap 供 Tesseract（内部独立线程）识别。
// 流水线：Camera → 截取扫描区域 → ImageBitmap(transfer) → 本 Worker → 回传
//         → Tesseract OCR → 提取取件码
// 设计约束：
// - 全部使用浏览器标准能力（Worker / OffscreenCanvas / ImageBitmap transferable）
// - 传输零拷贝：bitmap 通过 transferable 转移，不复制像素
// - 任何失败都以 { type:'error' } 回报，主线程回退同步预处理（scan.html）
'use strict';

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type !== 'binarize' || !msg.bitmap || !msg.id) return;
  try {
    var bmp = msg.bitmap;
    var scale = msg.scale || 1;
    var threshold = typeof msg.threshold === 'number' ? msg.threshold : 128;
    var ow = Math.max(1, Math.round(bmp.width * scale));
    var oh = Math.max(1, Math.round(bmp.height * scale));

    var canvas = new OffscreenCanvas(ow, oh);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, ow, oh);
    if (bmp.close) bmp.close();

    var img = ctx.getImageData(0, 0, ow, oh);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = g < threshold ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);

    var out = canvas.transferToImageBitmap();
    self.postMessage({ type: 'binarized', id: msg.id, bitmap: out, width: ow, height: oh }, [out]);
  } catch (e) {
    self.postMessage({ type: 'error', id: msg.id, message: (e && e.message) || 'worker binarize failed' });
  }
};
