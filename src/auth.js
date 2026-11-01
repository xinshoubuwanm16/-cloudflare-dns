'use strict';
const crypto = require('crypto');
const { db } = require('./db');

const COOKIE_NAME = 'cns_session';
const SESSION_DAYS = 7;

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = Date.now() + SESSION_DAYS * 86400 * 1000;
  db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token, userId, expires_at);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

// 挂载 req.user
function sessionMiddleware(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  req.sessionToken = token || null;
  req.user = null;
  if (token) {
    const row = db.prepare(`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token=? AND s.expires_at > ?
    `).get(token, Date.now());
    if (row) req.user = row;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (!req.user.is_admin) return res.status(403).json({ error: '需要管理员权限' });
  next();
}

module.exports = { COOKIE_NAME, createSession, destroySession, sessionMiddleware, requireAuth, requireAdmin, cleanupSessions };
