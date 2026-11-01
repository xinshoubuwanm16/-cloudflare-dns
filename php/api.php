<?php
/**
 * CloudNS API 总入口
 * 访问形式：/api.php/auth/me 或 /api.php?api=auth/me
 */

declare(strict_types=1);

require_once __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/routes/auth.php';
require_once __DIR__ . '/app/routes/domains.php';
require_once __DIR__ . '/app/routes/pay.php';
require_once __DIR__ . '/app/routes/admin.php';

cns_session_start();
cns_rate_limit_gc();

$path = trim((string)($_SERVER['PATH_INFO'] ?? ''), '/');
if ($path === '') {
    $path = trim((string)($_GET['api'] ?? ''), '/');
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// [方法, 路径模板, 处理器, 权限]  权限: '' 公开 | 'user' 登录 | 'admin' 管理员
$routes = [
    ['GET',  'site', 'api_site', ''],

    ['POST', 'auth/register', 'api_auth_register', ''],
    ['POST', 'auth/send-code', 'api_auth_send_code', ''],
    ['POST', 'auth/reset', 'api_auth_reset', ''],
    ['POST', 'auth/login', 'api_auth_login', ''],
    ['POST', 'auth/logout', 'api_auth_logout', ''],
    ['GET',  'auth/me', 'api_auth_me', 'user'],
    ['POST', 'auth/checkin', 'api_auth_checkin', 'user'],
    ['GET',  'auth/checkin/calendar', 'api_auth_checkin_calendar', 'user'],
    ['GET',  'auth/credits/logs', 'api_auth_credits_logs', 'user'],

    ['GET',  'domains/zones', 'api_domains_zones', 'user'],
    ['GET',  'domains/mine', 'api_domains_mine', 'user'],
    ['POST', 'domains/buy', 'api_domains_buy', 'user'],
    ['POST', 'domains/{id}/renew', 'api_domains_renew', 'user'],
    ['GET',  'domains/{id}/records', 'api_domains_records_list', 'user'],
    ['POST', 'domains/{id}/records', 'api_domains_record_create', 'user'],
    ['PUT',  'domains/{id}/records/{rid}', 'api_domains_record_update', 'user'],
    ['DELETE', 'domains/{id}/records/{rid}', 'api_domains_record_delete', 'user'],

    ['GET',  'pay/config', 'api_pay_config', ''],
    ['POST', 'pay/create', 'api_pay_create', 'user'],
    ['GET',  'pay/orders', 'api_pay_orders', 'user'],
    ['GET',  'pay/order/{no}', 'api_pay_order', 'user'],
    ['GET',  'pay/notify', 'api_pay_notify', 'raw'],
    ['GET',  'pay/cashier/{no}', 'api_pay_cashier', 'raw'],
    ['GET',  'pay/sandbox-pay/{no}', 'api_pay_sandbox', 'raw'],

    ['GET',  'admin/stats', 'api_admin_stats', 'admin'],
    ['GET',  'admin/providers', 'api_admin_providers', 'admin'],
    ['POST', 'admin/providers', 'api_admin_provider_create', 'admin'],
    ['PUT',  'admin/providers/{id}', 'api_admin_provider_update', 'admin'],
    ['DELETE', 'admin/providers/{id}', 'api_admin_provider_delete', 'admin'],
    ['POST', 'admin/providers/{id}/test', 'api_admin_provider_test', 'admin'],
    ['GET',  'admin/zones', 'api_admin_zones', 'admin'],
    ['POST', 'admin/zones', 'api_admin_zone_create', 'admin'],
    ['PUT',  'admin/zones/{id}', 'api_admin_zone_update', 'admin'],
    ['DELETE', 'admin/zones/{id}', 'api_admin_zone_delete', 'admin'],
    ['GET',  'admin/subdomains', 'api_admin_subdomains', 'admin'],
    ['DELETE', 'admin/subdomains/{id}', 'api_admin_subdomain_delete', 'admin'],
    ['GET',  'admin/users', 'api_admin_users', 'admin'],
    ['PUT',  'admin/users/{id}/credits', 'api_admin_user_credits', 'admin'],
    ['PUT',  'admin/users/{id}/admin', 'api_admin_user_admin', 'admin'],
    ['PUT',  'admin/users/{id}/password', 'api_admin_user_password', 'admin'],
    ['GET',  'admin/orders', 'api_admin_orders', 'admin'],
    ['GET',  'admin/settings', 'api_admin_settings', 'admin'],
    ['PUT',  'admin/settings', 'api_admin_settings_update', 'admin'],
    ['POST', 'admin/mail/test', 'api_admin_mail_test', 'admin'],
    ['GET',  'admin/mail/logs', 'api_admin_mail_logs', 'admin'],
    ['POST', 'admin/cron-token', 'api_admin_cron_token', 'admin'],
    ['POST', 'admin/expire/run', 'api_admin_expire_run', 'admin'],
    ['GET',  'admin/expiring', 'api_admin_expiring', 'admin'],
];

foreach ($routes as [$m, $tpl, $handler, $guard]) {
    if ($m !== $method) {
        continue;
    }
    $regex = '#^' . preg_replace('/\{[a-z]+\}/', '([^/]+)', $tpl) . '$#';
    if (!preg_match($regex, $path, $mm)) {
        continue;
    }
    array_shift($mm);
    $params = ['id' => null, 'rid' => null, 'no' => null];
    preg_match_all('/\{([a-z]+)\}/', $tpl, $names);
    foreach ($names[1] as $i => $name) {
        $params[$name] = $mm[$i] ?? null;
    }

    $user = null;
    if ($guard === 'user') {
        $user = cns_require_auth();
    } elseif ($guard === 'admin') {
        $user = cns_require_admin();
    }

    try {
        $handler($user, $params, cns_body(), $_GET);
    } catch (RuntimeException $e) {
        // 业务错误（积分不足、服务商报错等）
        cns_error($e->getMessage(), 400);
    } catch (Throwable $e) {
        error_log('[cns-api] ' . $e->getMessage());
        cns_error('服务器内部错误', 500);
    }
    exit;
}

cns_error('接口不存在', 404);
