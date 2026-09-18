// app.js — shared utilities: state, toast, modal, tab bar active, pull-to-refresh, helpers

var App = {
  state: {
    currentPage: document.body.dataset.page || '',
    loading: false,
    filter: 'all',
    keyword: '',
  },

  // ---- Tab bar active state ----
  initTabBar: function () {
    var page = document.body.dataset.page;
    if (!page) return;
    document.querySelectorAll('.tab-item').forEach(function (item) {
      if (item.dataset.nav === page) item.classList.add('active');
      else item.classList.remove('active');
    });
    // 主页 tab 点击时迸出微小光粒（极简反馈动效）
    document.querySelectorAll('.tab-bar .tab-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        App.tabSparks(e.clientX || (window.innerWidth / 2), e.clientY || window.innerHeight);
      });
    });
  },

  // tab 光粒：从点击点迸出 5 个小光点，向上漂浮渐隐后移除
  tabSparks: function (x, y) {
    var COLORS = ['#60A5FA', '#93C5FD', '#FCD34D', '#F9A8D4', '#86EFAC'];
    for (var i = 0; i < 5; i++) {
      var s = document.createElement('span');
      s.className = 'tab-spark';
      var dx = (Math.random() - 0.5) * 36;
      var dy = -(18 + Math.random() * 26);
      var size = 3 + Math.random() * 3;
      s.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;' +
        'background:' + COLORS[i % COLORS.length] + ';' +
        '--sx:' + dx.toFixed(1) + 'px;--sy:' + dy.toFixed(1) + 'px;';
      document.body.appendChild(s);
      (function (el) {
        setTimeout(function () { el.remove(); }, 700);
      })(s);
    }
  },

  // ---- 指引模式：每个功能首次进入显示一次轻量引导 ----
  showGuide: function (key, opts) {
    opts = opts || {};
    try {
      if (typeof Storage === 'undefined' || typeof Storage.isGuideShown !== 'function') return;
      if (Storage.isGuideShown(key)) return;
    } catch (e) { return; }
    var itemsHtml = (opts.items || []).map(function (it, i) {
      return '<div class="guide-item"><span class="guide-no">' + (i + 1) + '</span><span>' + it + '</span></div>';
    }).join('');
    var backdrop = document.createElement('div');
    backdrop.className = 'guide-mask';
    backdrop.innerHTML =
      '<div class="guide-card">' +
        '<div class="guide-icon">' + (opts.emoji || '✨') + '</div>' +
        '<div class="guide-title">' + (opts.title || '功能指引') + '</div>' +
        '<div class="guide-body">' + itemsHtml + '</div>' +
        '<button class="btn btn-primary btn-block" id="guideOk">' + (opts.okText || '开始使用') + '</button>' +
      '</div>';
    document.body.appendChild(backdrop);
    requestAnimationFrame(function () { backdrop.classList.add('show'); });
    function close() {
      try { Storage.markGuideShown(key); } catch (e) {}
      backdrop.classList.remove('show');
      setTimeout(function () { backdrop.remove(); }, 250);
      if (opts.onClose) opts.onClose();
    }
    backdrop.querySelector('#guideOk').addEventListener('click', close);
  },

  // ---- 图片压缩：File → 压缩后 dataURL（canvas 限制最大边长与质量，防止 localStorage 超限）----
  compressImage: function (file, maxSide, quality) {
    maxSide = maxSide || 900;
    quality = quality || 0.72;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('不是图片文件')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('解析失败')); };
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // ---- Toast ----
  toast: function (msg, duration) {
    duration = duration || 2000;
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><span>' + msg + '</span>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 250);
    }, duration);
  },

  // ---- Toast success ----
  toastSuccess: function (msg) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>' + msg + '</span>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 250);
    }, 2000);
  },

  // ---- Modal ----
  showModal: function (opts) {
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var iconSvg = '';
    if (opts.icon === 'success') {
      iconSvg = '<div class="modal-icon" style="color:#10B981"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>';
    } else if (opts.icon === 'warning') {
      iconSvg = '<div class="modal-icon" style="color:#F59E0B"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>';
    } else if (opts.icon === 'error') {
      iconSvg = '<div class="modal-icon" style="color:#EF4444"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>';
    } else if (opts.iconSvg) {
      iconSvg = '<div class="modal-icon">' + opts.iconSvg + '</div>';
    }

    var actionsHtml = '';
    if (opts.actions && opts.actions.length) {
      actionsHtml = '<div class="modal-actions">' + opts.actions.map(function (a) {
        return '<button class="btn ' + (a.style || 'btn-primary') + (a.size === 'lg' ? ' btn-lg' : '') + '" data-action="' + a.label + '">' + a.label + '</button>';
      }).join('') + '</div>';
    } else if (opts.confirmText) {
      actionsHtml = '<div class="modal-actions"><button class="btn btn-outline" data-action="cancel">' + (opts.cancelText || '取消') + '</button><button class="btn btn-primary" data-action="confirm">' + opts.confirmText + '</button></div>';
    }

    // 支持自定义 body（用于嵌入 QR 码、表单等复杂内容）
    // customBody 存在时，替换 desc + actions 区域，保留 icon 和 title
    var bodyHtml = opts.customBody
      ? opts.customBody
      : '<div class="modal-desc">' + (opts.desc || '') + '</div>' + actionsHtml;

    backdrop.innerHTML = '<div class="modal">' + iconSvg + '<div class="modal-title">' + (opts.title || '') + '</div>' + bodyHtml + '</div>';
    document.body.appendChild(backdrop);
    requestAnimationFrame(function () { backdrop.classList.add('show'); });

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop || e.target.dataset.action === 'cancel') {
        backdrop.classList.remove('show');
        setTimeout(function () { backdrop.remove(); }, 250);
        if (opts.onCancel) opts.onCancel();
      }
      if (e.target.dataset.action === 'confirm') {
        if (opts.onConfirm) opts.onConfirm();
        backdrop.classList.remove('show');
        setTimeout(function () { backdrop.remove(); }, 250);
      }
      if (opts.actions) {
        opts.actions.forEach(function (a) {
          if (e.target.dataset.action === a.label) {
            if (a.onClick) a.onClick();
            backdrop.classList.remove('show');
            setTimeout(function () { backdrop.remove(); }, 250);
          }
        });
      }
    });
    return backdrop;
  },

  closeModal: function () {
    var backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('show');
      setTimeout(function () { backdrop.remove(); }, 250);
    }
  },

  // ---- Loading overlay ----
  showLoading: function () {
    var el = document.querySelector('.loading-overlay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'loading-overlay';
      el.innerHTML = '<div class="spinner" style="width:36px;height:36px;border-width:3px;"></div>';
      document.body.appendChild(el);
    }
    requestAnimationFrame(function () { el.classList.add('show'); });
  },
  hideLoading: function () {
    var el = document.querySelector('.loading-overlay');
    if (el) el.classList.remove('show');
  },

  // ---- Skeleton helpers ----
  skeletonList: function (count) {
    count = count || 3;
    var html = '';
    for (var i = 0; i < count; i++) {
      html += '<div class="pkg-card" style="margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
        '<div class="skeleton" style="width:28px;height:28px;border-radius:8px;"></div>' +
        '<div class="skeleton" style="width:80px;height:16px;"></div>' +
        '<div class="skeleton" style="width:50px;height:16px;margin-left:auto;"></div>' +
        '</div>' +
        '<div class="skeleton" style="width:100%;height:14px;margin-bottom:8px;"></div>' +
        '<div class="skeleton" style="width:60%;height:14px;"></div>' +
        '</div>';
    }
    return html;
  },

  // ---- Empty state ----
  emptyState: function (title, desc) {
    return '<div class="empty-state">' +
      '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>' +
      '<div class="empty-state-title">' + (title || '暂无数据') + '</div>' +
      '<div class="empty-state-desc">' + (desc || '') + '</div>' +
      '</div>';
  },

  // ---- Error state ----
  errorState: function (title, desc, retryFn) {
    var retryHtml = '';
    if (retryFn) {
      retryHtml = '<button class="btn btn-outline btn-sm" onclick="' + retryFn + '()" style="margin-top:12px;">重试</button>';
    }
    return '<div class="error-state">' +
      '<svg class="error-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
      '<div class="error-state-title">' + (title || '加载失败') + '</div>' +
      '<div class="error-state-desc">' + (desc || '请检查网络后重试') + '</div>' +
      retryHtml +
      '</div>';
  },

  // ---- 分片渲染（列表性能）----
  // ≤50 条一次性渲染；>50 条先渲染首屏，其余按 chunkSize 分帧追加，
  // 避免一次性大 DOM 造成主线程长任务与滚动掉帧（配合 requestIdleCallback 降级 setTimeout）。
  renderChunked: function (el, items, renderItem, chunkSize) {
    if (!el) return;
    var CHUNK = chunkSize || 30;
    if (items.length <= 50) {
      var html = '';
      items.forEach(function (item, i) { html += renderItem(item, i); });
      el.innerHTML = html;
      return;
    }
    var idx = 0;
    el.innerHTML = '';
    function next() {
      var end = Math.min(idx + CHUNK, items.length);
      var html = '';
      for (; idx < end; idx++) html += renderItem(items[idx], idx);
      el.insertAdjacentHTML('beforeend', html);
      if (idx < items.length) {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(next, { timeout: 200 });
        else setTimeout(next, 16);
      }
    }
    next();
  },

  // ---- Package logo ----
  pkgLogo: function (pkg) {
    return '<div class="pkg-logo" style="background:' + pkg.logoColor + ';">' + pkg.shortName + '</div>';
  },

  // ---- Status label ----
  statusLabel: function (status) {
    var map = { pending: '待取件', picked: '已取件', expired: '已逾期', incoming: '运输中' };
    return map[status] || status;
  },
  statusClass: function (status) {
    return 'status-' + status;
  },

  // ---- Pull to refresh ----
  initPullToRefresh: function (container, onRefresh) {
    var startY = 0, pulling = false, pullDist = 0;
    var indicator = document.createElement('div');
    indicator.className = 'ptr-indicator';
    indicator.innerHTML = '<div class="spinner"></div>';
    if (container.firstChild) container.insertBefore(indicator, container.firstChild);
    else container.appendChild(indicator);

    container.addEventListener('touchstart', function (e) {
      if (container.scrollTop === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    container.addEventListener('touchmove', function (e) {
      if (!pulling) return;
      pullDist = e.touches[0].clientY - startY;
      if (pullDist > 0 && pullDist < 80) {
        indicator.style.height = pullDist + 'px';
      }
    }, { passive: true });

    container.addEventListener('touchend', function () {
      if (!pulling) return;
      pulling = false;
      if (pullDist > 50) {
        indicator.classList.add('active');
        indicator.style.height = '';
        if (onRefresh) {
          Promise.resolve(onRefresh()).finally(function () {
            setTimeout(function () { indicator.classList.remove('active'); }, 500);
          });
        } else {
          setTimeout(function () { indicator.classList.remove('active'); }, 500);
        }
      } else {
        indicator.style.height = '0';
      }
      pullDist = 0;
    }, { passive: true });
  },

  // ---- Init on DOM ready ----
  init: function () {
    this.initTabBar();
    this.initTheme();
  },

  // ---- Theme ----
  initTheme: function () {
    // login.html 等页面不引入 storage.js，直接跳过（theme-init.js 已完成预渲染主题）
    // 注意：浏览器原生存在 window.Storage 接口，需按方法存在性判断而非 typeof
    if (typeof Storage === 'undefined' || typeof Storage.getSettings !== 'function') return;
    var settings = Storage.getSettings();
    this.applyTheme(settings.theme);
  },

  setTheme: function (theme) {
    var settings = Storage.getSettings();
    settings.theme = theme;
    Storage.saveSettings(settings);
    this.applyTheme(theme);
  },

  applyTheme: function (theme) {
    var html = document.documentElement;
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
    } else if (theme === 'yaolan') {
      html.setAttribute('data-theme', 'yaolan');
    } else {
      html.removeAttribute('data-theme');
    }
  },

  // ---- Notifications ----
  requestNotificationPermission: function () {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  sendNotification: function (title, body) {
    if (!('Notification' in window)) return;
    var settings = Storage.getSettings();
    if (!settings.notifyPickup && !settings.notifyMessage) return;
    if (Notification.permission === 'granted') {
      try {
        var n = new Notification(title, { body: body, icon: 'assets/icons/favicon.svg' });
        if (settings.notifySound) {
          // 简单 beep
          var audio = new AudioContext();
          var o = audio.createOscillator();
          var g = audio.createGain();
          o.connect(g); g.connect(audio.destination);
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.1, audio.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
          o.start();
          o.stop(audio.currentTime + 0.3);
        }
        return n;
      } catch (e) {}
    }
  },

  // ---- Platform Badge ----
  platformMap: {
    '拼多多': { name: '拼多多', color: '#E4423A', bg: '#FFF1F0' },
    '淘宝': { name: '淘宝', color: '#FF6900', bg: '#FFF7E6' },
    '天猫': { name: '天猫', color: '#E5333B', bg: '#FFF1F3' },
    '京东': { name: '京东', color: '#E31436', bg: '#FFF1F2' },
    '菜鸟': { name: '菜鸟', color: '#00A0E9', bg: '#E6F7FF' },
    '抖音': { name: '抖音', color: '#161823', bg: '#EAEAEA' },
    '小红书': { name: '小红书', color: '#FE2C55', bg: '#FFE8EC' },
    '得物': { name: '得物', color: '#FB7C37', bg: '#FFF1E6' },
    '唯品会': { name: '唯品会', color: '#FF2E8B', bg: '#FFE8F5' },
    '当当': { name: '当当', color: '#C8161D', bg: '#FFE8E8' },
    '叮咚': { name: '叮咚买菜', color: '#00C569', bg: '#E6FFF0' },
  },

  platformBadge: function (sender) {
    if (!sender) return '';
    for (var key in this.platformMap) {
      if (!this.platformMap.hasOwnProperty(key)) continue;
      if (sender.indexOf(key) !== -1) {
        var p = this.platformMap[key];
        return '<span class="platform-badge" style="background:' + p.bg + ';color:' + p.color + ';">' + p.name + '</span>';
      }
    }
    return '';
  },

  // ---- 头像渲染：image(base64) > emoji 预设 > 姓名首字 ----
  avatarHtml: function (user, size, fallbackBg, fallbackColor) {
    size = size || 48;
    fallbackBg = fallbackBg || 'var(--color-primary-light)';
    fallbackColor = fallbackColor || 'var(--color-primary)';
    var base = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;';
    var avatar = user && user.avatar;
    if (avatar && avatar.type === 'image' && avatar.data) {
      return '<span style="' + base + '"><img src="' + avatar.data + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"></span>';
    }
    if (avatar && avatar.type === 'emoji' && avatar.emoji) {
      return '<span style="' + base + 'background:' + (avatar.bg || '#E0E7FF') + ';font-size:' + Math.round(size * 0.52) + 'px;line-height:1;">' + avatar.emoji + '</span>';
    }
    var ch = (user && user.name ? String(user.name) : '用').charAt(0);
    return '<span style="' + base + 'background:' + fallbackBg + ';color:' + fallbackColor + ';font-size:' + Math.round(size * 0.42) + 'px;font-weight:700;">' + ch + '</span>';
  },

  // ---- Identity Code Modal ----
  showIdentityCode: function () {
    var user = Storage.getUser();
    var studentId = user.studentId || '';
    var avatarHtml = this.avatarHtml(user, 60, 'rgba(255,255,255,0.25)', '#fff');

    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal" style="max-width:320px;padding:0;overflow:hidden;">' +
        '<div style="background:linear-gradient(135deg,var(--color-primary),var(--color-primary-hover));padding:24px 24px 20px;text-align:center;color:#fff;">' +
          '<div style="margin:0 auto 10px;width:60px;">' + avatarHtml + '</div>' +
          '<div style="font-size:17px;font-weight:700;">' + (user.name || '') + '</div>' +
          '<div style="font-size:12px;opacity:0.85;margin-top:3px;">学号 ' + studentId + '</div>' +
        '</div>' +
        '<div style="padding:20px 24px 24px;text-align:center;">' +
          '<div style="font-size:12px;color:var(--color-text-sub);margin-bottom:10px;">取件身份码（请向工作人员出示）</div>' +
          '<div id="identityQrBox" style="display:flex;align-items:center;justify-content:center;min-height:150px;">' +
            '<div class="spinner" style="width:28px;height:28px;border-width:3px;"></div>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--color-text-hint);margin-top:8px;font-family:var(--font-mono);letter-spacing:1px;">' + studentId + '</div>' +
          '<button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="App.closeModal()">关闭</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);
    requestAnimationFrame(function () { backdrop.classList.add('show'); });

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) App.closeModal();
    });

    var generateQR = function () {
      try {
        var qr = qrcode(0, 'M');
        qr.addData(studentId, 'Byte');
        qr.make();
        var svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        var box = document.getElementById('identityQrBox');
        if (box) box.innerHTML = svg;
      } catch (e) {
        var box2 = document.getElementById('identityQrBox');
        if (box2) box2.innerHTML = '<div style="font-size:13px;color:var(--color-text-hint);">二维码生成失败</div>';
      }
    };

    if (typeof qrcode === 'function') {
      generateQR();
    } else {
      var script = document.createElement('script');
      script.src = 'libs/qr-encoder/qrcode.js';
      script.onload = function () {
        var s2 = document.createElement('script');
        s2.src = 'libs/qr-encoder/qrcode_UTF8.js';
        s2.onload = generateQR;
        s2.onerror = generateQR;
        document.head.appendChild(s2);
      };
      script.onerror = function () {
        var box3 = document.getElementById('identityQrBox');
        if (box3) box3.innerHTML = '<div style="font-size:13px;color:var(--color-text-hint);">二维码库加载失败</div>';
      };
      document.head.appendChild(script);
    }
  },

  // ---- Map Navigation Action Sheet ----
  showMapNav: function (poiId, poiName, address) {
    var localUrl = 'map.html' + (poiId ? '?poi=' + poiId : '');
    var keyword = encodeURIComponent(address || poiName || '');
    var gaodeUrl = 'https://uri.amap.com/search?keyword=' + keyword + '&src=campus-package-app';
    var baiduUrl = 'https://api.map.baidu.com/place/search?query=' + keyword + '&src=campus-package-app';

    var backdrop = document.createElement('div');
    backdrop.className = 'action-sheet-backdrop';

    var sheet = document.createElement('div');
    sheet.className = 'action-sheet';
    sheet.innerHTML =
      '<div style="text-align:center;font-size:13px;color:var(--color-text-sub);padding:4px 0 12px;">选择导航方式</div>' +
      '<a href="' + localUrl + '" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:var(--color-surface);margin-bottom:8px;text-decoration:none;color:var(--color-text);box-shadow:var(--shadow-sm);">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:var(--color-primary-light);display:flex;align-items:center;justify-content:center;color:var(--color-primary);flex-shrink:0;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>' +
        '</div>' +
        '<div><div style="font-size:14px;font-weight:600;">本地校园地图</div><div style="font-size:12px;color:var(--color-text-sub);">校内路线导航（离线可用）</div></div>' +
      '</a>' +
      '<a href="' + gaodeUrl + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:var(--color-surface);margin-bottom:8px;text-decoration:none;color:var(--color-text);box-shadow:var(--shadow-sm);">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:#E6F7FF;display:flex;align-items:center;justify-content:center;color:#00A0E9;flex-shrink:0;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '</div>' +
        '<div><div style="font-size:14px;font-weight:600;">高德地图</div><div style="font-size:12px;color:var(--color-text-sub);">打开高德地图搜索位置</div></div>' +
      '</a>' +
      '<a href="' + baiduUrl + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:var(--color-surface);margin-bottom:8px;text-decoration:none;color:var(--color-text);box-shadow:var(--shadow-sm);">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:#E8F0FF;display:flex;align-items:center;justify-content:center;color:#2932E1;flex-shrink:0;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '</div>' +
        '<div><div style="font-size:14px;font-weight:600;">百度地图</div><div style="font-size:12px;color:var(--color-text-sub);">打开百度地图搜索位置</div></div>' +
      '</a>' +
      '<button class="btn btn-outline btn-block" style="margin-top:4px;" onclick="App.closeMapNav()">取消</button>';

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(function () { backdrop.classList.add('show'); });

    backdrop.addEventListener('click', function () { App.closeMapNav(); });
    sheet.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setTimeout(function () { App.closeMapNav(); }, 150); });
    });
  },

  closeMapNav: function () {
    var backdrop = document.querySelector('.action-sheet-backdrop');
    if (backdrop) backdrop.classList.remove('show');
    setTimeout(function () {
      var b = document.querySelector('.action-sheet-backdrop');
      var s = document.querySelector('.action-sheet');
      if (b) b.remove();
      if (s) s.remove();
    }, 300);
  },
};

document.addEventListener('DOMContentLoaded', function () {
  App.init();
});

// ---- PWA：Service Worker 注册（离线缓存 App 外壳与静态资源） ----
// 仅在 HTTPS 或 localhost 下生效（SW 安全要求）；注册失败静默降级为在线模式
(function () {
  try {
    var secure = location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && secure) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 降级在线模式 */ });
      });
    }
  } catch (e) { /* SW 不可用不影响 App 运行 */ }
})();
