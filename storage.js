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
    guide: 'guideDB',
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
    var manual = data.source === 'manual';
    var pkg = {
      id: (manual ? 'MP' : 'LP') + now,                      // MP = Manual Pkg / LP = Local scan Pkg
      company: data.company || '其他快递',
      shortName: data.shortName || (data.company || '其他').slice(0, 2),
      logoColor: data.logoColor || '#64748B',
      trackingNo: data.trackingNo || ('手动导入·' + data.pickupCode),
      sender: data.sender || (manual ? '手动导入' : '扫描导入'),
      pickupPoint: data.pickupPoint || '校园驿站',
      pickupCode: data.pickupCode,
      status: 'pending',
      type: data.type || 'station',
      arrivesAt: this.formatNow(),
      expiresIn: data.expiresIn || '72 小时',
      estimatedTime: data.estimatedTime || '已到站',
      source: manual ? 'manual-input' : 'local-scan',        // 标记来源：手动录入 / 本地扫码导入
      createdAt: now,
    };
    list.unshift(pkg);
    this._write(this.KEYS.packages, list);
    // 同步在消息中心加一条导入通知
    var messages = this.getMessages();
    messages.unshift({
      id: 'M' + now,
      type: 'pickup',
      title: manual ? '已手动添加快递' : '已导入本地快递',
      content: (manual ? '已手动添加【' : '已从快递架扫码导入【') + pkg.company + '】取件码 ' + pkg.pickupCode + '，可在「快递」列表查看。',
      time: '刚刚',
      read: false,
      icon: 'box',
      color: '#2563EB',
    });
    this._write(this.KEYS.messages, messages);
    return { success: true, pkg: pkg };
  },

  // ---- 全部快递数据清零 ----
  // 清空 packages 列表 + 取件记录 + 快递类消息（pickup/warning），并把用户取件统计归零。
  // 写入空数组（而非 remove）：种子只在 key === null 时播种，[] 不会导致 demo 数据复活，
  // 清零后列表只保留用户之后手动导入的记录。
  clearAllPackages: function () {
    var before = {
      packages: this.getPackages().length,
      records: this.getRecords().length,
    };
    this._write(this.KEYS.packages, []);
    this._write(this.KEYS.records, []);
    // 快递类消息（取件提醒/逾期/取件成功）全部移除，系统类通知保留
    var keptMessages = this.getMessages().filter(function (m) {
      return m.type !== 'pickup' && m.type !== 'warning';
    });
    this._write(this.KEYS.messages, keptMessages);
    // 用户累计取件数归零（个人中心统计）
    var user = this.getUser();
    user.pickedCount = 0;
    this.saveUser(user);
    return { success: true, cleared: before.packages + before.records };
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
      var parts = user.dormitory.match(/^(\S+苑|\S+园|\S+宿舍)\s*(.+)$/);
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

  // 获取所有浴室列表（merge 用户手动修改的本地覆盖：名称/楼层/营业时间）
  getBathrooms: function () {
    var overrides = this._life().bathOverrides || {};
    return (this.getCampusData().bathrooms || []).map(function (b) {
      var ov = overrides[b.id];
      return ov ? Object.assign({}, b, ov) : b;
    });
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

  // 浴室手动改名 / 改楼层 / 改营业时间（本地覆盖，不动 campus-data.js 种子）
  // patch: { name?, floor?, hours? }，传 null 可清除该浴室的全部覆盖
  bathSaveOverride: function (bathroomId, patch) {
    if (!bathroomId) return { success: false, message: '缺少浴室 ID' };
    var data = this._life();
    if (!data.bathOverrides) data.bathOverrides = {};
    if (patch === null) {
      delete data.bathOverrides[bathroomId];
    } else {
      var cur = data.bathOverrides[bathroomId] || {};
      ['name', 'floor', 'hours'].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
          var v = String(patch[k] == null ? '' : patch[k]).trim();
          if (v) cur[k] = v.slice(0, 20);
        }
      });
      data.bathOverrides[bathroomId] = cur;
    }
    this._saveLife(data);
    return { success: true };
  },

  bathGetOverride: function (bathroomId) {
    var ov = (this._life().bathOverrides || {})[bathroomId];
    return ov || null;
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

  // ---- 浴室 · 洗澡记录（手动快速录入，全本地） ----
  bathGetShowers: function () {
    return this._life().bath.showers;
  },

  bathAddShower: function (note) {
    var data = this._life();
    var item = {
      id: 'S' + Date.now(),
      ts: Date.now(),
      note: note ? String(note).slice(0, 30) : '',
    };
    data.bath.showers.unshift(item);
    this._saveLife(data);
    return { success: true, item: item };
  },

  bathRemoveShower: function (id) {
    var data = this._life();
    var kept = [];
    for (var i = 0; i < data.bath.showers.length; i++) {
      if (data.bath.showers[i].id !== id) kept.push(data.bath.showers[i]);
    }
    data.bath.showers = kept;
    this._saveLife(data);
    return { success: true };
  },

  // ---- 节日倒计时 · DIY 自定义节日（月/日，按年循环） ----
  festGetCustom: function () {
    return this._life().festivals;
  },

  // opts: { bg?: 压缩后 dataURL 背景图, layout?: 'wide'|'compact', note?: 寄语 }
  festAddCustom: function (name, month, day, opts) {
    var m = parseInt(month, 10), d = parseInt(day, 10);
    if (!name || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) {
      return { success: false, message: '名称或日期无效' };
    }
    opts = opts || {};
    var data = this._life();
    var item = {
      id: 'V' + Date.now(),
      name: String(name).slice(0, 12),
      m: m,
      d: d,
      custom: true,
      bg: opts.bg || null,
      layout: opts.layout === 'compact' ? 'compact' : 'wide',
      note: opts.note ? String(opts.note).slice(0, 40) : '',
      createdAt: Date.now(),
    };
    data.festivals.unshift(item);
    this._saveLife(data);
    return { success: true, item: item };
  },

  // 更新自定义卡片（名称 / 日期 / 背景图 / 布局 / 寄语）
  festUpdateCustom: function (id, patch) {
    patch = patch || {};
    var data = this._life();
    for (var i = 0; i < data.festivals.length; i++) {
      if (data.festivals[i].id === id) {
        if (patch.name) data.festivals[i].name = String(patch.name).slice(0, 12);
        if (patch.m >= 1 && patch.m <= 12) data.festivals[i].m = parseInt(patch.m, 10);
        if (patch.d >= 1 && patch.d <= 31) data.festivals[i].d = parseInt(patch.d, 10);
        if (Object.prototype.hasOwnProperty.call(patch, 'bg')) data.festivals[i].bg = patch.bg || null;
        if (patch.layout) data.festivals[i].layout = patch.layout === 'compact' ? 'compact' : 'wide';
        if (Object.prototype.hasOwnProperty.call(patch, 'note')) data.festivals[i].note = String(patch.note || '').slice(0, 40);
        this._saveLife(data);
        return { success: true, item: data.festivals[i] };
      }
    }
    return { success: false, message: '未找到该节日' };
  },

  festRemoveCustom: function (id) {
    var data = this._life();
    var kept = [];
    for (var i = 0; i < data.festivals.length; i++) {
      if (data.festivals[i].id !== id) kept.push(data.festivals[i]);
    }
    data.festivals = kept;
    this._saveLife(data);
    return { success: true };
  },

  // ---- 秒表：数字段 DIY 配色（8 段：时时分分秒秒厘厘）----
  swGetColors: function () {
    var c = this._life().stopwatch.colors;
    return Array.isArray(c) && c.length === 8 ? c : ['#2563EB', '#2563EB', '#2563EB', '#2563EB', '#2563EB', '#2563EB', '#94A3B8', '#94A3B8'];
  },
  swSaveColors: function (arr) {
    if (!Array.isArray(arr) || arr.length !== 8) return { success: false, message: '配色段数量不正确' };
    var data = this._life();
    data.stopwatch.colors = arr.map(function (c) { return /^#[0-9A-Fa-f]{6}$/.test(c) ? c : '#2563EB'; });
    this._saveLife(data);
    return { success: true };
  },

  // ---- 备忘录 ----
  notesGetAll: function () {
    return this._life().notes.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  },
  notesAdd: function (note) {
    var title = String((note && note.title) || '').trim().slice(0, 30);
    var content = String((note && note.content) || '').trim();
    if (!title && !content) return { success: false, message: '内容为空' };
    var data = this._life();
    var now = Date.now();
    var item = {
      id: 'N' + now + '_' + Math.random().toString(36).slice(2, 7),
      title: title || content.slice(0, 12),
      content: content.slice(0, 5000),
      createdAt: now,
      updatedAt: now,
    };
    data.notes.unshift(item);
    this._saveLife(data);
    return { success: true, item: item };
  },
  notesUpdate: function (id, patch) {
    patch = patch || {};
    var data = this._life();
    for (var i = 0; i < data.notes.length; i++) {
      if (data.notes[i].id === id) {
        if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
          data.notes[i].title = String(patch.title || '').trim().slice(0, 30) || data.notes[i].content.slice(0, 12);
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
          data.notes[i].content = String(patch.content || '').slice(0, 5000);
        }
        data.notes[i].updatedAt = Date.now();
        this._saveLife(data);
        return { success: true, item: data.notes[i] };
      }
    }
    return { success: false, message: '备忘录不存在' };
  },
  notesRemove: function (id) {
    var data = this._life();
    data.notes = data.notes.filter(function (n) { return n.id !== id; });
    this._saveLife(data);
    return { success: true };
  },

  // ---- 健身：周计划（1-7）+ 增肌/减脂目标 + 自定义饮食 ----
  fitGet: function () {
    return this._life().fitness;
  },
  fitAddItem: function (day, item) {
    day = parseInt(day, 10);
    if (!(day >= 1 && day <= 7)) return { success: false, message: '星期无效' };
    var name = String((item && item.name) || '').trim().slice(0, 12);
    if (!name) return { success: false, message: '动作名称为空' };
    var data = this._life();
    var row = {
      id: 'F' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: name,
      detail: String((item && item.detail) || '').trim().slice(0, 20),
    };
    data.fitness.plan[day].push(row);
    this._saveLife(data);
    return { success: true, item: row };
  },
  fitRemoveItem: function (day, id) {
    day = parseInt(day, 10);
    if (!(day >= 1 && day <= 7)) return { success: false };
    var data = this._life();
    data.fitness.plan[day] = data.fitness.plan[day].filter(function (x) { return x.id !== id; });
    this._saveLife(data);
    return { success: true };
  },
  fitSetGoal: function (goal) {
    if (goal !== 'gain' && goal !== 'cut') return { success: false, message: '目标无效' };
    var data = this._life();
    data.fitness.dietGoal = goal;
    this._saveLife(data);
    return { success: true };
  },
  fitSetFocus: function (day, idx) {
    day = parseInt(day, 10);
    idx = parseInt(idx, 10);
    if (!(day >= 1 && day <= 7)) return { success: false, message: '星期无效' };
    if (!(idx >= 0 && idx <= 6)) return { success: false, message: '部位无效' };
    var data = this._life();
    data.fitness.focusMap[day] = idx;
    this._saveLife(data);
    return { success: true };
  },
  fitAddCustomFood: function (food) {
    var name = String((food && food.name) || '').trim().slice(0, 12);
    if (!name) return { success: false, message: '食物名称为空' };
    var data = this._life();
    var item = {
      id: 'FD' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      name: name,
      kcal: String((food && food.kcal) || '').slice(0, 10),
      goal: food.goal === 'cut' ? 'cut' : 'gain',
    };
    data.fitness.customFoods.push(item);
    this._saveLife(data);
    return { success: true, item: item };
  },
  fitRemoveCustomFood: function (id) {
    var data = this._life();
    data.fitness.customFoods = data.fitness.customFoods.filter(function (x) { return x.id !== id; });
    this._saveLife(data);
    return { success: true };
  },
  // Markdown 一键导入：payload.plan={day:[{name,detail}]}（整组替换对应星期）；
  // payload.foods=[{name,kcal,goal}]（同名同目标去重后追加）；payload.goal/payload.focusMap 可选
  fitImport: function (payload) {
    payload = payload || {};
    var data = this._life();
    var plan = payload.plan || {};
    var days = 0, items = 0;
    Object.keys(plan).forEach(function (k) {
      var day = parseInt(k, 10);
      if (!(day >= 1 && day <= 7) || !Array.isArray(plan[k])) return;
      var rows = [], seen = {};
      plan[k].forEach(function (it) {
        var name = String((it && it.name) || '').trim().slice(0, 12);
        if (!name || seen[name]) return;
        seen[name] = 1;
        rows.push({
          id: 'F' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: name,
          detail: String((it && it.detail) || '').trim().slice(0, 20),
        });
      });
      data.fitness.plan[day] = rows;
      days++;
      items += rows.length;
    });
    var foodsAdded = 0;
    (payload.foods || []).forEach(function (f) {
      var name = String((f && f.name) || '').trim().slice(0, 12);
      if (!name) return;
      var goal = f.goal === 'cut' ? 'cut' : 'gain';
      var dup = data.fitness.customFoods.some(function (x) { return x.name === name && x.goal === goal; });
      if (dup) return;
      data.fitness.customFoods.push({
        id: 'FD' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        name: name,
        kcal: String((f && f.kcal) || '').slice(0, 10),
        goal: goal,
      });
      foodsAdded++;
    });
    if (payload.goal === 'gain' || payload.goal === 'cut') data.fitness.dietGoal = payload.goal;
    if (payload.focusMap && typeof payload.focusMap === 'object') {
      Object.keys(payload.focusMap).forEach(function (k) {
        var day = parseInt(k, 10), idx = parseInt(payload.focusMap[k], 10);
        if (day >= 1 && day <= 7 && idx >= 0 && idx <= 6) data.fitness.focusMap[day] = idx;
      });
    }
    this._saveLife(data);
    return { success: true, days: days, items: items, foods: foodsAdded };
  },

  // ---- 上课摸鱼：录音整理记录（仅文本入库，音频不落盘）----
  lazyGetRecordings: function () {
    return this._life().lazy.recordings.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
  },
  lazyAddRecording: function (rec) {
    rec = rec || {};
    var transcript = String(rec.transcript || '').trim();
    var summary = String(rec.summary || '').trim();
    if (!transcript && !summary) return { success: false, message: '内容为空' };
    var data = this._life();
    var now = Date.now();
    var item = {
      id: 'LZ' + now + '_' + Math.random().toString(36).slice(2, 7),
      title: String(rec.title || '').trim().slice(0, 30) || ('课堂记录 ' + this.formatNow()),
      transcript: transcript.slice(0, 20000),
      summary: summary.slice(0, 20000),
      duration: Math.max(0, parseInt(rec.duration, 10) || 0),
      createdAt: now,
      time: this.formatNow(),
    };
    data.lazy.recordings.unshift(item);
    this._saveLife(data);
    return { success: true, item: item };
  },
  lazyRemoveRecording: function (id) {
    var data = this._life();
    data.lazy.recordings = data.lazy.recordings.filter(function (x) { return x.id !== id; });
    this._saveLife(data);
    return { success: true };
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
        { id: 'xianyou',  name: '仙游校区', desc: '分校区 · 男生宿舍/女生宿舍' },
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
    this._remove(this.KEYS.guide);
    this.init();
  },

  // =========================================================
  // 用户数字 ID（唯一身份标识，生成后持久化，用于甄别数据归属）
  // =========================================================
  getUserId: function () {
    var user = this.getUser();
    if (user.numericId && /^\d{8}$/.test(String(user.numericId))) return String(user.numericId);
    var id = '';
    // 8 位数字，首位非 0
    id = String(Math.floor(Math.random() * 9) + 1);
    for (var i = 0; i < 7; i++) id += String(Math.floor(Math.random() * 10));
    user.numericId = id;
    this.saveUser(user);
    return id;
  },

  // =========================================================
  // 取件身份码（纯本地）
  // 未手动导入时，用唯一数字 ID 作为系统生成的身份码；
  // 用户本地导入后优先展示导入码，可随时清除恢复系统码。
  // =========================================================
  getIdentityCode: function () {
    var user = this.getUser();
    if (user.identityCode && user.identityCode.code) {
      return {
        code: String(user.identityCode.code),
        source: 'imported',
        importedAt: user.identityCode.importedAt || null,
      };
    }
    return { code: this.getUserId(), source: 'system', importedAt: null };
  },

  saveIdentityCode: function (code) {
    code = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9-]{4,24}$/.test(code)) {
      return { success: false, message: '身份码格式不正确（4-24 位字母/数字/短横线）' };
    }
    var user = this.getUser();
    user.identityCode = { code: code, importedAt: Date.now() };
    this.saveUser(user);
    return { success: true, code: code };
  },

  clearIdentityCode: function () {
    var user = this.getUser();
    if (user.identityCode) {
      delete user.identityCode;
      this.saveUser(user);
    }
    return { success: true };
  },

  // =========================================================
  // 个人空间 · 相册（图片以压缩后 dataURL 存储，可发布到自己的帖子）
  // =========================================================
  lifeGetAlbum: function () {
    return this._life().album || [];
  },

  lifeAddPhotos: function (dataUrls) {
    if (!dataUrls || !dataUrls.length) return { success: false, message: '没有可保存的照片' };
    var data = this._life();
    var MAX = 30;
    var added = 0;
    for (var i = 0; i < dataUrls.length; i++) {
      if (data.album.length >= MAX) break;
      data.album.unshift({
        id: 'P' + Date.now() + '_' + i,
        src: dataUrls[i],
        createdAt: Date.now(),
      });
      added++;
    }
    this._saveLife(data);
    return { success: added > 0, added: added, full: data.album.length >= MAX };
  },

  lifeRemovePhoto: function (photoId) {
    var data = this._life();
    var kept = [];
    for (var i = 0; i < data.album.length; i++) {
      if (data.album[i].id !== photoId) kept.push(data.album[i]);
    }
    data.album = kept;
    this._saveLife(data);
    return { success: true };
  },

  // =========================================================
  // 指引模式（每个功能首次进入显示一次轻量引导，之后不再打扰）
  // =========================================================
  isGuideShown: function (key) {
    var map = this._read(this.KEYS.guide, {});
    return !!map[key];
  },

  markGuideShown: function (key) {
    var map = this._read(this.KEYS.guide, {});
    map[key] = Date.now();
    this._write(this.KEYS.guide, map);
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
    // 约定：校园生活各功能初始均为 0 记录（无预填数据），由用户自己产生数据
    return {
      savings: {
        goals: [],
        ledger: [],
      },
      schedule: [],
      forum: {
        posts: [],
      },
      jobs: {
        applied: [],
        resumes: [],
        applications: [],
      },
      album: [],
      bath: { showers: [] },
      bathOverrides: {}, // 浴室信息手动修改覆盖（id → {name/floor/hours}）
      festivals: [],
      notes: [],
      stopwatch: { colors: [] }, // 数字段 DIY 配色
      fitness: {
        plan: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
        dietGoal: 'gain', // gain 增肌 | cut 减脂
        customFoods: [],
        focusMap: {}, // 每日训练部位自定义（{1: 索引}，缺省 day-1）
      },
      lazy: { recordings: [] }, // 上课摸鱼：录音转写整理记录（音频不入库，仅存文本）
      aiChat: [], // AI 校园助手本地会话记录
    };
  },

  _life: function () {
    var data = this._read(this.KEYS.life, null);
    if (!data) {
      data = this._lifeSeed();
      this._write(this.KEYS.life, data);
    }
    // 旧版本 lifeDB 补齐新字段（沿用空记录约定，不预填数据）
    if (!data.jobs) data.jobs = { applied: [], resumes: [], applications: [] };
    if (!data.jobs.applications) data.jobs.applications = [];
    if (!data.album) data.album = [];
    if (!data.bath) data.bath = { showers: [] };
    if (!data.bath.showers) data.bath.showers = [];
    if (!data.bathOverrides) data.bathOverrides = {};
    if (!data.festivals) data.festivals = [];
    if (!data.notes) data.notes = [];
    if (!data.stopwatch) data.stopwatch = { colors: [] };
    if (!data.fitness) {
      data.fitness = { plan: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }, dietGoal: 'gain', customFoods: [] };
    } else {
      var fp = data.fitness.plan || {};
      var freshPlan = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
      Object.keys(freshPlan).forEach(function (d) { freshPlan[d] = Array.isArray(fp[d]) ? fp[d] : []; });
      data.fitness.plan = freshPlan;
      if (!data.fitness.dietGoal) data.fitness.dietGoal = 'gain';
      if (!Array.isArray(data.fitness.customFoods)) data.fitness.customFoods = [];
      if (!data.fitness.focusMap || typeof data.fitness.focusMap !== 'object') data.fitness.focusMap = {};
    }
    if (!data.lazy) data.lazy = { recordings: [] };
    if (!Array.isArray(data.lazy.recordings)) data.lazy.recordings = [];
    if (!Array.isArray(data.aiChat)) data.aiChat = [];
    return data;
  },

  _saveLife: function (data) {
    this._write(this.KEYS.life, data);
  },

  // ---- AI 校园助手（本地规则引擎，会话仅存本机） ----
  aiGetChat: function () {
    return this._life().aiChat || [];
  },

  aiAddChat: function (msg) {
    if (!msg || !msg.role || !msg.text) return;
    var data = this._life();
    data.aiChat.push({
      role: msg.role === 'user' ? 'user' : 'ai',
      text: String(msg.text).slice(0, 1200),
      actions: Array.isArray(msg.actions) ? msg.actions.slice(0, 4) : [],
      ts: Date.now(),
    });
    // 仅保留最近 50 条，避免无限膨胀
    if (data.aiChat.length > 50) data.aiChat = data.aiChat.slice(-50);
    this._saveLife(data);
  },

  aiClearChat: function () {
    var data = this._life();
    data.aiChat = [];
    this._saveLife(data);
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
      icon: goal.icon || '🎯',
      createdAt: Date.now(),
    };
    data.savings.goals.push(g);
    this._saveLife(data);
    return { success: true, goal: g };
  },

  // DIY 更新攒钱卡片（名称/颜色/图标/目标金额）
  lifeUpdateGoal: function (goalId, patch) {
    if (!patch) return { success: false, message: '无更新内容' };
    var data = this._life();
    for (var i = 0; i < data.savings.goals.length; i++) {
      if (data.savings.goals[i].id === goalId) {
        var g = data.savings.goals[i];
        if (patch.name) g.name = String(patch.name).slice(0, 20);
        if (patch.color) g.color = String(patch.color);
        if (patch.icon) g.icon = String(patch.icon);
        if (patch.target > 0) g.target = Math.round(patch.target * 100) / 100;
        if (g.saved > g.target) g.saved = g.target;
        this._saveLife(data);
        return { success: true, goal: g };
      }
    }
    return { success: false, message: '目标不存在' };
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
    // 新课程模型已去除「周次」：读取时顺带清理旧数据残留的 weeks 字段
    var list = this._life().schedule || [];
    var changed = false;
    list.forEach(function (c) {
      if (Object.prototype.hasOwnProperty.call(c, 'weeks')) { delete c.weeks; changed = true; }
    });
    if (changed) {
      var data = this._life();
      data.schedule = list;
      this._saveLife(data);
    }
    return list;
  },

  lifeSaveCourses: function (list) {
    var data = this._life();
    // 统一去除周次字段，保证「按真实日期星期匹配」
    data.schedule = (list || []).map(function (c) {
      return {
        id: c.id || ('C' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
        name: c.name,
        teacher: c.teacher || '',
        position: c.position || '',
        weekday: parseInt(c.weekday, 10) || 1,
        start: parseInt(c.start, 10) || 1,
        end: parseInt(c.end, 10) || c.start || 1,
        color: c.color || '',
        remark: c.remark || '',
      };
    });
    this._saveLife(data);
    return { success: true, count: data.schedule.length };
  },

  lifeAddCourse: function (course) {
    if (!course || !course.name || !course.weekday || !(course.start >= 1)) {
      return { success: false, message: '课程信息不完整' };
    }
    var data = this._life();
    data.schedule.push({
      id: 'C' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: course.name,
      teacher: course.teacher || '',
      position: course.position || '',
      weekday: parseInt(course.weekday, 10) || 1,
      start: parseInt(course.start, 10) || 1,
      end: parseInt(course.end, 10) || course.start || 1,
      color: course.color || '#0A6EFF',
      remark: course.remark || '',
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
    var u = this.getUser() || {};
    var item = {
      id: 'F' + Date.now(),
      board: post.board || 'talk',
      title: post.title,
      content: post.content,
      image: post.image || '',
      author: post.author || u.name || '我',
      authorAvatar: u.avatar || null,
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
        var u = this.getUser() || {};
        var c = { author: u.name || '我', authorAvatar: u.avatar || null, text: text, time: this.formatNow() };
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

  // 投递状态机（贴近真实流程）：submitted 已投递 → viewed 已查看 → interview 面试邀约 → offer 已录用 / rejected 不合适
  // 本地演示按时间轴自动推进（与外卖订单时间轴同款策略）；面试后结果按 jobId 奇偶确定，保证可复现
  APPLICATION_TIMINGS: { viewedMs: 30 * 1000, interviewMs: 120 * 1000, resultMs: 360 * 1000 },
  APPLICATION_STATUS: {
    submitted: '已投递',
    viewed: '已查看',
    interview: '面试邀约',
    offer: '已录用',
    rejected: '不合适',
    withdrawn: '已撤回',
  },

  lifeApplyJob: function (jobId) {
    var data = this._life();
    if (data.jobs.applied.indexOf(jobId) !== -1) return { success: false, message: '已经投递过了' };
    if (!this.lifeGetResume()) return { success: false, message: '请先完成我的简历', needResume: true };
    data.jobs.applied.push(jobId);
    var app = {
      id: 'A' + Date.now(),
      jobId: jobId,
      title: jobId,
      status: 'submitted',
      createdAt: Date.now(),
      timeline: [{ status: 'submitted', time: this.formatNow() }],
    };
    data.jobs.applications.unshift(app);
    this._saveLife(data);
    return { success: true, application: app };
  },

  // 页面调用：带岗位名称投递（优先使用）
  lifeApplyJobMeta: function (jobId, title, company) {
    var data = this._life();
    if (data.jobs.applied.indexOf(jobId) !== -1) return { success: false, message: '已经投递过了' };
    if (!this.lifeGetResume()) return { success: false, message: '请先完成我的简历', needResume: true };
    data.jobs.applied.push(jobId);
    var app = {
      id: 'A' + Date.now(),
      jobId: jobId,
      title: title || jobId,
      company: company || '',
      status: 'submitted',
      createdAt: Date.now(),
      timeline: [{ status: 'submitted', time: this.formatNow() }],
    };
    data.jobs.applications.unshift(app);
    this._saveLife(data);
    return { success: true, application: app };
  },

  lifeGetApplications: function () {
    return this._life().jobs.applications || [];
  },

  // 推进投递状态（页面加载 / 定时调用）
  lifeSyncApplications: function () {
    var data = this._life();
    var T = this.APPLICATION_TIMINGS;
    var now = Date.now();
    var changed = false;
    var apps = data.jobs.applications || [];
    for (var i = 0; i < apps.length; i++) {
      var a = apps[i];
      if (a.status === 'withdrawn') continue;
      var elapsed = now - a.createdAt;
      var next = null;
      if (a.status === 'submitted' && elapsed >= T.viewedMs) next = 'viewed';
      else if (a.status === 'viewed' && elapsed >= T.interviewMs) next = 'interview';
      else if (a.status === 'interview' && elapsed >= T.resultMs) {
        // 面试后结果：jobId 末位数字偶数 → offer，奇数 → rejected（本地可复现演示）
        var tail = String(a.jobId).slice(-1);
        var num = parseInt(tail, 10);
        next = isNaN(num) ? (i % 2 === 0 ? 'offer' : 'rejected') : (num % 2 === 0 ? 'offer' : 'rejected');
      }
      if (next) {
        a.status = next;
        a.timeline.push({ status: next, time: this.formatNow() });
        changed = true;
      }
    }
    if (changed) this._saveLife(data);
    return apps;
  },

  lifeWithdrawApplication: function (appId) {
    var data = this._life();
    var apps = data.jobs.applications || [];
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].id === appId && apps[i].status !== 'withdrawn') {
        apps[i].status = 'withdrawn';
        apps[i].timeline.push({ status: 'withdrawn', time: this.formatNow() });
        // 同步移除 applied 标记，允许再次投递
        var idx = data.jobs.applied.indexOf(apps[i].jobId);
        if (idx !== -1) data.jobs.applied.splice(idx, 1);
        this._saveLife(data);
        return { success: true };
      }
    }
    return { success: false, message: '投递记录不存在' };
  },

  // ---- 完整简历（分步创建：基本信息 → 求职意向 → 教育经历 → 实践经历 → 技能/自评）----
  lifeGetResume: function () {
    return this._life().jobs.resume || null;
  },

  lifeSaveResume: function (resume) {
    if (!resume || !resume.name || !resume.intent) return { success: false, message: '姓名和意向岗位不能为空' };
    var data = this._life();
    data.jobs.resume = {
      name: resume.name,
      gender: resume.gender || '',
      phone: resume.phone || '',
      email: resume.email || '',
      intent: resume.intent,
      city: resume.city || '',
      salary: resume.salary || '',
      school: resume.school || '',
      major: resume.major || '',
      degree: resume.degree || '',
      eduStart: resume.eduStart || '',
      eduEnd: resume.eduEnd || '',
      experience: resume.experience || '',
      skills: resume.skills || '',
      intro: resume.intro || '',
      photo: resume.photo || '',
      completedAt: resume.completedAt || Date.now(),
    };
    this._saveLife(data);
    return { success: true, resume: data.jobs.resume };
  },

  // 求职墙快捷意向（旧入口保留）
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
