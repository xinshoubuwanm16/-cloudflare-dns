'use strict';
const crypto = require('crypto');

// async 路由包装
function aw(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function genOrderNo() {
  return Date.now().toString(36).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase();
}

const RESERVED_PREFIX = new Set(['www', 'mail', 'smtp', 'pop', 'imap', 'ns', 'ns1', 'ns2', 'ftp', 'admin', 'api', 'webmail', 'mx', 'mx1', 'mx2']);

function validPrefix(prefix) {
  if (typeof prefix !== 'string') return false;
  prefix = prefix.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(prefix)) return false;
  if (prefix.length > 62) return false;
  return true;
}

function isReserved(prefix) {
  const first = prefix.split('.')[0];
  return RESERVED_PREFIX.has(first);
}

function validHostname(h) {
  return typeof h === 'string' && h.length <= 253 &&
    /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.?$/i.test(h) && h.includes('.');
}

function validIPv4(s) { return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s); }
function validIPv6(s) { return /^[0-9a-fA-F:]+$/.test(s) && s.includes(':'); }

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'];

// 校验记录内容, 返回 error 字符串或 null
function validateRecord(type, name, content, ttl, priority) {
  if (!RECORD_TYPES.includes(type)) return '不支持的记录类型';
  if (ttl !== 1 && (!(Number.isInteger(ttl)) || ttl < 60 || ttl > 86400)) return 'TTL 需为自动或 60-86400 之间的整数';
  switch (type) {
    case 'A':
      if (!validIPv4(content)) return 'A 记录内容需为 IPv4 地址';
      break;
    case 'AAAA':
      if (!validIPv6(content)) return 'AAAA 记录内容需为 IPv6 地址';
      break;
    case 'CNAME':
    case 'NS':
      if (!validHostname(content)) return '内容需为有效的域名';
      break;
    case 'MX':
      if (!validHostname(content)) return 'MX 内容需为邮件服务器域名';
      if (!(Number.isInteger(priority) && priority >= 0 && priority <= 65535)) return 'MX 优先级需为 0-65535';
      break;
    case 'SRV':
      if (!/^\d+\s+\d+\s+\d+\s+\S+$/.test(content)) return 'SRV 内容格式: 优先级 权重 端口 目标';
      break;
    case 'TXT':
      if (typeof content !== 'string' || !content.length || content.length > 500) return 'TXT 内容长度需为 1-500';
      break;
    case 'CAA':
      if (!/^\d+\s+(issue|issuewild|iodef)\s+\S+$/i.test(content)) return 'CAA 内容格式: 0 issue "ca.example.com"';
      break;
  }
  return null;
}

// 记录主机名: 相对标签 -> FQDN
function recordFqdn(label, subdomainFqdn) {
  if (!label || label === '@') return subdomainFqdn;
  return `${label}.${subdomainFqdn}`;
}

function localDateStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted) || req.secure ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

module.exports = {
  aw, bad, genOrderNo, validPrefix, isReserved, validateRecord, recordFqdn,
  validHostname, localDateStr, baseUrl, RECORD_TYPES,
};
