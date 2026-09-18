// config.js — 后端配置（请在 .env 或环境变量中注入密钥）

module.exports = {
  // 服务器
  PORT: process.env.PORT || 3000,

  // 运行环境：development | gray | production
  // development = 本地开发（mock 数据，控制台验证码）
  // gray         = 灰度测试（真实第三方 + 小范围真实用户）
  // production   = 正式上线（暂不启用，仅占位）
  ENVIRONMENT: process.env.ENVIRONMENT || 'development',

  // App 版本号（反馈提交时由后端盖章，前端不可伪造）
  APP_VERSION: process.env.APP_VERSION || 'v0.2.0-gray',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'campus-package-secret-change-me',
  JWT_EXPIRES_IN: '7d',

  // ========== 短信服务 ==========
  // Provider 选择：console(开发) | tencent(腾讯云SMS) | aliyun(阿里云SMS)
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'console',
  SMS_CODE_LENGTH: 6,
  SMS_CODE_TTL: 5 * 60 * 1000,             // 5 分钟有效
  SMS_RATE_LIMIT: 60 * 1000,               // 同手机号 60s 内不可重发
  SMS_IP_HOURLY_LIMIT: 10,                 // 同 IP 每小时最多 10 次
  SMS_PHONE_DAILY_LIMIT: 5,                // 同手机号每天最多 5 次
  SMS_MAX_VERIFY_ATTEMPTS: 5,              // 验证码最多 5 次错误尝试后失效

  // 腾讯云 SMS（推荐，灰度阶段使用）
  TENCENT_SMS_SECRET_ID: process.env.TENCENT_SMS_SECRET_ID || '',
  TENCENT_SMS_SECRET_KEY: process.env.TENCENT_SMS_SECRET_KEY || '',
  TENCENT_SMS_SDK_APP_ID: process.env.TENCENT_SMS_SDK_APP_ID || '',
  TENCENT_SMS_SIGN_NAME: process.env.TENCENT_SMS_SIGN_NAME || '校园取件',
  TENCENT_SMS_TEMPLATE_ID: process.env.TENCENT_SMS_TEMPLATE_ID || '',
  TENCENT_SMS_REGION: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',

  // 阿里云 SMS（备用）
  ALIYUN_SMS_ACCESS_KEY: process.env.ALIYUN_SMS_ACCESS_KEY || '',
  ALIYUN_SMS_SECRET: process.env.ALIYUN_SMS_SECRET || '',
  ALIYUN_SMS_SIGN_NAME: process.env.ALIYUN_SMS_SIGN_NAME || '校园取件',
  ALIYUN_SMS_TEMPLATE_CODE: process.env.ALIYUN_SMS_TEMPLATE_CODE || '',

  // ========== 快递服务 ==========
  // Provider 选择：kdniao(快递鸟，统一查询) | cainiao(菜鸟占位)
  COURIER_PROVIDER: process.env.COURIER_PROVIDER || 'kdniao',

  // 快递鸟 API（https://www.kdniao.com/ 注册获取）
  KDNIAO_EBUSINESS_ID: process.env.KDNIAO_EBUSINESS_ID || '',
  KDNIAO_API_KEY: process.env.KDNIAO_API_KEY || '',
  KDNIAO_BASE_URL: 'https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx',

  // 菜鸟驿站 API（占位，未实现）
  CAINIAO_APP_KEY: process.env.CAINIAO_APP_KEY || '',
  CAINIAO_APP_SECRET: process.env.CAINIAO_APP_SECRET || '',

  // 出库码刷新策略（秒）
  OUTBOUND_REFRESH_INTERVAL: 5 * 60,       // 默认每 5 分钟刷新一次
  OUTBOUND_DEFAULT_TTL: 10 * 60,           // 默认有效期 10 分钟

  // 状态轮询间隔（秒）
  PACKAGE_POLL_INTERVAL: 60,               // 灰度用户每 60 秒可刷新一次状态

  // ========== 微信登录（占位） ==========
  WECHAT_APP_ID: process.env.WECHAT_APP_ID || '',
  WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET || '',
  WECHAT_LOGIN_ENABLED: false,             // 暂未开放，前端走手机号登录

  // ========== 灰度阶段 ==========
  GRAY_COHORT: process.env.GRAY_COHORT || 'wave1',  // wave1(5-10) / wave2(20-50) / wave3(100)
  GRAY_SESSION_TTL: 7 * 24 * 60 * 60,     // 灰度用户会话 7 天

  // ========== 用户反馈 ==========
  // 截图经前端压缩为 data URL 后 JSON 提交，后端解码落盘到 uploads/feedback（已 gitignore）
  // 灰度小流量方案：不引入 multer；文件只能通过 adminRequired 鉴权路由读取
  FEEDBACK_MAX_IMAGES: 3,
  FEEDBACK_MAX_IMAGE_BYTES: 5 * 1024 * 1024,   // 单张 ≤ 5MB
  FEEDBACK_CONTENT_MIN: 5,
  FEEDBACK_CONTENT_MAX: 500,

  // ========== AI 助手（DeepSeek，服务端代理） ==========
  // Key 只从环境变量/.env 读取，绝不下发前端；留空时 AI 路由返回 503，前端回退本地引擎
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  DEEPSEEK_TIMEOUT_MS: 30 * 1000,

  // ========== 安全 ==========
  // 手机号日志脱敏：保留前 3 后 4
  PHONE_MASK_KEEP_HEAD: 3,
  PHONE_MASK_KEEP_TAIL: 4,

  // 快递公司代码映射（快递鸟标准编码）
  KDNIAO_EXPRESS_CODES: {
    '顺丰': 'SF',
    '京东': 'JD',
    '圆通': 'YTO',
    '中通': 'ZTO',
    '申通': 'STO',
    '韵达': 'YD',
    '百世': 'HTKY',
    '邮政': 'EMS',
    'ems': 'EMS',
    '德邦': 'DBL',
    '极兔': 'JTSD',
  },
};
