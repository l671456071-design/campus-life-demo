// perf.js — 设备硬件加速层（零依赖，全部使用浏览器标准能力）
// 1) DeviceCapabilities：CPU 核数 / WebGL / WebGL2 / WebGPU / 摄像头 / BarcodeDetector / 定位 / 内存估算
// 2) 性能等级：high / medium / low（自动检测，可被用户设置覆盖：自动 / 省电 / 高性能）
// 3) 质量档位：DPR 上限 / 阴影 / 场景细节比例 / 扫码与 OCR 频率 / 帧率上限
// 4) FPS Governor：连续掉帧自动降档（供 3D 地图渲染循环调用）
// 5) Debug 面板：仅 ?debug=1 时显示，生产环境隐藏
//
// 加载顺序要求：config.js → mock.js → demo-data.js → storage.js → perf.js
var Perf = (function () {
  'use strict';

  // ---------- 1. 能力检测（每项独立 try-catch，任何一项不支持都不影响启动） ----------
  function detectCapabilities() {
    var caps = {
      cpuCores: 4,
      deviceMemory: 0,        // GB（Chrome 支持，Safari/Firefox 无此 API 记 0）
      webgl: false,
      webgl2: false,
      webgpu: false,          // 仅检测上报，渲染仍走 WebGL（WebGPURenderer 预留）
      camera: false,
      barcodeDetector: false,
      geolocation: false,
      offscreenCanvas: false,
      isMobile: false,
    };
    try { caps.cpuCores = navigator.hardwareConcurrency || 4; } catch (e) {}
    try { caps.deviceMemory = navigator.deviceMemory || 0; } catch (e) {}
    try {
      var c = document.createElement('canvas');
      caps.webgl = !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
      caps.webgl2 = !!c.getContext('webgl2');
    } catch (e) {}
    try { caps.webgpu = !!navigator.gpu; } catch (e) {}
    try { caps.camera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); } catch (e) {}
    try { caps.barcodeDetector = 'BarcodeDetector' in window; } catch (e) {}
    try { caps.geolocation = !!navigator.geolocation; } catch (e) {}
    try { caps.offscreenCanvas = typeof OffscreenCanvas !== 'undefined'; } catch (e) {}
    try { caps.isMobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent); } catch (e) {}
    return caps;
  }
  var caps = detectCapabilities();

  // ---------- 2. 自动性能等级 ----------
  function detectLevel() {
    var score = 0;
    score += caps.cpuCores >= 8 ? 2 : (caps.cpuCores >= 6 ? 1 : 0);
    if (caps.deviceMemory) score += caps.deviceMemory >= 8 ? 2 : (caps.deviceMemory >= 4 ? 1 : 0);
    score += caps.webgl2 ? 1 : 0;
    if (caps.isMobile) score -= 1;
    return score >= 4 ? 'high' : (score >= 2 ? 'medium' : 'low');
  }

  // ---------- 3. 质量档位 ----------
  var TIERS = {
    high:   { name: '高性能', dprCap: 2,   shadows: true,  shadowMapSize: 1024, detail: 1,   scanInterval: 200, ocrInterval: 3200, fpsCap: 60 },
    medium: { name: '均衡',   dprCap: 1.5, shadows: true,  shadowMapSize: 1024, detail: 0.7, scanInterval: 250, ocrInterval: 3200, fpsCap: 60 },
    low:    { name: '省电',   dprCap: 1,   shadows: false, shadowMapSize: 512,  detail: 0.5, scanInterval: 350, ocrInterval: 5000, fpsCap: 30 },
  };

  function readUserMode() {
    // 注意：不能写 typeof Storage !== 'undefined'（原生 window.Storage 接口恒存在）
    try {
      if (typeof Storage.getSettings === 'function') {
        var s = Storage.getSettings();
        if (s && (s.perfMode === 'saver' || s.perfMode === 'perf' || s.perfMode === 'auto')) return s.perfMode;
      }
    } catch (e) { /* storage.js 未加载或被禁用：保持 auto */ }
    return 'auto';
  }

  var userMode = readUserMode();     // auto | saver | perf
  var autoLevel = detectLevel();     // 设备自动评估等级
  var currentTierKey = baseLevel();  // 当前生效档位（Governor 可在 baseLevel 基础上再降）

  function baseLevel() {
    if (userMode === 'saver') return 'low';
    if (userMode === 'perf') return 'high';
    return autoLevel;
  }

  function tier() { return TIERS[currentTierKey]; }

  // ---------- 4. FPS Governor（在 rAF 渲染循环中每帧调用 tick） ----------
  var listeners = [];
  var frames = 0, lastSample = 0, fps = 60, badSamples = 0;

  function tick(now) {
    try { now = now || performance.now(); } catch (e) { now = Date.now(); }
    frames++;
    if (!lastSample) { lastSample = now; return fps; }
    var dt = now - lastSample;
    if (dt >= 1000) {
      fps = Math.round(frames * 1000 / dt);
      frames = 0; lastSample = now;
      evaluate();
    }
    return fps;
  }

  function evaluate() {
    if (currentTierKey === 'low') return; // 已是最低档
    if (fps < TIERS[currentTierKey].fpsCap * 0.7) badSamples++; else badSamples = 0;
    if (badSamples >= 2) {  // 连续 2 秒低于目标帧率 70%
      badSamples = 0;
      var order = ['high', 'medium', 'low'];
      var next = order[order.indexOf(currentTierKey) + 1];
      if (next) applyTier(next, true);
    }
  }

  function applyTier(key, byGovernor) {
    if (!TIERS[key] || key === currentTierKey) return;
    currentTierKey = key;
    listeners.forEach(function (fn) {
      try { fn(currentTierKey, TIERS[currentTierKey], byGovernor); } catch (e) {}
    });
  }

  function onChange(fn) { listeners.push(fn); }

  // 用户切换性能模式（设置页调用）：重置到目标档位，Governor 之后仍可自动降
  function setMode(mode) {
    if (['auto', 'saver', 'perf'].indexOf(mode) === -1) return;
    userMode = mode;
    applyTier(baseLevel(), false);
  }

  // ---------- 5. Debug 面板（?debug=1，生产环境隐藏） ----------
  function isDebug() {
    try { return /(?:^|[?&])debug=1/.test(location.search); } catch (e) { return false; }
  }

  // ---------- 6. WebGPU 实验探测 ----------
  // 仅采集适配器信息并预留计算能力，不切换渲染路径（本地 three.min.js 为 UMD 版，
  // 未内置 WebGPURenderer；后续升级 three.webgpu 模块时可用此信息直接接入）。
  function probeWebGPU() {
    return new Promise(function (resolve) {
      if (caps.webgpuInfo) { resolve(caps.webgpuInfo); return; }
      var done = function (info) { caps.webgpuInfo = info; resolve(info); };
      try {
        if (!navigator.gpu || !navigator.gpu.requestAdapter) {
          done({ supported: false, reason: '浏览器未暴露 navigator.gpu' });
          return;
        }
        navigator.gpu.requestAdapter().then(function (adapter) {
          if (!adapter) { done({ supported: false, reason: '无可用 GPU 适配器' }); return; }
          var info = { supported: true, vendor: '', architecture: '', features: [], maxTextureDim: null };
          try {
            if (adapter.info) {
              info.vendor = adapter.info.vendor || '';
              info.architecture = adapter.info.architecture || '';
            }
          } catch (e) { /* info 属性可选 */ }
          try { info.features = Array.prototype.slice.call(adapter.features || []).slice(0, 6); } catch (e) {}
          try { info.maxTextureDim = (adapter.limits && adapter.limits.maxTextureDimension2D) || null; } catch (e) {}
          done(info);
        }).catch(function (e) {
          done({ supported: false, reason: (e && e.message) || '适配器请求失败' });
        });
      } catch (e) {
        done({ supported: false, reason: (e && e.message) || '探测失败' });
      }
    });
  }

  function mountDebugPanel() {
    if (!isDebug() || document.getElementById('perfDebug')) return;
    var el = document.createElement('div');
    el.id = 'perfDebug';
    el.setAttribute('style',
      'position:fixed;top:6px;left:6px;z-index:99999;background:rgba(0,0,0,.72);color:#4ade80;' +
      'font:10px/1.55 monospace;padding:6px 9px;border-radius:8px;white-space:pre;');
    document.body.appendChild(el);
    // WebGPU 探测入口（点击面板内「点按探测」）
    el.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-action') === 'webgpu-probe') {
        t.textContent = '探测中…';
        probeWebGPU();
      }
    });
    setInterval(function () {
      var mem = 'n/a';
      try {
        if (performance.memory) mem = (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + 'MB';
      } catch (e) {}
      var gpuRow;
      if (caps.webgpuInfo === undefined) {
        gpuRow = 'WebGPU ' + (caps.webgpu ? 1 : 0) +
          (caps.webgpu ? ' · <span data-action="webgpu-probe" style="cursor:pointer;text-decoration:underline;">点按探测</span>' : '');
      } else {
        var wi = caps.webgpuInfo;
        gpuRow = wi.supported
          ? 'WebGPU 适配: ' + (wi.vendor || wi.architecture || '未知') +
            (wi.maxTextureDim ? ' · 纹理上限 ' + wi.maxTextureDim : '') +
            ' · 渲染仍走 WebGL（实验预留）'
          : 'WebGPU 不可用（' + (wi.reason || '') + '）· 渲染走 WebGL';
      }
      el.innerHTML =
        'FPS ' + fps + ' / 上限 ' + tier().fpsCap +
        '\n档位 ' + currentTierKey + ' · ' + tier().name + (autoLevel !== currentTierKey ? '（已降档）' : '') +
        '\n模式 ' + userMode + ' / 设备评估 ' + autoLevel +
        '\nCPU ' + caps.cpuCores + ' 核 / 内存 ' + (caps.deviceMemory ? caps.deviceMemory + 'GB' : 'n/a') +
        '\nWebGL ' + (caps.webgl ? 1 : 0) + ' / WebGL2 ' + (caps.webgl2 ? 1 : 0) +
        '\n' + gpuRow +
        '\n摄像头 ' + (caps.camera ? 1 : 0) + ' / 条码 ' + (caps.barcodeDetector ? 1 : 0) + ' / 定位 ' + (caps.geolocation ? 1 : 0) +
        '\nDPR ' + (window.devicePixelRatio || 1).toFixed(2) + ' / JS内存 ' + mem;
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDebugPanel);
  } else {
    mountDebugPanel();
  }

  return {
    caps: caps,
    autoLevel: autoLevel,
    tier: tier,
    tierKey: function () { return currentTierKey; },
    tick: tick,
    onChange: onChange,
    setMode: setMode,
    isDebug: isDebug,
    probeWebGPU: probeWebGPU,
    TIERS: TIERS,
  };
})();
