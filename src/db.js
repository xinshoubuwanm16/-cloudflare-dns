'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'panel.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_checkin_date TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- cloudflare | dnspod | aliyun | mock
  config TEXT NOT NULL DEFAULT '{}',-- JSON credentials
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- 主域名, 如 example.com
  provider_id INTEGER NOT NULL REFERENCES providers(id),
  price INTEGER NOT NULL DEFAULT 10,     -- 积分/年
  max_records INTEGER NOT NULL DEFAULT 10,
  max_per_user INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS subdomains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  prefix TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subdomain_id INTEGER NOT NULL REFERENCES subdomains(id) ON DELETE CASCADE,
  type TEXT NOT NULL,               -- A AAAA CNAME TXT MX NS SRV CAA
  name TEXT NOT NULL,               -- 完整 FQDN
  content TEXT NOT NULL,
  ttl INTEGER NOT NULL DEFAULT 1,   -- 1 = auto
  proxied INTEGER NOT NULL DEFAULT 0,
  priority INTEGER DEFAULT 0,       -- MX / SRV
  external_id TEXT DEFAULT NULL,    -- 服务商记录 ID
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  out_trade_no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  money REAL NOT NULL,
  credits INTEGER NOT NULL,
  pay_type TEXT NOT NULL,           -- alipay wxpay qqpay
  status TEXT NOT NULL DEFAULT 'pending', -- pending paid closed
  trade_no TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  paid_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS credit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,               -- YYYY-MM-DD
  credits INTEGER NOT NULL,
  streak INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  site_name: 'CloudNS',
  site_subtitle: '二级域名分发平台',
  credit_rate: '10',          // 1 元 = 10 积分
  min_recharge: '1',          // 最低充值金额(元)
  register_gift: '10',        // 注册赠送积分
  checkin_base: '5',          // 签到基础积分
  checkin_bonus_max: '5',     // 连续签到每日递增上限
  epay_gateway: '',           // 易支付网关, 如 https://pay.xxx.com
  epay_pid: '',
  epay_key: '',
  buy_notice: '购买后域名有效期为 365 天，到期前可按原价续期。',
};

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : (DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : '');
}
function getSettings(keys) {
  const out = {};
  for (const k of keys || Object.keys(DEFAULT_SETTINGS)) out[k] = getSetting(k);
  return out;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value));
}

// ---------- password ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}

// ---------- credits ----------
const creditTx = db.transaction((userId, delta, reason) => {
  const u = db.prepare('SELECT credits FROM users WHERE id=?').get(userId);
  if (!u) throw new Error('用户不存在');
  const balance = u.credits + delta;
  if (balance < 0) throw new Error('积分不足');
  db.prepare('UPDATE users SET credits=? WHERE id=?').run(balance, userId);
  db.prepare('INSERT INTO credit_logs(user_id,delta,balance,reason) VALUES(?,?,?,?)')
    .run(userId, delta, balance, reason);
  return balance;
});

// ---------- seed ----------
function seed() {
  const hasAdmin = db.prepare('SELECT id FROM users WHERE is_admin=1 LIMIT 1').get();
  if (!hasAdmin) {
    db.prepare('INSERT INTO users(username,email,password_hash,credits,is_admin) VALUES(?,?,?,?,1)')
      .run('admin', 'admin@local.host', hashPassword('admin123'), 10000);
    console.log('[seed] 已创建管理员 admin / admin123');
  }
  const hasProvider = db.prepare('SELECT id FROM providers LIMIT 1').get();
  if (!hasProvider) {
    const info = db.prepare('INSERT INTO providers(name,type,config) VALUES(?,?,?)')
      .run('内置演示(本地)', 'mock', '{}');
    const pid = info.lastInsertRowid;
    const seedZones = [
      ['cf-demo.xyz', 30, '演示主域名 · 可在后台替换为真实域名'],
      ['demo-site.top', 20, ''],
      ['free-test.cn', 10, ''],
    ];
    for (const [name, price, note] of seedZones) {
      db.prepare('INSERT INTO zones(name,provider_id,price,note) VALUES(?,?,?,?)').run(name, pid, price, note);
    }
    console.log('[seed] 已创建 Mock 服务商与 3 个演示主域名');
  }
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!db.prepare('SELECT key FROM settings WHERE key=?').get(k)) setSetting(k, v);
  }
}
seed();

module.exports = {
  db,
  DEFAULT_SETTINGS,
  getSetting,
  getSettings,
  setSetting,
  hashPassword,
  verifyPassword,
  creditTx,
};
