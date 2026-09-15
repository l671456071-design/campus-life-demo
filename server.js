// server.js — 本地开发服务器（零依赖，仅使用 Node.js 内置模块）
// 用途：浏览器限制 file:// 协议下调用摄像头 / 定位 / fetch 本地 JSON，
//      通过 http://localhost 启动即可解锁全部本地能力。
// 启动：node server.js   （或 npm start）
// 访问：http://localhost:3000/

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  } catch (e) {
    urlPath = '/';
  }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // 防目录穿越：解析后必须仍在项目根目录内
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + urlPath);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('[启动失败] 端口 ' + PORT + ' 已被占用。');
    console.error('可换端口启动：PORT=3001 node server.js （Windows: set PORT=3001 && node server.js）');
    process.exit(1);
  }
  console.error('[启动失败]', err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  const line = '-'.repeat(56);
  console.log(line);
  console.log('  校园取件 App · 本地服务器已启动');
  console.log(line);
  console.log('  首页:       http://localhost:' + PORT + '/');
  console.log('  扫码取件:   http://localhost:' + PORT + '/scan.html');
  console.log('  校园地图:   http://localhost:' + PORT + '/map.html');
  console.log('  二维码测试: http://localhost:' + PORT + '/test-qr.html');
  console.log(line);
  console.log('  所有数据保存在浏览器 localStorage，仅本机运行，不上传任何数据。');
  console.log('  按 Ctrl+C 停止服务器。');
});
