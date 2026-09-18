// config.js — 环境配置（统一本地模式）
// 必须在 mock.js / storage.js / api-client.js 之前引入。
//
// 演示模式已撤销：所有环境（本地 / 公网）统一走 local 模式，
// 数据只保存在用户本机 localStorage，不再注入任何演示标签或虚拟演示身份。
// demo-data.js 文件保留但永远不会被激活（APP_CONFIG.isDemo 恒为 false）。

var APP_CONFIG = {
  mode: 'local',
  isDemo: false,

  productName: '校园智能生活 App',
  productIntro: '校园快递 + 扫码取件 + 外卖 + 课表 + 攒钱 + 论坛 + 实习',
  productVersion: '2.2.0',

  // App 灰度版本号（反馈提交时展示；最终以后端盖章为准，前端不可伪造）
  appVersion: 'v0.2.0-gray',

  // 分享链接（部署后自动取当前站点地址）
  shareUrl: (function () {
    try { return location.origin + location.pathname; } catch (e) { return ''; }
  })(),
};

(function () {
  // 兼容历史链接：?mode=local 正常，?mode=demo 不再生效（统一本地模式）
  try {
    localStorage.removeItem('campus_mode_override');
  } catch (e) {}
  APP_CONFIG.mode = 'local';
  APP_CONFIG.isDemo = false;
})();
