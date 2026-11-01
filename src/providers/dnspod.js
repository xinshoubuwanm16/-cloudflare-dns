'use strict';
// 腾讯云 DNSPod 适配器 (TC3-HMAC-SHA256 签名, API 2021-03-23)
// config: { secretId, secretKey }

const crypto = require('crypto');

const ENDPOINT = 'dnspod.tencentcloudapi.com';
const SERVICE = 'dnspod';
const VERSION = '2021-03-23';

function sha256hex(msg, key) {
  return crypto.createHmac('sha256', key).update(msg).digest('hex');
}

async function tc3Request(config, action, payload) {
  const region = '';
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);

  const body = JSON.stringify(payload);
  const hashedPayload = crypto.createHash('sha256').update(body).digest('hex');

  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${ENDPOINT}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = [httpRequestMethod, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, hashedPayload].join('\n');

  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = [algorithm, ts, credentialScope, hashedCanonicalRequest].join('\n');

  const secretDate = sha256hex(date, `TC3${config.secretKey}`);
  const secretService = sha256hex(SERVICE, secretDate);
  const secretSigning = sha256hex('tc3_request', secretService);
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  const authorization = `${algorithm} Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: ENDPOINT,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(ts),
      'X-TC-Version': VERSION,
      ...(region ? { 'X-TC-Region': region } : {}),
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (data.Response && data.Response.Error) {
    throw new Error(`DNSPod: ${data.Response.Error.Code} ${data.Response.Error.Message}`);
  }
  if (!res.ok || !data.Response) throw new Error(`DNSPod: HTTP ${res.status}`);
  return data.Response;
}

// FQDN -> 子域名前缀
function toSubDomain(fqdn, zoneName) {
  if (fqdn === zoneName) return '@';
  const suffix = '.' + zoneName;
  if (fqdn.endsWith(suffix)) return fqdn.slice(0, -suffix.length);
  return fqdn;
}

module.exports = {
  type: 'dnspod',
  label: '腾讯云 DNSPod',
  configFields: [
    { key: 'secretId', label: 'SecretId', placeholder: '腾讯云 API 密钥 ID' },
    { key: 'secretKey', label: 'SecretKey', placeholder: '腾讯云 API 密钥 Key', secret: true },
  ],
  async test(config) {
    const r = await tc3Request(config, 'DescribeDomainList', { Offset: 0, Limit: 1 });
    return { ok: true, message: `连接成功，共有 ${r.DomainListInfo && r.DomainListInfo.TotalCount !== undefined ? r.DomainListInfo.TotalCount : '?'} 个域名` };
  },
  async createRecord(config, zoneName, rec) {
    const payload = {
      Domain: zoneName,
      SubDomain: toSubDomain(rec.name, zoneName),
      RecordType: rec.type,
      RecordLine: '默认',
      Value: rec.content,
      TTL: rec.ttl && rec.ttl !== 1 ? Number(rec.ttl) : 600,
    };
    if (rec.type === 'MX') payload.MX = Number(rec.priority) || 10;
    const r = await tc3Request(config, 'CreateRecord', payload);
    return { id: String(r.RecordId) };
  },
  async updateRecord(config, zoneName, externalId, rec) {
    const payload = {
      Domain: zoneName,
      RecordId: Number(externalId),
      SubDomain: toSubDomain(rec.name, zoneName),
      RecordType: rec.type,
      RecordLine: '默认',
      Value: rec.content,
      TTL: rec.ttl && rec.ttl !== 1 ? Number(rec.ttl) : 600,
    };
    if (rec.type === 'MX') payload.MX = Number(rec.priority) || 10;
    const r = await tc3Request(config, 'ModifyRecord', payload);
    return { id: String(r.RecordId) };
  },
  async deleteRecord(config, zoneName, externalId) {
    await tc3Request(config, 'DeleteRecord', { Domain: zoneName, RecordId: Number(externalId) });
  },
};
