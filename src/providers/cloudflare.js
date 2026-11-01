'use strict';
// Cloudflare API v4 适配器
// config: { token: 'API Token' }  (需要 Zone.DNS Edit 权限)

const API = 'https://api.cloudflare.com/client/v4';

async function cfFetch(config, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = (data.errors && data.errors[0] && (data.errors[0].message || data.errors[0].code)) || `HTTP ${res.status}`;
    throw new Error(`Cloudflare: ${msg}`);
  }
  return data.result;
}

async function getZoneId(config, zoneName) {
  const list = await cfFetch(config, 'GET', `/zones?name=${encodeURIComponent(zoneName)}&status=active`);
  if (!list.length) throw new Error(`Cloudflare 账户中未找到区域 ${zoneName} (或未激活)`);
  return list[0].id;
}

module.exports = {
  type: 'cloudflare',
  label: 'Cloudflare',
  configFields: [
    { key: 'token', label: 'API Token', placeholder: '需要 Zone → DNS → Edit 权限', secret: true },
  ],
  async test(config) {
    const r = await cfFetch(config, 'GET', '/user/tokens/verify');
    return { ok: true, message: `Token 有效 (${r.status})` };
  },
  async createRecord(config, zoneName, rec) {
    const zid = await getZoneId(config, zoneName);
    const r = await cfFetch(config, 'POST', `/zones/${zid}/dns_records`, {
      type: rec.type,
      name: rec.name,
      content: rec.content,
      ttl: rec.ttl === 1 ? 1 : Number(rec.ttl),
      proxied: !!rec.proxied,
      priority: rec.priority || undefined,
    });
    return { id: r.id };
  },
  async updateRecord(config, zoneName, externalId, rec) {
    const zid = await getZoneId(config, zoneName);
    const r = await cfFetch(config, 'PUT', `/zones/${zid}/dns_records/${externalId}`, {
      type: rec.type,
      name: rec.name,
      content: rec.content,
      ttl: rec.ttl === 1 ? 1 : Number(rec.ttl),
      proxied: !!rec.proxied,
      priority: rec.priority || undefined,
    });
    return { id: r.id };
  },
  async deleteRecord(config, zoneName, externalId) {
    const zid = await getZoneId(config, zoneName);
    await cfFetch(config, 'DELETE', `/zones/${zid}/dns_records/${externalId}`);
  },
};
