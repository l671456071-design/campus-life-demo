// routes/ai.js — AI 校园助手后端代理（DeepSeek）
//
// 安全约定：
//   1. DEEPSEEK_API_KEY 只从 config（环境变量/.env）读取，仅在服务端注入 Authorization 头；
//      响应体、日志、错误信息中绝不出现 key
//   2. 前端只传 messages 文本，服务端强制拼接校园助手 system prompt
//   3. 入参严格校验（条数/角色/长度），最多转发最近 10 条，防止 token 膨胀与刷量
//   4. 同 IP 简易内存限流：20 次/分钟
//   5. key 未配置 / 上游超时 / 上游错误分别返回 503 / 504 / 502，前端静默回退本地规则引擎

var express = require('express');
var config = require('../config');
var logger = require('../services/logger');

var router = express.Router();

// ---------- 校园助手人设（服务端强制注入，前端无法覆盖） ----------
var SYSTEM_PROMPT =
  '你是「校园智能生活 App」内置的 AI 助手，服务对象是中国高校在校大学生。' +
  '要求：' +
  '1. 用简短、口语化、有温度的中文回答，绝大多数回答控制在 150 字以内；' +
  '2. 可以聊学习、课程、快递取件、食堂外卖、校园生活、情绪陪伴、通用知识；' +
  '3. 你拿不到用户的实时个人数据（快递单号、取件码、课表等），严禁编造具体单号、取件码或物流状态；' +
  '   涉及这些内容时，如实说明并引导用户在 App 内对应页面查看；' +
  '4. 不输出 Markdown 表格，不讨论政治敏感话题，拒绝违法违规请求；' +
  '5. 结尾不要加签名或免责声明。';

// ---------- 入参限制 ----------
var MAX_MESSAGES = 20;          // 接收上限
var FORWARD_MESSAGES = 10;      // 实际转发上限（最近 N 条）
var MAX_CONTENT_LEN = 1500;
var MAX_CONTEXT_LEN = 300;
var ALLOWED_ROLES = { user: 1, assistant: 1, system: 1 };

// ---------- 简易 IP 限流：20 次 / 60 秒（进程内存，重启清零） ----------
var RATE_WINDOW_MS = 60 * 1000;
var RATE_LIMIT = 20;
var rateBuckets = new Map();

setInterval(function () {
  var now = Date.now();
  rateBuckets.forEach(function (bucket, ip) {
    if (!bucket.length || now - bucket[bucket.length - 1] > RATE_WINDOW_MS) {
      rateBuckets.delete(ip);
    }
  });
}, 5 * 60 * 1000).unref();

function rateLimited(ip) {
  var now = Date.now();
  var bucket = rateBuckets.get(ip) || [];
  bucket = bucket.filter(function (t) { return now - t < RATE_WINDOW_MS; });
  var hit = bucket.length >= RATE_LIMIT;
  if (!hit) bucket.push(now);
  rateBuckets.set(ip, bucket);
  return hit;
}

function fail(res, status, message) {
  return res.status(status).json({ code: status, message: message });
}

// POST /api/ai/chat  body: { messages: [{role, content}], context?: string }
router.post('/chat', async function (req, res) {
  // 1) key 未配置：前端据此静默回退本地引擎
  if (!config.DEEPSEEK_API_KEY) {
    return fail(res, 503, 'AI 服务未配置');
  }

  // 2) 限流
  var ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  if (rateLimited(ip)) {
    return fail(res, 429, '提问太快啦，喝口水稍后再试');
  }

  // 3) 入参校验
  var body = req.body || {};
  var rawMessages = body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length < 1 || rawMessages.length > MAX_MESSAGES) {
    return fail(res, 400, '消息格式不正确');
  }
  var cleanMessages = [];
  for (var i = 0; i < rawMessages.length; i++) {
    var m = rawMessages[i];
    if (!m || typeof m.content !== 'string' || !ALLOWED_ROLES[m.role]) {
      return fail(res, 400, '消息格式不正确');
    }
    var content = m.content.trim();
    if (!content || content.length > MAX_CONTENT_LEN) {
      return fail(res, 400, '消息内容长度不符合要求');
    }
    // 前端传入的 system 角色一律忽略，人设只能由服务端决定
    if (m.role !== 'system') cleanMessages.push({ role: m.role, content: content });
  }
  if (!cleanMessages.length) return fail(res, 400, '消息格式不正确');
  cleanMessages = cleanMessages.slice(-FORWARD_MESSAGES);

  // 4) 组装最终 messages（系统人设 + 可选的本机状态摘要 + 对话）
  var finalMessages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (typeof body.context === 'string' && body.context.trim()) {
    var ctx = body.context.trim().slice(0, MAX_CONTEXT_LEN);
    finalMessages.push({
      role: 'system',
      content: '用户当前 App 本机状态摘要（可能为空，仅供参考，不要原样复述）：' + ctx,
    });
  }
  finalMessages = finalMessages.concat(cleanMessages);

  // 5) 调用 DeepSeek（Node >= 22 全局 fetch；超时中断）
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, config.DEEPSEEK_TIMEOUT_MS);
  var upstreamStatus = 0;
  try {
    var upstream = await fetch(config.DEEPSEEK_BASE_URL.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.DEEPSEEK_API_KEY,
      },
      body: JSON.stringify({
        model: config.DEEPSEEK_MODEL,
        messages: finalMessages,
        stream: false,
        temperature: 0.7,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });
    upstreamStatus = upstream.status;
    if (!upstream.ok) {
      // 不把上游响应体透传给客户端（可能含敏感细节）
      logger.warn('[ai] deepseek upstream status ' + upstreamStatus + ' ip=' + ip);
      return fail(res, 502, 'AI 服务暂时不可用');
    }
    var data = await upstream.json();
    var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof text !== 'string' || !text.trim()) {
      logger.warn('[ai] deepseek empty response');
      return fail(res, 502, 'AI 服务返回异常');
    }
    return res.json({ code: 0, data: { text: text.trim().slice(0, 2000) } });
  } catch (e) {
    if (e.name === 'AbortError') {
      logger.warn('[ai] deepseek timeout ip=' + ip);
      return fail(res, 504, 'AI 响应超时');
    }
    logger.error('[ai] deepseek error: ' + (e && e.message));
    return fail(res, 502, 'AI 服务暂时不可用');
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
