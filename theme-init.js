// theme-init.js — 页面渲染前初始化主题，避免浅色→深色闪烁
// 必须放在 <head> 中、styles.css 之后，且不能 defer/async
(function () {
  try {
    var key = 'appSettingsDB';
    var raw = localStorage.getItem(key);
    var theme = 'auto';
    if (raw) {
      try {
        var data = JSON.parse(raw);
        if (data && data.theme) theme = data.theme;
      } catch (e) {}
    }
    var html = document.documentElement;
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
    }
  } catch (e) {}
})();
