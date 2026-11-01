# CloudNS — 二级域名分发平台

仿 Cloudflare 新版仪表盘 UI 的二级域名分发系统。用户用积分购买主域名下的子域名，并通过面板直接管理真实的上游 DNS 解析记录。

- **UI**：1:1 还原 Cloudflare Dashboard 观感（白色侧边栏 + 浅灰内容区 + 蓝色主按钮 + 橙色云朵），PC 与移动端自适应，移动端使用抽屉式导航。
- **DNS 服务商**：Cloudflare API v4、腾讯云 DNSPod（TC3 签名）、阿里云云解析（RPC 签名）、内置本地演示。
- **充值与积分**：彩虹易支付协议（支付宝/微信/QQ），1 元 = 10 积分（可配置）；未配置支付时自动进入站内沙盒收银台，可完整体验流程。
- **签到**：每日签到得积分，连续签到递增（可配置基础值与递增上限）。
- **管理后台**：服务商凭据管理、主域名定价/限额、用户积分与权限、订单流水、站点与支付设置。

---

## 快速开始

### 方式一：双击启动（Windows，免安装）

```
双击 start.bat
```

脚本会自动使用项目内的便携版 Node.js（`nodeportable/`），首次运行自动安装依赖。

### 方式二：标准 Node 环境

```bash
npm install
npm start          # 默认 http://localhost:3000，可用 PORT 环境变量修改
```

首次启动会自动建库并输出初始管理员账号：

| 账号 | 密码 |
| --- | --- |
| `admin` | `admin123` |

> **上线前务必修改管理员密码**（管理后台 → 用户 → 重置密码），并在管理后台「系统设置」里改站点名称。

演示用户可自行注册，注册即赠 10 积分（可配置）。

### 方式三：PHP 版（服务器部署，推荐上线使用）

项目自带一套独立的 PHP 8.2 + MySQL 5.7 实现，位于 `php/` 目录，功能与 Node 版一致（积分、购买/续期、DNS 记录同步、易支付充值、签到、管理后台），并新增了 Cloudflare 风格的主页介绍页。适合直接部署在宝塔 / LNMP 虚拟主机上：

```
把 php/ 目录内的全部文件上传到站点根目录 → 浏览器访问 install.php 完成建库配置 → 删除 install.php
```

详细步骤、环境要求与 Node 版的差异说明见 `php/README.md`。

---

## 目录结构

```
website/
├─ src/
│  ├─ server.js            Express 入口（API + 静态资源 + SPA 回退）
│  ├─ db.js                SQLite schema、设置、密码哈希、积分事务
│  ├─ auth.js              会话 Cookie、登录态中间件、权限校验
│  ├─ epay.js              彩虹易支付签名/验签/表单构造
│  ├─ helpers.js           校验（前缀/IPv4/IPv6/记录内容）、订单号、FQDN 拼接
│  ├─ ratelimit.js         登录/签到内存限流
│  ├─ providers/
│  │  ├─ index.js          服务商注册表
│  │  ├─ cloudflare.js     Cloudflare API v4
│  │  ├─ dnspod.js         腾讯云 DNSPod（TC3-HMAC-SHA256）
│  │  ├─ aliyun.js         阿里云云解析（HMAC-SHA1 RPC）
│  │  └─ mock.js           本地演示（记录存 data/mock-records.json）
│  └─ routes/
│     ├─ auth.js           注册/登录/登出/签到/积分日志
│     ├─ domains.js        可售域名/购买/续期/DNS 记录 CRUD
│     ├─ pay.js            充值下单/易支付异步通知/沙盒收银台
│     └─ admin.js          后台统计/服务商/主域名/用户/订单/设置
├─ public/                 前端 SPA（原生 JS，无构建步骤）
│  ├─ index.html
│  ├─ css/app.css
│  └─ js/app.js
├─ data/                   SQLite 数据库与运行时文件（自动创建）
├─ scripts/test-api.js     接口回归测试（26 项）
├─ start.bat               Windows 一键启动
└─ nodeportable/           便携版 Node.js（可删除，改用系统 Node）
```

数据全部存放在 `data/panel.db`（SQLite，WAL 模式）。备份 = 拷贝 `data/` 目录。

---

## 配置说明

所有参数都在 **管理后台 → 系统设置** 中修改，无需改代码。

### 积分规则

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| 1 元兑换积分 | 10 | 充值 1 元到账积分 |
| 最低充值金额 | 1 | 元 |
| 注册赠送积分 | 10 | 0 表示不赠送 |
| 签到基础积分 | 5 | 每次签到基础值 |
| 连续签到递增上限 | 5 | 第 N 天 = 基础 + min(N-1, 上限) |

### 易支付

填入网关地址、商户 PID、商户 KEY 后立即切换到真实支付（站内沙盒收银台自动停用）。

- 网关示例：`https://pay.yourdomain.com`（脚本会自动拼接 `/submit.php`）
- 异步通知地址：`https://你的域名/api/pay/notify`
- 同步跳转：`https://你的域名/#/recharge?paid=订单号`
- 签名算法：参与参数剔除空值与 `sign/sign_type`，按 key ASCII 升序拼 `k=v&...`，末尾拼商户 KEY 后取 MD5；回调验签通过且 `trade_status=TRADE_SUCCESS`、金额一致才入账（幂等，重复通知不会重复加积分）。

### DNS 服务商

在 **管理后台 → DNS 服务商 → 添加服务商** 配置凭据，点「测试连接」验证。

| 类型 | 所需凭据 | 权限要求 |
| --- | --- | --- |
| Cloudflare | API Token | Zone → DNS → Edit（建议只授权目标 Zone） |
| 腾讯云 DNSPod | SecretId / SecretKey | DNSPod 全读写 |
| 阿里云云解析 | AccessKeyId / AccessKeySecret | AliyunDNSFullAccess（建议最小化授权） |
| 内置演示 | 无 | 记录只存本地 JSON，不出网 |

添加服务商后，在 **主域名** 里添加根域名并绑定该服务商。**主域名必须已存在于对应服务商账号中**（Cloudflare 需为 Active 状态），否则创建记录时会返回服务商错误。

主域名可配置：每年积分价格、单域名记录上限、每人持有上限、是否上架。

---

## 用户侧功能一览

| 页面 | 能力 |
| --- | --- |
| 概述 | 积分/持有域名/连续签到统计、一键签到、本月签到日历、最近域名 |
| 购买域名 | 浏览可售主域名、实时计算扣费、选择 1-3 年有效期、余额不足提示 |
| 我的域名 | 搜索、到期倒计时、续期、复制域名、进入 DNS 管理 |
| DNS 记录 | 添加/编辑/删除记录（A/AAAA/CNAME/TXT/MX/NS/SRV/CAA），TTL、MX 优先级、Cloudflare 橙云代理开关，服务端完整校验 + 同步上游 |
| 充值积分 | 金额换算积分、选择支付方式、充值记录与到账状态 |
| 每日签到 | 签到、连续天数、近 30 天记录 |
| 积分日志 | 余额与近 50 条变动明细 |

**保留前缀**（不可购买）：`www`、`mail`、`smtp`、`pop`、`imap`、`ns`、`ns1`、`ns2`、`ftp`、`admin`、`api`、`webmail`、`mx`、`mx1`、`mx2`。可在 `src/helpers.js` 的 `RESERVED_PREFIX` 中调整。

---

## 接口回归测试

服务启动后执行：

```bash
npm test
```

覆盖 26 项：注册/重复注册/非法用户名、签到与重复签到、积分累计、保留前缀与非法前缀、购买与余额扣减、余额不足、各类记录校验（IPv4/CNAME/超长 TXT/MX）、记录编辑删除、越权访问、未登录拦截、下单与最低金额/非法支付方式、易支付签名与篡改检测。

---

## 部署建议

1. 用 `pm2` / `systemd` 托管 `node src/server.js`，并通过 Nginx 反代。
2. Nginx 需透传真实 IP 与协议：
   ```nginx
   location / {
     proxy_pass http://127.0.0.1:3000;
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
   面板会按 `X-Forwarded-Proto/Host` 生成易支付回调地址，**必须是 HTTPS**，否则易支付回调可能被拒。
3. 定期备份 `data/panel.db*`。
4. 生产环境建议把会话 Cookie 改为 `Secure`（`src/auth.js` 中 `createSession` 的 `Set-Cookie`）。

## 已知限制

- 会话与限流都在进程内存/数据库中，设计为单实例部署；多实例需改为共享存储。
- 到期域名不会自动停用（仅展示倒计时），如需自动回收可加定时任务清理 `expires_at < now` 的子域名并同步删除上游记录。
- 上游 DNS 服务商异常时，记录操作会直接返回错误并不落库，保证本地与上游一致；若上游成功但本地写库失败（极端情况），可通过服务商控制台手动清理。

## 许可

MIT
