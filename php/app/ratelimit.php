<?php
/**
 * 简单限流：按 IP + 接口路径计数（对应 Node 版 src/ratelimit.js）
 * 使用 MySQL 表存储，多进程 PHP-FPM 下同样生效。
 */

declare(strict_types=1);

function cns_client_ip(): string
{
    return $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '0.0.0.0';
}

/**
 * 超限直接返回 429，未超限放行
 * @param int $windowSec 窗口秒数
 * @param int $max       窗口内最大次数
 */
function cns_rate_limit(string $scope, int $windowSec = 60, int $max = 20): void
{
    $bucket = substr(md5(cns_client_ip() . '|' . $scope), 0, 32);
    $ok = cns_transaction(function () use ($bucket, $windowSec, $max) {
        $db = cns_db();
        $st = $db->prepare('SELECT cnt, reset_at FROM ' . cns_table('rate_limits') . ' WHERE bucket = ? FOR UPDATE');
        $st->execute([$bucket]);
        $row = $st->fetch();
        $now = time();
        if (!$row || strtotime((string)$row['reset_at']) < $now) {
            $reset = date('Y-m-d H:i:s', $now + $windowSec);
            if ($row) {
                $db->prepare('UPDATE ' . cns_table('rate_limits') . ' SET cnt = 1, reset_at = ? WHERE bucket = ?')
                    ->execute([$reset, $bucket]);
            } else {
                $db->prepare('INSERT INTO ' . cns_table('rate_limits') . ' (bucket, cnt, reset_at) VALUES (?, 1, ?)')
                    ->execute([$bucket, $reset]);
            }
            return true;
        }
        if ((int)$row['cnt'] >= $max) {
            return false;
        }
        $db->prepare('UPDATE ' . cns_table('rate_limits') . ' SET cnt = cnt + 1 WHERE bucket = ?')
            ->execute([$bucket]);
        return true;
    });
    if (!$ok) {
        header('Retry-After: ' . $windowSec);
        cns_error('操作过于频繁，请稍后再试', 429);
    }
}

// 清理过期桶（概率触发，避免额外定时任务）
function cns_rate_limit_gc(): void
{
    if (random_int(1, 50) !== 1) {
        return;
    }
    try {
        cns_db()->prepare('DELETE FROM ' . cns_table('rate_limits') . ' WHERE reset_at < NOW()')->execute();
    } catch (Throwable $e) {
        // 忽略
    }
}
