// verify.js — 本地化升级验收脚本（纯 Node 运行，无需浏览器）
// 1) 二维码编解码 round-trip：qrcode-generator 生成 → jsQR 识别（两个本地库互验）
// 2) Storage 数据层行为：种子初始化 / 确认取件 / 记录联动 / 消息已读
// 3) api.resolveScanCode 解析规则
// 运行：node verify.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------- 1. QR 编解码 round-trip ----------
console.log('\n[1] 二维码编解码 round-trip（本地 qrcode-generator ↔ jsQR）');
const qrcodeLib = require(path.join(ROOT, 'libs/qr-encoder/qrcode.js'));
const jsQR = require(path.join(ROOT, 'libs/qr-scanner/jsQR.js'));

function makeQr(text) {
  const qr = qrcodeLib(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr;
}

function qrToImageData(qr, cellSize, margin) {
  const count = qr.getModuleCount();
  const size = (count + margin * 2) * cellSize;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          const px = (margin + c) * cellSize + dx;
          const py = (margin + r) * cellSize + dy;
          const i = (py * size + px) * 4;
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
        }
      }
    }
  }
  return { data, width: size, height: size };
}

function roundTrip(text, cellSize, downscaleTo) {
  const qr = makeQr(text);
  let img = qrToImageData(qr, cellSize, 4);
  if (downscaleTo) {
    const factor = Math.min(img.width, img.height) / downscaleTo;
    const w = Math.round(img.width / factor), h = Math.round(img.height / factor);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (Math.min(img.height - 1, Math.round(y * factor)) * img.width + Math.min(img.width - 1, Math.round(x * factor))) * 4;
        const di = (y * w + x) * 4;
        out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = 255;
      }
    }
    img = { data: out, width: w, height: h };
  }
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return res ? res.data : null;
}

const samples = [
  JSON.stringify({ qrCode: '8-3-267', packageId: 'PK001' }),
  JSON.stringify({ qrCode: '3-1-089', packageId: 'PK002' }),
  JSON.stringify({ qrCode: 'C-12-45', packageId: 'PK003' }),
  JSON.stringify({ qrCode: 'D-06-23', packageId: 'PK004' }),
  JSON.stringify({ qrCode: '8-3-301', packageId: 'PK005' }),
  JSON.stringify({ qrCode: '8-3-355', packageId: 'PK015' }),
  '8-3-267',
];
samples.forEach((t, i) => {
  const out = roundTrip(t, 4, null);
  check('样本 ' + (i + 1) + ' 原尺寸识别', out === t, 'got: ' + out);
});
check('缩放到 480px 后识别（模拟浏览器降采样）', roundTrip(samples[0], 8, 480) === samples[0]);
check('反色二维码识别（inversionAttempts）', (() => {
  const qr = makeQr(samples[0]);
  const img = qrToImageData(qr, 4, 4);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i] === 0 ? 255 : 0;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return res && res.data === samples[0];
})());

// ---------- 2. Storage 数据层（Node 下 localStorage 不可用 → 内存降级，逻辑一致） ----------
console.log('\n[2] Storage 数据层行为');
global.localStorage = undefined; // 显式声明：Node 环境走内存降级
eval(fs.readFileSync(path.join(ROOT, 'mock.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8'));

Storage.init();
check('种子数据初始化（15 条快递）', Storage.getPackages().length === 15);
check('种子取件记录（10 条）', Storage.getRecords().length === 10);
check('种子消息（8 条）', Storage.getMessages().length === 8);
check('初始未读数 = 3', Storage.getUnreadCount() === 3);

// 取件点实时待取数量（东门驿站：PK001/PK002/PK015 共 3 件待取）
const pp01 = Storage.getPickupPoints().find(p => p.id === 'PP01');
check('取件点待取数量实时计算 PP01', pp01 && pp01.pendingCount === 3, 'got ' + (pp01 && pp01.pendingCount));

// 确认取件 PK001
const before = {
  pending: Storage.getPackages().filter(p => p.status === 'pending').length,
  records: Storage.getRecords().length,
  unread: Storage.getUnreadCount(),
  picked: Storage.getUser().pickedCount,
};
const r1 = Storage.confirmPickup('PK001');
check('确认取件返回 success', r1.success === true);
const after = {
  pending: Storage.getPackages().filter(p => p.status === 'pending').length,
  records: Storage.getRecords().length,
  unread: Storage.getUnreadCount(),
  picked: Storage.getUser().pickedCount,
};
const pkg1 = Storage.getPackage('PK001');
check('状态 pending → picked', pkg1.status === 'picked');
check('记录 pickedAt 时间戳', /^\d{2}-\d{2} \d{2}:\d{2}$/.test(pkg1.pickedAt || ''));
check('待取数量 -1', after.pending === before.pending - 1, before.pending + ' → ' + after.pending);
check('取件记录 +1', after.records === before.records + 1);
check('新增未读取件通知', after.unread === before.unread + 1);
check('累计取件数 +1', after.picked === before.picked + 1);
const newRecord = Storage.getRecords()[0];
check('新记录 packageId=PK001', newRecord.packageId === 'PK001');

// 重复取件被拒绝
const r2 = Storage.confirmPickup('PK001');
check('重复取件被拒绝', r2.success === false);
// 运输中包裹不可取
const r3 = Storage.confirmPickup('PK006');
check('运输中包裹不可取件', r3.success === false);

// 消息已读
Storage.markMessageRead('M01');
check('单条消息已读', Storage.getUnreadCount() === after.unread - 1);
Storage.markAllMessagesRead();
check('全部已读后未读数归零', Storage.getUnreadCount() === 0);

// ---------- 3. resolveScanCode ----------
console.log('\n[3] 扫码内容解析规则');
eval(fs.readFileSync(path.join(ROOT, 'api.js'), 'utf8'));
check('JSON 二维码解析', API.resolveScanCode('{"qrCode":"8-3-267","packageId":"PK001"}').status === 'picked'); // 已在第2步取件
check('纯取件码解析', API.resolveScanCode('3-1-089').status === 'pending');
check('运单号解析', API.resolveScanCode('ZT9876543210').status === 'pending');
check('packageId 直接解析', API.resolveScanCode('PK002').status === 'pending');
check('运输中包裹提示', API.resolveScanCode('JT7788990011').status === 'incoming');
check('未知内容 notfound', API.resolveScanCode('XXXX-999').status === 'notfound');
check('空内容 empty', API.resolveScanCode('  ').status === 'empty');

// ---------- 3b. OCR 取件码提取规则 ----------
console.log('\n[3b] OCR 取件码提取与匹配');
const cand = (text) => API.extractPickupCandidates(text);
check('三段式取件码 8-3-267', cand('8-3-267').indexOf('8-3-267') !== -1);
check('纯数字 83267', cand('83267').indexOf('83267') !== -1);
check('字母段 A-12-568', cand('A-12-568').indexOf('A-12-568') !== -1);
check('双段式 12-35-88', cand('12-35-88').indexOf('12-35-88') !== -1);
check('中文前缀“取件码：8-3-267”', cand('取件码：8-3-267').indexOf('8-3-267') !== -1);
check('中文前缀“取件码 83267”', cand('取件码 83267').indexOf('83267') !== -1);
check('含空格换行清理', cand('取 件 码\n8-3-267').indexOf('8-3-267') !== -1);
check('OCR 噪声文本中提取', API.resolveScanText('XX快递 面单\n取件码 3-1-089\n谢谢').status === 'pending');
check('OCR 文本匹配本地快递（含噪声）', API.resolveScanText('面单文字 C-12-45').status === 'pending');
check('无匹配返回 notfound', API.resolveScanText('9999-8888').status === 'notfound');
check('无数字返回 empty', API.resolveScanText('没有任何数字').status === 'empty');

// ---------- 2b. 外卖数据层（购物车 / 订单 / 状态流转） ----------
console.log('\n[2b] 外卖数据层行为');
check('店铺种子数据（7 家）', Storage.getRestaurants().length === 7);
check('菜品种子数据（38 道）', Storage.getFoods().length === 38);
check('店铺营业状态计算（isOpen 字段）', typeof Storage.getRestaurants()[0].isOpen === 'boolean');
check('按分类筛选奶茶', Storage.getRestaurants({ category: 'tea' }).every(r => r.category === 'tea'));
check('按关键词搜索“蜜雪”', Storage.getRestaurants({ keyword: '蜜雪' })[0].id === 'F04');

// 购物车：加购 / 跨店替换 / 数量增减 / 汇总
const f1 = Storage.getFood('F01-01'), f2 = Storage.getFood('F01-02'), f4 = Storage.getFood('F04-01');
let cAdd = Storage.addToCart(f1, 2);
check('加入购物车', cAdd.replaced === false && Storage.getCartCount() === 2);
cAdd = Storage.addToCart(f1, 1);
check('同商品数量累加', Storage.getCartCount() === 3);
cAdd = Storage.addToCart(f2, 1);
check('同店不同商品', Storage.getCartCount() === 4 && Storage.getCart().items.length === 2);
let sum = Storage.getCartSummary();
check('购物车汇总：小计正确', Math.abs(sum.subtotal - (15 * 3 + 12)) < 1e-9, 'got ' + sum.subtotal);
check('食堂 F01 满减（满20减3）', sum.discount === 3, 'got ' + sum.discount);
check('食堂 F01 免配送费', sum.deliveryFee === 0);
check('起送价判断（F01 起送0）', sum.reachMin === true);
cAdd = Storage.addToCart(f4, 1);
check('跨店加购触发整单替换', cAdd.replaced === true && Storage.getCartCount() === 1);
sum = Storage.getCartSummary();
check('替换后归属新店铺 F04', sum.restaurant.id === 'F04' && sum.deliveryFee === 1);
Storage.setCartQty('F04-01', 0);
check('数量清零移出购物车', Storage.getCartCount() === 0);

// 订单：创建 → 支付 → 制作 → 配送 → 完成
Storage.addToCart(Storage.getFood('F04-01'), 2); // 4*2=8，满20减4不触发
let co = Storage.createOrder(null, '少冰');
check('生成订单（待支付）', co.success === true && co.order.status === 'unpaid');
check('订单写入 localStorage', Storage.getOrders().length === 1);
check('下单后购物车清空', Storage.getCartCount() === 0);
check('订单地址取用户资料', co.order.address && co.order.address.name === Storage.getUser().name);
check('订单含店铺 3D 坐标（供地图）', typeof co.order.x === 'number' && typeof co.order.accessNode === 'string');
check('订单备注保存', co.order.note === '少冰');
const oid = co.order.id;
check('模拟支付 → 制作中', Storage.payOrder(oid).success === true && Storage.getOrder(oid).status === 'preparing');
check('配送进度（未到配送阶段=0）', Storage.getDeliveryProgress(Storage.getOrder(oid)) === 0);
// 手动推进时间轴：模拟制作完成
const ord1 = Storage.getOrder(oid); ord1.preparingAt -= Storage.FOOD_TIMINGS.preparingMs + 1;
Storage._write(Storage.KEYS.orders, [ord1]);
Storage.syncOrderStatuses();
check('制作超时 → 配送中', Storage.getOrder(oid).status === 'delivering');
check('配送进度（刚开始=0）', Storage.getDeliveryProgress(Storage.getOrder(oid)) === 0);
const ord2 = Storage.getOrder(oid); ord2.deliveringAt -= Storage.FOOD_TIMINGS.deliveringMs + 1;
Storage._write(Storage.KEYS.orders, [ord2]);
Storage.syncOrderStatuses();
check('配送超时 → 已完成', Storage.getOrder(oid).status === 'completed');
check('配送进度（完成=1）', Storage.getDeliveryProgress(Storage.getOrder(oid)) === 1);
Storage._write(Storage.KEYS.orders, []); // 清理演示订单
check('订单清空', Storage.getOrders().length === 0);

// ---------- 4. 本地资源完整性（无 CDN / 无死链） ----------
console.log('\n[4] 静态资源检查');
const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
let externalRefs = [], deadLinks = [];
function walk(dir, prefix) {
  let out = [];
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) out = out.concat(walk(full, prefix + f + '/'));
    else out.push(prefix + f);
  });
  return out;
}
const localFiles = new Set(fs.readdirSync(ROOT).concat(
  walk(path.join(ROOT, 'assets'), 'assets/'),
  walk(path.join(ROOT, 'libs'), 'libs/'),
));
// 仅后端服务期存在的路由入口（dev-login.html 是服务器页，链接的 /gray/ 由后端路由提供，
// 不属于静态文件，故不参与“本地文件死链”检查）
const SERVER_ONLY_REFS = new Set(['/gray/', '/gray', '/dev', '/dev-login.html']);
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  refs.forEach(ref => {
    if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//')) {
      if (ref.startsWith('http://www.w3.org') || ref.startsWith('https://www.w3.org')) return; // SVG 命名空间，非资源加载
      externalRefs.push(f + ' → ' + ref);
    } else if (!ref.startsWith('javascript:') && !ref.startsWith('#') && ref !== '' && !SERVER_ONLY_REFS.has(ref)) {
      if (/[+'"]/.test(ref)) return; // JS 字符串动态拼接片段（如 src="' + p.image + '"），非真实引用
      const clean = ref.split('?')[0].split('#')[0].replace(/^\.\//, ''); // 归一化 ./ 相对前缀
      if (!localFiles.has(clean)) deadLinks.push(f + ' → ' + ref);
    }
  });
});
check('HTML 中无外部 http(s) 资源引用', externalRefs.length === 0, externalRefs.join('; '));
check('无死链（所有本地引用文件存在）', deadLinks.length === 0, deadLinks.join('; '));

// 应用代码：严格禁止任何外部 URL
const appFiles = ['styles.css', 'mock.js', 'storage.js', 'api.js', 'app.js',
  'libs/qr-scanner/jsQR.js', 'libs/qr-encoder/qrcode.js', 'libs/qr-encoder/qrcode_UTF8.js',
  'libs/three/three.min.js', 'libs/tesseract/tesseract.min.js', 'libs/tesseract/worker.min.js'];
let cdnHits = [];
appFiles.forEach(f => {
  const c = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 三方库内置的默认路径（tesseract/three 官方发行版自带）不算依赖 —— 页面已全部用本地路径覆盖
  if (/(https?:)?\/\/(cdn|unpkg|jsdelivr|cdnjs|googleapis|gstatic|maps\.googleapis|amap\.com|webapi\.amap|apis\.map)/i.test(c)) cdnHits.push(f);
});
const vendorDefaultHits = cdnHits.filter(f => f.startsWith('libs/tesseract/') || f.startsWith('libs/three/'));
const appHits = cdnHits.filter(f => !f.startsWith('libs/') && !f.startsWith('assets/'));
check('应用代码无 CDN / 无在线地图 API 依赖', appHits.length === 0, appHits.join('; '));
check('三方库内置默认 URL 均被本地路径覆盖', (() => {
  if (!vendorDefaultHits.length) return true;
  const sh = fs.readFileSync(path.join(ROOT, 'scan.html'), 'utf8');
  return sh.includes("workerPath: 'libs/tesseract/worker.min.js'")
    && sh.includes("corePath: 'libs/tesseract/core'")
    && sh.includes("langPath: 'libs/tesseract/lang'");
})(), '库内置默认: ' + vendorDefaultHits.join('; '));

// ---------- 5. 二次升级结构验收 ----------
console.log('\n[5] 二次升级结构验收');
check('3D 库本地化（libs/three/three.min.js 存在）', localFiles.has('libs/three/three.min.js'));
check('OCR 库本地化（tesseract.min.js 存在）', localFiles.has('libs/tesseract/tesseract.min.js'));
check('OCR worker 本地化', localFiles.has('libs/tesseract/worker.min.js'));
check('OCR 语言包本地化（eng.traineddata.gz）', localFiles.has('libs/tesseract/lang/eng.traineddata.gz'));
check('OCR wasm core 本地化', localFiles.has('libs/tesseract/core/tesseract-core.wasm.js') && localFiles.has('libs/tesseract/core/tesseract-core-simd.wasm.js'));
check('外卖页面 food.html 存在', fs.existsSync(path.join(ROOT, 'food.html')));
check('外卖详情页 food-detail.html 存在', fs.existsSync(path.join(ROOT, 'food-detail.html')));
check('订单页 order.html 存在', fs.existsSync(path.join(ROOT, 'order.html')));
check('3D 地图页 map.html 存在（功能页）', fs.existsSync(path.join(ROOT, 'map.html')));

// 导航结构：5 Tab = 首页/快递/扫码/外卖/我的；地图不再是 Tab
let tabIssues = [];
const mainPages = ['index.html', 'packages.html', 'scan.html', 'food.html', 'profile.html', 'detail.html', 'map.html', 'messages.html', 'records.html', 'order.html', 'food-detail.html', 'savings.html', 'schedule.html', 'forum.html', 'jobs.html'];
mainPages.forEach(f => {
  if (!fs.existsSync(path.join(ROOT, f))) return;
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (!html.includes('class="tab-bar"')) return; // 无 tab bar 的页面跳过
  const navs = [...html.matchAll(/data-nav="([a-z]+)"/g)].map(m => m[1]);
  const order = navs.filter((v, i, a) => a.indexOf(v) === i);
  if (order.join(',') !== 'home,packages,scan,food,profile') tabIssues.push(f + ': ' + order.join(','));
  if (html.includes('data-nav="map"')) tabIssues.push(f + ': 仍有地图Tab');
});
check('底部导航统一为 首页/快递/扫码/外卖/我的', tabIssues.length === 0, tabIssues.join('; '));

// 3D 地图关键能力（代码特征断言）
const mapHtml = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');
check('map.html 引用本地 three.min.js', mapHtml.includes('libs/three/three.min.js'));
check('3D 场景：透视相机 + WebGL 渲染', mapHtml.includes('PerspectiveCamera') && mapHtml.includes('WebGLRenderer'));
check('3D 地图：阴影光照', mapHtml.includes('castShadow') && mapHtml.includes('DirectionalLight'));
check('3D 地图：轨道旋转 / 缩放限制', mapHtml.includes('theta') && mapHtml.includes('phi') && mapHtml.includes('radius'));
check('3D 地图：geolocation 定位', mapHtml.includes('navigator.geolocation.getCurrentPosition'));
check('3D 地图：POI 点击交互', mapHtml.includes('Raycaster') || mapHtml.includes('raycaster'));
check('3D 地图：本地路径规划（Dijkstra）', mapHtml.includes('dijkstra') || mapHtml.includes('Dijkstra'));
check('3D 地图：配送模式（mode=delivery）', mapHtml.includes("mode') === 'delivery'") || mapHtml.includes('DELIVERY_MODE'));
check('3D 地图：骑手 + 配送进度', mapHtml.includes('buildRider') && mapHtml.includes('getDeliveryProgress'));

// 扫码页关键能力
const scanHtml = fs.readFileSync(path.join(ROOT, 'scan.html'), 'utf8');
check('scan.html 使用真实摄像头 getUserMedia', scanHtml.includes('getUserMedia'));
check('scan.html 二维码本地识别（jsQR）', scanHtml.includes('libs/qr-scanner/jsQR.js'));
check('scan.html 本地 OCR（tesseract）', scanHtml.includes('libs/tesseract/tesseract.min.js'));
check('scan.html OCR 结果走本地取件码匹配', scanHtml.includes('resolveScanText') || scanHtml.includes('extractPickupCandidates'));
check('scan.html 绿色识别成功框动画', scanHtml.includes('scan-frame--success'));

// ---------- 6. Demo 双环境隔离验收（config.js 自动判定 + demo_ 存储隔离 + 虚拟数据） ----------
console.log('\n[6] Demo / Local 双环境隔离');
const vm = require('vm');

// 构造浏览器沙箱：给定主机名 / URL 参数 / 独立 localStorage，依次执行前端脚本
function loadEnv(opts) {
  const store = {};
  const sandbox = {
    console: console,
    Promise: Promise, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
    setTimeout: setTimeout, setInterval: function () {}, clearTimeout: clearTimeout, clearInterval: function () {},
    location: {
      protocol: opts.protocol || 'https:',
      hostname: opts.hostname,
      host: opts.hostname,
      search: opts.search || '',
      pathname: '/index.html',
      origin: (opts.protocol || 'https:') + '//' + opts.hostname,
    },
    window: {},
    navigator: {},
    document: {
      addEventListener: function () {},
      querySelector: function () { return null; },
      body: { dataset: {} },
    },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    },
  };
  sandbox.window.location = sandbox.location;
  vm.createContext(sandbox);
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  run('config.js');
  run('mock.js');
  run('demo-data.js');
  run('storage.js');
  run('perf.js');
  run('api-client.js');
  return { sandbox: sandbox, store: store,
    APP_CONFIG: vm.runInContext('APP_CONFIG', sandbox),
    Storage: vm.runInContext('Storage', sandbox),
    Perf: vm.runInContext('Perf', sandbox),
    ApiClient: vm.runInContext('ApiClient', sandbox),
    DB: vm.runInContext('DB', sandbox),
    DEMO_DATA: vm.runInContext('DEMO_DATA', sandbox) };
}

// 6.1 演示模式已撤销：任何域名都恒为 local 模式，demo 种子永不激活
const pub = loadEnv({ hostname: 'demo-user.github.io' });
check('公网域名仍恒为 local 模式（演示已撤销）', pub.APP_CONFIG.mode === 'local' && pub.APP_CONFIG.isDemo === false);
check('demo-data 不再被激活（DB 不替换为 DEMO_DATA）', pub.DB !== pub.DEMO_DATA);
check('公网环境使用 mock.js 种子（id 为数字 / 15 条快递）', pub.DB.user.id === 1 && pub.Storage.getPackages().length === 15);
check('无张同学 / DEMO001 虚拟用户', pub.DB.user.id !== 'DEMO001' && pub.DB.user.name !== '张同学');
const demoStoreKeys = Object.keys(pub.store);
check('localStorage 不出现任何 demo_ 前缀键', demoStoreKeys.every(k => k.indexOf('demo_') !== 0), demoStoreKeys.join(','));
check('本地数据无 DEMOPK 虚拟快递', pub.Storage.getPackages().every(p => !/^DEMOPK/.test(p.id)));
check('种子数据无真实 11 位手机号', !/1[3-9]\d{9}/.test(JSON.stringify(pub.DB)));

// 6.2 本地取件流程（公网域名环境）正常写入本地键
const asyncChecks = [];
const firstPkg = pub.Storage.getPackages().find(p => p.status === 'pending') || pub.Storage.getPackages()[0];
const pr = pub.Storage.confirmPickup(firstPkg.id);
check('本地确认取件成功', pr.success === true);
check('取件状态持久化到本地 packageDB', JSON.parse(pub.store['packageDB']).find(p => p.id === firstPkg.id).status === 'picked');
check('取件记录写入本地 pickupRecordDB', JSON.parse(pub.store['pickupRecordDB'])[0].packageId === firstPkg.id);

// 6.3 localhost 与公网域名行为完全一致（同样 local、同样种子）
const local = loadEnv({ hostname: 'localhost', protocol: 'http:' });
check('localhost 同样为 local 模式', local.APP_CONFIG.mode === 'local' && local.APP_CONFIG.isDemo === false);
check('localhost 存储键不带 demo_ 前缀', 'packageDB' in local.store && !('demo_packageDB' in local.store));
check('两种环境用户一致（均为 mock 种子用户）', local.Storage.getUser().id === pub.Storage.getUser().id);

// 6.4 URL 参数不再能切换演示模式
const forcedDemo = loadEnv({ hostname: 'localhost', search: '?mode=demo' });
check('?mode=demo 已失效（仍为 local）', forcedDemo.APP_CONFIG.mode === 'local' && forcedDemo.APP_CONFIG.isDemo === false);
const forcedLocal = loadEnv({ hostname: 'x.github.io', search: '?mode=local' });
check('公网域名带 ?mode=local 仍为 local', forcedLocal.APP_CONFIG.mode === 'local');

// 6.5 config.js 中演示模式入口已彻底移除
const configSrc = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
check('config.js 不含演示模式横幅文案', configSrc.indexOf('当前为演示模式') === -1 && configSrc.indexOf('数据均为虚拟数据') === -1);
check('config.js 不注入演示 chip / 演示切换 UI（无 demo-chip、无横幅 DOM 注入）',
  configSrc.indexOf('demo-chip') === -1 && configSrc.indexOf('createElement') === -1 &&
  configSrc.indexOf('insertAdjacentHTML') === -1 && configSrc.indexOf('当前为演示模式') === -1);
check('config.js 启动时清除历史演示模式覆盖（campus_mode_override）', configSrc.indexOf("removeItem('campus_mode_override')") !== -1);
check('config.js isDemo 恒为 false 常量', /isDemo:\s*false/.test(configSrc));

// 6.6 每个功能页都在 storage.js 之前引入 config.js，且引入 storage.js 的页面同时引入 demo-data.js
// （本地化升级报告.html 是说明文档；dev-login.html / gray 是刻意自包含的服务器分发页，均不参与本项检查）
const SELF_CONTAINED_PAGES = new Set(['本地化升级报告.html', 'dev-login.html', 'about.html', 'website.html']);
const demoScriptPages = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !SELF_CONTAINED_PAGES.has(f));
let scriptIssues = [];
demoScriptPages.forEach(f => {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const pos = (re) => { const m = html.match(re); return m ? m.index : -1; };
  const pConfig = pos(/<script[^>]*src="config\.js"/);
  const pMock = pos(/<script[^>]*src="mock\.js"/);
  const pDemo = pos(/<script[^>]*src="demo-data\.js"/);
  const pStorage = pos(/<script[^>]*src="storage\.js"/);
  if (pConfig === -1) scriptIssues.push(f + ': 缺少 config.js');
  if (pStorage !== -1) {
    if (!(pConfig < pMock && pMock < pDemo && pDemo < pStorage)) {
      scriptIssues.push(f + ': 脚本顺序错误（应为 config→mock→demo-data→storage）');
    }
  }
});
check('全部页面脚本顺序：config.js → mock.js → demo-data.js → storage.js', scriptIssues.length === 0, scriptIssues.join('; '));

// 6.7 部署卫生：敏感文件/凭证不进入公网
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
check('.gitignore 排除 backend/data.json', gitignore.indexOf('backend/data.json') !== -1);
const backendConfig = fs.readFileSync(path.join(ROOT, 'backend', 'config.js'), 'utf8');
check('backend/config.js 无硬编码快递鸟凭证', /KDNIAO_(EBUSINESS_ID|API_KEY):\s*process\.env/.test(backendConfig) && !/KDNIAO_(EBUSINESS_ID|API_KEY):\s*['"][A-Za-z0-9]{4,}/.test(backendConfig));
check('后端快递鸟凭证改由环境变量注入', backendConfig.indexOf('process.env.KDNIAO_API_KEY') !== -1);
const reportSrc = fs.readFileSync(path.join(ROOT, '本地化升级报告.html'), 'utf8');
check('升级报告已脱敏 Tailscale 内网 IP', reportSrc.indexOf('100.86.') === -1);
const frontBundle = ['mock.js', 'demo-data.js', 'storage.js', 'api.js', 'api-client.js', 'app.js', 'config.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
check('前端代码无 file:// / C:\\ 绝对路径', !/file:\/\/\/|[A-Za-z]:\\\\/.test(frontBundle));

// ---------- 7. 硬件加速层 ----------
console.log('\n[7] 硬件加速层（perf.js / ocr-worker.js / GPU 渲染 / 分片渲染）');
const perfSrc = fs.readFileSync(path.join(ROOT, 'perf.js'), 'utf8');
const mapSrc = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');
const scanSrc = fs.readFileSync(path.join(ROOT, 'scan.html'), 'utf8');
const settingsSrc = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
const foodSrc = fs.readFileSync(path.join(ROOT, 'food.html'), 'utf8');
const pkgSrc = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
const appJsSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// 7.1 能力检测：任何 API 缺失都不崩溃（沙箱 navigator 为空对象）
check('perf.js 在无浏览器能力沙箱中加载不崩溃', typeof pub.Perf === 'object' && pub.Perf !== null);
check('Perf 暴露完整 API（caps/tier/tick/onChange/setMode）',
  typeof pub.Perf.tier === 'function' && typeof pub.Perf.tick === 'function' &&
  typeof pub.Perf.onChange === 'function' && typeof pub.Perf.setMode === 'function' && !!pub.Perf.caps);
check('能力检测逐项 try-catch（检测代码不含裸访问）',
  (perfSrc.match(/try \{ caps\./g) || []).length >= 6);
check('能力缺失时设备评估降为 low（沙箱无任何硬件信息）', pub.Perf.autoLevel === 'low');
check('Debug 面板仅 ?debug=1 显示（生产环境隐藏）', perfSrc.indexOf('debug=1') !== -1 && /isDebug\(\) \|\| document\.getElementById\('perfDebug'\)/.test(perfSrc.replace(/\s+/g, ' ')));

// 7.2 三档质量档位参数
const T = pub.Perf.TIERS;
check('三档性能等级（high/medium/low）齐全', !!T.high && !!T.medium && !!T.low);
check('DPR 上限分级（high 2 / medium 1.5 / low 1）', T.high.dprCap === 2 && T.medium.dprCap === 1.5 && T.low.dprCap === 1);
check('阴影分级（low 关闭阴影 + 512 阴影贴图）', T.high.shadows === true && T.low.shadows === false && T.low.shadowMapSize === 512);
check('扫码频率分级（200/250/350ms，非逐帧识别）', T.high.scanInterval === 200 && T.medium.scanInterval === 250 && T.low.scanInterval === 350);
check('OCR 频率分级（低配 5000ms）', T.high.ocrInterval === 3200 && T.low.ocrInterval === 5000);
check('帧率上限分级（low 限 30fps）', T.high.fpsCap === 60 && T.low.fpsCap === 30);

// 7.3 用户性能模式（自动 / 省电 / 高性能）
check('storage.js 默认 perfMode 为 auto', pub.Storage.getSettings().perfMode === 'auto');
check('省电模式强制 low 档', (pub.Perf.setMode('saver'), pub.Perf.tierKey()) === 'low');
check('高性能模式强制 high 档', (pub.Perf.setMode('perf'), pub.Perf.tierKey()) === 'high');
check('非法模式被忽略', (pub.Perf.setMode('hack'), pub.Perf.tierKey()) === 'high');
check('自动模式回到设备评估档位', (pub.Perf.setMode('auto'), pub.Perf.tierKey()) === pub.Perf.autoLevel);
check('settings.html 提供性能模式三选项', settingsSrc.indexOf('data-perf="auto"') !== -1 && settingsSrc.indexOf('data-perf="saver"') !== -1 && settingsSrc.indexOf('data-perf="perf"') !== -1);
check('settings.html 切换时调用 Perf.setMode 并持久化', settingsSrc.indexOf('Perf.setMode(mode)') !== -1 && /setPerfMode[\s\S]{0,400}saveSettings/.test(settingsSrc));

// 7.4 FPS Governor：连续掉帧自动降档 + onChange 通知
let govEvents = [];
pub.Perf.setMode('perf');                 // 回到 high 档
pub.Perf.onChange(function (key, tier, byGov) { if (byGov) govEvents.push(key); });
pub.Perf.tick(1000);                      // 初始化采样起点
pub.Perf.tick(2500);                      // 1.5s 内 1 帧 → fps≈1，badSamples=1
pub.Perf.tick(4000);                      // 再 1 帧 → badSamples=2 → 降档
check('连续掉帧触发 Governor 自动降档', pub.Perf.tierKey() === 'medium', '当前档位 ' + pub.Perf.tierKey());
check('Governor 降档通过 onChange 通知渲染层', govEvents.indexOf('medium') !== -1);

// 7.5 3D 地图 GPU 集成（map.html）
check('map.html 引入 perf.js 且位于 storage.js 之后', mapSrc.indexOf('src="perf.js"') > mapSrc.indexOf('src="storage.js"'));
check('3D 地图按档位设置 DPR 上限', mapSrc.indexOf('M3.tier.dprCap') !== -1);
check('3D 地图按档位控制阴影与阴影贴图', mapSrc.indexOf('M3.tier.shadows') !== -1 && mapSrc.indexOf('M3.tier.shadowMapSize') !== -1);
check('建筑/树/路灯使用 InstancedMesh 合批', (mapSrc.match(/new THREE\.InstancedMesh/g) || []).length >= 6);
check('渲染循环接入 FPS Governor（Perf.tick）', mapSrc.indexOf('Perf.tick(') !== -1);
check('档位变化动态生效（Perf.onChange + 阴影贴图重建）', mapSrc.indexOf('Perf.onChange(') !== -1 && mapSrc.indexOf('shadow.map.dispose()') !== -1);
check('渲染循环按 fpsCap 限帧（不强制高帧率）', mapSrc.indexOf('fpsCap') !== -1 && mapSrc.indexOf('1000 / fpsCap') !== -1);
check('低档设备跳过次要动画（detail 抽稀树/路灯）', mapSrc.indexOf('detailStep') !== -1 && mapSrc.indexOf('lowDetail') !== -1);

// 7.6 扫码 / OCR 流水线（scan.html + ocr-worker.js）
check('scan.html 引入 perf.js 且位于 storage.js 之后', scanSrc.indexOf('src="perf.js"') > scanSrc.indexOf('src="storage.js"'));
check('扫码/OCR 频率按档位读取', scanSrc.indexOf('SCAN.scanInterval') !== -1 && scanSrc.indexOf('SCAN.ocrInterval') !== -1);
check('二维码识别只分析扫描框区域（cropScanFrame）', scanSrc.indexOf('function cropScanFrame(') !== -1 && scanSrc.indexOf('detector.detect(SCAN.video)') === -1);
check('识别成功立即停止分析（pauseScan）', /onDecoded[\s\S]{0,200}pauseScan\(\)/.test(scanSrc) && /onOcrText[\s\S]{0,400}pauseScan\(\)/.test(scanSrc));
const ocrWorkerSrc = fs.readFileSync(path.join(ROOT, 'ocr-worker.js'), 'utf8');
check('ocr-worker.js 独立 Worker（零 Node 依赖 / 无 require）', ocrWorkerSrc.indexOf('self.onmessage') !== -1 && !/\brequire\(/.test(ocrWorkerSrc));
check('ocr-worker.js 使用 OffscreenCanvas + ImageBitmap 零拷贝传输', ocrWorkerSrc.indexOf('OffscreenCanvas') !== -1 && ocrWorkerSrc.indexOf('transferToImageBitmap') !== -1 && ocrWorkerSrc.indexOf(', [out]') !== -1);
check('scan.html 主线程只做抓帧，预处理走 Worker', scanSrc.indexOf("new Worker('ocr-worker.js')") !== -1 && scanSrc.indexOf('preprocessForOcr') !== -1);
check('Worker 不可用时回退主线程同步预处理', scanSrc.indexOf('binarizeCanvasSync') !== -1);

// 7.7 动画 GPU 化与列表分片
check('扫描框改四角呼吸灯（cornerBreath，旧绿色扫描线已移除）', scanSrc.indexOf('@keyframes cornerBreath') !== -1 && scanSrc.indexOf('translateY(230px)') === -1);
const cssSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
// 关键帧体含一层嵌套（0%/from/to 选择器），需嵌套感知正则
const kfBlocks = cssSrc.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*\s*[^{}]*\}/g) || [];
const badKf = kfBlocks.filter(b => /\b(top|left|right|bottom|width|height|margin|padding)\s*:/.test(b));
check('styles.css 关键帧动画均使用合成器属性（transform/opacity）', kfBlocks.length >= 4 && badKf.length === 0, badKf.map(b => b.split('{')[0].trim()).join(', '));
check('App.renderChunked 分片渲染助手存在', appJsSrc.indexOf('renderChunked:') !== -1 && appJsSrc.indexOf('requestIdleCallback') !== -1);
check('快递列表大列表分片渲染', pkgSrc.indexOf('App.renderChunked(listEl') !== -1);
check('外卖店铺列表大列表分片渲染', foodSrc.indexOf('App.renderChunked(listEl') !== -1);
check('骑手/配送动画在统一 rAF 渲染循环内', mapSrc.indexOf('requestAnimationFrame(animate)') !== -1 && mapSrc.indexOf('M3.delivery.rider') !== -1);

// 7.8 全部引入 perf.js 的页面均在 storage.js 之后加载（加载顺序约定）
let perfOrderIssues = [];
fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const pPerf = html.indexOf('src="perf.js"');
  if (pPerf !== -1 && pPerf < html.indexOf('src="storage.js"')) perfOrderIssues.push(f);
});
check('perf.js 加载顺序全部正确（storage.js 之后）', perfOrderIssues.length === 0, perfOrderIssues.join(', '));

// ---------- 8. PWA 离线缓存与体验增强 ----------
console.log('\n[8] PWA 离线缓存（manifest/sw.js）+ 记录分片 + WebGPU 实验');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
check('manifest.json 基本字段完整（name/start_url/scope/display）',
  !!manifest.name && manifest.start_url === './index.html' && manifest.scope === './' && manifest.display === 'standalone');
check('manifest 图标覆盖 192/512/maskable',
  manifest.icons.some(i => i.sizes === '192x192' && i.type === 'image/png') &&
  manifest.icons.filter(i => i.sizes === '512x512').length >= 2 &&
  manifest.icons.some(i => i.purpose === 'maskable'));
const icon192 = fs.readFileSync(path.join(ROOT, 'assets', 'icons', 'pwa-192.png'));
const icon512 = fs.readFileSync(path.join(ROOT, 'assets', 'icons', 'pwa-512.png'));
check('PWA PNG 图标真实有效（PNG 签名 + 非空）',
  icon192.length > 100 && icon512.length > 100 &&
  icon192.slice(1, 4).toString('ascii') === 'PNG' && icon512.slice(1, 4).toString('ascii') === 'PNG');

const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js 版本化缓存并在 activate 清理旧缓存',
  /CACHE_NAME = 'campus-life-' \+ VERSION/.test(swSrc) && swSrc.indexOf('caches.delete') !== -1);
check('sw.js 预缓存 App 外壳（页面/perf.js/ocr-worker.js/Three.js/jsQR）',
  swSrc.indexOf("'./index.html'") !== -1 && swSrc.indexOf("'./perf.js'") !== -1 &&
  swSrc.indexOf("'./ocr-worker.js'") !== -1 && swSrc.indexOf("'./libs/three/three.min.js'") !== -1 &&
  swSrc.indexOf("'./libs/qr-scanner/jsQR.js'") !== -1);
check('sw.js 业务接口永不缓存（/api/ /upload 跳过）', swSrc.indexOf('/api/') !== -1 && swSrc.indexOf('/upload') !== -1);
check('sw.js 页面导航网络优先 + 离线回退缓存',
  /req\.mode === 'navigate'[\s\S]{0,200}fetch\(req\)[\s\S]{0,400}caches\.match\(req, \{ ignoreSearch: true \}\)/.test(swSrc));
check('sw.js 静态资源缓存优先 + 后台更新', swSrc.indexOf('cache.put(req, res.clone())') !== -1);
check('sw.js 预缓存单资源失败不阻断安装（catch 容忍）', /cache\.add\([\s\S]{0,80}\.catch/.test(swSrc));
check('sw.js 零依赖纯标准能力（无 require/fetch 依赖库）', swSrc.indexOf('self.addEventListener') !== -1 && !/\brequire\(/.test(swSrc));
check('app.js 注册 SW（仅 HTTPS/localhost，失败静默降级）',
  appJsSrc.indexOf("navigator.serviceWorker.register('./sw.js')") !== -1 &&
  appJsSrc.indexOf("location.protocol === 'https:'") !== -1);

const pwaPages = ['index.html', 'login.html', 'packages.html', 'food.html', 'food-detail.html', 'order.html',
  'scan.html', 'map.html', 'settings.html', 'track.html', 'messages.html', 'profile.html',
  'profile-edit.html', 'records.html', 'detail.html'];
const missingPwaHead = pwaPages.filter(f => {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return h.indexOf('href="./manifest.json"') === -1 ||
    h.indexOf('name="theme-color"') === -1 || h.indexOf('apple-touch-icon') === -1;
});
check('15 个页面均接入 manifest/theme-color/apple-touch-icon（相对路径）', missingPwaHead.length === 0, missingPwaHead.join(', '));

const recSrc = fs.readFileSync(path.join(ROOT, 'records.html'), 'utf8');
check('取件记录列表接入分片渲染（日期头+记录卡展开）',
  recSrc.indexOf('App.renderChunked(list, items') !== -1 && recSrc.indexOf('it.header') !== -1);
check('WebGPU 探测仅采集适配器信息（perf.js probeWebGPU）',
  perfSrc.indexOf('probeWebGPU') !== -1 && perfSrc.indexOf('requestAdapter') !== -1);
check('地图页 WebGPU 实验开关仅 debug 模式可见', mapSrc.indexOf('if (Perf.isDebug()) initWebGPUExperiment()') !== -1);
check('WebGPU 开关不强制切换渲染（仅预留计算通道）',
  mapSrc.indexOf("typeof THREE.WebGPURenderer === 'function'") !== -1 && mapSrc.indexOf('M3.webgpu = info') !== -1);

// ---------- 9. 灰度测试隔离（Phase 7 加固） ----------
console.log('\n[9] 灰度测试隔离（.env / 微信占位 / 友好降级 / 脱敏 / 灰度门禁 / 管理台）');

// 9.1 .env.example 模板齐全
const envExample = fs.readFileSync(path.join(ROOT, 'backend', '.env.example'), 'utf8');
check('.env.example 存在', envExample.length > 0);
check('.env.example 含 SMS_SECRET 占位', envExample.indexOf('TENCENT_SMS_SECRET_ID=') !== -1 && envExample.indexOf('TENCENT_SMS_SECRET_KEY=') !== -1);
check('.env.example 含 WECHAT_SECRET 占位', envExample.indexOf('WECHAT_APP_SECRET=') !== -1);
check('.env.example 含 COURIER_API_KEY 占位', envExample.indexOf('KDNIAO_API_KEY=') !== -1);
check('.env.example 含 DATABASE_PATH 占位', envExample.indexOf('DATABASE_PATH=') !== -1);
check('.env.example 含 ENVIRONMENT 三态说明', envExample.indexOf('development') !== -1 && envExample.indexOf('gray') !== -1 && envExample.indexOf('production') !== -1);

// 9.2 灰度方案文档齐全
const grayDoc = fs.readFileSync(path.join(ROOT, '灰度方案.md'), 'utf8');
check('灰度方案.md 存在', grayDoc.length > 0);
const grayDocSections = ['1. 灰度用户范围', '2. 接入服务', '3. API 清单', '4. 数据结构', '5. 安全措施', '6. 灰度指标', '7. 风险', '8. 回滚方案', '9. 第三方接口依赖', '10. 上线前检查清单'];
check('灰度方案.md 含 10 个章节', grayDocSections.every(s => grayDoc.indexOf(s) !== -1));
check('灰度方案.md 含三阶段灰度表', grayDoc.indexOf('wave1') !== -1 && grayDoc.indexOf('wave2') !== -1 && grayDoc.indexOf('wave3') !== -1);
check('灰度方案.md 含回滚至 Demo 模式', grayDoc.indexOf('ENVIRONMENT=development') !== -1 && grayDoc.indexOf('一键回滚') !== -1);

// 9.3 微信登录占位（不伪造授权成功）
const authRouteSrc = fs.readFileSync(path.join(ROOT, 'backend', 'routes', 'auth.js'), 'utf8');
check('auth.js 含微信 qrcode 占位路由', authRouteSrc.indexOf("router.get('/wechat/qrcode'") !== -1);
check('auth.js 含微信 callback 占位路由', authRouteSrc.indexOf("router.get('/wechat/callback'") !== -1);
check('auth.js 含微信 status 查询路由', authRouteSrc.indexOf("router.get('/wechat/status'") !== -1);
check('微信占位未启用时返回 503 文案', authRouteSrc.indexOf('微信登录暂未开放') !== -1 && authRouteSrc.indexOf('请使用手机号登录') !== -1);
check('微信占位不伪造成功授权', authRouteSrc.indexOf('WECHAT_LOGIN_ENABLED') !== -1 && authRouteSrc.indexOf('请使用手机号登录') !== -1);

// 9.4 灰度门禁中间件
const grayMwSrc = fs.readFileSync(path.join(ROOT, 'backend', 'middleware', 'gray.js'), 'utf8');
check('gray.js 导出 grayRequired + grayOptional', grayMwSrc.indexOf('grayRequired') !== -1 && grayMwSrc.indexOf('grayOptional') !== -1);
check('grayRequired 校验登录 + 灰度名单 + 过期', grayMwSrc.indexOf('req.userId') !== -1 && grayMwSrc.indexOf('getGrayUserByUserId') !== -1 && grayMwSrc.indexOf('expires_at') !== -1);
check('grayRequired 未登录返回 401 + 友好文案', grayMwSrc.indexOf('401') !== -1 && grayMwSrc.indexOf('请先登录') !== -1);
check('grayRequired 非灰度用户返回 403 + demo 提示', grayMwSrc.indexOf('403') !== -1 && grayMwSrc.indexOf('演示模式') !== -1);
check('grayRequired 过期返回 403 + 过期文案', grayMwSrc.indexOf('灰度资格已过期') !== -1);

// 9.5 友好降级文案表（errorHandler.js）
const errHandlerSrc = fs.readFileSync(path.join(ROOT, 'backend', 'middleware', 'errorHandler.js'), 'utf8');
check('errorHandler 含 ECONNREFUSED 友好文案', errHandlerSrc.indexOf('服务暂时不可用') !== -1);
check('errorHandler 含 outbound_expired 友好文案', errHandlerSrc.indexOf('出库码已过期') !== -1);
check('errorHandler 含 courier_unavailable 友好文案', errHandlerSrc.indexOf('快递信息暂时无法获取') !== -1);
check('errorHandler 含 sms_failed 友好文案', errHandlerSrc.indexOf('验证码发送失败') !== -1);
check('errorHandler 含 wechat_failed 友好文案', errHandlerSrc.indexOf('微信授权失败') !== -1);
check('errorHandler 含 scan_invalid 友好文案', errHandlerSrc.indexOf('该取件码不属于当前用户') !== -1);
check('errorHandler 原始堆栈入日志不外泄', errHandlerSrc.indexOf('logger.error') !== -1 && errHandlerSrc.indexOf('err.stack') !== -1);

// 9.6 手机号脱敏
const maskSrc = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'mask.js'), 'utf8');
check('mask.js 提供 maskPhone', maskSrc.indexOf('function maskPhone') !== -1);
check('mask.js 提供 maskIp', maskSrc.indexOf('function maskIp') !== -1);
check('mask.js 提供 maskSecrets', maskSrc.indexOf('function maskSecrets') !== -1);
check('maskPhone 保留前 3 后 4', maskSrc.indexOf('PHONE_MASK_KEEP_HEAD') !== -1 && maskSrc.indexOf('PHONE_MASK_KEEP_TAIL') !== -1);

// 9.7 指标采集（8 事件 + 手机号脱敏入库）
const metricsSrc = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'metrics.js'), 'utf8');
check('metrics.js 提供 start/stop/wrap/record', ['start', 'stop', 'wrap', 'record'].every(m => metricsSrc.indexOf(m + ':') !== -1 || metricsSrc.indexOf(m + ' =') !== -1 || metricsSrc.indexOf('function ' + m) !== -1));
check('metrics.js 含 8 类事件常量', ['sms_send', 'sms_verify', 'login', 'courier_sync', 'pickup_code', 'outbound_refresh', 'scan_verify', 'pickup_complete'].every(e => metricsSrc.indexOf(e) !== -1));
check('metrics.js 入库 phone_masked 字段', metricsSrc.indexOf('phone_masked') !== -1);

// 9.8 Provider 工厂回退
const courierProviderIdxSrc = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'courierProvider', 'index.js'), 'utf8');
check('courierProvider/index.js 工厂 getProvider', courierProviderIdxSrc.indexOf('getProvider') !== -1);
check('courierProvider/index.js 工厂未知 provider 回退 kdniao', courierProviderIdxSrc.indexOf('回退') !== -1 && courierProviderIdxSrc.indexOf('kdniao') !== -1);
const kdniaoProviderSrc = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'courierProvider', 'kdniaoProvider.js'), 'utf8');
check('kdniaoProvider 含 capabilities 字段', kdniaoProviderSrc.indexOf('capabilities') !== -1);
check('kdniaoProvider trackByNumber 能力 true', kdniaoProviderSrc.indexOf('trackByNumber: true') !== -1);
check('kdniaoProvider getOutboundCode 能力 false（不支持）', kdniaoProviderSrc.indexOf('getOutboundCode: false') !== -1);

const smsProviderIdxSrc = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'smsProvider', 'index.js'), 'utf8');
check('smsProvider/index.js 工厂 getProvider', smsProviderIdxSrc.indexOf('getProvider') !== -1);
check('smsProvider 工厂按 SMS_PROVIDER 切换', smsProviderIdxSrc.indexOf('SMS_PROVIDER') !== -1);
check('smsProvider 默认回退 console', smsProviderIdxSrc.indexOf('console') !== -1);

// 9.8.1 腾讯云短信真实实现（零依赖，TC3-HMAC-SHA256 签名直连）
const tencentProviderSrc = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'smsProvider', 'tencentProvider.js'), 'utf8');
check('tencentProvider 已从占位升级为真实实现（无占位警告）',
  tencentProviderSrc.indexOf('SDK 未启用') === -1 && tencentProviderSrc.indexOf('取消注释') === -1);
check('tencentProvider 零第三方依赖（仅内置 https + crypto）',
  /require\('https'\)/.test(tencentProviderSrc) && /require\('crypto'\)/.test(tencentProviderSrc) &&
  tencentProviderSrc.indexOf("require('tencentcloud-sdk") === -1);
check('tencentProvider 指向 sms.tencentcloudapi.com', tencentProviderSrc.indexOf('sms.tencentcloudapi.com') !== -1);
check('tencentProvider 使用 API3.0 SendSms / 2021-01-11',
  tencentProviderSrc.indexOf("'SendSms'") !== -1 && tencentProviderSrc.indexOf('2021-01-11') !== -1);
check('tencentProvider 实现 TC3-HMAC-SHA256 签名',
  tencentProviderSrc.indexOf('TC3-HMAC-SHA256') !== -1 &&
  tencentProviderSrc.indexOf("'TC3' + secretKey") !== -1 &&
  tencentProviderSrc.indexOf('tc3_request') !== -1);
check('tencentProvider 请求含 SmsSdkAppId/SignName/TemplateId/TemplateParamSet',
  ['SmsSdkAppId', 'SignName', 'TemplateId', 'TemplateParamSet'].every(function (k) {
    return tencentProviderSrc.indexOf(k) !== -1;
  }));
check('tencentProvider 手机号自动补 +86 国家码', tencentProviderSrc.indexOf("'+86' + phone") !== -1);
check('tencentProvider 以 SendStatusSet[0].Code === Ok 判定成功',
  /SendStatusSet/.test(tencentProviderSrc) && /status\.Code === 'Ok'/.test(tencentProviderSrc));
check('tencentProvider 凭证不全时拒绝发送（不假装成功）',
  /hasCredentials[\s\S]{0,400}ok:\s*false/.test(tencentProviderSrc));
check('tencentProvider 频控错误码给用户友好文案',
  tencentProviderSrc.indexOf('LimitExceeded.PhoneNumber') !== -1 &&
  tencentProviderSrc.indexOf('验证码发送过于频繁') !== -1);
check('tencentProvider 日志对手机号脱敏', tencentProviderSrc.indexOf('mask.maskPhone') !== -1);
check('tencentProvider 请求有超时保护', /timeout:\s*(?:REQUEST_TIMEOUT_MS|\d+)/.test(tencentProviderSrc));

// 9.8.2 .env 零依赖加载（必须在 config 之前，且不覆盖真实环境变量）
const loadEnvSrc = fs.readFileSync(path.join(ROOT, 'backend', 'load-env.js'), 'utf8');
check('load-env.js 存在且零依赖（不 require dotenv）',
  loadEnvSrc.indexOf("require('fs')") !== -1 && loadEnvSrc.indexOf("require('dotenv')") === -1);
check('load-env.js 不覆盖已存在的环境变量', loadEnvSrc.indexOf('process.env[key] === undefined') !== -1);
const serverHeadForEnv = fs.readFileSync(path.join(ROOT, 'backend', 'server.js'), 'utf8').slice(0, 600);
check('server.js 在 require config 之前加载 .env',
  serverHeadForEnv.indexOf("require('./load-env')") !== -1 &&
  serverHeadForEnv.indexOf("require('./load-env')") < serverHeadForEnv.indexOf("require('./config')"));

// 9.8.3 Windows 登录自启脚本
const startCmdSrc = fs.readFileSync(path.join(ROOT, 'backend', 'start-backend.cmd'), 'utf8');
check('start-backend.cmd 调 node server.js',
  /nodejs\\node\.exe/.test(startCmdSrc) && /"%NODE_EXE%"\s+server\.js/.test(startCmdSrc));
check('start-backend.cmd 日志重定向到 logs/autostart.log', startCmdSrc.indexOf('logs\\autostart.log') !== -1);
check('start-backend.cmd 纯 ASCII（避免 cmd GBK 解析中文乱码）', /[^\x00-\x7F]/.test(startCmdSrc) === false);
const envExampleSrc = fs.readFileSync(path.join(ROOT, 'backend', '.env.example'), 'utf8');
check('.env.example 含腾讯短信 5 个配置键',
  ['TENCENT_SMS_SECRET_ID', 'TENCENT_SMS_SECRET_KEY', 'TENCENT_SMS_SDK_APP_ID',
   'TENCENT_SMS_SIGN_NAME', 'TENCENT_SMS_TEMPLATE_ID'].every(function (k) {
    return envExampleSrc.indexOf(k) !== -1;
  }));

// 9.8.4 性能与瘦身：gzip/缓存/证书持久化/数据保留期清理/keep-alive/旧静态服务器下线
const serverPerfSrc = fs.readFileSync(path.join(ROOT, 'backend', 'server.js'), 'utf8');
check('server.js 零依赖 gzip（内置 zlib，无 compression 包）',
  serverPerfSrc.indexOf("require('zlib')") !== -1 &&
  serverPerfSrc.indexOf('createGzip') !== -1 &&
  serverPerfSrc.indexOf("require('compression')") === -1);
check('gzip 仅对接受 gzip 的 GET/HEAD 生效', serverPerfSrc.indexOf("'accept-encoding'") !== -1);
check('gzip 背压双向传递（socket drain + 上游 res drain 转发，防大文件挂起）',
  /gz\.on\('data'[\s\S]{0,200}gz\.pause\(\)/.test(serverPerfSrc) &&
  /gz\.on\('drain'[\s\S]{0,80}res\.emit\('drain'\)/.test(serverPerfSrc));
check('静态资源差异化缓存（库 7 天强缓存 + HTML no-cache）',
  serverPerfSrc.indexOf('max-age=604800') !== -1 &&
  /LONG_CACHE_EXT[\s\S]{0,400}no-cache/.test(serverPerfSrc));
check('自签证书持久化到 backend/certs 并在 IP 变化时续签',
  serverPerfSrc.indexOf("path.join(__dirname, 'certs')") !== -1 &&
  serverPerfSrc.indexOf('certCoversIps') !== -1);
check('HTTPS keep-alive 延长（减少手机端重复 RSA 握手）',
  /keepAliveTimeout\s*=\s*15000/.test(serverPerfSrc));
check('数据保留期清理已调度（启动一次 + 每天一次，unref 不阻止退出）',
  serverPerfSrc.indexOf('db.purgeOldData') !== -1 &&
  /setTimeout\(runPurge[\s\S]{0,40}\)\.unref\(\)/.test(serverPerfSrc) &&
  /setInterval\(runPurge[\s\S]{0,80}\)\.unref\(\)/.test(serverPerfSrc));
const sqlitePerfSrc = fs.readFileSync(path.join(ROOT, 'backend', 'db', 'sqlite.js'), 'utf8');
check('sqlite.js 含 purgeOldData 三表清理（验证码/指标/错误日志）',
  sqlitePerfSrc.indexOf('purgeOldData') !== -1 &&
  ['verification_codes', 'metrics_events', 'error_logs'].every(function (t) {
    return new RegExp('DELETE FROM ' + t).test(sqlitePerfSrc);
  }));
check('SQLite WAL 下调 synchronous=NORMAL + busy_timeout（降磁盘负载/防锁）',
  sqlitePerfSrc.indexOf('PRAGMA synchronous = NORMAL') !== -1 &&
  sqlitePerfSrc.indexOf('PRAGMA busy_timeout') !== -1);
const metricsSrc2 = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'metrics.js'), 'utf8');
check('metrics inFlight 有 TTL 兜底回收（防挂死请求泄漏内存）',
  /INFLIGHT_TTL_MS[\s\S]{0,300}inFlight\.delete\(id\)/.test(metricsSrc2));
check('.gitignore 排除 backend/certs/ 私钥与证书',
  fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').indexOf('backend/certs/') !== -1);
check('旧的零依赖根 server.js 已下线（静态站点统一由后端提供）',
  fs.existsSync(path.join(ROOT, 'server.js')) === false);
const rootPkgSrc = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
check('根 package.json start 指向 backend/server.js',
  /"start"\s*:\s*"node backend\/server\.js"/.test(rootPkgSrc));

// 9.9 admin 路由鉴权 + 9 路由
const adminRouteSrc = fs.readFileSync(path.join(ROOT, 'backend', 'routes', 'admin.js'), 'utf8');
check('admin.js router.use adminRequired 前置鉴权', adminRouteSrc.indexOf("router.use(adminRequired)") !== -1 || adminRouteSrc.indexOf('router.use(require') !== -1);
const adminRoutes = ['/health', '/metrics', '/errors', '/gray-users', '/users'];
check('admin.js 含 5 类核心路由', adminRoutes.every(r => adminRouteSrc.indexOf(r) !== -1));
check('admin.js POST 添加灰度用户', adminRouteSrc.indexOf("router.post('/gray-users'") !== -1);
check('admin.js PUT 启用禁用灰度用户', adminRouteSrc.indexOf("router.put('/gray-users/:id'") !== -1);
check('admin.js DELETE 移出灰度名单', adminRouteSrc.indexOf("router.delete('/gray-users/:id'") !== -1);
check('admin.js 灰度名单手机号脱敏', adminRouteSrc.indexOf('maskPhone') !== -1 || adminRouteSrc.indexOf('mask.maskPhone') !== -1);
check('admin.js 用户列表手机号脱敏', /users[\s\S]{0,500}maskPhone/.test(adminRouteSrc) || /users[\s\S]{0,500}mask\.maskPhone/.test(adminRouteSrc));

// 9.10 扫码闭环：scanVerify + scanConfirm 二次校验
const scanRouteSrc = fs.readFileSync(path.join(ROOT, 'backend', 'routes', 'scan.js'), 'utf8');
check('scan.js POST /verify 校验取件码归属', scanRouteSrc.indexOf("router.post('/verify'") !== -1);
check('scan.js POST /confirm 置 picked 状态', scanRouteSrc.indexOf("router.post('/confirm'") !== -1 && scanRouteSrc.indexOf('picked') !== -1);
check('scan.js 前置 grayRequired 强门禁', scanRouteSrc.indexOf('grayRequired') !== -1);
check('scan.js 不直接信任 OCR 结果（后端二次校验归属）', scanRouteSrc.indexOf('getPackageById') !== -1 && scanRouteSrc.indexOf('user_id') !== -1 && scanRouteSrc.indexOf('req.userId') !== -1);
check('scan.js 抛 scan_invalid BusinessError 拒绝他人取件码', scanRouteSrc.indexOf('scan_invalid') !== -1 && scanRouteSrc.indexOf('BusinessError') !== -1);

// 9.11 SQLite schema 8 表完整
const schemaSrc = fs.readFileSync(path.join(ROOT, 'backend', 'db', 'schema.sql'), 'utf8');
const schemaTables = ['users', 'gray_users', 'verification_codes', 'packages', 'package_tracking', 'outbound_codes', 'metrics_events', 'error_logs'];
check('schema.sql 含 8 张表', schemaTables.every(t => schemaSrc.indexOf('CREATE TABLE IF NOT EXISTS ' + t) !== -1));
check('schema.sql users 表含 environment 字段', /CREATE TABLE[\s\S]+users[\s\S]+environment/.test(schemaSrc));
check('schema.sql gray_users 表含 enabled + expires_at', /CREATE TABLE[\s\S]+gray_users[\s\S]+enabled[\s\S]+expires_at/.test(schemaSrc));
check('schema.sql outbound_codes 表含 source + status + expires_at', /CREATE TABLE[\s\S]+outbound_codes[\s\S]+source[\s\S]+status[\s\S]+expires_at/.test(schemaSrc));
check('schema.sql metrics_events 含 phone_masked 字段', /CREATE TABLE[\s\S]+metrics_events[\s\S]+phone_masked/.test(schemaSrc));
check('schema.sql verification_codes 含 attempts 防爆破字段', /CREATE TABLE[\s\S]+verification_codes[\s\S]+attempts/.test(schemaSrc));

// 9.12 前端 api-client.js 灰度方法 + demo 覆盖
const apiClientSrc = fs.readFileSync(path.join(ROOT, 'api-client.js'), 'utf8');
check('api-client.js 含 getPickupCode 方法', apiClientSrc.indexOf('getPickupCode') !== -1);
check('api-client.js 含 getOutboundCode 方法', apiClientSrc.indexOf('getOutboundCode') !== -1);
check('api-client.js 含 scanVerify 方法', apiClientSrc.indexOf('scanVerify') !== -1);
check('api-client.js 含 scanConfirm 方法', apiClientSrc.indexOf('scanConfirm') !== -1);
check('api-client.js demo 模式覆盖新接口（APP_CONFIG.isDemo 分支）', apiClientSrc.indexOf('APP_CONFIG.isDemo') !== -1 && apiClientSrc.indexOf('DEMO') !== -1);

// 9.13 scan.html 灰度模式校验
check('scan.html 含 isGrayScan 判断', scanSrc.indexOf('isGrayScan') !== -1);
check('scan.html 含 grayVerifyPickupCode', scanSrc.indexOf('grayVerifyPickupCode') !== -1);
check('scan.html 含 grayConfirmPickup', scanSrc.indexOf('grayConfirmPickup') !== -1);
check('scan.html 加载 api-client.js', scanSrc.indexOf('api-client.js') !== -1);
check('scan.html 灰度模式调 scanVerify 二次校验', /grayVerifyPickupCode[\s\S]{0,400}scanVerify/.test(scanSrc));
check('scan.html 非灰度模式回退本地 API.confirmPickup', scanSrc.indexOf('API.confirmPickup') !== -1);

// 9.14 admin.html 单页应用
const adminHtmlSrc = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
check('admin.html 存在', adminHtmlSrc.length > 0);
check('admin.html 加载 config.js + api-client.js', adminHtmlSrc.indexOf('config.js') !== -1 && adminHtmlSrc.indexOf('api-client.js') !== -1);
check('admin.html 含 5 Tab（总览/指标/异常/灰度/用户）',
  ['总览', '指标', '异常', '灰度', '用户'].every(s => adminHtmlSrc.indexOf(s) !== -1));
check('admin.html 含登录卡片', adminHtmlSrc.indexOf('登录') !== -1 && adminHtmlSrc.indexOf('验证码') !== -1);

// 9.15 .gitignore 安全
const gitignoreSrc = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
check('.gitignore 排除 .env', gitignoreSrc.indexOf('.env') !== -1);
check('.gitignore 排除 backend/data/', gitignoreSrc.indexOf('backend/data/') !== -1 || gitignoreSrc.indexOf('backend/data') !== -1);
check('.gitignore 排除 *.sqlite', gitignoreSrc.indexOf('*.sqlite') !== -1);
check('.gitignore 排除 secrets/', gitignoreSrc.indexOf('secrets/') !== -1);
check('.gitignore 排除 logs/', gitignoreSrc.indexOf('logs/') !== -1);

// ============================================================
// [10] 问题反馈系统 + 灰度/开发者双入口访问隔离（防拆包）
// ============================================================
(function () {
console.log('\n[10] 问题反馈系统 + 灰度/开发者双入口访问隔离');

// 10.1 settings 入口（已迁至个人中心）+ feedback.html 表单
const settingsSrc = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
check('settings.html 已移除「问题反馈」入口（迁至个人中心）',
  settingsSrc.indexOf('href="feedback.html"') === -1 && settingsSrc.indexOf('问题反馈') === -1);
const profileFeedbackSrc = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
check('profile.html 含「反馈建议」入口跳 feedback.html',
  profileFeedbackSrc.indexOf('反馈建议') !== -1 && profileFeedbackSrc.indexOf("location.href='feedback.html'") !== -1);

const feedbackHtmlSrc = fs.readFileSync(path.join(ROOT, 'feedback.html'), 'utf8');
['功能异常', '界面问题', '使用建议', '快递问题', '扫码问题', '外卖问题', '地图问题', '其他'].forEach(function (t) {
  check('feedback.html 含反馈类型 ' + t, feedbackHtmlSrc.indexOf(t) !== -1);
});
check('feedback.html 文本框 maxlength=500 + 实时计数 0/500',
  feedbackHtmlSrc.indexOf('maxlength="500"') !== -1 && feedbackHtmlSrc.indexOf('/ 500') !== -1);
check('feedback.html 截图 accept 限 PNG/JPG/WEBP',
  feedbackHtmlSrc.indexOf('accept="image/png,image/jpeg,image/webp"') !== -1);
check('feedback.html 限制最多 3 张截图', feedbackHtmlSrc.indexOf('最多 3 张') !== -1);
check('feedback.html 演示环境提示不发送生产',
  feedbackHtmlSrc.indexOf('当前为演示环境，反馈不会发送到生产系统') !== -1);
check('feedback.html 成功态返回个人中心',
  feedbackHtmlSrc.indexOf('反馈提交成功') !== -1 && feedbackHtmlSrc.indexOf("location.href='profile.html'") !== -1);
check('feedback.html 加载 config/storage/api-client/app 脚本链',
  ['config.js', 'storage.js', 'api-client.js', 'app.js'].every(function (s) { return feedbackHtmlSrc.indexOf(s) !== -1; }));

// 10.2 api-client 反馈方法 + demo 覆盖
check('api-client.js 含 submitFeedback', apiClientSrc.indexOf('submitFeedback') !== -1);
check('api-client.js 含 getMyFeedback', apiClientSrc.indexOf('getMyFeedback') !== -1);
check('api-client.js demo 模式反馈落 demo_feedbackDB', apiClientSrc.indexOf('demo_feedbackDB') !== -1);
check('config.js 含 appVersion v0.2.0-gray',
  fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').indexOf('v0.2.0-gray') !== -1);

// 10.3 gray/index.html：灰度唯一对外分发页，必须自包含防拆包
const graySrc = fs.readFileSync(path.join(ROOT, 'gray', 'index.html'), 'utf8');
check('gray/index.html 存在且非空', graySrc.length > 1000);
check('gray 页 noindex,nofollow', graySrc.indexOf('noindex') !== -1);
check('gray 页无外部 <script src> 引用（零拆包面）', !/<script[^>]+src=/.test(graySrc));
check('gray 页无外部样式表引用', graySrc.indexOf('rel="stylesheet"') === -1);
check('gray 页仅直连 /api/auth 与 /api/feedback',
  graySrc.indexOf('/api/auth/send-code') !== -1 && graySrc.indexOf('/api/feedback') !== -1);
check('gray 页自带版本号 v0.2.0-gray', graySrc.indexOf('v0.2.0-gray') !== -1);
check('gray 页含 8 类反馈 Chip',
  ['bug', 'ui', 'suggestion', 'express', 'scan', 'food', 'map', 'other'].every(function (c) {
    return new RegExp("code:\\s*'" + c + "'").test(graySrc);
  }));

// 10.4 dev-login.html 开发者入口
const devLoginSrc = fs.readFileSync(path.join(ROOT, 'dev-login.html'), 'utf8');
check('dev-login.html 调 /api/auth/dev-session 换身份', devLoginSrc.indexOf('/api/auth/dev-session') !== -1);
check('dev-login.html 无外部脚本引用（自包含）', !/<script[^>]+src=/.test(devLoginSrc));
check('dev-login.html 提供灰度反馈入口链接', devLoginSrc.indexOf('/gray/') !== -1);

// 10.5 schema 第 9 表 + sqlite CRUD
check('schema.sql 头部声明 9 张表', /9\s*张表/.test(schemaSrc));
check('schema.sql 含 feedback 表', schemaSrc.indexOf('CREATE TABLE IF NOT EXISTS feedback') !== -1);
['idx_feedback_status', 'idx_feedback_type', 'idx_feedback_time', 'idx_feedback_user'].forEach(function (idx) {
  check('schema.sql 含索引 ' + idx, schemaSrc.indexOf(idx) !== -1);
});
const sqliteSrc = fs.readFileSync(path.join(ROOT, 'backend', 'db', 'sqlite.js'), 'utf8');
['createFeedback', 'getFeedbackById', 'listFeedback', 'countFeedback', 'updateFeedbackFields'].forEach(function (fn) {
  check('sqlite.js 含反馈方法 ' + fn, sqliteSrc.indexOf(fn + ':') !== -1 || sqliteSrc.indexOf(fn + ' =') !== -1);
});
check('updateFeedbackFields 白名单仅 status/admin_note',
  /allowed\s*=\s*\[\s*'status'\s*,\s*'admin_note'\s*\]/.test(sqliteSrc));
check('updateFeedbackFields 使用 apply 逐参数绑定（防 node:sqlite 数组坑）',
  sqliteSrc.indexOf('updStmt.run.apply') !== -1);

// 10.6 routes/feedback.js 后端盖章 + 安全校验
const feedbackRouteSrc = fs.readFileSync(path.join(ROOT, 'backend', 'routes', 'feedback.js'), 'utf8');
check('feedback 路由 POST 必须 authRequired',
  /router\.post\('\/',\s*auth\.authRequired/.test(feedbackRouteSrc));
['bug', 'ui', 'suggestion', 'express', 'scan', 'food', 'map', 'other'].forEach(function (t) {
  check('feedback.js 类型白名单含 ' + t, new RegExp('\\b' + t + ":\\s*'").test(feedbackRouteSrc));
});
check('feedback.js 校验 PNG/JPEG/WEBP MIME 白名单',
  feedbackRouteSrc.indexOf('image/png') !== -1 && feedbackRouteSrc.indexOf('image/webp') !== -1);
check('feedback.js 校验文件头魔数（0x89/0xFF/RIFF）',
  feedbackRouteSrc.indexOf('checkMagic') !== -1 && feedbackRouteSrc.indexOf('0x89') !== -1 && feedbackRouteSrc.indexOf('0x52') !== -1);
check('feedback.js 截图落盘 uploads/feedback 目录', feedbackRouteSrc.indexOf("'uploads', 'feedback'") !== -1);
check('feedback.js 截图失败回滚删除反馈记录', feedbackRouteSrc.indexOf('DELETE FROM feedback') !== -1);
check('feedback.js appVersion 由后端 config 盖章', feedbackRouteSrc.indexOf('appVersion: config.APP_VERSION') !== -1);
check('feedback.js userId 只取自 JWT', feedbackRouteSrc.indexOf('userId: req.userId') !== -1);
check('feedback.js 提交埋点不含正文', feedbackRouteSrc.indexOf('feedback_submit') !== -1 && feedbackRouteSrc.indexOf('imageCount') !== -1);

// 10.7 admin 反馈后台
check('admin.js 含 GET /feedback 列表', adminRouteSrc.indexOf("router.get('/feedback'") !== -1);
check('admin.js 含 GET /feedback/:id 详情', adminRouteSrc.indexOf("router.get('/feedback/:id'") !== -1);
check('admin.js 含 PUT /feedback/:id 状态更新', adminRouteSrc.indexOf("router.put('/feedback/:id'") !== -1);
check('admin.js 含鉴权截图读取路由', adminRouteSrc.indexOf('/screenshots/:idx') !== -1);
check('admin.js 四态状态机 pending/processing/resolved/closed',
  ['pending', 'processing', 'resolved', 'closed'].every(function (s) { return adminRouteSrc.indexOf("'" + s + "'") !== -1; }));
check('admin.js 截图路径正则防目录穿越',
  adminRouteSrc.indexOf('uploads/feedback/[^/]+/\\d{2}') !== -1 || adminRouteSrc.indexOf('uploads\\/feedback\\/[^/]+\\/\\d{2}') !== -1);
check('admin.js 截图 sendFile 前做根目录前缀校验',
  adminRouteSrc.indexOf('path.resolve') !== -1 && adminRouteSrc.indexOf('sendFile') !== -1);
check('formatFeedback 手机号脱敏', /formatFeedback[\s\S]{0,1200}maskPhone/.test(adminRouteSrc));

// 10.8 auth.js 开发者会话（仅 admin）
check('auth.js 含 POST /dev-session', authRouteSrc.indexOf("router.post('/dev-session'") !== -1);
check('dev-session 仅 role=admin 可换，其他统一 403',
  authRouteSrc.indexOf("user.role !== 'admin'") !== -1 && authRouteSrc.indexOf('该账号没有开发者权限') !== -1);
check('dev_session Cookie 含 HttpOnly + Secure + sameSite',
  /DEV_COOKIE_OPTS[\s\S]{0,200}httpOnly:\s*true/.test(authRouteSrc) &&
  /DEV_COOKIE_OPTS[\s\S]{0,200}secure:\s*true/.test(authRouteSrc) &&
  authRouteSrc.indexOf("sameSite: 'lax'") !== -1);
check('auth.js 含 POST /dev-logout 清 Cookie', authRouteSrc.indexOf("router.post('/dev-logout'") !== -1 && authRouteSrc.indexOf('clearCookie') !== -1);

// 10.9 server.js 访问隔离
const serverSrc = fs.readFileSync(path.join(ROOT, 'backend', 'server.js'), 'utf8');
check('server.js 定义 GRAY_PUBLIC_API 仅放登录/反馈/健康',
  serverSrc.indexOf('GRAY_PUBLIC_API') !== -1 && serverSrc.indexOf('auth\\/(?:send-code') !== -1 && serverSrc.indexOf('feedback') !== -1);
check('server.js 定义 ALWAYS_DENY 拦截后端源码/库/.git/node_modules',
  serverSrc.indexOf('ALWAYS_DENY') !== -1 && serverSrc.indexOf('.sqlite') !== -1 && serverSrc.indexOf('.git') !== -1);
check('server.js 灰度公开静态仅 /gray 与 /dev-login',
  serverSrc.indexOf('GRAY_PUBLIC_STATIC') !== -1 && serverSrc.indexOf("'/gray/'") !== -1 && serverSrc.indexOf("'/dev-login.html'") !== -1);
check('server.js 三重身份判定 bearerIsAdmin/devSessionOk/isLoopback',
  ['bearerIsAdmin', 'devSessionOk', 'isLoopback'].every(function (f) { return serverSrc.indexOf('function ' + f) !== -1; }));
check('server.js 仅 text/html 导航请求 302，子资源 403',
  serverSrc.indexOf("accept.indexOf('text/html')") !== -1 && serverSrc.indexOf("res.status(403)") !== -1);
check('server.js 未手写 /gray 重定向（避免非严格路由自跳，注释里的说明文字除外）',
  /^\s*app\.get\('\/gray'/m.test(serverSrc) === false);
check('server.js json body 放开 25mb 容纳截图', serverSrc.indexOf("limit: '25mb'") !== -1);
check('server.js 静态服务 dotfiles deny', serverSrc.indexOf("dotfiles: 'deny'") !== -1);

// 10.10 admin.html 反馈管理 Tab
check('admin.html 含反馈管理 Tab + 待处理角标',
  adminHtmlSrc.indexOf('data-tab="feedback"') !== -1 && adminHtmlSrc.indexOf('fbPendingChip') !== -1);
check('admin.html 反馈截图走鉴权 fetch 而非 img 直链',
  adminHtmlSrc.indexOf('fetchFeedbackImage') !== -1);

// 10.11 截图目录禁止入库
check('.gitignore 排除 backend/uploads/ 截图目录', gitignoreSrc.indexOf('backend/uploads/') !== -1);
})();

// ============================================================
// [11] 宿舍与浴室（数据驱动、三级联动、不硬编码）
// ============================================================
(function () {
console.log('\n[11] 宿舍与浴室系统');

// 11.1 campus-data.js 数据文件
check('campus-data.js 存在', fs.existsSync(path.join(ROOT, 'campus-data.js')));
check('assets/data/campus-buildings.json 存在', fs.existsSync(path.join(ROOT, 'assets', 'data', 'campus-buildings.json')));
const campusDataSrc = fs.readFileSync(path.join(ROOT, 'campus-data.js'), 'utf8');
check('campus-data.js 含 5+ 苑区（竹/菊/兰/楷/梅）',
  ['竹苑', '菊苑', '兰苑', '楷苑', '梅苑'].every(function (n) { return campusDataSrc.indexOf(n) !== -1; }));
check('campus-data.js 含 bathrooms 数组', campusDataSrc.indexOf('bathrooms') !== -1);
check('campus-data.js 含仙游校区', campusDataSrc.indexOf('xianyou') !== -1);

// 11.2 storage.js 宿舍/浴室方法
const storageSrc2 = fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8');
check('storage.js 含 getUserDorm', storageSrc2.indexOf('getUserDorm') !== -1);
check('storage.js 含 saveUserDorm', storageSrc2.indexOf('saveUserDorm') !== -1);
check('storage.js 含 getMyBathroom', storageSrc2.indexOf('getMyBathroom') !== -1);
check('storage.js 含 getBathrooms', storageSrc2.indexOf('getBathrooms') !== -1);
check('storage.js 含 getBathroomById', storageSrc2.indexOf('getBathroomById') !== -1);
check('storage.js 含 toggleFavoriteBathroom', storageSrc2.indexOf('toggleFavoriteBathroom') !== -1);
check('storage.js 含 setDefaultBathroom', storageSrc2.indexOf('setDefaultBathroom') !== -1);
check('storage.js 含 getCampusAreas', storageSrc2.indexOf('getCampusAreas') !== -1);
check('storage.js 含 getAreasByCampus', storageSrc2.indexOf('getAreasByCampus') !== -1);
check('storage.js 含 getBuildingsByArea', storageSrc2.indexOf('getBuildingsByArea') !== -1);
check('storage.js getDefaultAddress 读 user.dorm 优先', storageSrc2.indexOf('getUserDorm') !== -1 && storageSrc2.indexOf('getDefaultAddress') !== -1);
check('storage.js getUser 默认含 dorm 结构', /dorm:\s*\{/.test(storageSrc2));
check('storage.js setCampusId 切校区清旧宿舍', /dorm\s*=\s*null/.test(storageSrc2) && storageSrc2.indexOf('setCampusId') !== -1);

// 11.3 profile-edit.html 三级联动
check('profile-edit.html 存在', fs.existsSync(path.join(ROOT, 'profile-edit.html')));
const profileEditSrc = fs.readFileSync(path.join(ROOT, 'profile-edit.html'), 'utf8');
check('profile-edit.html 引入 campus-data.js', profileEditSrc.indexOf('campus-data.js') !== -1);
check('profile-edit.html 含 inputArea 下拉', profileEditSrc.indexOf('inputArea') !== -1);
check('profile-edit.html 含 inputBuilding 下拉', profileEditSrc.indexOf('inputBuilding') !== -1);
check('profile-edit.html 含 inputRoom 输入', profileEditSrc.indexOf('inputRoom') !== -1);
check('profile-edit.html 含 onCampusChange 联动', profileEditSrc.indexOf('onCampusChange') !== -1);
check('profile-edit.html 含 onAreaChange 联动', profileEditSrc.indexOf('onAreaChange') !== -1);
check('profile-edit.html saveProfile 读 areaId+building', /saveProfile[\s\S]{0,400}areaId[\s\S]{0,200}building/.test(profileEditSrc));
check('profile-edit.html saveProfile 调 saveUserDorm', profileEditSrc.indexOf('saveUserDorm') !== -1);
check('profile-edit.html 不含旧 inputDorm 文本框', profileEditSrc.indexOf('inputDorm') === -1);

// 11.4 bathroom.html 详情页
check('bathroom.html 存在', fs.existsSync(path.join(ROOT, 'bathroom.html')));
const bathSrc = fs.readFileSync(path.join(ROOT, 'bathroom.html'), 'utf8');
check('bathroom.html 引入 campus-data.js', bathSrc.indexOf('campus-data.js') !== -1);
check('bathroom.html 含实时状态占位', bathSrc.indexOf('实时状态暂未接入') !== -1);
check('bathroom.html 不伪造人数/拥挤', bathSrc.indexOf('当前人数') === -1 && bathSrc.indexOf('拥挤程度') === -1);
check('bathroom.html 含 3D 地图导航链接', bathSrc.indexOf('3D地图导航') !== -1);
check('bathroom.html 含收藏按钮', bathSrc.indexOf('toggleFav') !== -1);
check('bathroom.html 含设为常用', bathSrc.indexOf('setDefault') !== -1);
check('bathroom.html 含 getBathroomById', bathSrc.indexOf('getBathroomById') !== -1);
check('bathroom.html 含 getDefaultBathroom', bathSrc.indexOf('getDefaultBathroom') !== -1);

// 11.5 浴室卡片已从 packages.html 迁至 index.html 首页校园服务区
const pkgHtmlForBath = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
const idxHtmlForBath = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('index.html 含 bathroomCard 容器', idxHtmlForBath.indexOf('id="bathroomCard"') !== -1);
check('index.html 含 renderBathroomCard', idxHtmlForBath.indexOf('renderBathroomCard') !== -1);
check('index.html 引入 campus-data.js', idxHtmlForBath.indexOf('campus-data.js') !== -1);
check('index.html 浴室卡读取 getDefaultBathroom', idxHtmlForBath.indexOf('getDefaultBathroom') !== -1);
check('index.html 无常用浴室数据时不渲染卡片', /getDefaultBathroom\(\)[\s\S]{0,80}innerHTML = ''/.test(idxHtmlForBath));
check('packages.html 已移除浴室卡（bathroomCard）', pkgHtmlForBath.indexOf('bathroomCard') === -1);

// 11.6 demo-data.js + mock.js 含结构化宿舍
const demoSrc = fs.readFileSync(path.join(ROOT, 'demo-data.js'), 'utf8');
check('demo-data.js 含 dorm 结构', demoSrc.indexOf('dorm:') !== -1);
check('demo-data.js 张同学宿舍 = 兰苑 5号楼 302室', demoSrc.indexOf('"兰苑"') !== -1 && demoSrc.indexOf('"5号楼"') !== -1 && demoSrc.indexOf('"302室"') !== -1);
const mockSrc = fs.readFileSync(path.join(ROOT, 'mock.js'), 'utf8');
check('mock.js 含 dorm 结构', mockSrc.indexOf('dorm:') !== -1);

// 11.7 profile.html 显示结构化宿舍
const profileSrc = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
check('profile.html 引入 campus-data.js', profileSrc.indexOf('campus-data.js') !== -1);
check('profile.html 调 getUserDorm 显示宿舍', profileSrc.indexOf('getUserDorm') !== -1);
})();

// ============================================================
// [12] 灰度一键体验会话（免验证码 2h 进入产品，仅看 demo 虚拟数据）
// ============================================================
(function () {
console.log('\n[12] 灰度一键体验会话');

const authRouteSrc = fs.readFileSync(path.join(ROOT, 'backend', 'routes', 'auth.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'backend', 'server.js'), 'utf8');
const apiClientSrc = fs.readFileSync(path.join(ROOT, 'api-client.js'), 'utf8');

// 12.1 后端 trial-login / trial-logout
check('auth.js 含 POST /trial-login', authRouteSrc.indexOf("router.post('/trial-login'") !== -1);
check('auth.js 含 POST /trial-logout', authRouteSrc.indexOf("router.post('/trial-logout'") !== -1);
check('trial 令牌 scope=trial 且 env=gray',
  /scope:\s*'trial'/.test(authRouteSrc) && /env:\s*'gray'/.test(authRouteSrc));
check('exp_session Cookie 含 HttpOnly + Secure + SameSite=Lax',
  /EXP_COOKIE_OPTS[\s\S]{0,220}httpOnly:\s*true/.test(authRouteSrc) &&
  /EXP_COOKIE_OPTS[\s\S]{0,220}secure:\s*true/.test(authRouteSrc) &&
  /EXP_COOKIE_OPTS[\s\S]{0,220}sameSite:\s*'lax'/.test(authRouteSrc));
check('体验令牌有效期 2 小时（Cookie maxAge + JWT expiresIn）',
  /EXP_COOKIE_OPTS[\s\S]{0,220}2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(authRouteSrc) &&
  /expiresIn:\s*'2h'/.test(authRouteSrc));
check('体验账号使用固定虚拟手机号，不与真实用户冲突',
  /TRIAL_PHONE\s*=\s*'1\d{10}'/.test(authRouteSrc));
check('体验账号不存在时以 gray 环境创建',
  /createUser\(TRIAL_PHONE,\s*\{[^}]*environment:\s*'gray'/.test(authRouteSrc));
check('trial-login 有 IP 限频且超限返回 429',
  authRouteSrc.indexOf('trialRateMap') !== -1 && authRouteSrc.indexOf('429') !== -1);
check('trial-logout 清除 exp_session Cookie',
  /router\.post\('\/trial-logout'[\s\S]{0,200}clearCookie\('exp_session'/.test(authRouteSrc));

// 12.2 server.js 四层门禁：exp_session 只解锁静态页，永不解锁 API/admin/源码
check('server.js 定义 expSessionOk 且只认 scope=trial',
  /function expSessionOk[\s\S]{0,260}payload\.scope\s*===\s*'trial'/.test(serverSrc));
check('GRAY_PUBLIC_API 放通 trial-login/trial-logout',
  /auth\\\/\(\?:[^)]*trial-login\|trial-logout/.test(serverSrc));
check('server.js 定义 ADMIN_ONLY_STATIC 封锁 /admin',
  serverSrc.indexOf('ADMIN_ONLY_STATIC') !== -1 &&
  /\^\\\/admin\(\?:\\\.html\)\?\(\?:\\\/\|\$\)/.test(serverSrc));
check('静态门禁对体验 Cookie 放行产品页（dev || expSessionOk）',
  /if \(dev \|\| expSessionOk\(req\)\) return next\(\)/.test(serverSrc));
check('管理页对体验用户 302 到灰度入口',
  /ADMIN_ONLY_STATIC\.test\(p\) && !dev[\s\S]{0,220}redirect\(302,\s*'\/gray\/'\)/.test(serverSrc));
check('SPA fallback 含 expSessionOk',
  /app\.get\('\*'[\s\S]{0,400}expSessionOk\(req\)/.test(serverSrc));
const apiGateBlock = serverSrc.slice(serverSrc.indexOf("app.use('/api'"));
const apiGateBody = apiGateBlock.slice(0, apiGateBlock.indexOf('});') + 3);
check('API 总闸不接受 exp_session（体验令牌无法触达任何业务/管理 API）',
  apiGateBody.indexOf('expSessionOk') === -1 && apiGateBody.indexOf('bearerIsAdmin') !== -1);
check('ALWAYS_DENY 在静态中间件最前（源码/数据库 404 优先于体验放行）',
  serverSrc.indexOf('ALWAYS_DENY.test(p)') < serverSrc.indexOf('expSessionOk(req)) return next'));

// 12.3 config.js 模式覆盖持久化
const configSrc2 = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
check('config.js 定义 campus_mode_override 持久化键',
  configSrc2.indexOf("campus_mode_override") !== -1);
check('config.js 演示撤销后不再读写 mode 覆盖（改为主动清除 campus_mode_override）',
  !/localStorage\.setItem\(MODE_KEY/.test(configSrc2) &&
  !/localStorage\.getItem\(MODE_KEY\)/.test(configSrc2) &&
  configSrc2.indexOf("localStorage.removeItem('campus_mode_override')") !== -1);

// 12.4 api-client.js 体验登录/退出 + 真实登录清覆盖
check('api-client.js 含 trialLogin 调 /api/auth/trial-login',
  /trialLogin:\s*function[\s\S]{0,200}\/api\/auth\/trial-login/.test(apiClientSrc));
check('api-client.js 含 trialLogout 调 /api/auth/trial-logout 并清覆盖',
  /trialLogout:\s*function[\s\S]{0,400}\/api\/auth\/trial-logout[\s\S]{0,200}removeItem\('campus_mode_override'\)/.test(apiClientSrc));
check('api-client.js 真实 login 成功后清除 demo 覆盖',
  /login:\s*function[\s\S]{0,400}removeItem\('campus_mode_override'\)/.test(apiClientSrc));
const demoOverrideBlock = apiClientSrc.slice(apiClientSrc.indexOf('APP_CONFIG.isDemo'));
check('demo 覆盖块不替换 trialLogin/trialLogout（退出体验仍打真实后端）',
  demoOverrideBlock.indexOf('ApiClient.trialLogin') === -1 &&
  demoOverrideBlock.indexOf('ApiClient.trialLogout') === -1);

// 12.5 gray/index.html 一键体验入口
const grayHtmlSrc2 = fs.readFileSync(path.join(ROOT, 'gray', 'index.html'), 'utf8');
check('gray 页含一键体验按钮 trialBtn', grayHtmlSrc2.indexOf('id="trialBtn"') !== -1);
check('gray 页含 enterTrial 处理函数', grayHtmlSrc2.indexOf('function enterTrial') !== -1);
check('enterTrial 成功后强制 demo 覆盖 + 体验标记',
  /setItem\('campus_mode_override',\s*'demo'\)/.test(grayHtmlSrc2) &&
  /setItem\('campus_trial',\s*'1'\)/.test(grayHtmlSrc2));
check('enterTrial 跳转产品首页 /index.html',
  /function enterTrial[\s\S]{0,700}location\.href\s*=\s*'\/index\.html'/.test(grayHtmlSrc2));
check('gray 反馈表单页也有体验入口 trialLink', grayHtmlSrc2.indexOf('id="trialLink"') !== -1);

// 12.6 settings.html 退出产品体验入口（仅体验会话可见）
const settingsSrc2 = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
check('settings.html 含 trialExitGroup 且默认隐藏',
  /id="trialExitGroup"[^>]*style="display:none;"/.test(settingsSrc2));
check('settings.html 仅 campus_trial=1 时显示退出入口',
  /getItem\('campus_trial'\)\s*===\s*'1'/.test(settingsSrc2));
check('settings.html 含 exitTrial 函数', settingsSrc2.indexOf('function exitTrial') !== -1);
check('settings.html 引入 api-client.js（退出时调真实 trial-logout）',
  /<script src="api-client\.js"><\/script>/.test(settingsSrc2));
check('exitTrial 调 ApiClient.trialLogout',
  /function exitTrial[\s\S]{0,1200}ApiClient\.trialLogout\(\)/.test(settingsSrc2));
check('exitTrial 清理本地体验痕迹并回灰度页',
  /function exitTrial[\s\S]{0,900}removeItem\('campus_trial'\)[\s\S]{0,200}removeItem\('campus_mode_override'\)[\s\S]{0,200}'\/gray\/'/.test(settingsSrc2));
})();

// [13] 扫码导入本地快递 + 首页布局重组 + 个人卡片缩小（新功能：本地导入 / 不调云端）
(function () {
  console.log('\n[13] 扫码导入本地快递 + 首页布局重组 + 个人卡片缩小');

  // 13.1 storage.js 新增 addLocalPackage
  check('storage.js 含 addLocalPackage 方法', typeof Storage.addLocalPackage === 'function');

  // 13.2 addLocalPackage 基础写入
  const before = Storage.getPackages().length;
  const res = Storage.addLocalPackage({
    pickupCode: '13-5-' + Date.now().toString().slice(-3),
    company: '顺丰', shortName: '顺丰', logoColor: '#000000',
    pickupPoint: '涵江校园驿站', type: 'station',
  });
  check('addLocalPackage 返回 success', !!res.success);
  check('addLocalPackage 新增 1 条快递', Storage.getPackages().length === before + 1);
  check('新快递 id 以 LP 开头（Local Pkg 标识）', /^LP\d+$/.test(res.pkg.id));
  check('新快递 status=pending', res.pkg.status === 'pending');
  check('新快递 source=local-scan', res.pkg.source === 'local-scan');
  check('新快递 trackingNo 默认本地导入前缀', /本地导入/.test(res.pkg.trackingNo));

  // 13.3 重复导入去重（同取件码+取件点 → 拒绝）
  const dup = Storage.addLocalPackage({
    pickupCode: res.pkg.pickupCode,
    company: '圆通', pickupPoint: res.pkg.pickupPoint,
  });
  check('addLocalPackage 同取件码+取件点去重', !dup.success && /已存在/.test(dup.message));

  // 13.4 空取件码拒绝
  const empty = Storage.addLocalPackage({ pickupCode: '', company: '中通' });
  check('addLocalPackage 空取件码拒绝', !empty.success);

  // 13.5 导入后写入消息中心通知
  const beforeMsg = Storage.getMessages().length;
  const r2 = Storage.addLocalPackage({
    pickupCode: '99-9-' + Date.now().toString().slice(-3),
    company: '京东', pickupPoint: '竹苑快递柜', type: 'locker',
  });
  check('导入成功后消息中心 +1', r2.success && Storage.getMessages().length === beforeMsg + 1);

  // 13.6 scan.html 模式切换 + 导入抽屉
  const scanHtml = fs.readFileSync(path.join(ROOT, 'scan.html'), 'utf8');
  check('scan.html 含 mode-switch 切换按钮', scanHtml.indexOf('class="mode-switch"') !== -1);
  check('scan.html 含 mode-banner 模式横幅', scanHtml.indexOf('class="mode-banner') !== -1);
  check('scan.html 含 import-sheet 导入抽屉', scanHtml.indexOf('class="import-sheet"') !== -1);
  check('scan.html 含 import-mask 抽屉遮罩', scanHtml.indexOf('class="import-mask"') !== -1);
  check('scan.html 含 chip 选择器（公司/取件点）', scanHtml.indexOf('class="chip"') !== -1);
  check('scan.html 含 toggleScanMode 函数', /function toggleScanMode\(/.test(scanHtml));
  check('scan.html 含 openImportSheet 函数', /function openImportSheet\(/.test(scanHtml));
  check('scan.html 含 closeImportSheet 函数', /function closeImportSheet\(/.test(scanHtml));
  check('scan.html 含 submitImportLocal 函数', /function submitImportLocal\(/.test(scanHtml));
  check('scan.html 含 extractPickupCode 函数', /function extractPickupCode\(/.test(scanHtml));
  check('scan.html 含 selectChip 函数', /function selectChip\(/.test(scanHtml));
  check('scan.html 导入模式不走 API.resolveScanCode',
    /SCAN\.mode === 'import'[\s\S]{0,200}openImportSheet/.test(scanHtml));
  check('scan.html 提交导入调 Storage.addLocalPackage',
    /submitImportLocal[\s\S]{0,800}Storage\.addLocalPackage/.test(scanHtml));
  check('scan.html CSS 模式切换按钮过渡 transition',
    /\.mode-switch[\s\S]{0,500}transition:[\s\S]{0,200}background[\s\S]{0,400}cubic-bezier/.test(scanHtml));
  check('scan.html CSS 导入抽屉滑入过渡 transform',
    /\.import-sheet[\s\S]{0,500}transform:[\s\S]{0,300}translateY/.test(scanHtml));
  check('scan.html CSS chip spring 弹性动画',
    /\.chip:active[\s\S]{0,100}scale/.test(scanHtml) && /\.import-submit-btn:active[\s\S]{0,100}scale/.test(scanHtml));
  check('scan.html 含 8 家快递公司 chip', (scanHtml.match(/data-company="/g) || []).length >= 8);
  check('scan.html 含 7 个取件点 chip', (scanHtml.match(/data-point="/g) || []).length >= 7);
  check('scan.html 成功 overlay 标题可动态切换（导入 vs 取件）',
    scanHtml.indexOf('successOverlayTitle') !== -1);

  // 13.7 index.html 首页重组为校园生活门户
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('index.html 含「攒钱」入口', idx.indexOf('savings.html') !== -1 && idx.indexOf('攒钱') !== -1);
  check('index.html 含「课程表」入口（支持贝蒂导入提示）', idx.indexOf('schedule.html') !== -1 && idx.indexOf('课程表') !== -1);
  check('index.html 含「校园论坛」入口', idx.indexOf('forum.html') !== -1 && idx.indexOf('校园论坛') !== -1);
  check('index.html 含「实习工作」入口', idx.indexOf('jobs.html') !== -1 && idx.indexOf('实习工作') !== -1);
  check('index.html 校园服务区含快递入口', /href="packages\.html"/.test(idx) && idx.indexOf('校园服务') !== -1);
  check('index.html 校园服务区含外卖入口', /href="food\.html"/.test(idx));
  check('index.html 活动 DOM 不再渲染待取横幅（pendingCount 仅在注释中）',
    idx.indexOf('id="pendingCount"') === -1);
  check('index.html 旧取件区块以注释保留（含 hero-card / pointsList / bathroomCard 说明）',
    /<!--[\s\S]*hero-card[\s\S]*-->/.test(idx) && idx.indexOf('bathroomCard') !== -1 && idx.indexOf('pointsList') !== -1);
  check('index.html 标题改为校园生活门户', idx.indexOf('校园生活') !== -1 && idx.indexOf('校园取件') === -1);

  // 13.7b packages.html 整合首页全部取件功能
  const pkgHtml2 = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
  check('packages.html 含待取横幅（pendingCount / pendingHint）',
    pkgHtml2.indexOf('id="pendingCount"') !== -1 && pkgHtml2.indexOf('id="pendingHint"') !== -1);
  check('packages.html 含快捷操作（扫码取件/本地导入/查快递/取件记录）',
    pkgHtml2.indexOf('扫码取件') !== -1 && pkgHtml2.indexOf('本地导入') !== -1 &&
    pkgHtml2.indexOf('track.html') !== -1 && pkgHtml2.indexOf('records.html') !== -1);
  check('packages.html 含常用取件点区块（pointsList）', pkgHtml2.indexOf('id="pointsList"') !== -1);
  check('packages.html 已移除浴室卡区块（迁至首页）', pkgHtml2.indexOf('bathroomCard') === -1);
  check('packages.html 保留搜索/筛选/快递列表',
    pkgHtml2.indexOf('id="searchInput"') !== -1 && pkgHtml2.indexOf('id="filterChips"') !== -1 && pkgHtml2.indexOf('id="pkgList"') !== -1);

  // 13.8 profile.html 个人中心改版（小头像 + 数字ID + 宿舍行）
  const prof = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
  check('profile.html 用户卡片水平内边距 14px',
    /margin-bottom:12px; padding:16px 14px/.test(prof));
  check('profile.html 头像 52px 可点击进入个人空间',
    /avatarHtml\(user,\s*52,/.test(prof) && prof.indexOf('myhome.html') !== -1);
  check('profile.html 用户名字号 ≤ 18px',
    /font-size:16px; font-weight:700/.test(prof));
  check('profile.html 已移除统计数字卡片（待取/已取/未读）',
    prof.indexOf('statPending') === -1 && prof.indexOf('statPicked') === -1 &&
    prof.indexOf('font-size:20px; font-weight:800') === -1);
  check('profile.html 装饰 svg 缩小 ≤ 100px',
    /width:90px; height:90px/.test(prof));
})();

// ============================================================
// [14] 校园生活门户（攒钱/课程表/论坛/实习）+ 耀蓝主题 + 极简切换动画 + 标题靠左
// ============================================================
(function () {
  console.log('\n[14] 校园生活门户 + 耀蓝主题 + 切换动画 + 标题靠左');
  const stylesSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const themeInitSrc = fs.readFileSync(path.join(ROOT, 'theme-init.js'), 'utf8');
  const appJsSrc2 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const settingsSrc3 = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
  const foodSrc2 = fs.readFileSync(path.join(ROOT, 'food.html'), 'utf8');
  const profileSrc2 = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
  const pkgSrc3 = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

  // 14.1 耀蓝主题
  check('styles.css 含耀蓝主题选择器 [data-theme="yaolan"]', stylesSrc.indexOf('[data-theme="yaolan"]') !== -1);
  check('耀蓝主色 #0A6EFF', /\[data-theme="yaolan"\][\s\S]{0,1200}#0A6EFF/.test(stylesSrc));
  check('深色 prefers-color-scheme 媒体查询排除耀蓝',
    /prefers-color-scheme:\s*dark[\s\S]{0,300}not\(\[data-theme="yaolan"\]\)/.test(stylesSrc));
  check('settings.html 含耀蓝模式选项（data-theme="yaolan"）', settingsSrc3.indexOf('data-theme="yaolan"') !== -1 && settingsSrc3.indexOf('耀蓝') !== -1);
  check('theme-init.js 含 yaolan 分支', /yaolan[\s\S]{0,120}data-theme/.test(themeInitSrc) || themeInitSrc.indexOf("'yaolan'") !== -1);
  check('app.js applyTheme 含 yaolan 分支', appJsSrc2.indexOf('yaolan') !== -1);

  // 14.2 极简页面切换动画
  check('styles.css 含 pageEnter 关键帧', /@keyframes pageEnter/.test(stylesSrc));
  check('pageEnter 仅透明度+8px 位移（极简，无旋转/缩放/弹性）',
    /@keyframes pageEnter\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(8px\)/.test(stylesSrc));
  check('.app-shell 动画使用 backwards（避免 fixed 悬浮导航参照系被改）',
    /\.app-shell\s*\{[\s\S]{0,400}animation:[\s\S]*pageEnter[\s\S]*backwards/.test(stylesSrc));
  check('尊重系统减少动态偏好（prefers-reduced-motion 关闭动画）',
    /prefers-reduced-motion[\s\S]{0,200}animation:\s*none/.test(stylesSrc));

  // 14.3 顶部标题靠左（全部快递/校园外卖/个人中心）
  check('packages.html header 标题靠左（header--left + header-spacer）',
    /class="app-header header--left"[\s\S]{0,200}全部快递[\s\S]{0,200}header-spacer/.test(pkgSrc3));
  check('food.html header 标题靠左',
    /class="app-header header--left"[\s\S]{0,200}校园外卖[\s\S]{0,200}header-spacer/.test(foodSrc2));
  check('profile.html header 标题靠左',
    /class="app-header header--left"[\s\S]{0,200}个人中心[\s\S]{0,200}header-spacer/.test(profileSrc2));

  // 14.4 四个新页面文件存在
  ['savings.html', 'schedule.html', 'forum.html', 'jobs.html'].forEach(f => {
    check(f + ' 存在', fs.existsSync(path.join(ROOT, f)));
  });
  const savSrc = fs.readFileSync(path.join(ROOT, 'savings.html'), 'utf8');
  const schSrc = fs.readFileSync(path.join(ROOT, 'schedule.html'), 'utf8');
  const forumSrc = fs.readFileSync(path.join(ROOT, 'forum.html'), 'utf8');
  const jobsSrc = fs.readFileSync(path.join(ROOT, 'jobs.html'), 'utf8');

  [['savings.html', savSrc], ['schedule.html', schSrc], ['forum.html', forumSrc], ['jobs.html', jobsSrc]].forEach(([f, h]) => {
    check(f + ' 功能页已移除 tab-bar（进入功能隐藏悬浮导航）', !h.includes('class="tab-bar"'));
    check(f + ' 使用相对路径资源（无 http/https 外链脚本样式）',
      !/<script[^>]*src="https?:/.test(h) && !/<link[^>]*href="https?:/.test(h));
    check(f + ' 含完整标准脚本链',
      h.indexOf('config.js') !== -1 && h.indexOf('mock.js') !== -1 &&
      h.indexOf('demo-data.js') !== -1 && h.indexOf('storage.js') !== -1 &&
      h.indexOf('api.js') !== -1 && h.indexOf('api-client.js') !== -1 && h.indexOf('app.js') !== -1);
  });
  const idxForTabs = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  [['index.html', idxForTabs], ['packages.html', pkgSrc3], ['food.html', foodSrc2], ['profile.html', profileSrc2]].forEach(([f, h]) => {
    check(f + ' 主导航页保留 tab-bar', h.includes('class="tab-bar"'));
  });

  // 14.5 攒钱页能力
  check('savings.html 含储蓄目标区块', savSrc.indexOf('goalList') !== -1 && savSrc.indexOf('lifeAddGoal') !== -1);
  check('savings.html 含收支流水（工资/记账）', savSrc.indexOf('ledgerList') !== -1 && savSrc.indexOf('lifeAddLedger') !== -1);
  check('savings.html 支持目标存入', savSrc.indexOf('lifeContributeGoal') !== -1);

  // 14.6 课程表页能力（贝蒂导入）
  check('schedule.html 含贝蒂课程表导入入口', schSrc.indexOf('导入贝蒂课程表') !== -1);
  check('schedule.html 支持 JSON 文件选择', /type="file"[^>]*accept="\.json/.test(schSrc));
  check('schedule.html 支持粘贴 JSON 双通道', schSrc.indexOf('importText') !== -1 && schSrc.indexOf('FileReader') !== -1);
  check('schedule.html 含容错字段映射解析（parseSchedule）', schSrc.indexOf('function parseSchedule') !== -1);
  check('schedule.html 兼容常见字段名（courseName/weekday/sections 等）',
    schSrc.indexOf('courseName') !== -1 && schSrc.indexOf('weekday') !== -1);
  check('schedule.html 兼容中文星期与「1-2节」区间', schSrc.indexOf('parseDay') !== -1 && schSrc.indexOf('parseSections') !== -1);
  check('schedule.html 导入调用 lifeSaveCourses 覆盖渲染', schSrc.indexOf('lifeSaveCourses') !== -1);
  check('schedule.html 支持手动加课（lifeAddCourse）', schSrc.indexOf('lifeAddCourse') !== -1);
  check('schedule.html 支持 XLS/XLSX 导入（btnPickXls + importXlsFile）',
    schSrc.indexOf('btnPickXls') !== -1 && schSrc.indexOf('importXlsFile') !== -1);
  check('schedule.html 使用本地化 SheetJS（libs/xlsx，无在线依赖）',
    schSrc.indexOf('libs/xlsx/xlsx.full.min.js') !== -1 && !/<script[^>]*src="https?:/.test(schSrc));
  check('schedule.html 含 XLS 解析（parseXlsxRows + loadSheetJs）',
    schSrc.indexOf('parseXlsxRows') !== -1 && schSrc.indexOf('loadSheetJs') !== -1);

  // 14.7 论坛页能力
  check('forum.html 含板块筛选（学习/二手/失物/兼职/吐槽）',
    forumSrc.indexOf('学习交流') !== -1 && forumSrc.indexOf('二手交易') !== -1 &&
    forumSrc.indexOf('失物招领') !== -1 && forumSrc.indexOf('兼职实习') !== -1);
  check('forum.html 含发帖功能（lifeAddPost）', forumSrc.indexOf('lifeAddPost') !== -1 && forumSrc.indexOf('postSheet') !== -1);
  check('forum.html 含点赞功能（lifeLikePost）', forumSrc.indexOf('lifeLikePost') !== -1);
  check('forum.html 含评论功能（lifeAddComment）', forumSrc.indexOf('lifeAddComment') !== -1);
  check('forum.html 含帖子详情层', forumSrc.indexOf('detailSheet') !== -1 && forumSrc.indexOf('openDetail') !== -1);
  check('forum.html 输出做 XSS 转义（esc 函数）', forumSrc.indexOf('function esc') !== -1);

  // 14.8 实习工作页能力
  check('jobs.html 含实习/校招/兼职筛选', jobsSrc.indexOf('实习') !== -1 && jobsSrc.indexOf('校招') !== -1 && jobsSrc.indexOf('兼职') !== -1);
  check('jobs.html 含职位搜索', jobsSrc.indexOf('id="searchInput"') !== -1);
  check('jobs.html 含职位详情弹层与投递（lifeApplyJob）', jobsSrc.indexOf('lifeApplyJob') !== -1 && jobsSrc.indexOf('detailSheet') !== -1);
  check('jobs.html 含我的投递分区', jobsSrc.indexOf('我的投递') !== -1);
  check('jobs.html 含校园求职墙（legacy 求职意向展示）',
    jobsSrc.indexOf('求职墙') !== -1 && jobsSrc.indexOf('lifeGetResume') !== -1);
  check('jobs.html 含内置种子虚拟岗位（≥20 个）', (jobsSrc.match(/id: 'J\d+'/g) || []).length >= 20);

  // 14.9 storage.js 生活模块数据层
  check('storage.js KEYS 含 lifeDB', /life:\s*'lifeDB'/.test(fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8')));
  check('lifeGetSavings 新用户无种子记录（goals/ledger 均为空）', (function () {
    const s = Storage.lifeGetSavings();
    return Array.isArray(s.goals) && s.goals.length === 0 && Array.isArray(s.ledger) && s.ledger.length === 0;
  })());
  const ledgerBefore = Storage.lifeGetSavings().ledger.length;
  check('lifeAddLedger 记收入并置顶', (function () {
    const r = Storage.lifeAddLedger({ type: 'income', amount: 500, category: '实习工资', note: 'verify测试' });
    const l = Storage.lifeGetSavings().ledger;
    return r.success && l.length === ledgerBefore + 1 && l[0].type === 'income' && l[0].amount === 500;
  })());
  check('lifeAddLedger 拒绝非法金额', !Storage.lifeAddLedger({ type: 'expense', amount: 0 }).success);
  const goalRes = Storage.lifeAddGoal({ name: 'verify目标', target: 100 });
  check('lifeAddGoal 创建目标', goalRes.success && goalRes.goal.saved === 0);
  check('lifeContributeGoal 累加且封顶 target', (function () {
    Storage.lifeContributeGoal(goalRes.goal.id, 60);
    Storage.lifeContributeGoal(goalRes.goal.id, 999);
    const g = Storage.lifeGetSavings().goals.find(x => x.id === goalRes.goal.id);
    return g.saved === 100;
  })());
  check('lifeAddCourse / lifeGetCourses 可读写', (function () {
    const n0 = Storage.lifeGetCourses().length;
    const r = Storage.lifeAddCourse({ name: '验证课', weekday: 2, start: 3, end: 4, position: 'T101' });
    return r.success && Storage.lifeGetCourses().length === n0 + 1;
  })());
  check('lifeAddCourse 拒绝不完整课程', !Storage.lifeAddCourse({ name: '', weekday: 1, start: 1 }).success);
  const courseList = [{ name: '导入课A', weekday: 1, start: 1, end: 2 }, { name: '导入课B', weekday: 3, start: 5, end: 6 }];
  check('lifeSaveCourses 整体覆盖（贝蒂导入用）', (function () {
    const r = Storage.lifeSaveCourses(courseList);
    return r.success && r.count === 2 && Storage.lifeGetCourses().length === 2;
  })());
  const postRes = Storage.lifeAddPost({ board: 'study', title: 'verify 帖子', content: '内容' });
  check('lifeAddPost 发帖并置顶', postRes.success && Storage.lifeGetPosts()[0].id === postRes.post.id);
  check('lifeAddPost 拒绝空标题', !Storage.lifeAddPost({ title: '', content: 'x' }).success);
  check('lifeLikePost 点赞/取消切换', (function () {
    const a = Storage.lifeLikePost(postRes.post.id);
    const b = Storage.lifeLikePost(postRes.post.id);
    return a.success && a.liked === true && b.liked === false;
  })());
  check('lifeAddComment 写评论', (function () {
    const r = Storage.lifeAddComment(postRes.post.id, 'verify 评论');
    const p = Storage.lifeGetPosts().find(x => x.id === postRes.post.id);
    return r.success && p.comments[p.comments.length - 1].text === 'verify 评论';
  })());
  check('lifeApplyJob 未建简历拦截投递（needResume）', (function () {
    const a = Storage.lifeApplyJob('J1');
    return !a.success && a.needResume === true;
  })());
  check('lifeApplyJob 建简历后投递 + 重复投递去重', (function () {
    Storage.lifeSaveResume({ name: 'verify同学', intent: '前端实习' });
    const a = Storage.lifeApplyJob('J1');
    const b = Storage.lifeApplyJob('J1');
    return a.success && !b.success && Storage.lifeGetJobsState().applied.indexOf('J1') !== -1;
  })());
  check('lifeAddResume 发布求职意向', (function () {
    const n0 = Storage.lifeGetJobsState().resumes.length;
    const r = Storage.lifeAddResume({ name: 'verify同学', intent: '前端实习', contact: 'wx' });
    return r.success && Storage.lifeGetJobsState().resumes.length === n0 + 1;
  })());
  check('lifeAddResume 拒绝缺少意向', !Storage.lifeAddResume({ name: 'x', intent: '' }).success);

  // 14.10 sw.js 预缓存
  check('sw.js VERSION 升级为 v4', /var VERSION = 'v4'/.test(swSrc));
  ['savings.html', 'schedule.html', 'forum.html', 'jobs.html',
   'myhome.html', 'about.html', 'website.html'].forEach(f => {
    check('sw.js 预缓存 ' + f, swSrc.indexOf("'./" + f + "'") !== -1);
  });
  check('sw.js 预缓存 xlsx 本地库', swSrc.indexOf("'./libs/xlsx/xlsx.full.min.js'") !== -1);
})();

// ============================================================
// [15] v3 改版：光粒/指引模式/数字ID/个人空间相册/图片帖/简历流程/投递状态机/消息铃铛/浴室入首页
// ============================================================
(function () {
  console.log('\n[15] v3 改版：光粒/指引/个人空间/简历流程/消息铃铛');
  const stylesSrc4 = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const appJsSrc3 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const storageSrc4 = fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8');
  const idxSrc4 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const foodSrc3 = fs.readFileSync(path.join(ROOT, 'food.html'), 'utf8');
  const pkgSrc4 = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
  const forumSrc2 = fs.readFileSync(path.join(ROOT, 'forum.html'), 'utf8');
  const jobsSrc2 = fs.readFileSync(path.join(ROOT, 'jobs.html'), 'utf8');
  const profSrc3 = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
  const setSrc2 = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');

  // 15.1 光粒动效
  check('styles.css 含 tab-spark 样式与 @keyframes tab-spark-rise',
    stylesSrc4.indexOf('.tab-spark') !== -1 && /@keyframes tab-spark-rise/.test(stylesSrc4));
  check('app.js 含 tabSparks 光粒实现', appJsSrc3.indexOf('tabSparks') !== -1);

  // 15.2 指引模式 + 图片压缩
  check('app.js 含 showGuide 指引模式', appJsSrc3.indexOf('showGuide') !== -1);
  check('app.js 含 compressImage 图片压缩', appJsSrc3.indexOf('compressImage') !== -1);
  check('storage.js KEYS 含 guideDB', /guide:\s*'guideDB'/.test(storageSrc4));
  check('storage.js 含 isGuideShown/markGuideShown',
    storageSrc4.indexOf('isGuideShown') !== -1 && storageSrc4.indexOf('markGuideShown') !== -1);
  ['savings.html', 'schedule.html', 'forum.html', 'jobs.html', 'myhome.html'].forEach(f => {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    check(f + ' 含 showGuide 指引调用', h.indexOf("showGuide('") !== -1);
  });

  // 15.3 个人中心：数字 ID + 个人空间入口 + 新增页
  check('storage.js 含 getUserId 数字 ID', storageSrc4.indexOf('getUserId') !== -1);
  check('profile.html 含 userIdRow 数字 ID 展示', profSrc3.indexOf('userIdRow') !== -1);
  check('profile.html 已移除学号 userStudentId', profSrc3.indexOf('userStudentId') === -1);
  check('profile.html 头像可进入个人空间（myhome.html）', profSrc3.indexOf('myhome.html') !== -1);
  check('profile.html 含关于我们/应用官网/反馈建议入口',
    profSrc3.indexOf('about.html') !== -1 && profSrc3.indexOf('website.html') !== -1 &&
    profSrc3.indexOf('feedback.html') !== -1);
  check('settings.html 已移除问题反馈入口', setSrc2.indexOf('feedback.html') === -1);
  check('profile.html 展示结构化宿舍（getUserDorm）', profSrc3.indexOf('getUserDorm') !== -1);

  // 15.4 个人空间 myhome.html（极简纯展示：编辑能力已下沉 profile-edit.html）
  check('myhome.html 存在', fs.existsSync(path.join(ROOT, 'myhome.html')));
  const myhomeSrc = fs.existsSync(path.join(ROOT, 'myhome.html'))
    ? fs.readFileSync(path.join(ROOT, 'myhome.html'), 'utf8') : '';
  check('myhome.html 纯展示型（mh-hero 大头像+名字焦点）',
    myhomeSrc.indexOf('mh-hero') !== -1 && myhomeSrc.indexOf('编辑资料') !== -1 &&
    myhomeSrc.indexOf('profile-edit.html') !== -1);
  check('myhome.html 快递动态数据化（statPending/statIncoming）',
    myhomeSrc.indexOf('statPending') !== -1 && myhomeSrc.indexOf('statIncoming') !== -1 &&
    myhomeSrc.indexOf('packages.html?filter=incoming') !== -1);
  check('myhome.html 相册改为入口卡（mh-album，不再内联网格）',
    myhomeSrc.indexOf('mh-album') !== -1 && myhomeSrc.indexOf('album-grid') === -1);
  check('myhome.html 无内联编辑表单（avatarSheet/inpName/saveUserDorm 已移除）',
    myhomeSrc.indexOf('avatarSheet') === -1 && myhomeSrc.indexOf('inpName') === -1 &&
    myhomeSrc.indexOf('saveUserDorm') === -1);

  // 15.5 相册存储层
  check('storage.js 含相册 API（lifeGetAlbum/lifeAddPhotos/lifeRemovePhoto）',
    storageSrc4.indexOf('lifeGetAlbum') !== -1 && storageSrc4.indexOf('lifeAddPhotos') !== -1 &&
    storageSrc4.indexOf('lifeRemovePhoto') !== -1);

  // 15.6 论坛图片帖
  check('forum.html 支持图片帖（post-img + albumPick）',
    forumSrc2.indexOf('post-img') !== -1 && forumSrc2.indexOf('albumPick') !== -1);
  check('forum.html 支持 compose=1&img= 深链发图帖',
    forumSrc2.indexOf('compose=1') !== -1 && forumSrc2.indexOf('URLSearchParams') !== -1);
  check('storage.js lifeAddPost 支持 image 字段', /lifeAddPost[\s\S]{0,900}image/.test(storageSrc4));

  // 15.7 jobs 简历分步流程 + 投递状态机（纯本地）
  check('jobs.html 含分步简历向导（rzName/rzIntent/RZ_STEPS）',
    jobsSrc2.indexOf('rzName') !== -1 && jobsSrc2.indexOf('rzIntent') !== -1 &&
    jobsSrc2.indexOf('RZ_STEPS') !== -1);
  check('jobs.html 简历保存走 lifeSaveResume', jobsSrc2.indexOf('lifeSaveResume') !== -1);
  check('jobs.html 投递走 lifeApplyJobMeta（需简历拦截）',
    jobsSrc2.indexOf('lifeApplyJobMeta') !== -1 && jobsSrc2.indexOf('needResume') !== -1);
  check('jobs.html 含投递状态机（submitted/viewed/interview/offer/rejected/withdrawn）',
    ['submitted', 'viewed', 'interview', 'offer', 'rejected', 'withdrawn'].every(s => jobsSrc2.indexOf(s) !== -1));
  check('jobs.html 含投递撤回 lifeWithdrawApplication', jobsSrc2.indexOf('lifeWithdrawApplication') !== -1);
  check('jobs.html 投递时间轴自动推进 lifeSyncApplications', jobsSrc2.indexOf('lifeSyncApplications') !== -1);
  check('storage.js 含简历/投递 API（lifeSaveResume/lifeApplyJobMeta/lifeSyncApplications/lifeWithdrawApplication）',
    ['lifeSaveResume', 'lifeApplyJobMeta', 'lifeSyncApplications', 'lifeWithdrawApplication'].every(s => storageSrc4.indexOf(s) !== -1));

  // 15.8 消息铃铛（首页/快递/外卖右上角）
  check('index.html 右上角消息铃铛（messages.html + msgBadge）',
    idxSrc4.indexOf('messages.html') !== -1 && idxSrc4.indexOf('msgBadge') !== -1);
  check('packages.html 含消息铃铛 msgBadge', pkgSrc4.indexOf('msgBadge') !== -1);
  check('food.html 含消息铃铛 msgBadge', foodSrc3.indexOf('msgBadge') !== -1);

  // 15.9 浴室入口移至首页
  check('index.html 含浴室入口卡片（bathroom.html）', idxSrc4.indexOf('bathroom.html') !== -1);
  check('packages.html 已移除浴室卡', pkgSrc4.indexOf('bathroomCard') === -1);

  // ===== [16] 本轮优化：课程导入/攒钱DIY/论坛头像/扫码沉浸式/jobs蓝色/极简主页/快递降噪/AI图标/暗色对比度 =====
  console.log('\n[16] 本轮九块优化');

  // 16.1 课程表 XLS/JSON 统一导入管线
  const scheduleSrc2 = fs.readFileSync(path.join(ROOT, 'schedule.html'), 'utf8');
  check('schedule.html 使用 XLSX 库解析表格', scheduleSrc2.indexOf('xlsx.full.min.js') !== -1);
  check('schedule.html 含 extractWeeks 周次提取', scheduleSrc2.indexOf('function extractWeeks') !== -1);

  // 16.2 攒钱目标 DIY（图标字段 + 更新 API）
  const storageSrc5 = fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8');
  const savingsSrc2 = fs.readFileSync(path.join(ROOT, 'savings.html'), 'utf8');
  check('storage.js 含 lifeUpdateGoal 局部更新', storageSrc5.indexOf('lifeUpdateGoal:') !== -1);
  check('storage.js lifeAddGoal 支持 icon 字段', /lifeAddGoal[\s\S]{0,600}icon/.test(storageSrc5));
  check('savings.html 含 DIY 图标选择器（goalIconGrid/GOAL_ICONS）',
    savingsSrc2.indexOf('goalIconGrid') !== -1 && savingsSrc2.indexOf('GOAL_ICONS') !== -1);

  // 16.3 论坛头像与个人中心同源
  const forumSrc3 = fs.readFileSync(path.join(ROOT, 'forum.html'), 'utf8');
  check('storage.js 发帖/评论快照 authorAvatar',
    storageSrc5.indexOf('authorAvatar: u.avatar') !== -1);
  check('forum.html avatarOf 读取 authorAvatar',
    forumSrc3.indexOf('function avatarOf') !== -1 && forumSrc3.indexOf('authorAvatar') !== -1);

  // 16.4 扫码沉浸式重构
  const scanSrc2 = fs.readFileSync(path.join(ROOT, 'scan.html'), 'utf8');
  check('scan.html 全屏扫描舞台 scan-stage', scanSrc2.indexOf('scan-stage') !== -1);
  check('scan.html 四角呼吸灯（scan-corner + cornerBreath 1.5s）',
    scanSrc2.indexOf('scan-corner') !== -1 && scanSrc2.indexOf('cornerBreath 1.5s') !== -1);
  check('scan.html 成功对勾动画 + 震动反馈',
    scanSrc2.indexOf('checkPop') !== -1 && scanSrc2.indexOf('vibrate') !== -1);
  check('scan.html 3 秒慢提示浮现（slowHint/startSlowHints，无常驻提示）',
    scanSrc2.indexOf('id="slowHint"') !== -1 && scanSrc2.indexOf('startSlowHints') !== -1 &&
    scanSrc2.indexOf('scan-engine-hint') !== -1);
  check('scan.html 左上角退出返回首页', /scan-nav[\s\S]{0,500}index\.html/.test(scanSrc2));
  check('styles.css 扫码页底部导航毛玻璃（blur(20px)）',
    cssSrc.indexOf('body[data-page="scan"] .tab-bar') !== -1 &&
    /body\[data-page="scan"\] \.tab-bar[\s\S]{0,400}blur\(20px\)/.test(cssSrc));

  // 16.5 jobs 蓝色体系 + 简历照片/导出/导入/20+ 岗位
  const jobsSrc3 = fs.readFileSync(path.join(ROOT, 'jobs.html'), 'utf8');
  check('jobs.html 橙色零残留',
    ['F97316', 'EA580C', 'FB923C', 'FFEDD5', 'f97316', 'ea580c']
      .every(hex => jobsSrc3.indexOf(hex) === -1));
  check('jobs.html 蓝色主色体系（#3B82F6/#2563EB/#60A5FA/#22D3EE）',
    ['#3B82F6', '#2563EB', '#60A5FA', '#22D3EE'].every(hex => jobsSrc3.toUpperCase().indexOf(hex) !== -1));
  check('jobs.html 证件照上传（rzPhotoInput + compressImage）',
    jobsSrc3.indexOf('rzPhotoInput') !== -1 && jobsSrc3.indexOf('compressImage') !== -1);
  check('jobs.html 简历导出 Word/PDF/Markdown/JSON',
    ['exportResumeWord', 'exportResumePdf', 'exportResumeMarkdown', 'exportResumeJson']
      .every(fn => jobsSrc3.indexOf(fn) !== -1));
  check('jobs.html 支持简历 JSON 导入预填（importResumeInput/openResumeWizard）',
    jobsSrc3.indexOf('importResumeInput') !== -1 && /openResumeWizard\s*\(\s*prefill/.test(jobsSrc3));
  check('jobs.html 空字段显示「未填写」', jobsSrc3.indexOf('未填写') !== -1);
  check('storage.js lifeSaveResume 白名单含 photo',
    /lifeSaveResume[\s\S]{0,700}photo:/.test(storageSrc5));

  // 16.6 myhome 纯展示 + profile-edit 编辑/相册分离
  const myhomeSrc2 = fs.readFileSync(path.join(ROOT, 'myhome.html'), 'utf8');
  const peSrc2 = fs.readFileSync(path.join(ROOT, 'profile-edit.html'), 'utf8');
  check('myhome.html 编辑入口跳 profile-edit.html', myhomeSrc2.indexOf("href='profile-edit.html'") !== -1 || myhomeSrc2.indexOf('href="profile-edit.html"') !== -1);
  check('profile-edit.html 承载相册管理（album-grid/btnImportPhoto/lifeRemovePhoto）',
    peSrc2.indexOf('album-grid') !== -1 && peSrc2.indexOf('btnImportPhoto') !== -1 &&
    peSrc2.indexOf('lifeRemovePhoto') !== -1);
  check('profile-edit.html 相册发帖深链（compose=1&img=）', peSrc2.indexOf('compose=1&img=') !== -1);
  check('profile-edit.html 头像/照片走 compressImage', peSrc2.indexOf('compressImage') !== -1);

  // 16.7 packages 极简降噪 + 一键取件 + 深链筛选
  const pkgSrc5 = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
  check('packages.html 卡片默认隐藏物流单号', pkgSrc5.indexOf('物流单号') === -1);
  check('packages.html 待取件一键取件（quickPickup → API.confirmPickup）',
    pkgSrc5.indexOf('window.quickPickup') !== -1 && pkgSrc5.indexOf('API.confirmPickup') !== -1);
  check('packages.html 支持 ?filter= 深链',
    pkgSrc5.indexOf("new URLSearchParams(location.search).get('filter')") !== -1);
  check('packages.html 快捷入口单色调（is-neutral）',
    (pkgSrc5.match(/is-neutral/g) || []).length >= 3);

  // 16.8 分享入口移除 + 设置 AI 图标 + 暗色蓝色提亮 + 图片懒加载
  const profSrc4 = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
  const setSrc3 = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
  check('profile.html 已移除「分享我的作品」入口与死代码',
    profSrc4.indexOf('分享我的作品') === -1 && profSrc4.indexOf('showShareModal') === -1);
  check('settings.html 显示/性能选项 AI 渐变图标（ai-ico + aiGrad）',
    setSrc3.indexOf('class="ai-ico"') !== -1 && setSrc3.indexOf('id="aiGrad"') !== -1 &&
    (setSrc3.match(/class="ai-ico"/g) || []).length === 7);
  check('settings.html emoji 选项已替换（无 🌓🌙⚙️🔋🚀）',
    ['🌓', '🌙', '⚙️', '🔋', '🚀'].every(e => setSrc3.indexOf(e) === -1));
  check('styles.css 暗色蓝色文字提亮 20%（#629BF8，含系统暗色）',
    (cssSrc.match(/--color-primary-text: #629BF8/g) || []).length >= 2);
  check('forum.html 长列表图片懒加载', forumSrc3.indexOf('loading="lazy"') !== -1);
})();

// ---------- 汇总（等待 Promise 类断言落定后输出） ----------
Promise.all(asyncChecks || []).then(function () {
  console.log('\n========================================');
  console.log('  验收结果：' + passed + ' 通过 / ' + failed + ' 失败');
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
});
