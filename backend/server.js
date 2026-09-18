// server.js — 后端主入口
// 同时提供 API 接口和静态文件服务
//
// 启动方式：
//   cd backend && npm install && npm start
//
// 访问：
//   首页: http://localhost:3000/
//   API:  http://localhost:3000/api/...

// 最先加载 .env（零依赖，必须在 config 之前；真实环境变量优先于 .env）
require('./load-env');

var express = require('express');
var cors = require('cors');
var path = require('path');
var https = require('https');
var zlib = require('zlib');
var jwt = require('jsonwebtoken');
var config = require('./config');
var db = require('./db');

var app = express();

// ===== 中间件 =====
app.use(cors());
// 截图以 base64 JSON 提交，放开 body 上限（3 张 × 5MB ≈ 21MB）
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ===== gzip 压缩（零依赖，内置 zlib；仅压缩文本类，手机弱网/局域网传输显著减重）=====
var COMPRESSIBLE_TYPE = /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/;
var MIN_COMPRESS_BYTES = 1024;

app.use(function (req, res, next) {
  if ((req.method !== 'GET' && req.method !== 'HEAD') ||
      String(req.headers['accept-encoding'] || '').indexOf('gzip') === -1) {
    return next();
  }

  var gz = null;
  var decided = false;
  var origWrite = res.write;
  var origEnd = res.end;

  function eligible() {
    if (gz || res.getHeader('Content-Encoding')) return false;
    if (res.statusCode < 200 || res.statusCode >= 300) return false;
    if (!COMPRESSIBLE_TYPE.test(String(res.getHeader('Content-Type') || ''))) return false;
    var len = Number(res.getHeader('Content-Length') || 0);
    if (len && len < MIN_COMPRESS_BYTES) return false;
    return true;
  }

  // 静态文件（sendFile）走显式 writeHead，headers 对象里的 content-length 必须同步剔除，
  // 否则会与 gzip 后实际字节数冲突
  var origWriteHead = res.writeHead;
  res.writeHead = function () {
    if (!decided) {
      decided = true;
      if (eligible()) {
        var lastArg = arguments[arguments.length - 1];
        if (lastArg && typeof lastArg === 'object') delete lastArg['content-length'];
        startGzip();
      }
    }
    return origWriteHead.apply(res, arguments);
  };

  function startGzip() {
    gz = zlib.createGzip({ level: 6 });
    res.setHeader('Content-Encoding', 'gzip');
    res.removeHeader('Content-Length');
    var vary = res.getHeader('Vary');
    res.setHeader('Vary', vary ? (vary + ', Accept-Encoding') : 'Accept-Encoding');
    // 背压要在「文件流→gzip→socket」三段之间完整传递，缺一环大文件就永久挂起：
    // ① socket 写不动 → 暂停 gzip 输出；socket drain → 恢复 gzip
    gz.on('data', function (chunk) {
      if (!origWrite.call(res, chunk)) gz.pause();
    });
    res.on('drain', function () { if (gz) gz.resume(); });
    // ② 上游（send 的 stream.pipe）认的是 res 的背压：gzip 输入缓冲排空时，
    //    必须以 res 的名义补发 drain，文件流才会 resume（socket 没满时 res 自身不会触发）
    gz.on('drain', function () { res.emit('drain'); });
    gz.on('end', function () { origEnd.call(res); });
    gz.on('error', function () { try { origEnd.call(res); } catch (e) { /* 客户端已断开 */ } });
  }

  res.write = function (chunk, encoding, cb) {
    if (gz) return gz.write(chunk, encoding, cb);
    if (!decided) {
      decided = true;
      if (eligible()) { startGzip(); if (chunk) return gz.write(chunk, encoding, cb); return true; }
    }
    return origWrite.call(res, chunk, encoding, cb);
  };

  res.end = function (chunk, encoding, cb) {
    if (gz) {
      if (chunk) gz.end(chunk, encoding, cb); else gz.end(cb);
      return;
    }
    if (!decided) {
      decided = true;
      if (chunk && eligible()) {
        startGzip();
        gz.end(chunk, encoding, cb);
        return;
      }
    }
    return origEnd.call(res, chunk, encoding, cb);
  };

  next();
});

// ============================================================
// 访问隔离：灰度反馈产品  vs  产品体验  vs  开发者完整站点
//
//  匿名      → 仅 /gray/（自包含反馈页）+ 反馈/登录类 API，拿不到任何 App 页面/脚本
//  体验用户  → /gray/ 一键体验换取 exp_session（2h HttpOnly Cookie）后，可浏览产品前端
//              （demo 虚拟数据）；业务/管理 API、/admin、后端源码仍全部拒绝
//  开发者    → /dev 用 admin 账号换取 dev_session（HttpOnly Cookie）后，可访问完整站点
//  本机      → 127.0.0.1 直连免 Cookie（仅服务器本人生效，远端无法伪造）
// ============================================================

// 灰度产品允许调用的 API（其他业务/管理 API 对非 admin 令牌一律拒绝）
var GRAY_PUBLIC_API = /^\/(?:health|auth\/(?:send-code|login|me|dev-session|dev-logout|trial-login|trial-logout|wechat\/status)|feedback(?:\/|$)|ai\/chat)/;

function bearerIsAdmin(req) {
  var header = req.headers.authorization || '';
  if (header.indexOf('Bearer ') !== 0) return false;
  try {
    var payload = jwt.verify(header.slice(7), config.JWT_SECRET);
    var user = db.getUserById(payload.userId);
    return !!(user && user.role === 'admin');
  } catch (e) { return false; }
}

function getCookie(req, name) {
  var raw = req.headers.cookie || '';
  var m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(raw);
  return m ? decodeURIComponent(m[1]) : '';
}

function devSessionOk(req) {
  var token = getCookie(req, 'dev_session');
  if (!token) return false;
  try {
    var payload = jwt.verify(token, config.JWT_SECRET);
    var user = db.getUserById(payload.userId);
    return !!(user && user.role === 'admin');
  } catch (e) { return false; }
}

// 灰度体验会话：仅证明“该用户点过一键体验”，只能解锁前端演示页面
function expSessionOk(req) {
  var token = getCookie(req, 'exp_session');
  if (!token) return false;
  try {
    var payload = jwt.verify(token, config.JWT_SECRET);
    return payload.scope === 'trial';
  } catch (e) { return false; }
}

function isLoopback(req) {
  var ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// API 层隔离：非 admin 令牌只能访问登录与反馈接口
app.use('/api', function (req, res, next) {
  if (req.method === 'OPTIONS') return next();
  if (GRAY_PUBLIC_API.test(req.path)) return next();
  if (isLoopback(req)) return next();
  if (bearerIsAdmin(req)) return next();
  if (devSessionOk(req)) return next();
  var status = req.headers.authorization ? 403 : 401;
  return res.status(status).json({
    code: status,
    message: status === 403 ? '当前账号无权访问该接口' : '请先登录',
  });
});

// ===== API 路由 =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/courier', require('./routes/courier'));
app.use('/api/scan', require('./routes/scan'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/ai', require('./routes/ai'));

// 健康检查
app.get('/api/health', function (req, res) {
  res.json({
    code: 0, message: 'ok',
    data: {
      version: '2.0.0',
      appVersion: config.APP_VERSION,
      environment: config.ENVIRONMENT,
      smsProvider: config.SMS_PROVIDER,
      courierProvider: config.COURIER_PROVIDER,
      grayCohort: config.GRAY_COHORT,
    },
  });
});

// ===== 静态文件访问控制 =====
// 任何情况下都不通过 HTTP 提供后端源码 / 数据 / 仓库元信息
var ALWAYS_DENY = /^\/(?:backend(?:\/|$)|[^/]*\.sqlite(?:-[^/]*)?$|\.git(?:\/|$)|node_modules(?:\/|$))/;

// 灰度产品公开可达的静态资源（反馈 SPA 自包含，仅依赖一个 favicon）
var GRAY_PUBLIC_STATIC = function (p) {
  return p === '/gray' || p === '/gray/' ||
    p === '/dev' || p === '/dev-login.html' ||
    p === '/favicon.ico' || p === '/assets/icons/favicon.svg';
};

// 即使持有体验 Cookie 也绝不开放的管理页面（必须 admin / dev_session / 本机）
var ADMIN_ONLY_STATIC = /^\/admin(?:\.html)?(?:\/|$)/;

app.use(function (req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  var p = req.path.split('?')[0];

  if (ALWAYS_DENY.test(p)) return res.status(404).json({ code: 404, message: 'Not found' });
  if (GRAY_PUBLIC_STATIC(p)) return next();

  var dev = isLoopback(req) || devSessionOk(req);

  // 管理后台：只有开发者/本机身份可进，体验用户与匿名一律拦截
  if (ADMIN_ONLY_STATIC.test(p) && !dev) {
    var acceptAdm = String(req.headers.accept || '');
    if (acceptAdm.indexOf('text/html') !== -1) return res.redirect(302, '/gray/');
    return res.status(403).json({ code: 403, message: '无权访问该资源' });
  }

  // 开发者/本机：完整站点；体验用户：产品前端页面（demo 虚拟数据）
  if (dev || expSessionOk(req)) return next();

  // 匿名：仅“页面导航”（Accept 含 text/html）跳转灰度反馈入口；
  // 脚本/图片等子资源（*/*）直接 403，避免把 HTML 当作 JS 返回，也不泄露代码
  var accept = String(req.headers.accept || '');
  if (accept.indexOf('text/html') !== -1) return res.redirect(302, '/gray/');
  return res.status(403).json({ code: 403, message: '无权访问该资源' });
});

// /dev → 开发者登录页（/gray 的斜杠补全由 express.static 目录重定向自动处理，
// 不能手写 app.get('/gray')，非严格路由会连 /gray/ 一起匹配造成自跳循环）
app.get('/dev', function (req, res) { res.redirect(302, '/dev-login.html'); });

// ===== 静态文件服务（前端页面）=====
// 指向上级目录，即 campus-package-app 根目录
var staticRoot = path.join(__dirname, '..');
// HTML：每次校验（改动即时生效，命中 304 无响应体）；
// 三方库/资源：强缓存 7 天（内容稳定，手机重复访问不重复下载近 6MB 的库）
var LONG_CACHE_EXT = /\.(?:css|js|mjs|json|png|jpg|jpeg|gif|webp|svg|ico|woff2?|wasm|traineddata|gz)$/i;
app.use(express.static(staticRoot, {
  extensions: ['html'],
  dotfiles: 'deny',
  maxAge: '7d',
  lastModified: true,
  etag: true,
  setHeaders: function (res, filePath) {
    if (LONG_CACHE_EXT.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA fallback: 未匹配的路径——开发者/本机/体验会话可进入产品，其余导向灰度反馈页
app.get('*', function (req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 404, message: 'API not found' });
  }
  if (isLoopback(req) || devSessionOk(req) || expSessionOk(req)) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(staticRoot, 'index.html'));
  }
  return res.redirect(302, '/gray/');
});

// ===== 全局错误处理 =====
// 必须放在所有路由之后，向用户输出友好文案，原始堆栈入 error_logs
app.use(require('./middleware/errorHandler').handler);

// ===== 启动（HTTPS，手机摄像头需要安全上下文） =====
var forge = require('node-forge');
var os = require('os');
var fs = require('fs');

// 收集本机所有 IP
var sanIps = ['127.0.0.1'];
var nets = os.networkInterfaces();
for (var name in nets) {
  nets[name].forEach(function (net) {
    if (net.family === 'IPv4' && !net.internal) sanIps.push(net.address);
  });
}

// 自签证书：持久化到 backend/certs/，首次生成、之后复用，重启不变（信任一次即可）。
// 当网卡 IP 变化（如换 WiFi）导致旧证书 SAN 不覆盖当前 IP 时，自动续签。
var certDir = path.join(__dirname, 'certs');
var certFilePath = path.join(certDir, 'dev-cert.pem');
var keyFilePath = path.join(certDir, 'dev-key.pem');

// 生成一张覆盖全部当前 IP + localhost 的自签证书
function buildSelfSignedCert(ips) {
  var keys = forge.pki.rsa.generateKeyPair(2048);
  var cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '0' + Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 825 * 24 * 60 * 60 * 1000);

  var attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Campus Package Dev' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  var altNames = ips.map(function (ip) { return { type: 7, ip: ip }; });
  altNames.push({ type: 2, value: 'localhost' });
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: altNames },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

// 已保存的证书 SAN 是否覆盖当前所有网卡 IP（type 7 = IP 地址）
function certCoversIps(pem, ips) {
  try {
    var saved = forge.pki.certificateFromPem(pem);
    var covered = {};
    (saved.extensions || []).forEach(function (ext) {
      if (ext.name === 'subjectAltName' && Array.isArray(ext.altNames)) {
        ext.altNames.forEach(function (a) { if (a.type === 7) covered[a.ip] = true; });
      }
    });
    return ips.every(function (ip) { return covered[ip]; });
  } catch (e) { return false; }
}

var certPem;
var keyPem;
var reused = false;
try {
  if (fs.existsSync(certFilePath) && fs.existsSync(keyFilePath)) {
    certPem = fs.readFileSync(certFilePath, 'utf8');
    keyPem = fs.readFileSync(keyFilePath, 'utf8');
    if (certCoversIps(certPem, sanIps)) {
      reused = true;
    } else {
      throw new Error('IP changed, renew cert');
    }
  } else {
    throw new Error('no saved cert');
  }
} catch (e) {
  var pair = buildSelfSignedCert(sanIps);
  certPem = pair.certPem;
  keyPem = pair.keyPem;
  fs.mkdirSync(certDir, { recursive: true });
  fs.writeFileSync(certFilePath, certPem, { mode: 0o644 });
  fs.writeFileSync(keyFilePath, keyPem, { mode: 0o600 });
}
console.log(reused ? '  [证书] 复用已保存的自签证书（certs/dev-cert.pem）'
                   : '  [证书] 已生成新自签证书（certs/dev-cert.pem）');

// ===== 数据库保留期清理：验证码/指标/错误日志只留 30 天，防止 SQLite 无限膨胀 =====
var DATA_RETENTION_DAYS = 30;
function runPurge() {
  try {
    var r = db.purgeOldData(DATA_RETENTION_DAYS);
    var total = r.codes + r.metrics + r.errors;
    if (total > 0) {
      console.log('  [清理] 过期数据 ' + total +
        ' 行（验证码 ' + r.codes + ' / 指标 ' + r.metrics + ' / 错误日志 ' + r.errors + '）');
    }
  } catch (e) {
    console.error('  [清理] 数据保留期清理失败:', e.message);
  }
}
setTimeout(runPurge, 10 * 1000).unref();                 // 启动 10s 后先清一次
setInterval(runPurge, 24 * 60 * 60 * 1000).unref();      // 之后每天一次

var httpsServer = https.createServer({
  key: keyPem,
  cert: certPem,
}, app);
// 连接复用保持 15s，手机连续打开多个页面时少做几次 RSA 握手；headersTimeout 须略大于前者
httpsServer.keepAliveTimeout = 15000;
httpsServer.headersTimeout = 20000;
httpsServer.listen(config.PORT, '0.0.0.0', function () {
  var ips = sanIps.filter(function (ip) { return ip !== '127.0.0.1'; });

  var line = '-'.repeat(56);
  console.log(line);
  console.log('  校园取件 App · 后端服务已启动 (HTTPS)');
  console.log(line);
  console.log('  本机访问:   https://localhost:' + config.PORT + '/');
  if (ips.length > 0) {
    console.log(line);
    console.log('  手机访问（同 WiFi 下，需先信任证书）:');
    ips.forEach(function (ip) {
      console.log('    https://' + ip + ':' + config.PORT + '/');
    });
    console.log('  登录页:     https://' + ips[0] + ':' + config.PORT + '/login.html');
    console.log('  扫码页:     https://' + ips[0] + ':' + config.PORT + '/scan.html');
  }
  console.log(line);
  console.log('  [重要] 手机首次打开会提示"不安全的证书"');
  console.log('         点击"高级" →"继续访问"即可');
  console.log('         只有 HTTPS 才能使用手机摄像头扫码');
  console.log(line);
  if (config.SMS_PROVIDER === 'console') {
    console.log('  [提示] 短信验证码将打印在控制台（开发模式）');
    console.log('  [提示] 手机登录时，验证码在此终端查看');
  }
  console.log(line);
  console.log('  按 Ctrl+C 停止服务。');
});
