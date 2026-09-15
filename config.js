// config.js — 环境配置：本地开发（local） / 公网演示（demo）
// 必须在 mock.js / storage.js / api-client.js 之前引入。
//
// 模式判定优先级：
//   1. URL 参数  ?mode=demo / ?mode=local   （强制切换，便于本地预览演示效果）
//   2. 自动判定  localhost / 127.0.0.1 / file:// 打开 → local（本地开发，走真实后端 + JWT 登录）
//               其他域名（如 xxx.github.io）→ demo（公网展示，纯虚拟数据，免登录）
//
// demo 模式特性：
//   - 免登录，直接进入首页
//   - 数据全部来自 demo-data.js（虚拟数据，不含任何真实个人信息）
//   - localStorage 使用 demo_ 前缀键，与本地开发数据完全隔离
//   - 页面顶部显示“当前为演示模式 · 数据均为虚拟数据”提示条

var APP_CONFIG = {
  mode: 'local',

  productName: '校园智能生活 App',
  productIntro: '校园快递 + 扫码取件 + 外卖 + 3D 地图',
  productVersion: '2.1.0-demo',

  // 分享链接（部署后自动取当前站点地址）
  shareUrl: (function () {
    try { return location.origin + location.pathname; } catch (e) { return ''; }
  })(),
};

(function () {
  // 1) URL 参数强制切换
  var forced = null;
  try {
    var m = location.search.match(/[?&]mode=(demo|local)/);
    if (m) forced = m[1];
  } catch (e) {}

  // 2) 自动判定
  var host = location.hostname || '';
  var isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '' || host.indexOf('192.168.') === 0 || host.indexOf('100.') === 0;

  APP_CONFIG.mode = forced || (isLocalHost ? 'local' : 'demo');
  APP_CONFIG.isDemo = APP_CONFIG.mode === 'demo';
})();

// demo 模式：注入顶部演示提示条（所有页面统一，无需逐页修改 HTML）
if (APP_CONFIG.isDemo) {
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('demoBanner')) return;
    var shell = document.querySelector('.app-shell');
    if (!shell) return;
    var banner = document.createElement('div');
    banner.id = 'demoBanner';
    banner.innerHTML = '当前为演示模式 · 数据均为虚拟数据';
    banner.setAttribute('style',
      'flex-shrink:0;padding:7px 12px;text-align:center;font-size:12px;font-weight:600;' +
      'background:#FEF3C7;color:#B45309;letter-spacing:0.5px;z-index:600;'
    );
    var header = shell.querySelector('.app-header');
    if (header) shell.insertBefore(banner, header);
    else shell.insertBefore(banner, shell.firstChild);
  });
}
