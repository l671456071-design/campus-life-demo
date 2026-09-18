# 校园智能生活 App

校园智能生活原型应用：**校园快递 + 扫码取件 + 外卖 + 3D 地图**，一套代码同时支持「本地开发版」和「公网演示版」。

- 零云端依赖：无在线数据库 / 无第三方在线地图 / 无 CDN / 无在线图片，全部资源本地打包
- 真实浏览器能力：摄像头扫码（getUserMedia + BarcodeDetector / jsQR）、本地 OCR（Tesseract.js）、定位（geolocation）、剪贴板复制
- 数据保存在浏览器 localStorage，关闭浏览器后仍然存在
- 双环境：`local`（开发者本地数据）与 `demo`（公网虚拟演示数据），数据完全隔离

---

## 一、功能总览

| 模块 | 页面 | 说明 |
| --- | --- | --- |
| 首页 | `index.html` | 待取横幅、快捷操作、最近待取、取件点概览 |
| 快递 | `packages.html` / `detail.html` / `track.html` | 快递列表（搜索/筛选）、详情、物流轨迹 |
| 扫码取件 | `scan.html` | 真实摄像头扫码 + 本地 OCR 识别取件码，支持手动输入回退 |
| 3D 地图 | `map.html` | 本地 Three.js 3D 校园场景、POI、路线规划、外卖配送演示 |
| 外卖 | `food.html` / `food-detail.html` / `order.html` | 店铺、菜品、购物车、下单、配送状态、3D 配送地图 |
| 记录/消息 | `records.html` / `messages.html` | 取件记录、消息中心（已读状态持久化） |
| 我的 | `profile.html` / `settings.html` / `profile-edit.html` | 个人中心、分享作品、通知/外观设置 |

## 二、本地运行

后端同时提供静态站点与 API（HTTPS 自签证书，摄像头/定位等安全上下文能力必需）：

```bash
cd backend
npm install      # 首次运行安装依赖
npm start        # 等价于 node server.js
```

然后访问 https://localhost:3000/ （首次打开自签证书提示，点"高级 → 继续访问"）。
Windows 开机自启：双击 `backend/start-backend.cmd` 后，登录系统即自动拉起服务（快捷方式在当前用户"启动"文件夹）。

> 手机访问：同 WiFi 用局域网 IP（如 https://192.168.x.x:3000/），外网用 Tailscale IP（如 https://100.x.x.x:3000/），首次同样信任证书。换端口：在 `backend/.env` 中设置 `PORT=3001`。

局域网真机测试（手机访问电脑 IP / Tailscale IP）时，`config.js` 会自动识别 `192.168.*` 和 `100.*` 网段并保持 local 模式。

## 三、Demo 模式（公网演示）

`config.js` 中的 `APP_CONFIG.mode` 决定运行环境：

| mode | 用途 | 数据来源 | 存储键 |
| --- | --- | --- | --- |
| `local` | 开发者本地开发 | `mock.js` 种子数据 | `packageDB` 等 |
| `demo` | 公网演示 | `demo-data.js` 虚拟数据 | `demo_packageDB` 等 |

**模式判定规则（自动，无需手动改代码）：**

1. URL 参数优先：任意页面加 `?mode=demo` 或 `?mode=local` 强制切换（例如想在本地预览演示版，访问 `http://localhost:3000/?mode=demo`）
2. 否则按域名自动判定：`localhost` / `127.0.0.1` / `192.168.*` / `100.*` → `local`；其他任何域名（如 `xxx.github.io`）→ `demo`

**Demo 模式下的行为：**

- 页面顶部显示提示条「当前为演示模式 · 数据均为虚拟数据」
- 免登录：演示用户（张同学 / DEMO001）始终视为已登录，不会跳转登录页
- 「退出登录」变为「重置演示数据」：只清空当前浏览器中的演示操作，恢复初始演示数据，不影响其他访问者
- 扫码页展示可体验的演示取件码（如 `8-3-267`），手动输入即可走完整取件流程
- 每个访问者的演示数据互相隔离（A 用户取件不影响 B 用户），只存在于各自浏览器的 localStorage，不上传服务器

## 四、公网部署（静态托管）

项目无强制后端，可直接静态部署。注意 `backend/` 和 `backend/node_modules` 不需要部署。

**部署前安全检查（已在 `.gitignore` 中处理，请勿重新加入）：**

- `backend/data.json` 已被 `.gitignore` 排除 —— 该文件是本地后端运行时数据，可能含开发时输入的手机号与验证码，**绝不能上传公网**
- `backend/config.js` 中的快递鸟 / 短信凭证只从环境变量读取，仓库内不含任何真实 API Key
- 全部演示数据来自 `demo-data.js`（虚构），`mock.js` 同为虚构种子数据

部署前建议通过 URL 参数自检：部署后打开 `https://你的域名/`，应显示演示模式横幅；也可访问 `https://你的域名/?mode=local` 验证强制切换是否生效。

### 方式一：GitHub Pages

1. 将本项目推送到 GitHub 仓库（先确认 `.gitignore` 已排除 `backend/node_modules`）
2. 仓库 Settings → Pages → Source 选择分支（如 `main`）/ 根目录
3. 保存后约 1 分钟生效，访问 `https://<用户名>.github.io/<仓库名>/`

> 项目根目录已包含 `.nojekyll`，确保 `libs/`、`assets/` 等目录下以 `_` 开头的文件不被 Pages 的 Jekyll 处理忽略。

### 方式二：Vercel

```bash
npm i -g vercel
vercel            # 首次部署
vercel --prod     # 正式发布
```

或直接在 Vercel 控制台 Import Git 仓库：Framework Preset 选 **Other**，无需 Build Command，Output Directory 默认根目录。

### 方式三：Netlify

控制台「Add new site → Deploy manually」，把项目根目录（不含 `backend/`）拖入即可；或连接 Git 仓库，Build command 留空。

### 部署要求核对表

- 所有资源均为相对路径（`./styles.css`、`./libs/three/three.min.js` 等），无 `C:\`、`file:///`、`localhost` 硬编码
- HTTPS 托管（Pages/Vercel/Netlify 默认都是 HTTPS），摄像头与定位能力自动可用
- 如需摄像头体验完整，必须 HTTPS；HTTP 环境下扫码页自动回退「手动输入取件码」

## 五、真实数据说明

**本项目 Demo 不使用任何真实个人数据。**

- 公网演示环境展示的用户、快递、取件码、外卖、订单、消息、地图 POI、配送员全部来自 `demo-data.js`，均为虚构（如：张同学 / 2025000001 / 顺丰 SF1357924680 / 取件码 8-3-267）
- `mock.js` 中的本地种子数据同样为演示数据，不含真实姓名、学号、地址、手机号
- 开发者本地的 localStorage 数据（真实操作记录）保存在本机浏览器中，**不会也不会被上传**——本项目没有任何上传接口
- 外部访问者的演示数据保存在其自己的浏览器中，彼此隔离

## 六、浏览器权限说明

| 能力 | 依赖 | 拒绝/不支持后的行为 |
| --- | --- | --- |
| 摄像头扫码 | `getUserMedia`（需 localhost 或 HTTPS） | 显示权限拒绝提示 + 「手动输入取件码」入口 |
| OCR 文字识别 | 本地 Tesseract.js（wasm） | 提示「当前浏览器暂不支持自动识别，请手动输入取件码」 |
| GPS 定位 | `geolocation`（需 localhost 或 HTTPS） | 使用默认位置（教学楼附近） |
| 闪光灯 | 摄像头 `torch` 能力 | 提示「当前设备不支持」 |
| 分享给好友 | Web Share API | 仅显示「复制体验链接」按钮 |
| 数据存储 | `localStorage` | 隐私模式下降级为内存（仅当次会话有效） |

## 七、项目目录

```
campus-package-app/
├── index.html            # 首页
├── packages.html         # 快递列表
├── detail.html           # 快递详情
├── scan.html             # 扫码取件（摄像头 + jsQR + Tesseract OCR + 手动输入）
├── map.html              # 3D 校园地图（本地 Three.js + 路线规划 + 配送演示）
├── track.html            # 物流轨迹
├── food.html             # 外卖·店铺列表
├── food-detail.html      # 外卖·菜品/购物车
├── order.html            # 外卖·订单/配送状态
├── records.html          # 取件记录
├── messages.html         # 消息中心
├── profile.html          # 个人中心（分享我的作品）
├── profile-edit.html     # 编辑资料
├── settings.html         # 设置（通知/外观/账号/关于）
├── login.html            # 登录（local 模式）
├── test-qr.html          # 二维码测试工具（开发辅助）
│
├── config.js             # 环境配置（mode: local / demo 判定 + 演示横幅）
├── mock.js               # 本地种子数据
├── demo-data.js          # Demo 虚拟数据（公网展示用）
├── storage.js            # 本地数据层（localStorage，demo 键前缀隔离）
├── api.js / api-client.js# 接口层（local 转发 Storage，demo 覆写为本地实现）
├── app.js                # 共享工具（toast/modal/tab bar）
├── theme-init.js         # 主题初始化（防闪烁）
├── styles.css            # 全局样式
├── verify.js             # 验收脚本
├── package.json
├── .nojekyll             # GitHub Pages 兼容
├── .gitignore
│
├── libs/
│   ├── three/three.min.js         # 3D 引擎（本地）
│   ├── tesseract/                 # 本地 OCR（core wasm + 英文语言包）
│   ├── qr-scanner/jsQR.js         # 二维码识别（本地）
│   └── qr-encoder/               # 二维码生成（本地）
│
├── assets/
│   ├── icons/favicon.svg
│   └── map/campus-data.json       # POI + 道路数据
│
└── backend/              # Express + JWT 后端（静态站点 + API + HTTPS，本地运行入口）
    ├── server.js / routes/ / services/ / middleware/
    ├── config.js / db.js / db/sqlite.js
    ├── .env / start-backend.cmd / certs/（自签证书，已 gitignore）
    └── node_modules/      # 已被 .gitignore 排除
```

## 八、如何测试真实扫码

1. 启动后端后打开 https://localhost:3000/test-qr.html
2. 该页面为所有「待取快递」实时生成二维码（格式 `{"qrCode":"8-3-267","packageId":"PK001"}` 或纯取件码）
3. 打开 https://localhost:3000/scan.html：
   - 用另一台设备打开 test-qr.html，将其屏幕对准摄像头；或
   - 将生成的二维码截图，用扫码页的「相册识别」选择该图片
4. 识别成功 → 确认取件 → 首页待取数量 -1，取件记录新增一条，消息中心新增未读通知

## 九、验收脚本

```bash
node verify.js
```

包含六组自动化检查（131 项断言）：二维码编解码 round-trip、Storage 数据层行为（取件状态流转/记录/消息/统计联动）、扫码与 OCR 解析规则、外卖购物车/订单时间轴、静态资源检查（无外部 http(s) 资源、无死链、无 CDN 依赖），以及 **Demo/Local 双环境隔离检查**（公网域名自动判定 demo、`demo_` 存储前缀、虚拟数据断言、取件流程只影响演示键、URL 参数强制切换、敏感文件/凭证不入库）。
