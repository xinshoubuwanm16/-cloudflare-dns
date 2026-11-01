'use strict';
const express = require('express');
const path = require('path');
const { getSettings } = require('./db');
const { sessionMiddleware, cleanupSessions } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(sessionMiddleware);

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/pay', require('./routes/pay'));
app.use('/api/admin', require('./routes/admin'));

// 站点公开信息
app.get('/api/site', (req, res) => {
  const s = getSettings(['site_name', 'site_subtitle', 'buy_notice', 'credit_rate', 'checkin_base']);
  res.json({ site: s });
});

// 错误处理
// eslint-disable-next-line no-unused-vars
app.use('/api', (err, req, res, next) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 静态前端
const PUB = path.join(__dirname, '..', 'public');
app.use(express.static(PUB));
app.get(/^\/(?!api|pay).*/, (req, res) => res.sendFile(path.join(PUB, 'index.html')));

setInterval(cleanupSessions, 3600 * 1000).unref();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CloudNS 已启动: http://localhost:${PORT}`);
});
