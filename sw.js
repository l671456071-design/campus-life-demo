// sw.js — PWA 离线缓存 Service Worker（零依赖，纯浏览器标准能力）
// 缓存策略：
//   1. 页面导航（HTML）：网络优先，失败回退缓存 → 断网仍可打开页面
//   2. 静态资源（js/css/图片/本地库）：缓存优先 + 后台更新（stale-while-revalidate）
//   3. 后端接口（/api/ /upload）：永不缓存，保持业务数据实时
//   4. OCR 核心（tesseract wasm/词典）：体积大，首次使用后自动进入缓存，离线 OCR 可用
// 缓存版本：发布新版本时递增 VERSION，activate 阶段自动清理旧缓存
// 用户数据安全：仅缓存 App 外壳与静态资源；localStorage 业务数据不经过 SW
'use strict';

var VERSION = 'v11';
var CACHE_NAME = 'campus-life-' + VERSION;

// 预缓存：App 外壳（页面 + 核心脚本 + 3D/扫码本地库 + 图标）
var PRECACHE = [
  './',
  './index.html', './login.html', './packages.html', './food.html', './food-detail.html',
  './order.html', './scan.html', './map.html', './settings.html', './track.html',
  './messages.html', './profile.html', './profile-edit.html', './records.html', './detail.html',
  './ai.html',
  './savings.html', './schedule.html', './forum.html', './jobs.html',
  './myhome.html', './about.html', './website.html',
  './bathroom.html', './campus-data.js', './spark-badge.html', './spark.html',
  './festival.html', './stopwatch.html', './notes.html',
  './decibel.html', './fitness.html', './lazy.html',
  './libs/xlsx/xlsx.full.min.js',
  './styles.css', './theme-init.js', './config.js', './mock.js', './demo-data.js',
  './storage.js', './api.js', './api-client.js', './app.js', './perf.js', './ocr-worker.js',
  './libs/three/three.min.js', './libs/qr-scanner/jsQR.js',
  './assets/icons/pwa-192.png', './assets/icons/pwa-512.png', './assets/icons/favicon.svg',
];

// 安装：逐个预缓存，单个失败不阻断整体安装（缺失资源运行时按需缓存）
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { /* 缺失容忍 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// 激活：清理旧版本缓存，立即接管所有页面
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k !== CACHE_NAME ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== location.origin) return;                        // 跨域不处理
  if (/\/api\//.test(url.pathname) || /\/upload/.test(url.pathname)) return; // 业务接口永不缓存

  // ---- 页面导航：网络优先，离线回退缓存 ----
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).then(function (fresh) {
        var copy = fresh.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        return fresh;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // ---- 静态资源：缓存优先 + 后台更新 ----
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {
        if (cached) {
          fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
          }).catch(function () { /* 后台更新失败忽略 */ });
          return cached;
        }
        return fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      });
    })
  );
});
