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
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  refs.forEach(ref => {
    if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//')) {
      if (ref.startsWith('http://www.w3.org') || ref.startsWith('https://www.w3.org')) return; // SVG 命名空间，非资源加载
      externalRefs.push(f + ' → ' + ref);
    } else if (!ref.startsWith('javascript:') && !ref.startsWith('#') && ref !== '') {
      const clean = ref.split('?')[0].split('#')[0].replace(/^\.\//, ''); // 归一化 ./ 相对前缀
      if (!localFiles.has(clean)) deadLinks.push(f + ' → ' + ref);
    }
  });
});
check('HTML 中无外部 http(s) 资源引用', externalRefs.length === 0, externalRefs.join('; '));
check('无死链（所有本地引用文件存在）', deadLinks.length === 0, deadLinks.join('; '));

// 应用代码：严格禁止任何外部 URL
const appFiles = ['styles.css', 'mock.js', 'storage.js', 'api.js', 'app.js', 'server.js',
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
const mainPages = ['index.html', 'packages.html', 'scan.html', 'food.html', 'profile.html', 'detail.html', 'map.html', 'messages.html', 'records.html', 'order.html', 'food-detail.html'];
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

// 6.1 公网域名（模拟 GitHub Pages）→ 自动 demo 模式
const pub = loadEnv({ hostname: 'demo-user.github.io' });
check('公网域名自动判定为 demo 模式', pub.APP_CONFIG.mode === 'demo' && pub.APP_CONFIG.isDemo === true);
check('demo 模式 DB 被整体替换为 DEMO_DATA', pub.DB === pub.DEMO_DATA);
check('demo 用户为虚拟用户（张同学 / DEMO001）', pub.DB.user.id === 'DEMO001' && pub.DB.user.name === '张同学');
check('demo 快递全部为 DEMOPK 虚拟数据', pub.Storage.getPackages().every(p => /^DEMOPK/.test(p.id)));
check('demo 种子含取件码 8-3-267 / 5-8-112 / 9-2-345',
  ['8-3-267', '5-8-112', '9-2-345'].every(c => pub.Storage.getPackages().some(p => p.pickupCode === c)));
check('demo 外卖店铺/菜品已注入', pub.Storage.getRestaurants().length === 7 && pub.Storage.getFoods().length === 38);
const demoStoreKeys = Object.keys(pub.store);
check('demo 所有 localStorage 键带 demo_ 前缀', demoStoreKeys.length > 0 && demoStoreKeys.every(k => k.indexOf('demo_') === 0), demoStoreKeys.join(','));
check('demo 不写入任何本地开发键（packageDB 等）', !('packageDB' in pub.store) && !('userDB' in pub.store));
check('demo 存储中无本地用户张小明', JSON.stringify(pub.store).indexOf('张小明') === -1);
check('demo 数据无真实 11 位手机号', !/1[3-9]\d{9}/.test(JSON.stringify(pub.DEMO_DATA)));

// 6.2 demo 模式取件流程：只影响 demo_ 键；ApiClient 本地覆写可用
const asyncChecks = [];
const pr = pub.Storage.confirmPickup('DEMOPK001');
check('demo 确认取件成功', pr.success === true);
check('demo 取件后状态持久化到 demo_packageDB', JSON.parse(pub.store['demo_packageDB']).find(p => p.id === 'DEMOPK001').status === 'picked');
check('demo 取件记录写入 demo_pickupRecordDB', JSON.parse(pub.store['demo_pickupRecordDB'])[0].packageId === 'DEMOPK001');
const pubAuth = pub.ApiClient.requireAuth();
check('demo 模式 requireAuth 免登录返回 Promise', pubAuth instanceof Promise && typeof pubAuth.then === 'function');
asyncChecks.push(pubAuth.then(function (u) {
  check('demo requireAuth 用户为 DEMO001', u && u.id === 'DEMO001');
}));
check('demo 模式 isLoggedIn 恒为 true（免登录）', pub.ApiClient.isLoggedIn() === true);
asyncChecks.push(pub.ApiClient.trackPackage('SF1357924680').then(function (res) {
  check('demo 物流查询走本地虚拟轨迹', res.code === 0 && Array.isArray(res.data.tracking) && res.data.tracking.length > 0);
}));

// 6.3 localhost → local 模式，数据与 demo 完全隔离
const local = loadEnv({ hostname: 'localhost', protocol: 'http:' });
check('localhost 自动判定为 local 模式', local.APP_CONFIG.mode === 'local' && local.APP_CONFIG.isDemo === false);
check('local 模式使用 mock.js 种子（id 为数字）', local.DB.user.id === 1 && local.Storage.getPackages().length === 15);
check('local 存储键不带 demo_ 前缀', 'packageDB' in local.store && !('demo_packageDB' in local.store));
check('local 与 demo 用户不同', local.Storage.getUser().name !== pub.Storage.getUser().name);
check('demo 中取走 DEMOPK001 不影响 local 数据', local.Storage.getPackage('PK001') !== null);

// 6.4 URL 参数强制切换优先级
const forcedDemo = loadEnv({ hostname: 'localhost', search: '?mode=demo' });
check('?mode=demo 可在 localhost 强制演示模式', forcedDemo.APP_CONFIG.mode === 'demo');
const forcedLocal = loadEnv({ hostname: 'x.github.io', search: '?mode=local' });
check('?mode=local 可在公网域名强制本地模式', forcedLocal.APP_CONFIG.mode === 'local');

// 6.5 演示提示条逻辑存在于 config.js
const configSrc = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
check('config.js 内置演示模式横幅文案', configSrc.indexOf('当前为演示模式 · 数据均为虚拟数据') !== -1);

// 6.6 每个功能页都在 storage.js 之前引入 config.js，且引入 storage.js 的页面同时引入 demo-data.js
// （本地化升级报告.html 是说明文档，不属于 App 页面，不参与本项检查）
const demoScriptPages = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && f !== '本地化升级报告.html');
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
check('扫码线动画使用 transform（不触发 Layout/Paint）', scanSrc.indexOf('translateY(230px)') !== -1 && scanSrc.indexOf('top: calc(100% - 6px)') === -1);
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

// ---------- 汇总（等待 Promise 类断言落定后输出） ----------
Promise.all(asyncChecks || []).then(function () {
  console.log('\n========================================');
  console.log('  验收结果：' + passed + ' 通过 / ' + failed + ' 失败');
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
});
