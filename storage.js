// storage.js — 本地数据层：所有页面统一通过 Storage API 读写 localStorage
// 首次运行时把 mock.js（local 模式）或 demo-data.js（demo 模式）的种子数据初始化到 localStorage，之后全部从本地读取。
// 浏览器关闭重开后数据仍然存在；断网状态下完全可用。
// demo 模式（config.js 中 APP_CONFIG.isDemo）下所有存储键自动加 demo_ 前缀，
// 与本地开发数据完全隔离：外部用户只会在自己的浏览器里读写演示数据。

var Storage = {
  KEYS: {
    packages: 'packageDB',
    records: 'pickupRecordDB',
    messages: 'messageDB',
    user: 'userDB',
    points: 'pickupPointDB',
    meta: 'campusMetaDB',
    settings: 'appSettingsDB',
    restaurants: 'restaurantDB',
    foods: 'foodDB',
    cart: 'foodCartDB',
    orders: 'foodOrderDB',
  },

  // demo 模式：存储键统一加 demo_ 前缀（demo_packages / demo_cart / demo_orders / demo_messages ...）
  _initKeys: function () {
    var isDemo = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.isDemo);
    if (isDemo) {
      for (var k in this.KEYS) {
        if (Object.prototype.hasOwnProperty.call(this.KEYS, k) && this.KEYS[k].indexOf('demo_') !== 0) {
          this.KEYS[k] = 'demo_' + this.KEYS[k];
        }
      }
    }
  },

  // 外卖订单演示时间轴（本地模拟：制作 30s → 配送 180s → 完成）
  FOOD_TIMINGS: { preparingMs: 30 * 1000, deliveringMs: 180 * 1000 },

  ORDER_STATUS: {
    unpaid: '待支付',
    preparing: '制作中',
    delivering: '配送中',
    completed: '已完成',
  },

  // 隐私模式等场景下 localStorage 可能不可用，降级为内存存储（仅当次会话有效）
  _memory: {},
  _available: (function () {
    try {
      var k = '__storage_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })(),

  _read: function (key, fallback) {
    try {
      var raw = this._available ? localStorage.getItem(key) : this._memory[key];
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },

  _write: function (key, value) {
    var raw = JSON.stringify(value);
    if (this._available) localStorage.setItem(key, raw);
    else this._memory[key] = raw;
  },

  _remove: function (key) {
    if (this._available) localStorage.removeItem(key);
    else delete this._memory[key];
  },

  // ---- 初始化：首次运行时写入种子数据（local 模式来自 mock.js 的 DB，demo 模式来自 demo-data.js 替换后的 DB）----
  init: function () {
    this._initKeys();
    if (typeof DB === 'undefined') return;
    if (this._read(this.KEYS.packages, null) === null) this._write(this.KEYS.packages, DB.packages);
    if (this._read(this.KEYS.records, null) === null) this._write(this.KEYS.records, DB.records);
    if (this._read(this.KEYS.messages, null) === null) this._write(this.KEYS.messages, DB.messages);
    if (this._read(this.KEYS.user, null) === null) this._write(this.KEYS.user, DB.user);
    if (this._read(this.KEYS.points, null) === null) this._write(this.KEYS.points, DB.pickupPoints);
    if (this._read(this.KEYS.restaurants, null) === null) this._write(this.KEYS.restaurants, DB.restaurants || []);
    if (this._read(this.KEYS.foods, null) === null) this._write(this.KEYS.foods, DB.foods || []);
    this._write(this.KEYS.meta, { version: 3, seededAt: new Date().toISOString() });
  },

  // ---- 快递 ----
  getPackages: function () {
    return this._read(this.KEYS.packages, []);
  },

  getPackage: function (id) {
    var list = this.getPackages();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  },

  updatePackage: function (id, patch) {
    var list = this.getPackages();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        for (var k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) list[i][k] = patch[k];
        }
        this._write(this.KEYS.packages, list);
        return true;
      }
    }
    return false;
  },

  // ---- 确认取件：pending → picked，并联动记录、消息、用户统计 ----
  confirmPickup: function (id) {
    var pkg = this.getPackage(id);
    if (!pkg) return { success: false, message: '未找到该快递' };
    if (pkg.status !== 'pending') {
      return { success: false, message: pkg.status === 'picked' ? '该快递已被取件' : '当前状态不可取件' };
    }
    var now = this.formatNow();
    this.updatePackage(id, {
      status: 'picked',
      pickedAt: now,
      estimatedTime: '已取件',
      expiresIn: null,
    });

    // 取件记录新增一条
    var records = this.getRecords();
    records.unshift({
      id: 'R' + Date.now(),
      packageId: pkg.id,
      company: pkg.company,
      shortName: pkg.shortName,
      logoColor: pkg.logoColor,
      trackingNo: pkg.trackingNo,
      pickedAt: now,
      pickupPoint: pkg.pickupPoint,
      pickupCode: pkg.pickupCode,
      type: pkg.type,
    });
    this._write(this.KEYS.records, records);

    // 消息中心新增取件成功通知（未读）
    var messages = this.getMessages();
    messages.unshift({
      id: 'M' + Date.now(),
      type: 'pickup',
      title: '取件成功',
      content: '您已成功取走【' + pkg.company + '】包裹 ' + pkg.trackingNo + '，感谢使用校园快递服务。',
      time: '刚刚',
      read: false,
      icon: 'check',
      color: '#10B981',
    });
    this._write(this.KEYS.messages, messages);

    // 用户累计取件数 +1
    var user = this.getUser();
    user.pickedCount = (user.pickedCount || 0) + 1;
    this.saveUser(user);

    return { success: true, pickedAt: now };
  },

  // ---- 取件记录 ----
  getRecords: function () {
    return this._read(this.KEYS.records, []);
  },

  // ---- 消息 ----
  getMessages: function () {
    return this._read(this.KEYS.messages, []);
  },

  markMessageRead: function (id) {
    var messages = this.getMessages();
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].id === id) {
        messages[i].read = true;
        this._write(this.KEYS.messages, messages);
        return true;
      }
    }
    return false;
  },

  markAllMessagesRead: function () {
    var messages = this.getMessages();
    for (var i = 0; i < messages.length; i++) messages[i].read = true;
    this._write(this.KEYS.messages, messages);
  },

  getUnreadCount: function () {
    var messages = this.getMessages();
    var n = 0;
    for (var i = 0; i < messages.length; i++) {
      if (!messages[i].read) n++;
    }
    return n;
  },

  // ---- 取件点（待取数量实时从快递数据计算） ----
  getPickupPoints: function () {
    var points = this._read(this.KEYS.points, []);
    var packages = this.getPackages();
    var countMap = {};
    for (var i = 0; i < packages.length; i++) {
      var p = packages[i];
      if (p.status === 'pending') {
        countMap[p.pickupPoint] = (countMap[p.pickupPoint] || 0) + 1;
      }
    }
    return points.map(function (pt) {
      var copy = {};
      for (var k in pt) copy[k] = pt[k];
      copy.pendingCount = countMap[pt.name] || 0;
      return copy;
    });
  },

  getPickupPoint: function (id) {
    var points = this.getPickupPoints();
    for (var i = 0; i < points.length; i++) {
      if (points[i].id === id) return points[i];
    }
    return null;
  },

  // ---- 用户 ----
  getUser: function () {
    return this._read(this.KEYS.user, {
      id: 1, name: '张小明', studentId: '2024010132', phone: '138****8888',
      campus: '涵江校区 · 兰苑 3号楼', boundPhone: true, avatar: null, pickedCount: 0,
    });
  },

  saveUser: function (user) {
    this._write(this.KEYS.user, user);
  },

  // ---- 设置存储 ----
  getSettings: function () {
    var defaults = {
      theme: 'auto',         // auto | light | dark
      notifyPickup: true,    // 取件提醒
      notifyMessage: true,   // 消息通知
      notifySound: true,     // 声音提醒
      perfMode: 'auto',      // 性能模式：auto（按设备自动）| saver（省电）| perf（高性能）
    };
    var saved = this._read(this.KEYS.settings, {});
    return Object.assign({}, defaults, saved);
  },

  saveSettings: function (settings) {
    this._write(this.KEYS.settings, settings);
  },

  // =========================================================
  // 校园外卖：店铺 / 菜品 / 购物车 / 订单（全部本地）
  // =========================================================

  // ---- 店铺（营业状态按本地时间实时计算） ----
  getRestaurants: function (opts) {
    var list = this._read(this.KEYS.restaurants, []);
    var now = new Date();
    var hour = now.getHours() + now.getMinutes() / 60;
    var kw = opts && opts.keyword ? opts.keyword.toLowerCase() : '';
    var category = opts && opts.category && opts.category !== 'all' ? opts.category : '';
    return list.filter(function (r) {
      if (category && r.category !== category) return false;
      if (kw) {
        var hay = (r.name + (r.notice || '')).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    }).map(function (r) {
      var copy = {};
      for (var k in r) copy[k] = r[k];
      // 演示营业规则：早餐店 06:30-10:30；夜宵店 17:00-次日01:00；其余全时段
      var open = true;
      if (r.category === 'breakfast') open = hour >= 6.5 && hour <= 10.5;
      else if (r.category === 'night') open = hour >= 17 || hour <= 1;
      copy.isOpen = open;
      copy.statusText = open ? '营业中' : '休息中';
      return copy;
    });
  },

  getRestaurant: function (id) {
    var list = this.getRestaurants();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  },

  // ---- 菜品 ----
  getFoods: function (restaurantId) {
    var list = this._read(this.KEYS.foods, []);
    if (!restaurantId) return list;
    return list.filter(function (f) { return f.restaurantId === restaurantId; });
  },

  getFood: function (id) {
    var list = this._read(this.KEYS.foods, []);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  },

  // ---- 购物车（单店铺结构：{ restaurantId, items: [{foodId,name,price,qty,emoji}] }） ----
  getCart: function () {
    return this._read(this.KEYS.cart, { restaurantId: null, items: [] });
  },

  getCartCount: function () {
    var cart = this.getCart();
    var n = 0;
    for (var i = 0; i < cart.items.length; i++) n += cart.items[i].qty;
    return n;
  },

  // 加入购物车。若已有其它店铺商品则返回 { replaced: true } 由调用方提示
  addToCart: function (food, qty) {
    qty = qty || 1;
    var cart = this.getCart();
    var replaced = false;
    if (cart.restaurantId && cart.restaurantId !== food.restaurantId && cart.items.length) {
      cart = { restaurantId: food.restaurantId, items: [] };
      replaced = true;
    }
    cart.restaurantId = food.restaurantId;
    var found = false;
    for (var i = 0; i < cart.items.length; i++) {
      if (cart.items[i].foodId === food.id) {
        cart.items[i].qty += qty;
        found = true;
        break;
      }
    }
    if (!found) {
      cart.items.push({ foodId: food.id, name: food.name, price: food.price, qty: qty, emoji: food.emoji || '🍽️' });
    }
    this._write(this.KEYS.cart, cart);
    return { replaced: replaced };
  },

  setCartQty: function (foodId, qty) {
    var cart = this.getCart();
    var items = [];
    for (var i = 0; i < cart.items.length; i++) {
      if (cart.items[i].foodId === foodId) {
        if (qty > 0) { cart.items[i].qty = qty; items.push(cart.items[i]); }
      } else {
        items.push(cart.items[i]);
      }
    }
    cart.items = items;
    if (!items.length) cart.restaurantId = null;
    this._write(this.KEYS.cart, cart);
  },

  clearCart: function () {
    this._write(this.KEYS.cart, { restaurantId: null, items: [] });
  },

  // 购物车价格汇总（起送 / 配送费 / 满减优惠 / 合计）
  getCartSummary: function () {
    var cart = this.getCart();
    var restaurant = cart.restaurantId ? this.getRestaurant(cart.restaurantId) : null;
    var subtotal = 0, itemCount = 0;
    for (var i = 0; i < cart.items.length; i++) {
      subtotal += cart.items[i].price * cart.items[i].qty;
      itemCount += cart.items[i].qty;
    }
    var deliveryFee = 0, discount = 0, promoCut = 0;
    if (restaurant) {
      deliveryFee = restaurant.deliveryFee || 0;
      // 食堂类免配送费展示策略：满减来自 promo
      if (restaurant.promo && subtotal >= restaurant.promo.full) {
        discount = restaurant.promo.cut;
        promoCut = restaurant.promo.cut;
      }
    }
    var total = Math.max(0, subtotal - discount) + (itemCount > 0 ? deliveryFee : 0);
    var reachMin = !restaurant || subtotal >= (restaurant.minOrder || 0);
    return {
      restaurant: restaurant,
      itemCount: itemCount,
      subtotal: Math.round(subtotal * 100) / 100,
      deliveryFee: deliveryFee,
      discount: discount,
      promoCut: promoCut,
      total: Math.round(total * 100) / 100,
      reachMin: reachMin,
      minOrder: restaurant ? restaurant.minOrder || 0 : 0,
    };
  },

  // ---- 订单 ----
  getOrders: function () {
    return this._read(this.KEYS.orders, []);
  },

  getOrder: function (id) {
    var list = this.getOrders();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  },

  getDefaultAddress: function () {
    var user = this.getUser();
    var dorm = user.dormitory || '';
    var campus = user.campus || '';
    return {
      name: user.name || '同学',
      phone: user.phone || '138****8888',
      text: (campus ? campus + ' ' : '') + (dorm || '宿舍区'),
    };
  },

  // 从购物车生成订单（待支付状态）
  // opts 可携带 { payMethod: 'wechat' | 'alipay' | 'cod' }
  createOrder: function (address, note, opts) {
    var summary = this.getCartSummary();
    if (!summary.itemCount) return { success: false, message: '购物车是空的' };
    var r = summary.restaurant || {};
    var now = Date.now();
    opts = opts || {};
    var payMethod = opts.payMethod || 'wechat';
    var payMethodLabel = { wechat: '微信支付', alipay: '支付宝', cod: '货到付款（模拟）' }[payMethod] || '微信支付';
    var order = {
      id: 'FO' + now,
      restaurantId: r.id,
      restaurantName: r.name,
      restaurantEmoji: r.emoji || '🍽️',
      restaurantColor: r.color || '#F59E0B',
      accessNode: r.accessNode || 'd1',
      x: r.x, y: r.y,
      items: summary.restaurant ? this.getCart().items : [],
      itemCount: summary.itemCount,
      subtotal: summary.subtotal,
      deliveryFee: summary.deliveryFee,
      discount: summary.discount,
      total: summary.total,
      etaMinutes: r.deliveryTime || 20,
      address: address || this.getDefaultAddress(),
      note: note || '',
      status: 'unpaid',
      createdAt: now,
      payMethod: payMethod,
      payMethodLabel: payMethodLabel,
    };
    var orders = this.getOrders();
    orders.unshift(order);
    this._write(this.KEYS.orders, orders);
    this.clearCart();
    return { success: true, order: order };
  },

  // 模拟支付：待支付 → 制作中
  // 可携带 payMethod（wechat/alipay/cod），覆盖订单创建时的支付方式
  payOrder: function (id, payMethod) {
    var orders = this.getOrders();
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].id === id && orders[i].status === 'unpaid') {
        orders[i].status = 'preparing';
        orders[i].preparingAt = Date.now();
        if (payMethod) {
          orders[i].payMethod = payMethod;
          orders[i].payMethodLabel = { wechat: '微信支付', alipay: '支付宝', cod: '货到付款（模拟）' }[payMethod] || orders[i].payMethodLabel;
        }
        this._write(this.KEYS.orders, orders);
        return { success: true, order: orders[i] };
      }
    }
    return { success: false, message: '订单不存在或状态已变更' };
  },

  // 按演示时间轴推进订单状态（页面加载 / 定时调用）
  syncOrderStatuses: function () {
    var orders = this.getOrders();
    var now = Date.now();
    var changed = false;
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      if (o.status === 'preparing' && o.preparingAt && now - o.preparingAt >= this.FOOD_TIMINGS.preparingMs) {
        o.status = 'delivering';
        o.deliveringAt = now;
        changed = true;
      } else if (o.status === 'delivering' && o.deliveringAt) {
        var elapsed = now - o.deliveringAt;
        if (elapsed >= this.FOOD_TIMINGS.deliveringMs) {
          o.status = 'completed';
          o.completedAt = o.deliveringAt + this.FOOD_TIMINGS.deliveringMs;
          changed = true;
        }
      }
    }
    if (changed) this._write(this.KEYS.orders, orders);
    return orders;
  },

  // 配送进度 0~1（配送中订单，供 3D 地图骑手定位）
  getDeliveryProgress: function (order) {
    if (!order || order.status === 'completed') return 1;
    if (order.status !== 'delivering' || !order.deliveringAt) return 0;
    var p = (Date.now() - order.deliveringAt) / this.FOOD_TIMINGS.deliveringMs;
    return Math.max(0, Math.min(1, p));
  },

  // ---- 校区切换 ----
  // 校区信息存储在 user.campusId，默认涵江
  getCampusId: function () {
    var user = this.getUser();
    return user.campusId || 'hanjiang';
  },

  setCampusId: function (campusId) {
    var user = this.getUser();
    user.campusId = campusId;
    // 同步更新 campus 字段（兼容旧逻辑：campus 形如 "涵江校区 · 兰苑 5号楼"）
    var campuses = this.getCampuses();
    for (var i = 0; i < campuses.length; i++) {
      if (campuses[i].id === campusId) {
        var dorm = user.dormitory || '兰苑 5号楼';
        user.campus = campuses[i].name + ' · ' + dorm;
        break;
      }
    }
    this.saveUser(user);
    return user;
  },

  // 从 DB 读取校区列表
  getCampuses: function () {
    if (typeof DB === 'undefined' || !DB.campuses) {
      return [
        { id: 'hanjiang', name: '涵江校区', desc: '主校区 · 兰苑/楷苑/菊苑/梅苑' },
        { id: 'xianyou',  name: '仙游校区', desc: '分校区 · 兰香园/桂香园/菊香园' },
      ];
    }
    return DB.campuses;
  },

  // 从 DB 读取小程序合作入口
  getMiniPrograms: function () {
    if (typeof DB === 'undefined' || !DB.miniPrograms) return [];
    return DB.miniPrograms;
  },

  // ---- 重置全部本地数据（恢复初始演示数据） ----
  resetAll: function () {
    this._remove(this.KEYS.packages);
    this._remove(this.KEYS.records);
    this._remove(this.KEYS.messages);
    this._remove(this.KEYS.user);
    this._remove(this.KEYS.points);
    this._remove(this.KEYS.meta);
    this._remove(this.KEYS.settings);
    this._remove(this.KEYS.restaurants);
    this._remove(this.KEYS.foods);
    this._remove(this.KEYS.cart);
    this._remove(this.KEYS.orders);
    this.init();
  },

  // ---- 工具：按现有数据格式输出 "MM-DD HH:mm" ----
  formatNow: function () {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },
};

// 页面引入本文件后立即完成初始化（需在 mock.js 之后引入）
Storage.init();
