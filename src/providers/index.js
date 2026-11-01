'use strict';
const cloudflare = require('./cloudflare');
const dnspod = require('./dnspod');
const aliyun = require('./aliyun');
const mock = require('./mock');

const registry = {
  cloudflare, dnspod, aliyun, mock,
};

function getProvider(type) {
  const p = registry[type];
  if (!p) throw new Error(`未知的服务商类型: ${type}`);
  return p;
}

module.exports = { getProvider, all: registry };
