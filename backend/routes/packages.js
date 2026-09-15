// routes/packages.js — 快递路由

var express = require('express');
var db = require('../db');
var expressApi = require('../services/expressApi');

var router = express.Router();
var authRequired = require('../middleware/auth').authRequired;

// GET /api/packages  获取当前用户快递列表
router.get('/', authRequired, function (req, res) {
  var packages = db.getPackagesByUser(req.userId);
  var list = packages.map(function (p) {
    return formatPackage(p);
  });
  res.json({ code: 0, data: list });
});

// GET /api/packages/:id  获取快递详情
router.get('/:id', authRequired, function (req, res) {
  var pkg = db.getPackageById(req.params.id);
  if (!pkg || pkg.userId !== req.userId) {
    return res.status(404).json({ code: 404, message: '快递不存在' });
  }
  var tracking = db.getTrackingByPackage(pkg.id);
  res.json({
    code: 0,
    data: Object.assign(formatPackage(pkg), {
      tracking: tracking.map(function (t) {
        return {
          description: t.description,
          timestamp: t.timestamp,
        };
      }),
    }),
  });
});

// POST /api/packages/track  输入单号查询物流并保存
router.post('/track', authRequired, async function (req, res) {
  var trackingNo = (req.body.trackingNo || '').trim();
  var shipperCode = (req.body.shipperCode || '').trim();
  if (!trackingNo) {
    return res.json({ code: 400, message: '请输入快递单号' });
  }

  try {
    var result = await expressApi.queryByTrackingNo(trackingNo, shipperCode);
    var status = expressApi.mapStatus(result.state);

    var pkgId = db.upsertPackage({
      userId: req.userId,
      trackingNo: trackingNo,
      company: result.company || '',
      companyCode: result.companyCode || '',
      sender: '',
      status: status,
      pickupCode: '',
      pickupPoint: '',
      pickupAddress: '',
      arrivedAt: status === 'pending' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : '',
      rawData: JSON.stringify(result),
    });

    // 保存物流轨迹
    if (result.traces && result.traces.length > 0) {
      var tracks = result.traces.map(function (t) {
        return {
          description: t.AcceptStation,
          timestamp: t.AcceptTime,
        };
      });
      db.saveTracking(pkgId, tracks);
    }

    var pkg = db.getPackageById(pkgId);
    var tracking = db.getTrackingByPackage(pkgId);

    res.json({
      code: 0,
      message: '查询成功',
      data: Object.assign(formatPackage(pkg), {
        tracking: tracking.map(function (t) {
          return { description: t.description, timestamp: t.timestamp };
        }),
      }),
    });
  } catch (e) {
    console.error('[track] 异常:', e.message);
    res.json({ code: 500, message: e.message || '查询失败' });
  }
});

// PUT /api/packages/:id/status  手动更新状态
router.put('/:id/status', authRequired, function (req, res) {
  var pkg = db.getPackageById(req.params.id);
  if (!pkg || pkg.userId !== req.userId) {
    return res.status(404).json({ code: 404, message: '快递不存在' });
  }
  var status = req.body.status;
  if (!['pending', 'picked', 'expired', 'transporting'].includes(status)) {
    return res.json({ code: 400, message: '无效的状态' });
  }
  db.updatePackageStatus(pkg.id, status);
  res.json({ code: 0, message: '状态已更新' });
});

// DELETE /api/packages/:id  删除快递
router.delete('/:id', authRequired, function (req, res) {
  var pkg = db.getPackageById(req.params.id);
  if (!pkg || pkg.userId !== req.userId) {
    return res.status(404).json({ code: 404, message: '快递不存在' });
  }
  db.deletePackage(pkg.id);
  res.json({ code: 0, message: '已删除' });
});

function formatPackage(p) {
  var shortName = (p.company || '?').charAt(0);
  var logoColors = { '顺丰': '#4D4D4D', '京东': '#E31436', '中通': '#1A73E8', '圆通': '#FF6900', '申通': '#1677FF', '韵达': '#000066', '极兔': '#E6162D', '邮政': '#00713A' };
  return {
    id: p.id,
    trackingNo: p.trackingNo,
    company: p.company,
    companyCode: p.companyCode,
    shortName: shortName,
    logoColor: logoColors[p.company] || '#64748B',
    sender: p.sender,
    status: p.status,
    pickupCode: p.pickupCode,
    pickupPoint: p.pickupPoint,
    pickupAddress: p.pickupAddress,
    arrivedAt: p.arrivedAt,
    pickedAt: p.pickedAt,
    expiresIn: p.expiresIn,
    type: p.packageType,
    size: p.packageSize,
    estimatedTime: p.status === 'transporting' ? '运输中' : '',
    businessHours: '08:00 - 22:00',
  };
}

module.exports = router;
