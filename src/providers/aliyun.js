'use strict';
// 阿里云云解析 DNS 适配器 (RPC 签名 HMAC-SHA1, API 2015-01-09)
// config: { accessKeyId, accessKeySecret }

const crypto = require('crypto');

const ENDPOINT = 'https://alidns.aliyuncs.com';

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2B')
    .replace(/%7E/g, '~');
}

async function rpc(config, params) {
  const all = Object.assign({
    Format: 'JSON',
    Version: '2015-01-09',
    AccessKeyId: config.accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomBytes(16).toString('hex'),
  }, params);

  const sorted = Object.keys(all).sort()
    .map(k => `${percentEncode(k)}=${percentEncode(all[k])}`).join('&');
  const stringToSign = `GET&%2F&${percentEncode(sorted)}`;
  const signature = crypto.createHmac('sha1', config.accessKeySecret + '&')
    .update(stringToSign).digest('base64');

  const url = `${ENDPOINT}/?${sorted}&Signature=${percentEncode(signature)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.Error) throw new Error(`阿里云: ${data.Error.Code} ${data.Error.Message}`);
  // 阿里云部分接口把错误放在顶层 Code/Message
  if (!res.ok || (data.Code && data.Message)) {
    throw new Error(`阿里云: ${data.Code || 'HTTP ' + res.status} ${data.Message || ''}`.trim());
  }
  return data;
}

function toRR(fqdn, zoneName) {
  if (fqdn === zoneName) return '@';
  const suffix = '.' + zoneName;
  if (fqdn.endsWith(suffix)) return fqdn.slice(0, -suffix.length);
  return fqdn;
}

module.exports = {
  type: 'aliyun',
  label: '阿里云 DNS',
  configFields: [
    { key: 'accessKeyId', label: 'AccessKeyId', placeholder: '阿里云 AccessKey ID' },
    { key: 'accessKeySecret', label: 'AccessKeySecret', placeholder: '阿里云 AccessKey Secret', secret: true },
  ],
  async test(config) {
    const r = await rpc(config, { Action: 'DescribeDomains', PageSize: 1, PageNumber: 1 });
    return { ok: true, message: `连接成功，共有 ${r.TotalCount} 个域名` };
  },
  async createRecord(config, zoneName, rec) {
    const params = {
      Action: 'AddDomainRecord',
      DomainName: zoneName,
      RR: toRR(rec.name, zoneName),
      Type: rec.type,
      Value: rec.content,
      TTL: rec.ttl && rec.ttl !== 1 ? Number(rec.ttl) : 600,
    };
    if (rec.type === 'MX' || rec.type === 'SRV') params.Priority = Number(rec.priority) || 10;
    const r = await rpc(config, params);
    return { id: String(r.RecordId) };
  },
  async updateRecord(config, zoneName, externalId, rec) {
    const params = {
      Action: 'UpdateDomainRecord',
      RecordId: String(externalId),
      RR: toRR(rec.name, zoneName),
      Type: rec.type,
      Value: rec.content,
      TTL: rec.ttl && rec.ttl !== 1 ? Number(rec.ttl) : 600,
    };
    if (rec.type === 'MX' || rec.type === 'SRV') params.Priority = Number(rec.priority) || 10;
    const r = await rpc(config, params);
    return { id: String(r.RecordId) };
  },
  async deleteRecord(config, zoneName, externalId) {
    await rpc(config, { Action: 'DeleteDomainRecord', RecordId: String(externalId) });
  },
};
