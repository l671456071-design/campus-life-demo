// api.js — 本地数据接口层：全部读写 Storage（localStorage），不连接任何服务器。
// 函数签名与返回结构保持与原版一致，页面代码无需关心数据来自哪里。

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var API = {
  // GET /api/packages?status=&keyword=
  fetchPackages: async function (opts) {
    opts = opts || {};
    await delay(120);
    var list = Storage.getPackages().slice();
    if (opts.status && opts.status !== 'all') {
      list = list.filter(function (p) { return p.status === opts.status; });
    }
    if (opts.keyword) {
      var kw = opts.keyword.toLowerCase();
      list = list.filter(function (p) {
        return (p.company + p.trackingNo + p.pickupPoint + p.sender + (p.pickupCode || '')).toLowerCase().indexOf(kw) !== -1;
      });
    }
    return { code: 0, data: list, total: list.length };
  },

  // GET /api/packages/:id
  fetchPackage: async function (id) {
    await delay(100);
    return { code: 0, data: Storage.getPackage(id) || null };
  },

  // GET /api/packages/summary
  fetchSummary: async function () {
    await delay(100);
    var packages = Storage.getPackages();
    var pending = packages.filter(function (p) { return p.status === 'pending'; });
    var incoming = packages.filter(function (p) { return p.status === 'incoming'; });
    return { code: 0, data: { pendingCount: pending.length, incomingCount: incoming.length, packages: pending } };
  },

  // GET /api/records
  fetchRecords: async function (opts) {
    opts = opts || {};
    await delay(120);
    var list = Storage.getRecords().slice();
    if (opts.keyword) {
      var kw = opts.keyword.toLowerCase();
      list = list.filter(function (r) {
        return (r.company + r.trackingNo + r.pickupPoint).toLowerCase().indexOf(kw) !== -1;
      });
    }
    return { code: 0, data: list, total: list.length };
  },

  // GET /api/messages
  fetchMessages: async function () {
    await delay(120);
    var list = Storage.getMessages();
    return { code: 0, data: list, total: list.length };
  },

  // GET /api/pickup-points — 待取数量为实时计算值
  fetchPickupPoints: async function () {
    await delay(100);
    var list = Storage.getPickupPoints();
    return { code: 0, data: list, total: list.length };
  },

  // POST /api/scan/pickup — 本地解析扫码内容
  // 支持：纯取件码（8-3-267）/ JSON（{"qrCode":"8-3-267","packageId":"PK001"}）/ 运单号
  scanPickup: async function (code) {
    await delay(150);
    var result = API.resolveScanCode(code);
    if (result.status === 'pending') {
      return { code: 0, data: { success: true, packageId: result.pkg.id, companyName: result.pkg.company, trackingNo: result.pkg.trackingNo } };
    }
    return { code: 0, data: { success: false, message: result.message } };
  },

  // 同步解析扫码/手输内容，返回 {status, pkg?, message}
  resolveScanCode: function (raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { status: 'empty', message: '未识别到快递二维码' };
    }
    var text = raw.trim();

    // 尝试 JSON 形式：{"qrCode":"8-3-267","packageId":"PK001"}
    var packageId = null;
    var code = text;
    if (text.charAt(0) === '{') {
      try {
        var obj = JSON.parse(text);
        if (obj && typeof obj === 'object') {
          packageId = obj.packageId || null;
          code = obj.qrCode || obj.pickupCode || obj.code || '';
        }
      } catch (e) { /* 非法 JSON，按纯文本处理 */ }
    }

    var packages = Storage.getPackages();
    var pkg = null;
    if (packageId) {
      for (var i = 0; i < packages.length; i++) {
        if (packages[i].id === packageId) { pkg = packages[i]; break; }
      }
    }
    if (!pkg && code) {
      for (var j = 0; j < packages.length; j++) {
        if (packages[j].pickupCode === code || packages[j].trackingNo === code) { pkg = packages[j]; break; }
      }
    }
    // 兜底：扫码原文即 packageId
    if (!pkg && !packageId) {
      for (var k = 0; k < packages.length; k++) {
        if (packages[k].id === text) { pkg = packages[k]; break; }
      }
    }

    if (!pkg) return { status: 'notfound', message: '未识别到快递二维码，请检查取件码或手动输入' };
    if (pkg.status === 'pending') return { status: 'pending', pkg: pkg };
    if (pkg.status === 'picked') return { status: 'picked', pkg: pkg, message: '该快递已于 ' + (pkg.pickedAt || '早前') + ' 取出' };
    if (pkg.status === 'incoming') return { status: 'incoming', pkg: pkg, message: '该快递运输中（' + (pkg.estimatedTime || '尚未到站') + '），暂不能取件' };
    return { status: pkg.status, pkg: pkg, message: '该快递当前状态不支持取件' };
  },

  // POST /api/packages/:id/confirm-pickup — 真正写入本地存储
  confirmPickup: async function (id) {
    await delay(200);
    var result = Storage.confirmPickup(id);
    return { code: 0, data: result };
  },

  // GET /api/user
  fetchUser: async function () {
    await delay(80);
    return { code: 0, data: Storage.getUser() };
  },

  // POST /api/messages/:id/read
  markMessageRead: async function (id) {
    Storage.markMessageRead(id);
    return { code: 0, data: { success: true } };
  },

  // POST /api/messages/read-all
  markAllMessagesRead: async function () {
    Storage.markAllMessagesRead();
    return { code: 0, data: { success: true } };
  },

  // POST /api/auth/bind-phone — 本地模拟（无服务器阶段保留）
  bindPhone: async function (phone, code) {
    await delay(400);
    if (code === '1234') return { code: 0, data: { success: true } };
    return { code: 0, data: { success: false, message: '验证码错误' } };
  },

  // POST /api/auth/send-code — 本地模拟
  sendCode: async function (phone) {
    await delay(300);
    return { code: 0, data: { success: true, demoCode: '1234' } };
  },

  // =========================================================
  // 校园外卖（全部读写本地 Storage）
  // =========================================================

  // GET /api/food/restaurants?category=&keyword=
  fetchRestaurants: async function (opts) {
    opts = opts || {};
    await delay(100);
    var list = Storage.getRestaurants(opts);
    return { code: 0, data: list, total: list.length };
  },

  fetchRestaurant: async function (id) {
    await delay(80);
    return { code: 0, data: Storage.getRestaurant(id) || null };
  },

  // GET /api/food/restaurants/:id/foods
  fetchFoods: async function (restaurantId) {
    await delay(100);
    var list = Storage.getFoods(restaurantId);
    return { code: 0, data: list, total: list.length };
  },

  fetchFoodCategories: async function () {
    return { code: 0, data: (typeof DB !== 'undefined' && DB.foodCategories) ? DB.foodCategories : [] };
  },

  // ---- 购物车 ----
  fetchCartSummary: async function () {
    await delay(60);
    return { code: 0, data: Storage.getCartSummary() };
  },

  addToCart: async function (foodId, qty) {
    await delay(60);
    var food = Storage.getFood(foodId);
    if (!food) return { code: 0, data: { success: false, message: '菜品不存在' } };
    var r = Storage.addToCart(food, qty || 1);
    return { code: 0, data: { success: true, replaced: r.replaced, count: Storage.getCartCount() } };
  },

  setCartQty: async function (foodId, qty) {
    await delay(40);
    Storage.setCartQty(foodId, qty);
    return { code: 0, data: { success: true, count: Storage.getCartCount() } };
  },

  clearCart: async function () {
    Storage.clearCart();
    return { code: 0, data: { success: true } };
  },

  // ---- 订单 ----
  createOrder: async function (address, note) {
    await delay(200);
    var result = Storage.createOrder(address, note);
    return { code: 0, data: result };
  },

  fetchOrders: async function () {
    await delay(100);
    var list = Storage.syncOrderStatuses();
    return { code: 0, data: list, total: list.length };
  },

  fetchOrder: async function (id) {
    await delay(80);
    Storage.syncOrderStatuses();
    return { code: 0, data: Storage.getOrder(id) || null };
  },

  payOrder: async function (id) {
    await delay(400);
    var result = Storage.payOrder(id);
    return { code: 0, data: result };
  },

  // =========================================================
  // OCR 文本 → 取件码提取与匹配（供扫码页 OCR 引擎调用）
  // =========================================================

  // 从 OCR 识别文本中提取候选取件码。
  // 支持：8-3-267 / 83267 / A-12-568 / 12-35-88 / 取件码：8-3-267 / 取件码 83267
  extractPickupCandidates: function (text) {
    if (!text) return [];
    // 清理空格、换行、全角冒号
    var cleaned = String(text).replace(/[\s\u3000\n\r\t]+/g, '').replace(/：/g, ':');
    var out = [];
    var seen = {};
    function push(c) {
      var n = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n && !seen[n]) { seen[n] = 1; out.push(String(c)); }
    }
    var m;
    // 1) 三段式：8-3-267 / A-12-568 / 12-35-88 / C-12-45（首段可为纯字母）
    var reSeg = /([A-Za-z]{0,2}\d{0,4}-\d{1,4}-\d{1,6})/g;
    while ((m = reSeg.exec(cleaned))) push(m[1]);
    // 2) “取件码/取货码/凭码/提取码”前缀后的数字串
    var reZh = /(?:取件码|取货码|提取码|凭码|pickup)[:]?([0-9-]{3,15})/gi;
    while ((m = reZh.exec(cleaned))) push(m[1]);
    // 3) 连续 4-8 位纯数字（兜底）
    var reDigits = /(\d{4,8})/g;
    while ((m = reDigits.exec(cleaned))) push(m[1]);
    return out;
  },

  // OCR 文本整体解析：提取候选 → 归一化匹配本地快递数据库
  // 返回结构同 resolveScanCode：{ status, pkg?, candidates?, message }
  resolveScanText: function (rawText) {
    var candidates = API.extractPickupCandidates(rawText);
    if (!candidates.length) {
      return { status: 'empty', message: '未识别到取件码文字', candidates: [] };
    }
    function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    var packages = Storage.getPackages();
    for (var i = 0; i < candidates.length; i++) {
      var n = norm(candidates[i]);
      for (var j = 0; j < packages.length; j++) {
        var p = packages[j];
        var pc = p.pickupCode ? norm(p.pickupCode) : '';
        if (pc && pc === n) {
          return API.resolveScanCode(p.pickupCode);
        }
      }
    }
    return { status: 'notfound', message: '未找到对应快递，请重新扫描或手动输入取件码', candidates: candidates };
  },
};
