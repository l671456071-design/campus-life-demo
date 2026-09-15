// services/expressApi.js — 快递鸟 API 集成（按官方 Node.js Demo 实现）

var config = require('../config');
var axios = require('axios');
var crypto = require('crypto');

// 按快递鸟官方 Demo 实现签名
// 步骤：JSON双引号→单引号 → MD5(返回hex) → Buffer.from(hex) → Base64 → encodeURIComponent
function makeSign(reqData) {
  var ss = reqData.replace(/"/gi, "'"); // 双引号转单引号
  var md5hex = crypto.createHash('md5').update(ss + config.KDNIAO_API_KEY, 'utf8').digest('hex');
  var base64 = Buffer.from(md5hex).toString('base64');
  return encodeURIComponent(base64);
}

// 构建 POST 表单（手动拼接，避免双重编码问题）
function buildForm(reqData, requestType) {
  var requestDataEncoded = encodeURIComponent(reqData).replace(/%22/gi, '%27');
  var sign = makeSign(reqData);
  return 'RequestData=' + requestDataEncoded +
    '&EBusinessID=' + config.KDNIAO_EBUSINESS_ID +
    '&RequestType=' + requestType +
    '&DataSign=' + sign +
    '&DataType=2';
}

/**
 * 即时查询物流轨迹（RequestType=1002）
 */
async function trackExpress(trackingNo, shipperCode) {
  if (!config.KDNIAO_EBUSINESS_ID || !config.KDNIAO_API_KEY) {
    return mockTrack(trackingNo);
  }

  var reqData = JSON.stringify({
    OrderCode: '',
    ShipperCode: shipperCode,
    LogisticCode: trackingNo,
  });
  var postData = buildForm(reqData, '1002');

  console.log('[快递鸟 1002] 请求:', postData.slice(0, 200));

  try {
    var res = await axios.post(config.KDNIAO_BASE_URL, postData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      timeout: 15000,
    });

    console.log('[快递鸟 1002] 响应:', JSON.stringify(res.data).slice(0, 300));

    if (!res.data) throw new Error('快递鸟返回空数据');
    if (!res.data.Success) {
      throw new Error('快递鸟: ' + (res.data.Reason || '查询失败'));
    }

    return {
      state: String(res.data.State),
      traces: res.data.Traces || [],
      shipperCode: res.data.ShipperCode,
      logisticCode: res.data.LogisticCode,
    };
  } catch (e) {
    if (e.response) {
      console.error('[快递鸟 1002] HTTP错误:', e.response.status, JSON.stringify(e.response.data).slice(0, 500));
    } else {
      console.error('[快递鸟 1002] 异常:', e.message);
    }
    throw e;
  }
}

/**
 * 单号识别（RequestType=2002）
 */
async function recognizeExpress(trackingNo) {
  if (!config.KDNIAO_EBUSINESS_ID || !config.KDNIAO_API_KEY) {
    return { ShipperCode: 'SF', ShipperName: '顺丰速运' };
  }

  var reqData = JSON.stringify({ LogisticCode: trackingNo });
  var postData = buildForm(reqData, '2002');

  console.log('[快递鸟 2002] 请求:', postData.slice(0, 200));

  try {
    var res = await axios.post(config.KDNIAO_BASE_URL, postData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      timeout: 15000,
    });

    console.log('[快递鸟 2002] 响应:', JSON.stringify(res.data).slice(0, 300));

    if (!res.data || !res.data.Success) {
      return null;
    }

    var shippers = res.data.Shippers || [];
    if (shippers.length > 0) {
      return shippers[0];
    }
    return null;
  } catch (e) {
    console.error('[快递鸟 2002] 异常:', e.message);
    return null;
  }
}

/**
 * 查询单个快递单号的物流信息
 * @param trackingNo 快递单号
 * @param shipperCode 快递公司编码（可选，用户手动选择时传入）
 */
async function queryByTrackingNo(trackingNo, shipperCode) {
  var shipperName = '';

  // 如果用户提供了快递公司编码，直接用
  if (!shipperCode) {
    // 尝试单号识别
    var recognized = await recognizeExpress(trackingNo);
    shipperCode = recognized ? recognized.ShipperCode : '';
    shipperName = recognized ? recognized.ShipperName : '';
  }

  // 如果还是没识别到，尝试根据单号前缀猜
  if (!shipperCode) {
    shipperCode = guessShipperCode(trackingNo);
  }

  if (!shipperCode) {
    return { trackingNo: trackingNo, company: shipperName, traces: [], state: '0', error: '无法识别快递公司，请手动选择' };
  }

  var result = await trackExpress(trackingNo, shipperCode);
  return {
    trackingNo: trackingNo,
    company: shipperName || getCompanyName(shipperCode),
    companyCode: shipperCode,
    state: result.state,
    traces: result.traces,
  };
}

function getCompanyName(code) {
  var map = { SF: '顺丰速运', JD: '京东物流', ZTO: '中通快递', YTO: '圆通速递', STO: '申通快递', YD: '韵达速递', HTKY: '百世快递', EMS: '邮政EMS', DBL: '德邦快递', JTSD: '极兔速递' };
  return map[code] || code;
}

function mapStatus(kdniaoState) {
  var map = {
    '0': 'transporting',
    '1': 'transporting',
    '2': 'transporting',
    '3': 'picked',
    '4': 'expired',
  };
  return map[kdniaoState] || 'transporting';
}

function getShipperCode(companyName) {
  if (!companyName) return '';
  for (var key in config.KDNIAO_EXPRESS_CODES) {
    if (companyName.indexOf(key) !== -1) {
      return config.KDNIAO_EXPRESS_CODES[key];
    }
  }
  return '';
}

function guessShipperCode(trackingNo) {
  var prefix = trackingNo.slice(0, 2).toUpperCase();
  var guessMap = {
    'SF': 'SF', 'JD': 'JD', 'JT': 'JTSD',
    'ZT': 'ZTO', 'YT': 'YTO', 'ST': 'STO', 'YD': 'YD',
  };
  return guessMap[prefix] || '';
}

function mockTrack(trackingNo) {
  return {
    state: '2',
    traces: [
      { AcceptStation: '快件已揽收', AcceptTime: '2026-09-13 09:30' },
      { AcceptStation: '快件已到达分拣中心', AcceptTime: '2026-09-13 15:00' },
      { AcceptStation: '快件运输中', AcceptTime: '2026-09-14 08:00' },
    ],
    shipperCode: 'SF',
    logisticCode: trackingNo,
  };
}

module.exports = { trackExpress, recognizeExpress, queryByTrackingNo, mapStatus, getShipperCode };
