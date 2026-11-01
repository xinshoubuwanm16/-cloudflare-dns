'use strict';
// 易支付(彩虹协议)对接：https://www.epay.com
// 提交方式: POST {gateway}/submit.php  签名: MD5(按 key ASCII 升序拼 k=v&.. + key)
// 异步通知: GET notify_url, 需验签后输出 "success"

const crypto = require('crypto');
const { getSettings } = require('./db');

function md5(s) { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }

// 参与签名的参数(非空, 不含 sign / sign_type)
function buildSign(params, key) {
  const filtered = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .sort();
  const qs = filtered.map(k => `${k}=${params[k]}`).join('&');
  return md5(qs + key);
}

function verifyNotify(query, key) {
  const sign = query.sign;
  if (!sign) return false;
  const expect = buildSign(query, key);
  return crypto.timingSafeEqual(Buffer.from(sign), Buffer.from(expect));
}

function isConfigured() {
  const s = getSettings(['epay_gateway', 'epay_pid', 'epay_key']);
  return !!(s.epay_gateway && s.epay_pid && s.epay_key);
}

// 生成提交表单参数
function buildSubmitParams({ pid, key, gateway }, { outTradeNo, name, money, notifyUrl, returnUrl, type }) {
  const params = {
    pid: String(pid),
    type,                                  // alipay wxpay qqpay
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name,
    money: String(money),
  };
  params.sign = buildSign(params, key);
  params.sign_type = 'MD5';
  return params;
}

module.exports = { buildSign, verifyNotify, isConfigured, buildSubmitParams };
