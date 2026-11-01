'use strict';
const express = require('express');
const { db, getSettings, setSetting, DEFAULT_SETTINGS, hashPassword, creditTx } = require('../db');
const { requireAdmin } = require('../auth');
const { aw, bad } = require('../helpers');
const { all: providerRegistry } = require('../providers');

const router = express.Router();
router.use(requireAdmin);

// ---------- 统计 ----------
router.get('/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const zones = db.prepare('SELECT COUNT(*) c FROM zones').get().c;
  const subs = db.prepare(`SELECT COUNT(*) c FROM subdomains WHERE status='active'`).get().c;
  const records = db.prepare('SELECT COUNT(*) c FROM records').get().c;
  const paidSum = db.prepare(`SELECT COALESCE(SUM(money),0) m FROM orders WHERE status='paid'`).get().m;
  const today = new Date().toISOString().slice(0, 10);
  const todayCheckins = db.prepare('SELECT COUNT(*) c FROM checkins WHERE date=?').get(today).c;
  res.json({ users, zones, subs, records, paid_sum: paidSum, today_checkins: todayCheckins });
});

// ---------- 服务商 ----------
router.get('/providers', (req, res) => {
  const rows = db.prepare('SELECT * FROM providers ORDER BY id').all();
  // config 中的 secret 字段打码
  for (const r of rows) {
    const cfg = JSON.parse(r.config || '{}');
    const def = providerRegistry[r.type];
    if (def) {
      for (const f of def.configFields) {
        if (f.secret && cfg[f.key]) cfg[f.key] = '••••••' + String(cfg[f.key]).slice(-4);
      }
    }
    r.config = JSON.stringify(cfg);
    r.fields = def ? def.configFields : [];
    r.label = def ? def.label : r.type;
  }
  res.json({ providers: rows });
});

router.post('/providers', aw(async (req, res) => {
  const { name, type, config } = req.body || {};
  if (!providerRegistry[type]) return bad(res, '不支持的服务商类型');
  const info = db.prepare('INSERT INTO providers(name,type,config) VALUES(?,?,?)')
    .run(name || providerRegistry[type].label, type, JSON.stringify(config || {}));
  res.json({ ok: true, id: info.lastInsertRowid });
}));

router.put('/providers/:id', aw(async (req, res) => {
  const p = db.prepare('SELECT * FROM providers WHERE id=?').get(req.params.id);
  if (!p) return bad(res, '服务商不存在', 404);
  const { name, config } = req.body || {};
  let cfg = {};
  try { cfg = JSON.parse(config || '{}'); } catch { return bad(res, '配置格式错误'); }
  // 若 secret 字段是打码值则保留原值
  const oldCfg = JSON.parse(p.config || '{}');
  for (const f of providerRegistry[p.type].configFields) {
    if (f.secret && typeof cfg[f.key] === 'string' && cfg[f.key].startsWith('••••••')) {
      cfg[f.key] = oldCfg[f.key];
    }
  }
  db.prepare('UPDATE providers SET name=?, config=? WHERE id=?').run(name || p.name, JSON.stringify(cfg), p.id);
  res.json({ ok: true });
}));

router.post('/providers/:id/test', aw(async (req, res) => {
  const p = db.prepare('SELECT * FROM providers WHERE id=?').get(req.params.id);
  if (!p) return bad(res, '服务商不存在', 404);
  try {
    const def = providerRegistry[p.type];
    const r = await def.test(JSON.parse(p.config || '{}'));
    res.json(r);
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
}));

router.delete('/providers/:id', aw(async (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM zones WHERE provider_id=?').get(req.params.id).c;
  if (used) return bad(res, `仍有 ${used} 个主域名使用该服务商，无法删除`);
  db.prepare('DELETE FROM providers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- 主域名 ----------
router.get('/zones', (req, res) => {
  const rows = db.prepare(`
    SELECT z.*, p.name AS provider_name,
      (SELECT COUNT(*) FROM subdomains s WHERE s.zone_id=z.id) AS sold_count
    FROM zones z JOIN providers p ON p.id=z.provider_id ORDER BY z.id
  `).all();
  res.json({ zones: rows });
});

router.post('/zones', (req, res) => {
  const { name, provider_id, price, max_records, max_per_user, note } = req.body || {};
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(name || '')) {
    return bad(res, '主域名格式不正确');
  }
  if (db.prepare('SELECT id FROM zones WHERE name=?').get(name)) return bad(res, '该域名已存在');
  const info = db.prepare('INSERT INTO zones(name,provider_id,price,max_records,max_per_user,note) VALUES(?,?,?,?,?,?)')
    .run(name, provider_id, Math.max(parseInt(price, 10) || 10, 0), Math.max(parseInt(max_records, 10) || 10, 1),
      Math.max(parseInt(max_per_user, 10) || 5, 1), note || '');
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/zones/:id', (req, res) => {
  const z = db.prepare('SELECT * FROM zones WHERE id=?').get(req.params.id);
  if (!z) return bad(res, '域名不存在', 404);
  const { name, provider_id, price, max_records, max_per_user, note, enabled } = req.body || {};
  db.prepare('UPDATE zones SET name=?, provider_id=?, price=?, max_records=?, max_per_user=?, note=?, enabled=? WHERE id=?')
    .run(
      name || z.name,
      provider_id || z.provider_id,
      price !== undefined ? Math.max(parseInt(price, 10) || 0, 0) : z.price,
      max_records !== undefined ? Math.max(parseInt(max_records, 10) || 1, 1) : z.max_records,
      max_per_user !== undefined ? Math.max(parseInt(max_per_user, 10) || 1, 1) : z.max_per_user,
      note !== undefined ? note : z.note,
      enabled !== undefined ? (enabled ? 1 : 0) : z.enabled,
      z.id,
    );
  res.json({ ok: true });
});

router.delete('/zones/:id', aw(async (req, res) => {
  const sold = db.prepare('SELECT COUNT(*) c FROM subdomains WHERE zone_id=?').get(req.params.id).c;
  if (sold) return bad(res, `该域名下仍有 ${sold} 个已售子域名，请先下架而非删除`);
  db.prepare('DELETE FROM zones WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- 子域名 ----------
router.get('/subdomains', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const rows = db.prepare(`
    SELECT s.*, z.name AS zone_name, u.username
    FROM subdomains s JOIN zones z ON z.id=s.zone_id JOIN users u ON u.id=s.user_id
    WHERE s.full_name LIKE ? OR u.username LIKE ?
    ORDER BY s.id DESC LIMIT 200
  `).all(q, q);
  res.json({ subdomains: rows });
});

router.delete('/subdomains/:id', aw(async (req, res) => {
  // 管理员删除: 同步删除外部记录后级联删除本地记录
  const sub = db.prepare(`
    SELECT s.*, p.type AS provider_type, p.config AS provider_config, z.name AS zone_name
    FROM subdomains s JOIN zones z ON z.id=s.zone_id JOIN providers p ON p.id=z.provider_id
    WHERE s.id=?
  `).get(req.params.id);
  if (!sub) return bad(res, '不存在', 404);
  const recs = db.prepare('SELECT * FROM records WHERE subdomain_id=?').all(sub.id);
  const def = providerRegistry[sub.provider_type];
  for (const r of recs) {
    if (r.external_id && def) {
      try { await def.deleteRecord(JSON.parse(sub.provider_config || '{}'), sub.zone_name, r.external_id); } catch {}
    }
  }
  db.prepare('DELETE FROM subdomains WHERE id=?').run(sub.id);
  res.json({ ok: true });
}));

// ---------- 用户 ----------
router.get('/users', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const rows = db.prepare(`
    SELECT id, username, email, credits, is_admin, streak, created_at,
      (SELECT COUNT(*) FROM subdomains s WHERE s.user_id=users.id) AS sub_count
    FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 200
  `).all(q, q);
  res.json({ users: rows });
});

router.put('/users/:id/credits', aw(async (req, res) => {
  const delta = parseInt(req.body.delta, 10);
  if (!delta) return bad(res, '变动值不能为 0');
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
  if (!u) return bad(res, '用户不存在', 404);
  const balance = creditTx(u.id, delta, `管理员调整 (${req.user.username})`);
  res.json({ ok: true, balance });
}));

router.put('/users/:id/admin', (req, res) => {
  const flag = req.body.is_admin ? 1 : 0;
  db.prepare('UPDATE users SET is_admin=? WHERE id=?').run(flag, req.params.id);
  res.json({ ok: true });
});

router.put('/users/:id/password', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return bad(res, '密码长度至少 6 位');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), req.params.id);
  res.json({ ok: true });
});

// ---------- 订单 ----------
router.get('/orders', (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, u.username FROM orders o JOIN users u ON u.id=o.user_id
    ORDER BY o.id DESC LIMIT 200
  `).all();
  res.json({ orders: rows });
});

// ---------- 设置 ----------
router.get('/settings', (req, res) => {
  res.json({ settings: getSettings(Object.keys(DEFAULT_SETTINGS)) });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (body[k] !== undefined) setSetting(k, body[k]);
  }
  res.json({ ok: true });
});

module.exports = router;
