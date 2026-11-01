'use strict';
// 内置演示服务商：记录仅保存在本地 JSON 文件，无需真实密钥即可完整体验全流程
const path = require('path');
const fs = require('fs');

const FILE = path.join(__dirname, '..', '..', 'data', 'mock-records.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  type: 'mock',
  label: '内置演示(本地)',
  configFields: [],
  async test() {
    return { ok: true, message: '演示模式：记录仅保存在服务器本地' };
  },
  async createRecord(config, zoneName, rec) {
    const data = load();
    const id = 'mock_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    data[id] = { zone: zoneName, record: { type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl }, createdAt: Date.now() };
    save(data);
    return { id };
  },
  async updateRecord(config, zoneName, externalId, rec) {
    const data = load();
    if (!data[externalId]) throw new Error('演示记录不存在');
    data[externalId].record = { type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl };
    save(data);
    return { id: externalId };
  },
  async deleteRecord(config, zoneName, externalId) {
    const data = load();
    delete data[externalId];
    save(data);
  },
};
