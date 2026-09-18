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
    life: 'lifeDB',
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

  // ---- 扫描导入本地快递（不走云端，仅本地） ----
  // 用户扫描快递架上取件码标签后，手动确认导入一条 pending 快递到 packageDB。
  // 不调用第三方快递 API，不在云端查件；只保留一条真实本地记录。
  // 入参：{ pickupCode, company, pickupPoint, trackingNo?, sender?, type? }
  addLocalPackage: function (data) {
    if (!data || !data.pickupCode) {
      return { success: false, message: '取件码不能为空' };
    }
    var list = this.getPackages();
    // 同取件码 + 同取件点去重：已存在则提示
    for (var i = 0; i < list.length; i++) {
      if (list[i].pickupCode === data.pickupCode &&
          list[i].pickupPoint === data.pickupPoint &&
          list[i].status === 'pending') {
        return { success: false, message: '该取件码已存在于待取列表中', pkg: list[i] };
      }
    }
    var now = Date.now();
    var pkg = {
      id: 'LP' + now,                            // LP = Local Pkg 标识
      company: data.company || '其他快递',
      shortName: data.shortName || (data.company || '其他').slice(0, 2),
      logoColor: data.logoColor || '#64748B',
      trackingNo: data.trackingNo || '本地导入·' + data.pickupCode,
      sender: data.sender || '扫描导入',
      pickupPoint: data.pickupPoint || '校园驿站',
      pickupCode: data.pickupCode,
      status: 'pending',
      type: data.type || 'station',
      arrivesAt: this.formatNow(),
      expiresIn: '72 小时',
      estimatedTime: '已到站',
      source: 'local-scan',                       // 标记来源：本地扫码导入
      createdAt: now,
    };
    list.unshift(pkg);
    this._write(this.KEYS.packages, list);
    // 同步在消息中心加一条导入通知
    var messages = this.getMessages();
    messages.unshift({
      id: 'M' + now,
      type: 'pickup',
      title: '已导入本地快递',
      content: '已从快递架扫码导入【' + pkg.company + '】取件码 ' + pkg.pickupCode + '，可在「快递」列表查看。',
      time: '刚刚',
      read: false,
      icon: 'box',
      color: '#2563EB',
    });
    this._write(this.KEYS.messages, messages);
    return { success: true, pkg: pkg };
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
      campus: '涵江校区 · 兰苑 3号楼', campusId: 'hanjiang',
      dorm: { campusId: 'hanjiang', areaId: 'lanyuan', areaName: '兰苑', building: '3号楼', room: '215室' },
      boundPhone: true, avatar: null, pickedCount: 0,
    });
  },

  saveUser: function (user) {
    this._write(this.KEYS.user, user);
  },

  // =========================================================
  // 宿舍与浴室（数据来自 campus-data.js 的 CAMPUS_DATA）
  // =========================================================

  // 读取校园建筑/浴室配置（campus-data.js 在 storage.js 之前引入）
  _campusData: null,
  getCampusData: function () {
    if (this._campusData) return this._campusData;
    if (typeof CAMPUS_DATA !== 'undefined') this._campusData = CAMPUS_DATA;
    else this._campusData = { campuses: [], bathrooms: [] };
    return this._campusData;
  },

  // 获取所有校区（含苑区/楼栋结构）
  getCampusAreas: function () {
    return this.getCampusData().campuses || [];
  },

  // 获取指定校区的苑区列表
  getAreasByCampus: function (campusId) {
    var campuses = this.getCampusAreas();
    for (var i = 0; i < campuses.length; i++) {
      if (campuses[i].id === campusId) return campuses[i].areas || [];
    }
    return [];
  },

  // 获取指定苑区的楼栋列表
  getBuildingsByArea: function (campusId, areaId) {
    var areas = this.getAreasByCampus(campusId);
    for (var i = 0; i < areas.length; i++) {
      if (areas[i].id === areaId) return areas[i].buildings || [];
    }
    return [];
  },

  // 获取用户结构化宿舍信息（新格式 user.dorm）
  // 向后兼容：无 dorm 时尝试从旧 campus+dormitory 字段解析
  getUserDorm: function () {
    var user = this.getUser();
    if (user.dorm && user.dorm.areaId) return user.dorm;
    // 旧格式兼容：campus 形如 "涵江校区 · 兰苑 3号楼"，dormitory 形如 "兰苑 3号楼"
    if (user.dormitory) {
      var campusName = (user.campus || '').split(' · ')[0] || '';
      var parts = user.dormitory.match(/^(\S+苑|\S+园)\s*(.+)$/);
      if (parts) {
        var areaName = parts[1];
        var building = parts[2];
        var campusId = user.campusId || 'hanjiang';
        // 尝试匹配 areaId
        var areas = this.getAreasByCampus(campusId);
        var areaId = '';
        for (var i = 0; i < areas.length; i++) {
          if (areas[i].name === areaName) { areaId = areas[i].id; break; }
        }
        return { campusId: campusId, areaId: areaId, areaName: areaName, building: building, room: '' };
      }
    }
    return null;
  },

  // 保存用户宿舍信息（结构化）
  saveUserDorm: function (dorm) {
    var user = this.getUser();
    user.dorm = dorm;
    // 同步旧字段兼容
    if (dorm) {
      var campusName = '';
      var campuses = this.getCampusAreas();
      for (var i = 0; i < campuses.length; i++) {
        if (campuses[i].id === dorm.campusId) { campusName = campuses[i].name; break; }
      }
      user.dormitory = dorm.areaName + ' ' + dorm.building;
      user.campus = campusName + ' · ' + user.dormitory;
      user.campusId = dorm.campusId;
    }
    this.saveUser(user);
    return user;
  },

  // 获取所有浴室列表
  getBathrooms: function () {
    return this.getCampusData().bathrooms || [];
  },

  // 按 ID 获取浴室
  getBathroomById: function (id) {
    var list = this.getBathrooms();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  },

  // 根据用户宿舍获取最近浴室（优先同楼栋 → 同苑区）
  getMyBathroom: function () {
    var dorm = this.getUserDorm();
    if (!dorm) return null;
    var list = this.getBathrooms();
    // 精确匹配：同校区+同苑区+同楼栋
    for (var i = 0; i < list.length; i++) {
      if (list[i].campusId === dorm.campusId &&
          list[i].areaId === dorm.areaId &&
          list[i].building === dorm.building) return list[i];
    }
    // 次选：同校区+同苑区
    for (var i = 0; i < list.length; i++) {
      if (list[i].campusId === dorm.campusId &&
          list[i].areaId === dorm.areaId) return list[i];
    }
    return null;
  },

  // 收藏/取消收藏浴室
  toggleFavoriteBathroom: function (bathroomId) {
    var user = this.getUser();
    var favs = user.favoriteBathrooms || [];
    var idx = favs.indexOf(bathroomId);
    if (idx !== -1) favs.splice(idx, 1);
    else favs.push(bathroomId);
    user.favoriteBathrooms = favs;
    this.saveUser(user);
    return favs.indexOf(bathroomId) !== -1;
  },

  // 设为常用浴室
  setDefaultBathroom: function (bathroomId) {
    var user = this.getUser();
    user.defaultBathroomId = bathroomId;
    this.saveUser(user);
  },

  getDefaultBathroom: function () {
    var user = this.getUser();
    if (user.defaultBathroomId) {
      var b = this.getBathroomById(user.defaultBathroomId);
      if (b) return b;
    }
    return this.getMyBathroom();
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
    var dorm = this.getUserDorm();
    var text;
    if (dorm) {
      text = dorm.areaName + ' ' + dorm.building + (dorm.room ? ' ' + dorm.room : '');
    } else {
      // 旧格式兼容
      var oldDorm = user.dormitory || '';
      var oldCampus = user.campus || '';
      text = (oldCampus ? oldCampus + ' ' : '') + (oldDorm || '宿舍区');
    }
    return {
      name: user.name || '同学',
      phone: user.phone || '138****8888',
      text: text,
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
    // 切换校区时，如果用户已设结构化宿舍，同步 campus 字段
    var campuses = this.getCampusAreas();
    for (var i = 0; i < campuses.length; i++) {
      if (campuses[i].id === campusId) {
        var dormText = '';
        if (user.dorm && user.dorm.areaName) {
          dormText = user.dorm.areaName + ' ' + user.dorm.building;
        } else {
          dormText = user.dormitory || '';
        }
        user.campus = campuses[i].name + (dormText ? ' · ' + dormText : '');
        // 切换校区后，旧宿舍信息不再适用
        if (user.dorm && user.dorm.campusId !== campusId) {
          user.dorm = null;
          user.dormitory = '';
        }
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
    this._remove(this.KEYS.life);
    this.init();
  },

  // ---- 工具：按现有数据格式输出 "MM-DD HH:mm" ----
  formatNow: function () {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  // =========================================================
  // 校园生活模块（攒钱 / 课表 / 论坛 / 实习）—— 全部本地 localStorage
  // =========================================================
  _lifeSeed: function () {
    var now = Date.now();
    return {
      savings: {
        goals: [
          { id: 'G1', name: '换一台新电脑', target: 6000, saved: 2350, color: '#0A6EFF', createdAt: now },
          { id: 'G2', name: '寒假旅行基金', target: 3000, saved: 900, color: '#FF9F0A', createdAt: now },
        ],
        ledger: [
          { id: 'L1', type: 'income', amount: 1800, category: '兼职工资', note: '图书馆助理 9 月', time: '09-15 18:00', createdAt: now - 86400000 * 3 },
          { id: 'L2', type: 'expense', amount: 32.5, category: '餐饮', note: '奶茶+晚餐', time: '09-16 12:20', createdAt: now - 86400000 * 2 },
          { id: 'L3', type: 'income', amount: 200, category: '其他收入', note: '二手教材', time: '09-17 20:05', createdAt: now - 86400000 },
        ],
      },
      schedule: [],
      forum: {
        posts: [
          { id: 'F1', board: 'lost', title: '兰苑 3 号楼门口捡到一张校园卡', content: '卡套是蓝色的，里面有一张食堂卡，已放宿管阿姨处，失主请联系。', author: '热心同学', likes: 24, liked: false, comments: [{ author: '宿管', text: '已登记，谢谢！' }], createdAt: now - 3600000 * 2 },
          { id: 'F2', board: 'market', title: '出九成新自行车，180 可小刀', content: '毕业出车，变速正常，锁和车筐都有，菊苑看车。', author: '即将毕业', likes: 11, liked: false, comments: [], createdAt: now - 3600000 * 6 },
          { id: 'F3', board: 'study', title: '高数期末复习资料分享（电子版）', content: '整理了近三年真题和重点公式，评论区留邮箱我发你，也可以直接私信。', author: '卷卷不吃葱', likes: 58, liked: false, comments: [{ author: '小明', text: '求一份！' }], createdAt: now - 3600000 * 20 },
          { id: 'F4', board: 'jobs', title: '校门口奶茶店招周末兼职', content: '18 元/小时，周末两天均可排班，有意向的同学留言联系方式。', author: '甜茶店长', likes: 7, liked: false, comments: [], createdAt: now - 3600000 * 30 },
          { id: 'F5', board: 'talk', title: '三食堂今天的糖醋排骨也太好吃了吧', content: '强烈安利，去晚了真的没位置……', author: '干饭第一名', likes: 36, liked: false, comments: [], createdAt: now - 3600000 * 50 },
        ],
      },
      jobs: {
        applied: [],
        resumes: [],
      },
    };
  },

  _life: function () {
    var data = this._read(this.KEYS.life, null);
    if (!data) {
      data = this._lifeSeed();
      this._write(this.KEYS.life, data);
    }
    return data;
  },

  _saveLife: function (data) {
    this._write(this.KEYS.life, data);
  },

  // ---- 攒钱 / 工资 ----
  lifeGetSavings: function () {
    return this._life().savings;
  },

  lifeAddLedger: function (entry) {
    if (!entry || !(entry.amount > 0)) return { success: false, message: '金额无效' };
    var data = this._life();
    var item = {
      id: 'L' + Date.now(),
      type: entry.type === 'income' ? 'income' : 'expense',
      amount: Math.round(entry.amount * 100) / 100,
      category: entry.category || (entry.type === 'income' ? '其他收入' : '其他支出'),
      note: entry.note || '',
      time: this.formatNow(),
      createdAt: Date.now(),
    };
    data.savings.ledger.unshift(item);
    this._saveLife(data);
    return { success: true, item: item };
  },

  lifeAddGoal: function (goal) {
    if (!goal || !goal.name || !(goal.target > 0)) return { success: false, message: '目标名称和金额不完整' };
    var data = this._life();
    var g = {
      id: 'G' + Date.now(),
      name: goal.name,
      target: Math.round(goal.target * 100) / 100,
      saved: 0,
      color: goal.color || '#0A6EFF',
      createdAt: Date.now(),
    };
    data.savings.goals.push(g);
    this._saveLife(data);
    return { success: true, goal: g };
  },

  lifeContributeGoal: function (goalId, amount) {
    if (!(amount > 0)) return { success: false, message: '存入金额无效' };
    var data = this._life();
    for (var i = 0; i < data.savings.goals.length; i++) {
      if (data.savings.goals[i].id === goalId) {
        data.savings.goals[i].saved = Math.min(
          data.savings.goals[i].target,
          Math.round((data.savings.goals[i].saved + amount) * 100) / 100
        );
        this._saveLife(data);
        return { success: true, goal: data.savings.goals[i] };
      }
    }
    return { success: false, message: '目标不存在' };
  },

  // ---- 课程表 ----
  lifeGetCourses: function () {
    return this._life().schedule || [];
  },

  lifeSaveCourses: function (list) {
    var data = this._life();
    data.schedule = list || [];
    this._saveLife(data);
    return { success: true, count: data.schedule.length };
  },

  lifeAddCourse: function (course) {
    if (!course || !course.name || !course.weekday || !(course.start >= 1)) {
      return { success: false, message: '课程信息不完整' };
    }
    var data = this._life();
    data.schedule.push({
      id: 'C' + Date.now(),
      name: course.name,
      teacher: course.teacher || '',
      position: course.position || '',
      weekday: parseInt(course.weekday, 10) || 1,
      start: parseInt(course.start, 10) || 1,
      end: parseInt(course.end, 10) || course.start || 1,
      weeks: course.weeks || '1-16周',
      color: course.color || '#0A6EFF',
    });
    this._saveLife(data);
    return { success: true };
  },

  // ---- 校园论坛 ----
  lifeGetPosts: function () {
    return this._life().forum.posts;
  },

  lifeAddPost: function (post) {
    if (!post || !post.title || !post.content) return { success: false, message: '标题和内容不能为空' };
    var data = this._life();
    var item = {
      id: 'F' + Date.now(),
      board: post.board || 'talk',
      title: post.title,
      content: post.content,
      author: post.author || '我',
      likes: 0,
      liked: false,
      comments: [],
      createdAt: Date.now(),
      mine: true,
    };
    data.forum.posts.unshift(item);
    this._saveLife(data);
    return { success: true, post: item };
  },

  lifeLikePost: function (id) {
    var data = this._life();
    for (var i = 0; i < data.forum.posts.length; i++) {
      if (data.forum.posts[i].id === id) {
        data.forum.posts[i].liked = !data.forum.posts[i].liked;
        data.forum.posts[i].likes += data.forum.posts[i].liked ? 1 : -1;
        this._saveLife(data);
        return { success: true, liked: data.forum.posts[i].liked, likes: data.forum.posts[i].likes };
      }
    }
    return { success: false };
  },

  lifeAddComment: function (id, text) {
    if (!text) return { success: false, message: '评论内容为空' };
    var data = this._life();
    for (var i = 0; i < data.forum.posts.length; i++) {
      if (data.forum.posts[i].id === id) {
        var c = { author: '我', text: text, time: this.formatNow() };
        data.forum.posts[i].comments.push(c);
        this._saveLife(data);
        return { success: true, comment: c };
      }
    }
    return { success: false };
  },

  // ---- 实习工作 ----
  lifeGetJobsState: function () {
    return this._life().jobs;
  },

  lifeApplyJob: function (jobId) {
    var data = this._life();
    if (data.jobs.applied.indexOf(jobId) !== -1) return { success: false, message: '已经投递过了' };
    data.jobs.applied.push(jobId);
    this._saveLife(data);
    return { success: true };
  },

  lifeAddResume: function (resume) {
    if (!resume || !resume.name || !resume.intent) return { success: false, message: '姓名和意向岗位不能为空' };
    var data = this._life();
    var item = {
      id: 'R' + Date.now(),
      name: resume.name,
      intent: resume.intent,
      contact: resume.contact || '',
      note: resume.note || '',
      time: this.formatNow(),
    };
    data.jobs.resumes.unshift(item);
    this._saveLife(data);
    return { success: true, item: item };
  },
};

// 页面引入本文件后立即完成初始化（需在 mock.js 之后引入）
Storage.init();
