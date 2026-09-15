// middleware/auth.js — JWT 认证中间件

const jwt = require('jsonwebtoken');
const config = require('../config');

function authRequired(req, res, next) {
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '请先登录' });
  }
  var token = authHeader.slice(7);
  try {
    var payload = jwt.verify(token, config.JWT_SECRET);
    req.userId = payload.userId;
    req.phone = payload.phone;
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}

// 可选认证：有 token 就解析，没有就跳过
function authOptional(req, res, next) {
  var authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      var payload = jwt.verify(authHeader.slice(7), config.JWT_SECRET);
      req.userId = payload.userId;
      req.phone = payload.phone;
    } catch (e) { /* ignore */ }
  }
  next();
}

module.exports = { authRequired, authOptional };
