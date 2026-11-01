'use strict';
// 简单的内存限流（单进程）：防暴力破解与刷接口
const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 20, key = req => req.ip } = {}) {
  return (req, res, next) => {
    const k = key(req) + ':' + req.path;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(k, b);
    }
    b.count++;
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 300000).unref();

module.exports = { rateLimit };
