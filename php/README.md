# CloudNS PHP 版（服务器部署）

Node 版的完整 PHP 移植，适配 **PHP 8.0+（推荐 8.2）+ MySQL 5.6/5.7**，可直接跑在宝塔等 LNMP/LAMP 环境，功能与界面与原版一致：

- 仿 Cloudflare 仪表盘控制台（`dashboard.php`）
- 新增仿 Cloudflare 官网风格的**首页介绍页**（`index.php`）
- 全站图标使用 SVG，无 emoji
- 二级域名分发：积分购买、续期、DNS 记录增删改（直连 Cloudflare / DNSPod / 阿里云）
- 充值（彩虹易支付 + 沙盒收银台）、每日签到、积分日志、完整管理后台

## 目录结构

```
php/
├─ index.php            首页（介绍页）
├─ dashboard.php        控制台（SPA 外壳）
├─ api.php              全部后端接口（前端通过 ?api=xxx 调用）
├─ install.php          网页安装向导（建库建表 + 初始管理员）
├─ .htaccess            Apache 伪静态与目录保护
├─ app/                 应用代码（禁止 HTTP 直接访问）
│  ├─ bootstrap.php     配置加载 / PDO / 会话 / 公共函数
│  ├─ config.sample.php 配置模板（安装向导会自动生成 config.php）
│  ├─ helpers.php       前缀/记录/域名校验
│  ├─ auth.php          登录态、积分事务
│  ├─ ratelimit.php     MySQL 限流表
│  ├─ epay.php          易支付 MD5 签名/验签
│  ├─ providers.php     Cloudflare / DNSPod / 阿里云 / mock
│  └─ routes/           auth / domains / pay / admin 接口
├─ assets/              前端 css / js
├─ data/                mock 服务商记录文件（需可写）
└─ deploy/              nginx 配置示例
```

## 部署步骤（宝塔面板）

1. 新建站点，PHP 版本选择 **8.2**，创建 MySQL 数据库（记下库名/用户名/密码）。
2. 把 `php/` 目录**内部的所有文件**上传到站点根目录。
3. （Nginx）站点设置 → 配置文件，参考 `deploy/nginx.conf.example` 增加：
   - `location ~ ^/(app|data)/ { deny all; }`
   - `fastcgi_split_path_info` 与 `fastcgi_param PATH_INFO`（易支付回调需要）。
     回调地址固定用 `…/api.php/pay/notify` 这种 PATH_INFO 形式：验签会把查询串里的全部参数一起计算，若改用 `api.php?api=pay/notify`，多出的 `api` 参数会进签名串导致验签失败。
   （Apache）`.htaccess` 已包含目录保护与伪静态，无需额外配置。
4. 浏览器访问 `https://你的域名/install.php`，填写数据库信息与管理员账号，点击安装。
5. 安装成功后**删除 install.php**，访问：
   - 首页介绍页 `https://你的域名/`
   - 控制台 `https://你的域名/dashboard.php`
6. 进控制台 → 管理后台：
   - 「DNS 服务商」添加 Cloudflare Token / DNSPod / 阿里云密钥（内置演示可不改）；
   - 「主域名」添加已托管在对应服务商的根域名并定价；
   - 「系统设置」按需填易支付网关、PID、KEY（不填则走沙盒收银台）。
7. 在 DNS 服务商处给主域名添加泛解析（如 `* .example.com` 指向你的站点/源站），用户注册的二级域名才能真正解析。

## 环境要求

- PHP >= 8.0，扩展：`pdo_mysql`、`curl`、`mbstring`、`openssl`（宝塔默认均开启）
- MySQL >= 5.6（推荐 5.7，utf8mb4）
- `data/` 目录需可写（仅使用内置演示服务商时需要）

## 与 Node 版的差异

| | Node 版 | PHP 版 |
| --- | --- | --- |
| 数据库 | SQLite | MySQL 5.7 |
| 会话 | 数据库 token + Cookie | PHP 原生会话（Cookie: CNSSESSID） |
| 限流 | 内存桶 | `cns_rate_limits` 表（多进程一致） |
| 密码 | scrypt | bcrypt（`password_hash`） |
| 接口 | `/api/*`（Express） | `/api.php?api=*`（免伪静态，兼容宝塔默认 Nginx） |

业务规则（保留前缀、记录校验、积分/充值/签到逻辑、易支付签名协议）与 Node 版完全一致。

## 安全提醒

- 安装完成后删除 `install.php`；
- `app/config.php` 含数据库密码，确认站点已按上文 deny 规则保护；
- 上线后立即在管理后台修改管理员密码。
