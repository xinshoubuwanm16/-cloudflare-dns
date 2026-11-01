<?php
/**
 * CloudNS 安装脚本（MySQL 5.7 / 5.6+）
 * 浏览器访问 install.php 按提示填写即可；安装完成请删除本文件或设置目录权限保护。
 */

declare(strict_types=1);

require_once __DIR__ . '/app/bootstrap.php';

$errors = [];
$done = null;

$configFile = __DIR__ . '/app/config.php';
// 默认值始终取自示例配置，避免把已存在的数据库密码回显到表单里
$cfgSample = require __DIR__ . '/app/config.sample.php';

$form = [
    'host'     => $cfgSample['db']['host'],
    'port'     => (string)$cfgSample['db']['port'],
    'database' => $cfgSample['db']['database'],
    'username' => $cfgSample['db']['username'],
    'password' => $cfgSample['db']['password'],
    'prefix'   => $cfgSample['table_prefix'],
    'admin'    => 'admin',
    'password_admin' => '',
];

$installed = false;
if (is_file($configFile)) {
    try {
        $c = require $configFile;
        $pdo = new PDO(
            sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['db']['host'], $c['db']['port'], $c['db']['database']),
            $c['db']['username'],
            $c['db']['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $t = $c['table_prefix'] . 'users';
        $installed = (bool)$pdo->query("SHOW TABLES LIKE " . $pdo->quote($t))->fetch();
    } catch (Throwable $e) {
        $errors[] = '已有配置文件但连接失败：' . $e->getMessage() . '（可重新提交表单覆盖配置）';
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$installed) {
    foreach (array_keys($form) as $k) {
        if ($k === 'password_admin') {
            $form[$k] = (string)($_POST['password_admin'] ?? '');
        } else {
            $form[$k] = trim((string)($_POST[$k] ?? ''));
        }
    }
    if ($form['host'] === '' || $form['database'] === '' || $form['username'] === '') {
        $errors[] = '数据库参数不完整';
    }
    if (!preg_match('/^[a-zA-Z0-9_]{3,20}$/', $form['admin'])) {
        $errors[] = '管理员用户名需为 3-20 位字母、数字或下划线';
    }
    if (strlen($form['password_admin']) < 6) {
        $errors[] = '管理员密码至少 6 位';
    }
    if (!preg_match('/^[a-z0-9_]*$/', $form['prefix'])) {
        $errors[] = '表前缀仅允许小写字母、数字和下划线';
    }

    if (!$errors) {
        try {
            // 先尝试建库（无库名连接）
            $boot = new PDO(
                sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $form['host'], (int)$form['port']),
                $form['username'],
                $form['password'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );
            $boot->exec(sprintf(
                "CREATE DATABASE IF NOT EXISTS `%s` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
                str_replace('`', '', $form['database'])
            ));

            $pdo = new PDO(
                sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $form['host'], (int)$form['port'], $form['database']),
                $form['username'],
                $form['password'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
            );
            $p = $form['prefix'];

            $ddl = [
                "CREATE TABLE IF NOT EXISTS `{$p}users` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    username VARCHAR(64) NOT NULL,
                    email VARCHAR(191) NOT NULL,
                    email_verified TINYINT NOT NULL DEFAULT 0,
                    password_hash VARCHAR(255) NOT NULL,
                    credits INT NOT NULL DEFAULT 0,
                    is_admin TINYINT NOT NULL DEFAULT 0,
                    streak INT NOT NULL DEFAULT 0,
                    last_checkin_date DATE NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_username (username),
                    UNIQUE KEY uk_email (email)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}providers` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    name VARCHAR(128) NOT NULL,
                    type VARCHAR(32) NOT NULL,
                    config TEXT NOT NULL,
                    enabled TINYINT NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}zones` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    name VARCHAR(191) NOT NULL,
                    provider_id INT UNSIGNED NOT NULL,
                    price INT NOT NULL DEFAULT 10,
                    max_records INT NOT NULL DEFAULT 10,
                    max_per_user INT NOT NULL DEFAULT 5,
                    enabled TINYINT NOT NULL DEFAULT 1,
                    note VARCHAR(255) NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_name (name),
                    KEY idx_provider (provider_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}subdomains` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    zone_id INT UNSIGNED NOT NULL,
                    prefix VARCHAR(64) NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    user_id INT UNSIGNED NOT NULL,
                    expires_at DATETIME NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'active',
                    remind_stage VARCHAR(16) NOT NULL DEFAULT '',
                    expired_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_full_name (full_name),
                    KEY idx_user (user_id),
                    KEY idx_zone (zone_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}records` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    subdomain_id INT UNSIGNED NOT NULL,
                    type VARCHAR(8) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    content VARCHAR(512) NOT NULL,
                    ttl INT NOT NULL DEFAULT 1,
                    proxied TINYINT NOT NULL DEFAULT 0,
                    priority INT NOT NULL DEFAULT 0,
                    external_id VARCHAR(64) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_sub (subdomain_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}orders` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    out_trade_no VARCHAR(64) NOT NULL,
                    user_id INT UNSIGNED NOT NULL,
                    money DECIMAL(10,2) NOT NULL,
                    credits INT NOT NULL,
                    pay_type VARCHAR(16) NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    trade_no VARCHAR(64) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    paid_at DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_out_trade_no (out_trade_no),
                    KEY idx_user (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}credit_logs` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    user_id INT UNSIGNED NOT NULL,
                    delta INT NOT NULL,
                    balance INT NOT NULL,
                    reason VARCHAR(255) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_user (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}checkins` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    user_id INT UNSIGNED NOT NULL,
                    checkin_date DATE NOT NULL,
                    credits INT NOT NULL,
                    streak INT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_user_date (user_id, checkin_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}settings` (
                    setting_key VARCHAR(64) NOT NULL,
                    setting_value TEXT NOT NULL,
                    PRIMARY KEY (setting_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}rate_limits` (
                    bucket CHAR(32) NOT NULL,
                    cnt INT NOT NULL DEFAULT 0,
                    reset_at DATETIME NOT NULL,
                    PRIMARY KEY (bucket)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}email_codes` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    email VARCHAR(191) NOT NULL,
                    scene VARCHAR(16) NOT NULL,
                    code_hash CHAR(64) NOT NULL,
                    attempts INT NOT NULL DEFAULT 0,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_email_scene (email, scene)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS `{$p}mail_logs` (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    recipient VARCHAR(191) NOT NULL,
                    subject VARCHAR(191) NOT NULL,
                    status VARCHAR(16) NOT NULL,
                    error VARCHAR(512) NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            ];
            foreach ($ddl as $sql) {
                $pdo->exec($sql);
            }

            // 老库升级：补齐缺失的列
            $migrate = [
                ['users', 'email_verified', 'TINYINT NOT NULL DEFAULT 0'],
                ['subdomains', 'remind_stage', "VARCHAR(16) NOT NULL DEFAULT ''"],
                ['subdomains', 'expired_at', 'DATETIME NULL'],
            ];
            $colSt = $pdo->prepare(
                'SELECT COUNT(*) c FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            foreach ($migrate as [$tbl, $col, $def]) {
                $colSt->execute([$form['database'], $p . $tbl, $col]);
                if ((int)$colSt->fetch()['c'] === 0) {
                    $pdo->exec("ALTER TABLE `{$p}{$tbl}` ADD COLUMN `{$col}` {$def}");
                }
            }

            // 种子数据
            $hasAdmin = $pdo->query("SELECT COUNT(*) c FROM `{$p}users` WHERE is_admin = 1")->fetch()['c'];
            if (!$hasAdmin) {
                $st = $pdo->prepare("INSERT INTO `{$p}users` (username, email, password_hash, credits, is_admin) VALUES (?,?,?,?,1)");
                $st->execute([$form['admin'], 'admin@local.host', password_hash($form['password_admin'], PASSWORD_BCRYPT), 10000]);
            }

            $hasProvider = (int)$pdo->query("SELECT COUNT(*) c FROM `{$p}providers`")->fetch()['c'];
            if (!$hasProvider) {
                $pdo->prepare("INSERT INTO `{$p}providers` (name, type, config) VALUES (?,?,?)")
                    ->execute(['内置演示(本地)', 'mock', '{}']);
                $pid = (int)$pdo->lastInsertId();
                foreach ([['cf-demo.xyz', 30], ['demo-site.top', 20], ['free-test.cn', 10]] as $z) {
                    $pdo->prepare("INSERT INTO `{$p}zones` (name, provider_id, price, note) VALUES (?,?,?,'')")
                        ->execute([$z[0], $pid, $z[1]]);
                }
            }

            $setSt = $pdo->prepare("INSERT IGNORE INTO `{$p}settings` (setting_key, setting_value) VALUES (?,?)");
            foreach (CNS_DEFAULT_SETTINGS as $k => $v) {
                $setSt->execute([$k, $v]);
            }

            // 写配置
            $php = "<?php\nreturn " . var_export([
                'db' => [
                    'host'     => $form['host'],
                    'port'     => (int)$form['port'],
                    'database' => $form['database'],
                    'username' => $form['username'],
                    'password' => $form['password'],
                    'charset'  => 'utf8mb4',
                ],
                'table_prefix' => $form['prefix'],
                'timezone'     => 'Asia/Shanghai',
                'data_dir'     => __DIR__ . '/data',
            ], true) . ";\n";
            if (file_put_contents($configFile, $php) === false) {
                $errors[] = '数据库初始化完成，但 config.php 写入失败，请手动创建（内容见页面底部）。';
                $done = $php;
            } else {
                $done = true;
            }
        } catch (Throwable $e) {
            $errors[] = '安装失败：' . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>安装 · CloudNS</title>
<style>
* { box-sizing:border-box }
body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;
       background:#f2f4f7; color:#1b1d20; font-size:15px; }
.wrap { max-width:560px; margin:60px auto; padding:0 16px; }
.logo { display:flex; align-items:center; gap:10px; margin-bottom:20px; font-weight:800; font-size:20px; }
.logo svg { width:44px; height:28px; }
.card { background:#fff; border:1px solid #e1e4ea; border-radius:12px; padding:26px; box-shadow:0 1px 2px rgba(16,24,40,.06); }
h1 { font-size:18px; margin:0 0 4px; }
.sub { color:#6b7280; font-size:14px; margin:0 0 20px; }
label { display:block; margin-bottom:14px; font-size:13.5px; font-weight:600; }
input { width:100%; margin-top:6px; padding:10px 12px; border:1px solid #c9cdd6; border-radius:8px; font-size:14.5px; font-family:inherit; outline:none; }
input:focus { border-color:#2563eb; box-shadow:0 0 0 1px #2563eb; }
.row { display:flex; gap:12px; } .row label { flex:1 }
.btn { display:block; width:100%; padding:12px; border:none; border-radius:8px; background:#2563eb; color:#fff;
       font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; }
.btn:hover { background:#1d4ed8 }
.err { background:#fdecec; color:#991b1b; border:1px solid #f5c2c2; border-radius:8px; padding:10px 14px; font-size:14px; margin-bottom:14px; }
.ok { background:#e8f7ee; color:#166534; border:1px solid #bbe7c9; border-radius:8px; padding:10px 14px; font-size:14px; margin-bottom:14px; }
pre { background:#f6f7f9; border:1px solid #e1e4ea; border-radius:8px; padding:12px; font-size:12px; overflow:auto; }
a { color:#2563eb; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <svg viewBox="0 0 64 40" fill="#F6821F"><path d="M44.6 33.6c.5-1.8.3-3.5-.6-4.7-.8-1.1-2.2-1.8-3.9-1.8l-31.6-.4c-.2 0-.4-.1-.5-.3-.1-.2-.1-.4 0-.6.1-.3.4-.5.7-.5l31.9-.4c3.8-.2 7.9-3.2 9.3-7l1.8-4.8c.1-.2.1-.4.1-.6C50.5 5.3 43.9 0 36 0c-7.1 0-13.2 4.6-15.4 11-2.8-2.1-6.5-3.1-10.4-2.4C3.6 9.8-.5 15.5.05 22.1c.5 5.9 5.2 10.6 11 11.4h31.9c.3 0 .6-.2.7-.5l1-3.4z"/></svg>
    CloudNS 安装向导
  </div>

  <div class="card">
  <?php if ($installed): ?>
    <div class="ok">系统已安装。出于安全考虑，本页面已被锁定。</div>
    <p class="sub"><a href="./">前往站点首页</a> · <a href="./dashboard.php">进入控制台</a></p>
  <?php elseif ($done === true): ?>
    <div class="ok">安装完成。</div>
    <p class="sub">管理员账号：<?= htmlspecialchars($form['admin']) ?><br>
    请立即删除 install.php 文件，然后<a href="./dashboard.php">进入控制台</a>。</p>
  <?php else: ?>
    <h1>环境要求</h1>
    <p class="sub">PHP 8.0+（推荐 8.2，需 pdo_mysql、curl、mbstring 扩展）· MySQL 5.6+（推荐 5.7）</p>
    <?php foreach ($errors as $e): ?><div class="err"><?= htmlspecialchars($e) ?></div><?php endforeach; ?>
    <form method="post">
      <div class="row">
        <label>数据库主机<input name="host" value="<?= htmlspecialchars($form['host']) ?>"></label>
        <label style="max-width:110px">端口<input name="port" value="<?= htmlspecialchars($form['port']) ?>"></label>
      </div>
      <label>数据库名<input name="database" value="<?= htmlspecialchars($form['database']) ?>"></label>
      <div class="row">
        <label>用户名<input name="username" value="<?= htmlspecialchars($form['username']) ?>"></label>
        <label>密码<input name="password" type="password" value="<?= htmlspecialchars($form['password']) ?>"></label>
      </div>
      <label>表前缀<input name="prefix" value="<?= htmlspecialchars($form['prefix']) ?>"></label>
      <hr style="border:none;border-top:1px solid #e1e4ea;margin:18px 0">
      <div class="row">
        <label>管理员账号<input name="admin" value="<?= htmlspecialchars($form['admin']) ?>"></label>
        <label>管理员密码<input name="password_admin" type="password" placeholder="至少 6 位"></label>
      </div>
      <button class="btn" type="submit">开始安装</button>
    </form>
    <?php if (is_string($done)): ?>
      <h1 style="margin-top:22px">请手动保存以下内容为 app/config.php</h1>
      <pre><?= htmlspecialchars($done) ?></pre>
    <?php endif; ?>
  <?php endif; ?>
  </div>
</div>
</body>
</html>
