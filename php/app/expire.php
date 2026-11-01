<?php
/**
 * 到期处理：提醒 → 暂停解析 → 宽限期后回收（cron.php 与管理后台共用）
 */

declare(strict_types=1);

/**
 * 执行一轮扫描，返回日志行数组。
 */
function cns_expire_sweep(): array
{
    $notify = cns_setting('expire_notify') === '1';
    $graceDays = max(0, (int)cns_setting('expire_grace_days'));
    $autoDelete = cns_setting('expire_auto_delete') === '1';
    $now = time();
    $log = [];

    $rows = cns_all(
        'SELECT s.*, z.name AS zone_name, z.price, u.email,
                p.type AS provider_type, p.config AS provider_config
         FROM ' . cns_table('subdomains') . ' s
         JOIN ' . cns_table('zones') . ' z ON z.id = s.zone_id
         JOIN ' . cns_table('users') . ' u ON u.id = s.user_id
         JOIN ' . cns_table('providers') . ' p ON p.id = z.provider_id
         WHERE s.status IN (\'active\',\'expired\')
         ORDER BY s.expires_at ASC'
    );

    foreach ($rows as $sub) {
        $id = (int)$sub['id'];
        $expires = strtotime((string)$sub['expires_at']);
        $daysLeft = (int)ceil(($expires - $now) / 86400);
        $stages = array_values(array_filter(explode(',', (string)$sub['remind_stage'])));

        // 1) 到期前 7/3/1 天提醒：每档只发一次，一轮最多一封
        if ($sub['status'] === 'active' && $notify && $daysLeft > 0 && $daysLeft <= 7) {
            $due = [];
            foreach ([7, 3, 1] as $threshold) {
                if ($daysLeft <= $threshold && !in_array((string)$threshold, $stages, true)) {
                    $due[] = (string)$threshold;
                }
            }
            if ($due) {
                // 已越过的档位一并标记，避免同一轮里连发多封
                $stages = array_values(array_unique(array_merge($stages, $due)));
                usort($stages, static fn($a, $b) => (int)$b <=> (int)$a);
                cns_exec('UPDATE ' . cns_table('subdomains') . ' SET remind_stage = ? WHERE id = ?', [implode(',', $stages), $id]);
                [$ok, $err] = cns_mail_to((string)$sub['email'], 'expire_reminder', [
                    'full_name' => $sub['full_name'],
                    'days_left' => $daysLeft,
                    'expires_at' => $sub['expires_at'],
                    'price' => (int)$sub['price'],
                ]);
                $log[] = sprintf('[提醒] %s 剩余 %d 天 %s%s', $sub['full_name'], $daysLeft, $ok ? '已发送' : '发送失败', $err ? '：' . $err : '');
            }
        }

        // 2) 到期：删除上游解析，本地记录保留以便续期恢复
        if ($sub['status'] === 'active' && $expires <= $now) {
            cns_transaction(function () use ($sub, $id, $expires) {
                try {
                    $provider = dns_provider((string)$sub['provider_type']);
                } catch (Throwable $e) {
                    $provider = null;
                }
                $cfg = json_decode((string)($sub['provider_config'] ?? '{}'), true) ?: [];
                foreach (cns_all('SELECT * FROM ' . cns_table('records') . ' WHERE subdomain_id = ?', [$id]) as $r) {
                    if ($provider && (string)$r['external_id'] !== '') {
                        try {
                            $provider['delete']($cfg, (string)$sub['zone_name'], (string)$r['external_id']);
                        } catch (Throwable $e) {
                            // 上游删除失败也要清掉 external_id，避免续期时重复创建
                        }
                    }
                    cns_exec('UPDATE ' . cns_table('records') . ' SET external_id = NULL WHERE id = ?', [$r['id']]);
                }
                cns_exec(
                    'UPDATE ' . cns_table('subdomains') . " SET status='expired', expired_at=?, remind_stage='paused' WHERE id = ?",
                    // 宽限期从真实到期时间起算，否则 cron 停机期间到期的域名会白送一段宽限期
                    [date('Y-m-d H:i:s', $expires), $id]
                );
            });
            $deadline = date('Y-m-d H:i:s', $expires + $graceDays * 86400);
            $sent = '-';
            if ($notify) {
                [$ok] = cns_mail_to((string)$sub['email'], 'expire_paused', [
                    'full_name' => $sub['full_name'],
                    'expired_at' => $sub['expires_at'],
                    'grace' => $graceDays,
                    'deadline' => $deadline,
                ]);
                $sent = $ok ? '已通知' : '通知失败';
            }
            $log[] = sprintf('[暂停] %s 解析已停用，宽限至 %s（%s）', $sub['full_name'], $deadline, $sent);
            continue;
        }

        // 3) 宽限期结束：回收删除
        if ($sub['status'] === 'expired') {
            $expiredAt = strtotime((string)($sub['expired_at'] ?: $sub['expires_at']));
            if ($expiredAt + $graceDays * 86400 > $now) {
                continue;
            }
            if (!$autoDelete) {
                $log[] = sprintf('[待回收] %s 已过宽限期（自动删除已关闭）', $sub['full_name']);
                continue;
            }
            cns_exec('DELETE FROM ' . cns_table('records') . ' WHERE subdomain_id = ?', [$id]);
            cns_exec('DELETE FROM ' . cns_table('subdomains') . ' WHERE id = ?', [$id]);
            if ($notify) {
                cns_mail_to((string)$sub['email'], 'expire_deleted', [
                    'full_name' => $sub['full_name'],
                    'expired_at' => $sub['expires_at'],
                    'grace' => $graceDays,
                ]);
            }
            $log[] = sprintf('[回收] %s 已删除并释放前缀', $sub['full_name']);
        }
    }

    return $log;
}
