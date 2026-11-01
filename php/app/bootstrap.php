<?php
/**
 * CloudNS PHP 版启动引导：配置加载、数据库连接、会话、公共函数
 */

declare(strict_types=1);

define('CNS_ROOT', dirname(__DIR__));

// ---------- 配置 ----------
function cns_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            $file = __DIR__ . '/config.sample.php';
        }
        $config = require $file;
    }
    return $config;
}

function cns_table(string $name): string
{
    static $prefix = null;
    if ($prefix === null) {
        $prefix = cns_config()['table_prefix'];
    }
    return $prefix . $name;
}

// ---------- 数据库 ----------
function cns_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $cfg = cns_config()['db'];
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $cfg['host'], $cfg['port'], $cfg['database'], $cfg['charset']
        );
        $pdo = new PDO($dsn, $cfg['username'], $cfg['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// 查询多行
function cns_all(string $sql, array $args = []): array
{
    $st = cns_db()->prepare($sql);
    $st->execute($args);
    return $st->fetchAll();
}

// 查询单行，无结果返回 null
function cns_one(string $sql, array $args = []): ?array
{
    $st = cns_db()->prepare($sql);
    $st->execute($args);
    $row = $st->fetch();
    return $row === false ? null : $row;
}

// 执行写操作，返回 lastInsertId（int）
function cns_exec(string $sql, array $args = []): int
{
    $st = cns_db()->prepare($sql);
    $st->execute($args);
    return (int)cns_db()->lastInsertId();
}

// 事务包装：回调抛异常自动回滚
function cns_transaction(callable $fn)
{
    $db = cns_db();
    $db->beginTransaction();
    try {
        $result = $fn();
        $db->commit();
        return $result;
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

// ---------- 设置 ----------
const CNS_DEFAULT_SETTINGS = [
    'site_name'          => 'CloudNS',
    'site_subtitle'      => '二级域名分发平台',
    'credit_rate'        => '10',
    'min_recharge'       => '1',
    'register_gift'      => '10',
    'checkin_base'       => '5',
    'checkin_bonus_max'  => '5',
    'epay_gateway'       => '',
    'epay_pid'           => '',
    'epay_key'           => '',
    'buy_notice'         => '购买后域名有效期为 365 天，到期前可按原价续期。',
    'site_url'           => '',
    'mail_enabled'       => '0',
    'smtp_host'          => '',
    'smtp_port'          => '465',
    'smtp_secure'        => 'ssl',
    'smtp_user'          => '',
    'smtp_pass'          => '',
    'smtp_from'          => '',
    'smtp_from_name'     => '',
    'smtp_verify'        => '1',
    'register_need_email' => '1',
    'expire_notify'      => '1',
    'expire_grace_days'  => '7',
    'expire_auto_delete' => '1',
    'cron_token'         => '',
];

function cns_setting(string $key): string
{
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        try {
            foreach (cns_all('SELECT setting_key, setting_value FROM ' . cns_table('settings')) as $row) {
                $cache[$row['setting_key']] = $row['setting_value'];
            }
        } catch (Throwable $e) {
            // 表尚未创建（安装前），全部走默认值
        }
    }
    if (isset($cache[$key])) {
        return $cache[$key];
    }
    return CNS_DEFAULT_SETTINGS[$key] ?? '';
}

function cns_settings(array $keys = []): array
{
    if (!$keys) {
        $keys = array_keys(CNS_DEFAULT_SETTINGS);
    }
    $out = [];
    foreach ($keys as $k) {
        $out[$k] = cns_setting($k);
    }
    return $out;
}

function cns_set_setting(string $key, string $value): void
{
    cns_exec(
        'INSERT INTO ' . cns_table('settings') . ' (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        [$key, $value]
    );
}

// ---------- 会话 ----------
function cns_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'lifetime' => 7 * 86400,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
    ]);
    session_name('CNSSESSID');
    session_start();
}

// ---------- HTTP ----------
function cns_json($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cns_error(string $msg, int $status = 400): void
{
    cns_json(['error' => $msg], $status);
}

// 读取 JSON 请求体
function cns_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('请求数据格式错误');
    }
    return $data;
}

function cns_base_url(): string
{
    $configured = trim(cns_setting('site_url'));
    if ($configured !== '' && (PHP_SAPI === 'cli' || empty($_SERVER['HTTP_HOST']))) {
        return rtrim($configured, '/');
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $proto = $https ? 'https' : 'http';
    $host  = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $proto . '://' . $host;
}

// ---------- 引导 ----------
date_default_timezone_set(cns_config()['timezone'] ?? 'Asia/Shanghai');
mb_http_output('UTF-8');

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/providers.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/ratelimit.php';
require_once __DIR__ . '/epay.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/mailcode.php';
require_once __DIR__ . '/expire.php';
