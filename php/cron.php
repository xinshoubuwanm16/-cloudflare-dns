<?php
/**
 * 定时任务入口：到期提醒 → 暂停解析 → 宽限期后回收
 *
 * 宝塔计划任务（每 30 分钟，Shell 脚本）：
 *   /www/server/php/82/bin/php /www/wwwroot/你的站点/cron.php
 * 或 URL 触发（需在管理后台生成密钥）：
 *   https://你的域名/cron.php?token=密钥
 */

declare(strict_types=1);

require_once __DIR__ . '/app/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
    $expect = cns_setting('cron_token');
    $token = (string)($_GET['token'] ?? '');
    if ($expect === '' || !hash_equals($expect, $token)) {
        http_response_code(403);
        echo "禁止访问：请在管理后台「站点设置」生成 cron 密钥，或改用命令行运行\n";
        exit;
    }
}

$log = cns_expire_sweep();
cns_rate_limit_gc();

echo 'CloudNS 定时任务 ' . cns_now() . "\n" . ($log ? implode("\n", $log) : '本轮无需处理') . "\n";
