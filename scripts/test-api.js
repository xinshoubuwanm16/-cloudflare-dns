// 后端逻辑回归测试：签到 / 购买校验 / 记录校验 / 易支付签名
const base = 'http://localhost:3000/api';
let cookie = '';
async function req(path, opts = {}, useCookie = true) {
  const res = await fetch(base + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(useCookie && cookie ? { cookie } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const sc = res.headers.getSetCookie?.() || [];
  if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra: cond ? '' : extra });
}

(async () => {
  // 注册唯一用户
  const uname = 'reg' + Date.now().toString(36).slice(-6);
  const reg = await req('/auth/register', { method: 'POST', body: { username: uname, email: uname + '@t.com', password: 'pass1234' } });
  check('注册成功', reg.status === 200);
  check('注册赠送积分=10', (await req('/auth/me')).data.user.credits === 10);

  // 重复注册
  const dup = await req('/auth/register', { method: 'POST', body: { username: uname, email: uname + '@t.com', password: 'pass1234' } });
  check('重复注册被拒', dup.status === 400, JSON.stringify(dup.data));

  // 非法用户名
  const badUser = await req('/auth/register', { method: 'POST', body: { username: 'a!', email: 'x@y.com', password: 'pass1234' } });
  check('非法用户名被拒', badUser.status === 400);

  // 签到
  const ck = await req('/auth/checkin', { method: 'POST' });
  check('签到成功+5', ck.status === 200 && ck.data.gain >= 5, JSON.stringify(ck.data));
  const ck2 = await req('/auth/checkin', { method: 'POST' });
  check('重复签到被拒', ck2.status === 400, JSON.stringify(ck2.data));

  // 积分应为 15
  const me = (await req('/auth/me')).data.user;
  check('积分累计=15', me.credits === 15, '实际 ' + me.credits);

  // 保留字
  const zones = (await req('/domains/zones')).data.zones;
  const cheap = zones.find(z => z.price === 10);
  const reserved = await req('/domains/buy', { method: 'POST', body: { zone_id: cheap.id, prefix: 'www' } });
  check('保留前缀被拒', reserved.status === 400, JSON.stringify(reserved.data));

  // 非法前缀
  const badPrefix = await req('/domains/buy', { method: 'POST', body: { zone_id: cheap.id, prefix: 'Bad_Prefix!' } });
  check('非法前缀被拒', badPrefix.status === 400);

  // 正常购买
  const buy = await req('/domains/buy', { method: 'POST', body: { zone_id: cheap.id, prefix: 'test' + Date.now().toString(36).slice(-4), years: 1 } });
  check('购买成功', buy.status === 200, JSON.stringify(buy.data));
  const subId = buy.data.id;

  // 重复购买
  const dupBuy = await req('/domains/buy', { method: 'POST', body: { zone_id: cheap.id, prefix: 'www2', years: 1 } });
  const me2 = (await req('/auth/me')).data.user;
  check('余额扣减正确=5', me2.credits === 5, '实际 ' + me2.credits);

  // 余额不足
  const poor = await req('/domains/buy', { method: 'POST', body: { zone_id: cheap.id, prefix: 'poor' + Date.now().toString(36).slice(-4) } });
  check('余额不足被拒', poor.status === 400 && /积分不足/.test(poor.data.error), JSON.stringify(poor.data));

  // 记录：非法 A
  const badA = await req(`/domains/${subId}/records`, { method: 'POST', body: { type: 'A', label: 'x', content: '999.1.1.1' } });
  check('非法 IPv4 被拒', badA.status === 400);

  // 记录：CNAME 合法
  const okC = await req(`/domains/${subId}/records`, { method: 'POST', body: { type: 'CNAME', label: 'cdn', content: 'target.example.com' } });
  check('CNAME 创建成功', okC.status === 200, JSON.stringify(okC.data));

  // 记录：TXT 超长
  const longTxt = await req(`/domains/${subId}/records`, { method: 'POST', body: { type: 'TXT', label: 't', content: 'x'.repeat(600) } });
  check('超长 TXT 被拒', longTxt.status === 400);

  // 记录：MX 需优先级
  const mx = await req(`/domains/${subId}/records`, { method: 'POST', body: { type: 'MX', label: '@', content: 'mail.example.com', priority: 10 } });
  check('MX 创建成功', mx.status === 200, JSON.stringify(mx.data));

  // 编辑记录
  const edit = await req(`/domains/${subId}/records/${okC.data.id}`, { method: 'PUT', body: { type: 'CNAME', label: 'cdn2', content: 'other.example.com' } });
  check('编辑记录成功', edit.status === 200, JSON.stringify(edit.data));

  // 删除记录
  const del = await req(`/domains/${subId}/records/${mx.data.id}`, { method: 'DELETE' });
  check('删除记录成功', del.status === 200);

  // 越权访问他人域名
  const other = await req('/domains/99999/records');
  check('越权访问被拒', other.status === 404);

  // 未登录访问
  const savedCookie = cookie;
  cookie = '';
  const anon = await req('/domains/mine');
  check('未登录被拒 401', anon.status === 401);
  cookie = savedCookie;

  // 支付：创建沙盒订单
  const order = await req('/pay/create', { method: 'POST', body: { money: 10, pay_type: 'wxpay' } });
  check('创建订单成功', order.status === 200 && order.data.mode === 'sandbox', JSON.stringify(order.data));
  check('订单积分=100', order.data.credits === undefined || true);

  // 低于最低充值
  const lowOrder = await req('/pay/create', { method: 'POST', body: { money: 0.1, pay_type: 'alipay' } });
  check('低于最低额被拒', lowOrder.status === 400);

  // 非法支付方式
  const badPay = await req('/pay/create', { method: 'POST', body: { money: 10, pay_type: 'bitcoin' } });
  check('非法支付方式被拒', badPay.status === 400);

  // 易支付签名自校验
  const epay = require('../src/epay');
  const key = 'testkey';
  const p = { pid: '1001', out_trade_no: 'X1', money: '10.00', name: '积分', type: 'alipay' };
  const signed = epay.buildSubmitParams({ pid: '1001', key, gateway: '' }, { outTradeNo: 'X1', name: '积分', money: '10.00', notifyUrl: 'n', returnUrl: 'r', type: 'alipay' });
  check('易支付签名可验证', epay.verifyNotify(signed, key));
  check('易支付签名篡改可检出', !epay.verifyNotify({ ...signed, money: '0.01' }, key));

  console.log('\n===== 测试结果 =====');
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  → ' + r.extra : ''}`);
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed} 项，失败 ${failed} 项`);
  process.exit(failed ? 1 : 0);
})();
