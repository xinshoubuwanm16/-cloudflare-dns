<?php
/**
 * 管理后台接口
 */

declare(strict_types=1);

function api_admin_stats(?array $user, array $params, array $body, array $query): void
{
    $sc = fn(string $sql) => (int)cns_one($sql)['c'];
    $paidSum = (float)(cns_one('SELECT COALESCE(SUM(money),0) m FROM ' . cns_table('orders') . " WHERE status='paid'")['m'] ?? 0);
    cns_json([
        'users' => $sc('SELECT COUNT(*) c FROM ' . cns_table('users')),
        'zones' => $sc('SELECT COUNT(*) c FROM ' . cns_table('zones')),
        'subs' => $sc("SELECT COUNT(*) c FROM " . cns_table('subdomains') . " WHERE status='active'"),
        'records' => $sc('SELECT COUNT(*) c FROM ' . cns_table('records')),
        'paid_sum' => $paidSum,
        'today_checkins' => $sc('SELECT COUNT(*) c FROM ' . cns_table('checkins') . " WHERE checkin_date = '" . date('Y-m-d') . "'"),
    ]);
}

function api_admin_providers(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all('SELECT * FROM ' . cns_table('providers') . ' ORDER BY id');
    $reg = dns_providers();
    foreach ($rows as &$r) {
        $cfg = json_decode((string)($r['config'] ?? '{}'), true) ?: [];
        $def = $reg[$r['type']] ?? null;
        if ($def) {
            foreach ($def['configFields'] as $f) {
                if (!empty($f['secret']) && !empty($cfg[$f['key']])) {
                    $cfg[$f['key']] = '••••••' . substr((string)$cfg[$f['key']], -4);
                }
            }
        }
        $r['id'] = (int)$r['id'];
        $r['enabled'] = (int)$r['enabled'];
        $r['config'] = json_encode($cfg, JSON_UNESCAPED_UNICODE);
        $r['fields'] = $def['configFields'] ?? [];
        $r['label'] = $def['label'] ?? $r['type'];
    }
    unset($r);
    cns_json(['providers' => $rows]);
}

function api_admin_provider_create(?array $user, array $params, array $body, array $query): void
{
    $type = (string)($body['type'] ?? '');
    $reg = dns_providers();
    if (!isset($reg[$type])) {
        cns_error('不支持的服务商类型');
    }
    $id = cns_exec(
        'INSERT INTO ' . cns_table('providers') . ' (name, type, config, created_at) VALUES (?,?,?,?)',
        [(string)($body['name'] ?? $reg[$type]['label']), $type, json_encode($body['config'] ?? new stdClass(), JSON_UNESCAPED_UNICODE), cns_now()]
    );
    cns_json(['ok' => true, 'id' => $id]);
}

function api_admin_provider_update(?array $user, array $params, array $body, array $query): void
{
    $p = cns_one('SELECT * FROM ' . cns_table('providers') . ' WHERE id = ?', [(int)$params['id']]);
    if (!$p) {
        cns_error('服务商不存在', 404);
    }
    $cfgRaw = $body['config'] ?? '{}';
    if (is_string($cfgRaw)) {
        $cfg = json_decode($cfgRaw, true);
        if (!is_array($cfg)) {
            cns_error('配置格式错误');
        }
    } else {
        $cfg = (array)$cfgRaw;
    }
    $oldCfg = json_decode((string)($p['config'] ?? '{}'), true) ?: [];
    $def = dns_provider((string)$p['type']);
    foreach ($def['configFields'] as $f) {
        if (!empty($f['secret']) && is_string($cfg[$f['key']] ?? null) && str_starts_with((string)$cfg[$f['key']], '••••••')) {
            $cfg[$f['key']] = $oldCfg[$f['key']] ?? '';
        }
    }
    cns_exec(
        'UPDATE ' . cns_table('providers') . ' SET name = ?, config = ? WHERE id = ?',
        [(string)($body['name'] ?? $p['name']), json_encode($cfg, JSON_UNESCAPED_UNICODE), $p['id']]
    );
    cns_json(['ok' => true]);
}

function api_admin_provider_delete(?array $user, array $params, array $body, array $query): void
{
    $id = (int)$params['id'];
    $used = (int)cns_one('SELECT COUNT(*) c FROM ' . cns_table('zones') . ' WHERE provider_id = ?', [$id])['c'];
    if ($used) {
        cns_error('仍有 ' . $used . ' 个主域名使用该服务商，无法删除');
    }
    cns_exec('DELETE FROM ' . cns_table('providers') . ' WHERE id = ?', [$id]);
    cns_json(['ok' => true]);
}

function api_admin_provider_test(?array $user, array $params, array $body, array $query): void
{
    $p = cns_one('SELECT * FROM ' . cns_table('providers') . ' WHERE id = ?', [(int)$params['id']]);
    if (!$p) {
        cns_error('服务商不存在', 404);
    }
    try {
        $def = dns_provider((string)$p['type']);
        $cfg = json_decode((string)($p['config'] ?? '{}'), true) ?: [];
        $r = $def['test']($cfg);
        cns_json($r);
    } catch (Throwable $e) {
        cns_json(['ok' => false, 'message' => $e->getMessage()]);
    }
}

function api_admin_zones(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        'SELECT z.*, p.name AS provider_name,
           (SELECT COUNT(*) FROM ' . cns_table('subdomains') . ' s WHERE s.zone_id = z.id) AS sold_count
         FROM ' . cns_table('zones') . ' z JOIN ' . cns_table('providers') . ' p ON p.id = z.provider_id ORDER BY z.id'
    );
    foreach ($rows as &$r) {
        foreach (['id', 'provider_id', 'price', 'max_records', 'max_per_user', 'enabled', 'sold_count'] as $k) {
            $r[$k] = (int)$r[$k];
        }
    }
    unset($r);
    cns_json(['zones' => $rows]);
}

function api_admin_zone_create(?array $user, array $params, array $body, array $query): void
{
    $name = strtolower(trim((string)($body['name'] ?? '')));
    if (!cns_valid_zone_name($name)) {
        cns_error('主域名格式不正确');
    }
    if (cns_one('SELECT id FROM ' . cns_table('zones') . ' WHERE name = ?', [$name])) {
        cns_error('该域名已存在');
    }
    $pid = (int)($body['provider_id'] ?? 0);
    if (!cns_one('SELECT id FROM ' . cns_table('providers') . ' WHERE id = ?', [$pid])) {
        cns_error('服务商不存在');
    }
    $id = cns_exec(
        'INSERT INTO ' . cns_table('zones') . ' (name, provider_id, price, max_records, max_per_user, note, created_at) VALUES (?,?,?,?,?,?,?)',
        [
            $name, $pid,
            max(0, (int)($body['price'] ?? 10)),
            max(1, (int)($body['max_records'] ?? 10)),
            max(1, (int)($body['max_per_user'] ?? 5)),
            (string)($body['note'] ?? ''),
            cns_now(),
        ]
    );
    cns_json(['ok' => true, 'id' => $id]);
}

function api_admin_zone_update(?array $user, array $params, array $body, array $query): void
{
    $z = cns_one('SELECT * FROM ' . cns_table('zones') . ' WHERE id = ?', [(int)$params['id']]);
    if (!$z) {
        cns_error('域名不存在', 404);
    }
    $name = strtolower(trim((string)($body['name'] ?? $z['name'])));
    if (!cns_valid_zone_name($name)) {
        cns_error('主域名格式不正确');
    }
    $dup = cns_one('SELECT id FROM ' . cns_table('zones') . ' WHERE name = ? AND id <> ?', [$name, $z['id']]);
    if ($dup) {
        cns_error('该域名已存在');
    }
    cns_exec(
        'UPDATE ' . cns_table('zones') . ' SET name=?, provider_id=?, price=?, max_records=?, max_per_user=?, note=?, enabled=? WHERE id=?',
        [
            $name,
            (int)($body['provider_id'] ?? $z['provider_id']),
            array_key_exists('price', $body) ? max(0, (int)$body['price']) : (int)$z['price'],
            array_key_exists('max_records', $body) ? max(1, (int)$body['max_records']) : (int)$z['max_records'],
            array_key_exists('max_per_user', $body) ? max(1, (int)$body['max_per_user']) : (int)$z['max_per_user'],
            array_key_exists('note', $body) ? (string)$body['note'] : $z['note'],
            array_key_exists('enabled', $body) ? (!empty($body['enabled']) ? 1 : 0) : (int)$z['enabled'],
            $z['id'],
        ]
    );
    cns_json(['ok' => true]);
}

function api_admin_zone_delete(?array $user, array $params, array $body, array $query): void
{
    $id = (int)$params['id'];
    $sold = (int)cns_one('SELECT COUNT(*) c FROM ' . cns_table('subdomains') . ' WHERE zone_id = ?', [$id])['c'];
    if ($sold) {
        cns_error('该域名下仍有 ' . $sold . ' 个已售子域名，请先下架而非删除');
    }
    cns_exec('DELETE FROM ' . cns_table('zones') . ' WHERE id = ?', [$id]);
    cns_json(['ok' => true]);
}

function api_admin_subdomains(?array $user, array $params, array $body, array $query): void
{
    $q = '%' . str_replace(['%', '_'], ['\%', '\_'], (string)($query['q'] ?? '')) . '%';
    $rows = cns_all(
        'SELECT s.*, z.name AS zone_name, u.username
         FROM ' . cns_table('subdomains') . ' s
         JOIN ' . cns_table('zones') . ' z ON z.id = s.zone_id
         JOIN ' . cns_table('users') . ' u ON u.id = s.user_id
         WHERE s.full_name LIKE ? OR u.username LIKE ?
         ORDER BY s.id DESC LIMIT 200',
        [$q, $q]
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
    }
    unset($r);
    cns_json(['subdomains' => $rows]);
}

function api_admin_subdomain_delete(?array $user, array $params, array $body, array $query): void
{
    $sub = cns_one(
        'SELECT s.*, p.type AS provider_type, p.config AS provider_config, z.name AS zone_name
         FROM ' . cns_table('subdomains') . ' s
         JOIN ' . cns_table('zones') . ' z ON z.id = s.zone_id
         JOIN ' . cns_table('providers') . ' p ON p.id = z.provider_id
         WHERE s.id = ?',
        [(int)$params['id']]
    );
    if (!$sub) {
        cns_error('不存在', 404);
    }
    $reg = dns_providers();
    $def = $reg[$sub['provider_type']] ?? null;
    $cfg = json_decode((string)($sub['provider_config'] ?? '{}'), true) ?: [];
    if ($def) {
        $recs = cns_all('SELECT external_id FROM ' . cns_table('records') . ' WHERE subdomain_id = ?', [$sub['id']]);
        foreach ($recs as $r) {
            if (!empty($r['external_id'])) {
                try {
                    $def['delete']($cfg, (string)$sub['zone_name'], (string)$r['external_id']);
                } catch (Throwable $e) {
                    // 上游删除失败不阻塞回收
                }
            }
        }
    }
    cns_exec('DELETE FROM ' . cns_table('records') . ' WHERE subdomain_id = ?', [$sub['id']]);
    cns_exec('DELETE FROM ' . cns_table('subdomains') . ' WHERE id = ?', [$sub['id']]);
    cns_json(['ok' => true]);
}

function api_admin_users(?array $user, array $params, array $body, array $query): void
{
    $q = '%' . str_replace(['%', '_'], ['\%', '\_'], (string)($query['q'] ?? '')) . '%';
    $rows = cns_all(
        'SELECT id, username, email, credits, is_admin, streak, created_at,
           (SELECT COUNT(*) FROM ' . cns_table('subdomains') . ' s WHERE s.user_id = u.id) AS sub_count
         FROM ' . cns_table('users') . ' u WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 200',
        [$q, $q]
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['credits'] = (int)$r['credits'];
        $r['is_admin'] = (int)$r['is_admin'];
        $r['streak'] = (int)$r['streak'];
        $r['sub_count'] = (int)$r['sub_count'];
    }
    unset($r);
    cns_json(['users' => $rows]);
}

function api_admin_user_credits(?array $user, array $params, array $body, array $query): void
{
    $delta = (int)($body['delta'] ?? 0);
    if ($delta === 0) {
        cns_error('变动值不能为 0');
    }
    $u = cns_one('SELECT id FROM ' . cns_table('users') . ' WHERE id = ?', [(int)$params['id']]);
    if (!$u) {
        cns_error('用户不存在', 404);
    }
    try {
        $balance = cns_credit((int)$u['id'], $delta, '管理员调整 (' . $user['username'] . ')');
    } catch (RuntimeException $e) {
        cns_error($e->getMessage());
    }
    cns_json(['ok' => true, 'balance' => $balance]);
}

function api_admin_user_admin(?array $user, array $params, array $body, array $query): void
{
    $id = (int)$params['id'];
    if ($id === (int)$user['id']) {
        cns_error('不能修改自己的管理员权限');
    }
    cns_exec('UPDATE ' . cns_table('users') . ' SET is_admin = ? WHERE id = ?', [!empty($body['is_admin']) ? 1 : 0, $id]);
    cns_json(['ok' => true]);
}

function api_admin_user_password(?array $user, array $params, array $body, array $query): void
{
    $password = (string)($body['password'] ?? '');
    if (strlen($password) < 6) {
        cns_error('密码长度至少 6 位');
    }
    $u = cns_one('SELECT id FROM ' . cns_table('users') . ' WHERE id = ?', [(int)$params['id']]);
    if (!$u) {
        cns_error('用户不存在', 404);
    }
    cns_exec('UPDATE ' . cns_table('users') . ' SET password_hash = ? WHERE id = ?', [cns_hash_password($password), $u['id']]);
    cns_json(['ok' => true]);
}

function api_admin_orders(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        'SELECT o.*, u.username FROM ' . cns_table('orders') . ' o JOIN ' . cns_table('users') . ' u ON u.id = o.user_id
         ORDER BY o.id DESC LIMIT 200'
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['money'] = (float)$r['money'];
        $r['credits'] = (int)$r['credits'];
    }
    unset($r);
    cns_json(['orders' => $rows]);
}

function api_admin_settings(?array $user, array $params, array $body, array $query): void
{
    cns_json(['settings' => cns_settings()]);
}

function api_admin_settings_update(?array $user, array $params, array $body, array $query): void
{
    foreach (array_keys(CNS_DEFAULT_SETTINGS) as $k) {
        if (array_key_exists($k, $body)) {
            cns_set_setting($k, (string)$body[$k]);
        }
    }
    cns_json(['ok' => true]);
}

// ---------- 邮件与定时任务 ----------
function api_admin_mail_test(?array $user, array $params, array $body, array $query): void
{
    $to = strtolower(trim((string)($body['to'] ?? '')));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        cns_error('收件邮箱格式不正确');
    }
    if (cns_setting('smtp_host') === '') {
        cns_error('请先填写 SMTP 服务器');
    }
    $site = cns_setting('site_name');
    [$ok, $err] = cns_mail(
        $to,
        'SMTP 连通性测试 - ' . $site,
        cns_mail_shell('SMTP 配置正确', '<p style="margin:0;color:#4d5562;line-height:1.7">看到这封邮件说明发件配置可用，现在可以开启邮件服务了。</p>'),
        'SMTP 配置正确'
    );
    if (!$ok) {
        cns_error('发送失败：' . $err);
    }
    cns_json(['ok' => true]);
}

function api_admin_mail_logs(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        'SELECT id, recipient, subject, status, error, created_at FROM ' . cns_table('mail_logs') . ' ORDER BY id DESC LIMIT 50'
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
    }
    unset($r);
    cns_json(['logs' => $rows]);
}

function api_admin_cron_token(?array $user, array $params, array $body, array $query): void
{
    $token = bin2hex(random_bytes(16));
    cns_set_setting('cron_token', $token);
    cns_json(['ok' => true, 'token' => $token]);
}

function api_admin_expire_run(?array $user, array $params, array $body, array $query): void
{
    cns_rate_limit('admin/expire-run', 60, 6);
    $log = cns_expire_sweep();
    cns_json(['ok' => true, 'log' => $log]);
}

function api_admin_expiring(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        "SELECT s.id, s.full_name, s.status, s.expires_at, s.remind_stage, u.username, u.email,
                TIMESTAMPDIFF(DAY, NOW(), s.expires_at) AS days_left
         FROM " . cns_table('subdomains') . ' s
         JOIN ' . cns_table('users') . " u ON u.id = s.user_id
         WHERE s.status IN ('active','expired') AND s.expires_at <= DATE_ADD(NOW(), INTERVAL 14 DAY)
         ORDER BY s.expires_at ASC LIMIT 200"
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['days_left'] = (int)$r['days_left'];
    }
    unset($r);
    cns_json(['subdomains' => $rows]);
}
