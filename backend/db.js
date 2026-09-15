// db.js — JSON 文件存储（零编译依赖，纯 JS 实现）

var fs = require('fs');
var path = require('path');

var DATA_FILE = path.join(__dirname, 'data.json');

// 数据结构
var data = {
  users: [],
  verificationCodes: [],
  packages: [],
  packageTracking: [],
  counters: { user: 1, package: 1, code: 1, tracking: 1 },
};

// 加载已有数据
function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      var raw = fs.readFileSync(DATA_FILE, 'utf-8');
      var parsed = JSON.parse(raw);
      data = Object.assign(data, parsed);
    }
  } catch (e) {
    console.error('[db] 加载数据失败:', e.message);
  }
}

// 保存数据
function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[db] 保存数据失败:', e.message);
  }
}

load();

function nextId(prefix, key) {
  data.counters[key] = (data.counters[key] || 1) + 1;
  return prefix + Date.now() + Math.random().toString(36).slice(2, 5);
}

module.exports = {
  // 用户
  getUserByPhone: function (phone) {
    return data.users.find(function (u) { return u.phone === phone; });
  },
  getUserById: function (id) {
    return data.users.find(function (u) { return u.id === id; });
  },
  createUser: function (phone) {
    var user = {
      id: nextId('U', 'user'),
      phone: phone,
      name: '',
      studentId: '',
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    save();
    return user;
  },
  updateUser: function (id, name, studentId) {
    var u = data.users.find(function (x) { return x.id === id; });
    if (u) {
      u.name = name;
      u.studentId = studentId;
      save();
    }
  },

  // 验证码
  getLatestCode: function (phone) {
    var codes = data.verificationCodes.filter(function (c) { return c.phone === phone; });
    return codes.length ? codes[codes.length - 1] : null;
  },
  saveCode: function (phone, code, expiresAt) {
    data.verificationCodes.push({
      id: data.counters.code++,
      phone: phone,
      code: code,
      expiresAt: expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    });
    save();
  },
  markCodeUsed: function (id) {
    var c = data.verificationCodes.find(function (x) { return x.id === id; });
    if (c) { c.used = true; save(); }
  },

  // 快递
  getPackagesByUser: function (userId) {
    return data.packages.filter(function (p) { return p.userId === userId; });
  },
  getPackageById: function (id) {
    return data.packages.find(function (p) { return p.id === id; });
  },
  getPackageByTrackingNo: function (trackingNo) {
    return data.packages.find(function (p) { return p.trackingNo === trackingNo; });
  },
  upsertPackage: function (pkg) {
    var existing = data.packages.find(function (p) { return p.trackingNo === pkg.trackingNo; });
    if (existing) {
      Object.assign(existing, {
        company: pkg.company,
        companyCode: pkg.companyCode || '',
        sender: pkg.sender,
        status: pkg.status,
        pickupCode: pkg.pickupCode || '',
        pickupPoint: pkg.pickupPoint || '',
        pickupAddress: pkg.pickupAddress || '',
        arrivedAt: pkg.arrivedAt || '',
        expiresIn: pkg.expiresIn || '',
        packageType: pkg.packageType || '普通',
        packageSize: pkg.packageSize || '中',
        rawData: pkg.rawData || '',
        updatedAt: new Date().toISOString(),
      });
      save();
      return existing.id;
    }
    var id = nextId('PK', 'package');
    data.packages.push({
      id: id,
      userId: pkg.userId,
      trackingNo: pkg.trackingNo,
      company: pkg.company,
      companyCode: pkg.companyCode || '',
      sender: pkg.sender,
      status: pkg.status,
      pickupCode: pkg.pickupCode || '',
      pickupPoint: pkg.pickupPoint || '',
      pickupAddress: pkg.pickupAddress || '',
      arrivedAt: pkg.arrivedAt || '',
      pickedAt: '',
      expiresIn: pkg.expiresIn || '',
      packageType: pkg.packageType || '普通',
      packageSize: pkg.packageSize || '中',
      rawData: pkg.rawData || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    save();
    return id;
  },
  updatePackageStatus: function (id, status) {
    var p = data.packages.find(function (x) { return x.id === id; });
    if (p) { p.status = status; p.updatedAt = new Date().toISOString(); save(); }
  },
  deletePackage: function (id) {
    data.packages = data.packages.filter(function (p) { return p.id !== id; });
    data.packageTracking = data.packageTracking.filter(function (t) { return t.packageId !== id; });
    save();
  },

  // 物流跟踪
  getTrackingByPackage: function (packageId) {
    return data.packageTracking.filter(function (t) { return t.packageId === packageId; });
  },
  saveTracking: function (packageId, tracks) {
    data.packageTracking = data.packageTracking.filter(function (t) { return t.packageId !== packageId; });
    tracks.forEach(function (t) {
      data.packageTracking.push({
        id: data.counters.tracking++,
        packageId: packageId,
        status: t.status || '',
        location: t.location || '',
        description: t.description || '',
        timestamp: t.timestamp || '',
        createdAt: new Date().toISOString(),
      });
    });
    save();
  },
};
