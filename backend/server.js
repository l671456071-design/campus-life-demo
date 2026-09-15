// server.js — 后端主入口
// 同时提供 API 接口和静态文件服务
//
// 启动方式：
//   cd backend && npm install && npm start
//
// 访问：
//   首页: http://localhost:3000/
//   API:  http://localhost:3000/api/...

var express = require('express');
var cors = require('cors');
var path = require('path');
var https = require('https');
var config = require('./config');

var app = express();

// ===== 中间件 =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== API 路由 =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));

// 健康检查
app.get('/api/health', function (req, res) {
  res.json({ code: 0, message: 'ok', data: { version: '1.0.0' } });
});

// ===== 静态文件服务（前端页面）=====
// 指向上级目录，即 campus-package-app 根目录
var staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot, {
  extensions: ['html'],
  setHeaders: function (res) {
    res.setHeader('Cache-Control', 'no-store');
  },
}));

// SPA fallback: 未匹配的路径返回 index.html
app.get('*', function (req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 404, message: 'API not found' });
  }
  res.sendFile(path.join(staticRoot, 'index.html'));
});

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

// 用 node-forge 生成自签证书（格式更规范）
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

// SAN：所有 IP + localhost
var altNames = sanIps.map(function (ip) {
  return { type: 7, ip: ip };
});
altNames.push({ type: 2, value: 'localhost' });
cert.setExtensions([
  { name: 'basicConstraints', cA: false },
  { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
  { name: 'extKeyUsage', serverAuth: true },
  { name: 'subjectAltName', altNames: altNames },
]);

cert.sign(keys.privateKey, forge.md.sha256.create());

var certPem = forge.pki.certificateToPem(cert);
var keyPem = forge.pki.privateKeyToPem(keys.privateKey);

https.createServer({
  key: keyPem,
  cert: certPem,
}, app).listen(config.PORT, '0.0.0.0', function () {
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
