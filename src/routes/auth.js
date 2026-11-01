'use strict';
const express = require('express');
const { db, getSettings, hashPassword, verifyPassword, creditTx } = require('../db');
const { createSession, destroySession, requireAuth } = require('../auth');
const { aw, bad, localDateStr } = require('../helpers');
const { rateLimit } = require('../ratelimit');

const router = express.Router();

const authLimit = rateLimit({ windowMs: 60000, max: 10 });
const checkinLimit = rateLimit({ windowMs: 10000, max: 5 });

// 注册
router.post('/register', authLimit, aw(async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) return bad(res, '用户名需为 3-20 位字母、数字或下划线');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, '邮箱格式不正确');
  if (!password || password.length < 6 || password.length > 64) return bad(res, '密码长度需为 6-64 位');

  const exists = db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username, email);
  if (exists) return bad(res, '用户名或邮箱已被注册');

  const gift = parseInt(getSettings(['register_gift']).register_gift, 10) || 0;
  const info = db.prepare('INSERT INTO users(username,email,password_hash,credits) VALUES(?,?,?,?)')
    .run(username, email.toLowerCase(), hashPassword(password), gift);
  if (gift > 0) {
    db.prepare('INSERT INTO credit_logs(user_id,delta,balance,reason) VALUES(?,?,?,?)')
      .run(info.lastInsertRowid, gift, gift, '注册赠送');
  }
  res.setHeader('Set-Cookie', createSession(info.lastInsertRowid));
  res.json({ ok: true });
}));

// 登录
router.post('/login', authLimit, aw(async (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, username);
  if (!u || !verifyPassword(password || '', u.password_hash)) return bad(res, '用户名或密码错误', 401);
  res.setHeader('Set-Cookie', createSession(u.id));
  res.json({ ok: true, is_admin: !!u.is_admin });
}));

// 退出
router.post('/logout', aw(async (req, res) => {
  destroySession(req.sessionToken);
  res.setHeader('Set-Cookie', `${'cns_session'}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
}));

function mePayload(u) {
  return {
    id: u.id, username: u.username, email: u.email,
    credits: u.credits, is_admin: !!u.is_admin,
    streak: u.streak, last_checkin_date: u.last_checkin_date,
  };
}

// 当前用户
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: mePayload(req.user) });
});

// 签到
router.post('/checkin', requireAuth, checkinLimit, aw(async (req, res) => {
  const today = localDateStr();
  if (req.user.last_checkin_date === today) return bad(res, '今天已经签到过了');

  const s = getSettings(['checkin_base', 'checkin_bonus_max']);
  const base = parseInt(s.checkin_base, 10) || 5;
  const bonusMax = parseInt(s.checkin_bonus_max, 10) || 0;

  // 连续签到: 昨天签过则 streak+1, 否则重置为 1
  const yesterday = localDateStr(new Date(Date.now() - 86400 * 1000));
  const streak = req.user.last_checkin_date === yesterday ? (req.user.streak || 0) + 1 : 1;
  const bonus = Math.min(streak - 1, bonusMax);
  const gain = base + bonus;

  db.prepare('INSERT INTO checkins(user_id,date,credits,streak) VALUES(?,?,?,?)')
    .run(req.user.id, today, gain, streak);
  db.prepare('UPDATE users SET streak=?, last_checkin_date=? WHERE id=?')
    .run(streak, today, req.user.id);
  const balance = creditTx(req.user.id, gain, `每日签到 (连续${streak}天)`);

  res.json({ ok: true, gain, streak, balance });
}));

// 签到日历(近30天)
router.get('/checkin/calendar', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT date, credits, streak FROM checkins WHERE user_id=? ORDER BY date DESC LIMIT 30')
    .all(req.user.id);
  res.json({ days: rows });
});

// 积分日志
router.get('/credits/logs', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, delta, balance, reason, created_at FROM credit_logs WHERE user_id=? ORDER BY id DESC LIMIT 50')
    .all(req.user.id);
  res.json({ logs: rows });
});

module.exports = router;
