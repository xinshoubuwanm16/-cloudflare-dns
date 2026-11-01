'use strict';
const express = require('express');
const { db, creditTx } = require('../db');
const { requireAuth } = require('../auth');
const { aw, bad, validPrefix, isReserved, validateRecord, recordFqdn, RECORD_TYPES } = require('../helpers');
const { getProvider } = require('../providers');

const router = express.Router();
router.use(requireAuth);

// ---------- 可售域名列表(公开给登录用户) ----------
router.get('/zones', (req, res) => {
  const zones = db.prepare(`
    SELECT z.*, p.name AS provider_name, p.type AS provider_type,
      (SELECT COUNT(*) FROM subdomains s WHERE s.zone_id=z.id AND s.status='active') AS sold_count
    FROM zones z JOIN providers p ON p.id=z.provider_id
    WHERE z.enabled=1 ORDER BY z.price ASC, z.id ASC
  `).all();
  // 我在每个域名下已购数量
  const mine = db.prepare(`SELECT zone_id, COUNT(*) AS c FROM subdomains WHERE user_id=? AND status='active' GROUP BY zone_id`)
    .all(req.user.id);
  const mineMap = Object.fromEntries(mine.map(r => [r.zone_id, r.c]));
  for (const z of zones) z.mine_count = mineMap[z.id] || 0;
  res.json({ zones });
});

// ---------- 我的域名 ----------
router.get('/mine', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, z.name AS zone_name, z.max_records,
      (SELECT COUNT(*) FROM records r WHERE r.subdomain_id=s.id) AS record_count
    FROM subdomains s JOIN zones z ON z.id=s.zone_id
    WHERE s.user_id=? AND s.status='active'
    ORDER BY s.id DESC
  `).all(req.user.id);
  res.json({ subdomains: rows });
});

// ---------- 购买域名 ----------
router.post('/buy', aw(async (req, res) => {
  const { zone_id, prefix, years } = req.body || {};
  const y = Math.min(Math.max(parseInt(years, 10) || 1, 1), 5);

  if (!validPrefix(prefix)) return bad(res, '前缀格式不正确：仅允许小写字母、数字、连字符');
  if (isReserved(prefix)) return bad(res, '该前缀为保留字，不可使用');

  const zone = db.prepare('SELECT * FROM zones WHERE id=? AND enabled=1').get(zone_id);
  if (!zone) return bad(res, '域名不存在或已下架');

  const dup = db.prepare('SELECT id FROM subdomains WHERE full_name=?').get(`${prefix}.${zone.name}`);
  if (dup) return bad(res, '该子域名已被注册');

  const mineCount = db.prepare(`SELECT COUNT(*) AS c FROM subdomains WHERE user_id=? AND zone_id=? AND status='active'`)
    .get(req.user.id, zone.id).c;
  if (mineCount >= zone.max_per_user) return bad(res, `每个用户在该域名下最多持有 ${zone.max_per_user} 个子域名`);

  const cost = zone.price * y;
  const expires = new Date(Date.now() + y * 365 * 86400 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  const buyTx = db.transaction(() => {
    creditTx(req.user.id, -cost, `购买域名 ${prefix}.${zone.name} (${y}年)`);
    const info = db.prepare('INSERT INTO subdomains(zone_id,prefix,full_name,user_id,expires_at) VALUES(?,?,?,?,?)')
      .run(zone.id, prefix, `${prefix}.${zone.name}`, req.user.id, expires);
    return info.lastInsertRowid;
  });
  let subId;
  try { subId = buyTx(); } catch (e) { return bad(res, e.message); }

  res.json({ ok: true, id: subId, cost, expires_at: expires });
}));

// ---------- 续期 ----------
router.post('/:id/renew', aw(async (req, res) => {
  const sub = db.prepare(`
    SELECT s.*, z.price, z.name AS zone_name FROM subdomains s JOIN zones z ON z.id=s.zone_id
    WHERE s.id=? AND s.user_id=? AND s.status='active'
  `).get(req.params.id, req.user.id);
  if (!sub) return bad(res, '域名不存在', 404);

  const years = Math.min(Math.max(parseInt(req.body.years, 10) || 1, 1), 5);
  const cost = sub.price * years;
  const base = new Date(sub.expires_at) > new Date() ? new Date(sub.expires_at) : new Date();
  const newExpires = new Date(base.getTime() + years * 365 * 86400 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  try {
    creditTx(req.user.id, -cost, `续期域名 ${sub.full_name} (${years}年)`);
  } catch (e) { return bad(res, e.message); }
  db.prepare('UPDATE subdomains SET expires_at=? WHERE id=?').run(newExpires, sub.id);
  res.json({ ok: true, expires_at: newExpires, cost });
}));

// ---------- DNS 记录 ----------
function getOwnedSub(req) {
  return db.prepare(`
    SELECT s.*, z.name AS zone_name, z.max_records, z.provider_id, p.type AS provider_type, p.config AS provider_config
    FROM subdomains s JOIN zones z ON z.id=s.zone_id JOIN providers p ON p.id=z.provider_id
    WHERE s.id=? AND s.user_id=? AND s.status='active'
  `).get(req.params.id, req.user.id);
}

router.get('/:id/records', (req, res) => {
  const sub = getOwnedSub(req);
  if (!sub) return bad(res, '域名不存在', 404);
  const records = db.prepare('SELECT * FROM records WHERE subdomain_id=? ORDER BY id DESC').all(sub.id);
  res.json({ subdomain: sub, records, types: RECORD_TYPES });
});

router.post('/:id/records', aw(async (req, res) => {
  const sub = getOwnedSub(req);
  if (!sub) return bad(res, '域名不存在', 404);

  const count = db.prepare('SELECT COUNT(*) AS c FROM records WHERE subdomain_id=?').get(sub.id).c;
  if (count >= sub.max_records) return bad(res, `最多可创建 ${sub.max_records} 条记录`);

  const { type, label, content, ttl, priority, proxied } = req.body || {};
  const name = recordFqdn(label, sub.full_name);
  const ttlV = ttl === undefined || ttl === 1 || ttl === '1' ? 1 : parseInt(ttl, 10);
  const prio = priority === undefined || priority === '' ? 0 : parseInt(priority, 10);

  const err = validateRecord(type, name, String(content || '').trim(), ttlV, prio);
  if (err) return bad(res, err);
  const contentV = String(content).trim();

  const provider = getProvider(sub.provider_type);
  const external = await provider.createRecord(JSON.parse(sub.provider_config || '{}'), sub.zone_name, {
    type, name, content: contentV, ttl: ttlV, proxied: !!proxied, priority: prio,
  });

  const info = db.prepare(`INSERT INTO records(subdomain_id,type,name,content,ttl,proxied,priority,external_id)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(sub.id, type, name, contentV, ttlV, sub.provider_type === 'cloudflare' ? (proxied ? 1 : 0) : 0, prio, external.id);
  res.json({ ok: true, id: info.lastInsertRowid });
}));

router.put('/:id/records/:rid', aw(async (req, res) => {
  const sub = getOwnedSub(req);
  if (!sub) return bad(res, '域名不存在', 404);
  const rec = db.prepare('SELECT * FROM records WHERE id=? AND subdomain_id=?').get(req.params.rid, sub.id);
  if (!rec) return bad(res, '记录不存在', 404);

  const { type, label, content, ttl, priority, proxied } = req.body || {};
  const name = recordFqdn(label, sub.full_name);
  const ttlV = ttl === undefined || ttl === 1 || ttl === '1' ? 1 : parseInt(ttl, 10);
  const prio = priority === undefined || priority === '' ? 0 : parseInt(priority, 10);
  const err = validateRecord(type, name, String(content || '').trim(), ttlV, prio);
  if (err) return bad(res, err);
  const contentV = String(content).trim();

  const provider = getProvider(sub.provider_type);
  const external = await provider.updateRecord(
    JSON.parse(sub.provider_config || '{}'), sub.zone_name, rec.external_id,
    { type, name, content: contentV, ttl: ttlV, proxied: !!proxied, priority: prio },
  );

  db.prepare(`UPDATE records SET type=?, name=?, content=?, ttl=?, proxied=?, priority=?, external_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(type, name, contentV, ttlV, sub.provider_type === 'cloudflare' ? (proxied ? 1 : 0) : 0, prio, external.id, rec.id);
  res.json({ ok: true });
}));

router.delete('/:id/records/:rid', aw(async (req, res) => {
  const sub = getOwnedSub(req);
  if (!sub) return bad(res, '域名不存在', 404);
  const rec = db.prepare('SELECT * FROM records WHERE id=? AND subdomain_id=?').get(req.params.rid, sub.id);
  if (!rec) return bad(res, '记录不存在', 404);

  if (rec.external_id) {
    const provider = getProvider(sub.provider_type);
    await provider.deleteRecord(JSON.parse(sub.provider_config || '{}'), sub.zone_name, rec.external_id);
  }
  db.prepare('DELETE FROM records WHERE id=?').run(rec.id);
  res.json({ ok: true });
}));

module.exports = router;
