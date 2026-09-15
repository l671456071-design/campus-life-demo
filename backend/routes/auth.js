// routes/auth.js — 认证路由

var express = require('express');
var jwt = require('jsonwebtoken');
var config = require('../config');
var db = require('../db');
var sms = require('../services/sms');

var router = express.Router();

// POST /api/auth/send-code  发送验证码
router.post('/send-code', function (req, res) {
  var phone = (req.body.phone || '').trim();
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.json({ code: 400, message: '请输入正确的手机号' });
  }

  var result = sms.sendCode(phone);
  if (!result.ok) {
    return res.json({ code: 429, message: result.message });
  }

  res.json({ code: 0, message: result.message });
});

// POST /api/auth/login  手机号 + 验证码登录
router.post('/login', function (req, res) {
  var phone = (req.body.phone || '').trim();
  var code = (req.body.code || '').trim();

  if (!phone || !code) {
    return res.json({ code: 400, message: '手机号和验证码不能为空' });
  }

  var verifyResult = sms.verifyCode(phone, code);
  if (!verifyResult.ok) {
    return res.json({ code: 400, message: verifyResult.message });
  }

  // 查找或创建用户
  var user = db.getUserByPhone(phone);
  if (!user) {
    user = db.createUser(phone);
  }

  var token = jwt.sign(
    { userId: user.id, phone: phone },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  res.json({
    code: 0,
    message: '登录成功',
    data: {
      token: token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        studentId: user.studentId,
      },
    },
  });
});

// GET /api/auth/me  获取当前用户信息（需登录）
router.get('/me', require('../middleware/auth').authRequired, function (req, res) {
  var user = db.getUserById(req.userId);
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }
  res.json({
    code: 0,
    data: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      studentId: user.student_id,
    },
  });
});

// PUT /api/auth/me  更新用户信息（姓名、学号）
router.put('/me', require('../middleware/auth').authRequired, function (req, res) {
  var name = (req.body.name || '').trim();
  var studentId = (req.body.studentId || '').trim();
  db.updateUser(req.userId, name, studentId);
  var user = db.getUserById(req.userId);
  res.json({
    code: 0,
    message: '更新成功',
    data: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      studentId: user.student_id,
    },
  });
});

module.exports = router;
