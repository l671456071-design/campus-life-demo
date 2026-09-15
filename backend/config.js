// config.js — 后端配置（请在 .env 或此文件中填入你自己的密钥）

module.exports = {
  // 服务器
  PORT: process.env.PORT || 3000,

  // JWT 密钥（请改成随机字符串）
  JWT_SECRET: process.env.JWT_SECRET || 'campus-package-secret-change-me',
  JWT_EXPIRES_IN: '7d',

  // 短信验证码
  SMS_PROVIDER: 'console', // 'console' = 控制台打印（开发用）, 'aliyun' = 阿里云SMS
  SMS_CODE_LENGTH: 6,
  SMS_CODE_TTL: 5 * 60 * 1000, // 5 分钟有效
  SMS_RATE_LIMIT: 60 * 1000,   // 60 秒内不可重复发送

  // 阿里云 SMS（如需真实短信，填写以下配置）
  ALIYUN_SMS_ACCESS_KEY: '',
  ALIYUN_SMS_SECRET: '',
  ALIYUN_SMS_SIGN_NAME: '校园取件',
  ALIYUN_SMS_TEMPLATE_CODE: '',

  // 快递鸟 API（https://www.kdniao.com/ 注册获取）
  // 安全提示：凭证属于敏感信息，仅通过环境变量注入，切勿硬编码后提交到公开仓库
  KDNIAO_EBUSINESS_ID: process.env.KDNIAO_EBUSINESS_ID || '',  // 商户ID
  KDNIAO_API_KEY: process.env.KDNIAO_API_KEY || '',            // API Key
  KDNIAO_BASE_URL: 'https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx',

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
