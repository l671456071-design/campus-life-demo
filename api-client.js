// api-client.js — 统一 API 客户端：JWT 管理 + 后端接口调用

var ApiClient = {
  // 后端地址：http://localhost:3000 同源时用相对路径，file:// 时用绝对地址
  BASE: (function () {
    if (location.protocol === 'file:') return 'https://localhost:3000';
    return '';
  })(),

  // JWT token 存储键
  TOKEN_KEY: 'campus_jwt_token',

  // 获取 token
  getToken: function () {
    return localStorage.getItem(this.TOKEN_KEY) || '';
  },

  // 保存 token
  setToken: function (token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  // 清除 token（退出登录）
  clearToken: function () {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  // 判断是否已登录
  isLoggedIn: function () {
    return !!this.getToken();
  },

  // 获取 Authorization header
  _authHeader: function () {
    var token = this.getToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
  },

  // 统一请求方法
  _request: function (method, path, data) {
    var self = this;
    var url = self.BASE + path;
    var opts = {
      method: method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        self._authHeader()
      ),
    };
    if (data && method !== 'GET') {
      opts.body = JSON.stringify(data);
    }

    return fetch(url, opts).then(function (res) {
      return res.json();
    }).then(function (result) {
      // 401 = token 过期或未登录
      if (result.code === 401) {
        self.clearToken();
        var currentPage = document.body.dataset.page || '';
        if (currentPage !== 'login') {
          window.location.href = 'login.html';
        }
      }
      return result;
    }).catch(function (err) {
      console.error('[API] 请求失败:', path, err);
      return { code: 500, message: '网络错误，请检查服务是否运行' };
    });
  },

  // ===== 认证接口 =====

  // 发送验证码
  sendCode: function (phone) {
    return this._request('POST', '/api/auth/send-code', { phone: phone });
  },

  // 登录
  login: function (phone, code) {
    var self = this;
    return this._request('POST', '/api/auth/login', { phone: phone, code: code }).then(function (res) {
      if (res.code === 0 && res.data && res.data.token) {
        self.setToken(res.data.token);
      }
      return res;
    });
  },

  // 获取当前用户信息
  getMe: function () {
    return this._request('GET', '/api/auth/me');
  },

  // 更新用户信息
  updateMe: function (name, studentId) {
    return this._request('PUT', '/api/auth/me', { name: name, studentId: studentId });
  },

  // 退出登录
  logout: function () {
    this.clearToken();
    window.location.href = 'login.html';
  },

  // ===== 快递接口 =====

  // 获取快递列表
  getPackages: function () {
    return this._request('GET', '/api/packages');
  },

  // 获取快递详情
  getPackage: function (id) {
    return this._request('GET', '/api/packages/' + id);
  },

  // 输入单号查询物流
  trackPackage: function (trackingNo, shipperCode) {
    var data = { trackingNo: trackingNo };
    if (shipperCode) data.shipperCode = shipperCode;
    return this._request('POST', '/api/packages/track', data);
  },

  // 更新快递状态
  updatePackageStatus: function (id, status) {
    return this._request('PUT', '/api/packages/' + id + '/status', { status: status });
  },

  // 删除快递
  deletePackage: function (id) {
    return this._request('DELETE', '/api/packages/' + id);
  },

  // 页面初始化时检查登录
  // 未登录跳转到 login.html，已登录返回用户信息
  requireAuth: function () {
    var self = this;
    if (!self.isLoggedIn()) {
      window.location.href = 'login.html';
      return Promise.resolve(null);
    }
    return self.getMe().then(function (res) {
      if (res.code !== 0) {
        window.location.href = 'login.html';
        return null;
      }
      return res.data;
    });
  },

  // 快递公司列表（前端选择用）
  SHIPPERS: [
    { code: 'ZTO', name: '中通快递' },
    { code: 'YTO', name: '圆通速递' },
    { code: 'STO', name: '申通快递' },
    { code: 'SF', name: '顺丰速运' },
    { code: 'JD', name: '京东物流' },
    { code: 'YD', name: '韵达速递' },
    { code: 'HTKY', name: '百世快递' },
    { code: 'EMS', name: '邮政EMS' },
    { code: 'DBL', name: '德邦快递' },
    { code: 'JTSD', name: '极兔速递' },
  ],
};

// =========================================================
// Demo 模式覆盖（公网展示：无后端服务，全部数据来自本地 Storage / demo-data.js）
// 静态部署（GitHub Pages / Vercel / Netlify）下后端接口不存在，
// 这里把登录校验与数据接口全部切换为本地实现，保证外部用户免登录、零报错。
// =========================================================
if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.isDemo) {

  // 免登录：demo 用户始终视为已登录
  ApiClient.isLoggedIn = function () { return true; };

  ApiClient.requireAuth = function () {
    return Promise.resolve(typeof Storage !== 'undefined' ? Storage.getUser() : null);
  };

  ApiClient.getMe = function () {
    return Promise.resolve({ code: 0, data: Storage.getUser() });
  };

  ApiClient.updateMe = function (name, studentId) {
    var user = Storage.getUser();
    if (name) user.name = name;
    if (studentId) user.studentId = studentId;
    Storage.saveUser(user);
    return Promise.resolve({ code: 0, data: user });
  };

  ApiClient.getPackages = function () {
    return Promise.resolve({ code: 0, data: Storage.getPackages() });
  };

  ApiClient.getPackage = function (id) {
    return Promise.resolve({ code: 0, data: Storage.getPackage(id) || null });
  };

  ApiClient.updatePackageStatus = function (id, status) {
    var ok = Storage.updatePackage(id, { status: status });
    return Promise.resolve({ code: ok ? 0 : 404, data: ok ? { success: true } : null });
  };

  ApiClient.deletePackage = function (id) {
    var list = Storage.getPackages().filter(function (p) { return p.id !== id; });
    localStorage.setItem(Storage.KEYS.packages, JSON.stringify(list));
    return Promise.resolve({ code: 0, data: { success: true } });
  };

  // 物流查询：在本地演示快递中查找，并生成演示物流轨迹
  ApiClient.trackPackage = function (trackingNo) {
    var pkg = null;
    var list = Storage.getPackages();
    for (var i = 0; i < list.length; i++) {
      if (list[i].trackingNo === trackingNo) { pkg = list[i]; break; }
    }
    if (!pkg) {
      return Promise.resolve({
        code: 404,
        message: '演示模式：未找到该单号。可先到「快递」页复制一个演示单号再来查询。',
      });
    }
    var tracking = [
      { description: '【演示商家】您的包裹已发货', timestamp: '两天前 18:20' },
      { description: '到达【演示转运中心】，已完成分拣', timestamp: '昨天 22:40' },
      { description: '离开【演示转运中心】，发往演示校区', timestamp: '今天 04:10' },
      { description: '到达【演示校区】配送站', timestamp: '今天 07:30' },
    ];
    if (pkg.status === 'incoming') {
      tracking.push({ description: '派送员正在派送中（演示）', timestamp: '今天 09:00' });
    } else if (pkg.status === 'pending') {
      tracking.push({ description: '已到达【' + pkg.pickupPoint + '】，凭取件码 ' + (pkg.pickupCode || '-') + ' 取件', timestamp: pkg.arrivedAt || '今天 10:00' });
    } else if (pkg.status === 'picked') {
      tracking.push({ description: '已到达【' + pkg.pickupPoint + '】', timestamp: pkg.arrivedAt || '昨天 10:00' });
      tracking.push({ description: '已取件，演示流程完成', timestamp: pkg.pickedAt || '昨天 12:00' });
    } else if (pkg.status === 'expired') {
      tracking.push({ description: '超期未取，已退回发件人（演示）', timestamp: '今天 08:00' });
    }
    var copy = {};
    for (var k in pkg) copy[k] = pkg[k];
    copy.tracking = tracking;
    return Promise.resolve({ code: 0, data: copy });
  };

  // 退出登录：demo 模式下改为“重置演示数据”
  ApiClient.logout = function () {
    var settings = Storage.getSettings();
    Storage.resetAll();
    Storage.saveSettings(settings);
    window.location.href = 'index.html';
  };

  ApiClient.sendCode = function () {
    return Promise.resolve({ code: 0, data: { demo: true, message: '演示模式无需登录' } });
  };

  ApiClient.login = function () {
    return Promise.resolve({ code: 0, data: { demo: true } });
  };
}
