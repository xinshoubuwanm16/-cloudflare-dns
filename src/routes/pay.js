'use strict';
const express = require('express');
const { db, getSettings, creditTx } = require('../db');
const { requireAuth } = require('../auth');
const { aw, bad, genOrderNo, baseUrl } = require('../helpers');
const epay = require('../epay');

const router = express.Router();

// 充值配置 + 支付方式列表
router.get('/config', (req, res) => {
  const s = getSettings(['credit_rate', 'min_recharge', 'site_name']);
  res.json({
    credit_rate: parseInt(s.credit_rate, 10) || 10,
    min_recharge: parseFloat(s.min_recharge) || 1,
    epay_ready: epay.isConfigured(),
  });
});

// 创建订单(真实易支付或沙盒模式)
router.post('/create', requireAuth, aw(async (req, res) => {
  const { money, pay_type } = req.body || {};
  const s = getSettings(['credit_rate', 'min_recharge']);
  const rate = parseInt(s.credit_rate, 10) || 10;
  const min = parseFloat(s.min_recharge) || 1;

  const amount = Math.round(parseFloat(money) * 100) / 100;
  if (!amount || amount < min) return bad(res, `最低充值 ${min} 元`);
  if (amount > 5000) return bad(res, '单笔充值上限 5000 元');
  if (!['alipay', 'wxpay', 'qqpay'].includes(pay_type)) return bad(res, '请选择支付方式');

  const credits = Math.floor(amount * rate);
  const outTradeNo = genOrderNo();
  db.prepare('INSERT INTO orders(out_trade_no,user_id,money,credits,pay_type) VALUES(?,?,?,?,?)')
    .run(outTradeNo, req.user.id, amount, credits, pay_type);

  if (epay.isConfigured()) {
    const cfg = getSettings(['epay_gateway', 'epay_pid', 'epay_key']);
    const params = epay.buildSubmitParams(cfg, {
      outTradeNo,
      name: `${cfg.site_name || '积分充值'}-${credits}积分`,
      money: amount.toFixed(2),
      notifyUrl: `${baseUrl(req)}/api/pay/notify`,
      returnUrl: `${baseUrl(req)}/#/recharge?paid=${outTradeNo}`,
      type: pay_type,
    });
    // 构造自动提交到易支付网关的表单
    const inputs = Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}"/>`)
      .join('\n');
    return res.json({
      ok: true, mode: 'epay', out_trade_no: outTradeNo,
      submit_html: `<form id="epayform" method="post" action="${cfg.epay_gateway}/submit.php">${inputs}</form>`,
    });
  }

  // 沙盒模式：返回收银台 URL（演示支付）
  res.json({ ok: true, mode: 'sandbox', out_trade_no: outTradeNo, cash_url: `/api/pay/cashier/${outTradeNo}` });
}));

// 订单状态查询
router.get('/order/:no', requireAuth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE out_trade_no=? AND user_id=?').get(req.params.no, req.user.id);
  if (!o) return bad(res, '订单不存在', 404);
  res.json({ order: { out_trade_no: o.out_trade_no, money: o.money, credits: o.credits, status: o.status, pay_type: o.pay_type } });
});

// 我的订单
router.get('/orders', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT out_trade_no, money, credits, pay_type, status, created_at, paid_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 50')
    .all(req.user.id);
  res.json({ orders: rows });
});

// ---------- 易支付异步通知 ----------
router.get('/notify', aw(async (req, res) => {
  const key = getSettings(['epay_key']).epay_key;
  if (!epay.verifyNotify(req.query, key)) {
    return res.status(400).send('sign error');
  }
  const { out_trade_no, trade_no, money, trade_status } = req.query;
  if (trade_status !== 'TRADE_SUCCESS') return res.send('success');

  const o = db.prepare('SELECT * FROM orders WHERE out_trade_no=?').get(out_trade_no);
  if (!o) return res.status(400).send('order not found');
  if (o.status === 'paid') return res.send('success');
  if (Math.abs(parseFloat(money) - o.money) > 0.001) return res.status(400).send('money mismatch');

  const done = db.transaction(() => {
    db.prepare(`UPDATE orders SET status='paid', trade_no=?, paid_at=datetime('now','localtime') WHERE id=?`)
      .run(trade_no || '', o.id);
    creditTx(o.user_id, o.credits, `在线充值 ${o.money} 元 (订单 ${o.out_trade_no})`);
  });
  done();
  res.send('success');
}));

// 沙盒收银台(未配置易支付时的演示支付页)
router.get('/cashier/:no', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE out_trade_no=?').get(req.params.no);
  if (!o) return res.status(404).send('order not found');
  if (o.status === 'paid') return res.redirect('/#/recharge?paid=' + o.out_trade_no);
  res.send(`<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>沙盒收银台</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#f2f4f7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:40px;width:340px;text-align:center}
.amount{font-size:40px;font-weight:700;color:#1b1d20;margin:16px 0}
.muted{color:#6b7280;font-size:14px}
.btn{display:block;width:100%;padding:12px;border:none;border-radius:8px;background:#f6821f;color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:20px}
.btn:hover{background:#e2740f}
.tag{display:inline-block;background:#fff7ed;color:#c2410c;font-size:12px;padding:2px 10px;border-radius:99px}
</style></head><body><div class="card">
<div class="tag">沙盒演示支付</div>
<div class="amount">¥${o.money.toFixed(2)}</div>
<div class="muted">订单号 ${o.out_trade_no}<br>充值 ${o.credits} 积分 · 支付方式 ${o.pay_type}</div>
<a href="/api/pay/sandbox-pay/${o.out_trade_no}"><button class="btn">模拟支付成功</button></a>
<div class="muted" style="margin-top:12px">接入真实易支付后此页自动关闭</div>
</div></body></html>`);
});

// 沙盒支付确认
router.get('/sandbox-pay/:no', aw(async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE out_trade_no=?').get(req.params.no);
  if (!o) return res.status(404).send('order not found');
  if (o.status !== 'paid') {
    const done = db.transaction(() => {
      db.prepare(`UPDATE orders SET status='paid', trade_no=?, paid_at=datetime('now','localtime') WHERE id=?`)
        .run('SANDBOX-' + Date.now(), o.id);
      creditTx(o.user_id, o.credits, `沙盒充值 ${o.money} 元 (订单 ${o.out_trade_no})`);
    });
    done();
  }
  res.redirect('/#/recharge?paid=' + o.out_trade_no);
}));

module.exports = router;
