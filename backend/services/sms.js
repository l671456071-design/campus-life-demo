// services/sms.js — 短信验证码服务（控制台模式 + 阿里云SMS）

var config = require('../config');
var db = require('../db');

// 生成 6 位数字验证码
function generateCode() {
  var code = '';
  for (var i = 0; i < config.SMS_CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

// 发送验证码
function sendCode(phone) {
  // 频率限制
  var latest = db.getLatestCode(phone);
  if (latest && !latest.used) {
    var elapsed = Date.now() - new Date(latest.createdAt).getTime();
    if (elapsed < config.SMS_RATE_LIMIT) {
      var waitSec = Math.ceil((config.SMS_RATE_LIMIT - elapsed) / 1000);
      return { ok: false, message: '发送太频繁，请 ' + waitSec + ' 秒后重试' };
    }
  }

  var code = generateCode();
  var expiresAt = new Date(Date.now() + config.SMS_CODE_TTL).toISOString();
  db.saveCode(phone, code, expiresAt);

  if (config.SMS_PROVIDER === 'aliyun' && config.ALIYUN_SMS_ACCESS_KEY) {
    sendAliyunSMS(phone, code);
  } else {
    // 开发模式：控制台打印
    console.log('\n');
    console.log('┌──────────────────────────────────┐');
    console.log('│  验证码: ' + code + '                   │');
    console.log('│  手机号: ' + phone + '                │');
    console.log('│  有效期: 5 分钟                   │');
    console.log('└──────────────────────────────────┘');
    console.log('');
  }

  return { ok: true, message: '验证码已发送' };
}

// 验证码校验
function verifyCode(phone, code) {
  var record = db.getLatestCode(phone);
  if (!record || record.used) {
    return { ok: false, message: '验证码无效或已使用' };
  }
  if (record.code !== code) {
    return { ok: false, message: '验证码错误' };
  }
  if (new Date(record.expires_at) < new Date()) {
    return { ok: false, message: '验证码已过期' };
  }
  db.markCodeUsed(record.id);
  return { ok: true };
}

// 阿里云 SMS 发送（需要安装 @alicloud/sms20170525 SDK）
function sendAliyunSMS(phone, code) {
  // 实际部署时取消注释并安装依赖：
  // npm install @alicloud/sms20170525 @alicloud/openapi-client
  //
  // const SMS = require('@alicloud/sms20170525');
  // const OpenApi = require('@alicloud/openapi-client');
  // const config = require('../config');
  // var client = new SMS.default(new OpenApi.Config({
  //   accessKeyId: config.ALIYUN_SMS_ACCESS_KEY,
  //   accessKeySecret: config.ALIYUN_SMS_SECRET,
  // }));
  // client.endpoint = 'dysmsapi.aliyuncs.com';
  // client.sendSms({
  //   phoneNumbers: phone,
  //   signName: config.ALIYUN_SMS_SIGN_NAME,
  //   templateCode: config.ALIYUN_SMS_TEMPLATE_CODE,
  //   templateParam: JSON.stringify({ code: code }),
  // });
  console.log('[阿里云SMS] 发送验证码到 ' + phone + ': ' + code);
}

module.exports = { sendCode, verifyCode };
