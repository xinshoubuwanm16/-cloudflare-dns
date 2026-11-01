<?php
/**
 * 域名与 DNS 记录接口
 */

declare(strict_types=1);

function api_domains_zones(?array $user, array $params, array $body, array $query): void
{
    $zones = cns_all(
        'SELECT z.*, p.name AS provider_name, p.type AS provider_type,
           (SELECT COUNT(*) FROM ' . cns_table('subdomains') . ' s WHERE s.zone_id = z.id AND s.status = \'active\') AS sold_count
         FROM ' . cns_table('zones') . ' z JOIN ' . cns_table('providers') . ' p ON p.id = z.provider_id
         WHERE z.enabled = 1 ORDER BY z.price ASC, z.id ASC'
    );
    $mine = cns_all(
        'SELECT zone_id, COUNT(*) AS c FROM ' . cns_table('subdomains') . ' WHERE user_id = ? AND status = \'active\' GROUP BY zone_id',
        [$user['id']]
    );
    $mineMap = [];
    foreach ($mine as $r) {
        $mineMap[(int)$r['zone_id']] = (int)$r['c'];
    }
    foreach ($zones as &$z) {
        $z['id'] = (int)$z['id'];
        $z['price'] = (int)$z['price'];
        $z['max_records'] = (int)$z['max_records'];
        $z['max_per_user'] = (int)$z['max_per_user'];
        $z['sold_count'] = (int)$z['sold_count'];
        $z['mine_count'] = $mineMap[(int)$z['id']] ?? 0;
    }
    unset($z);
    cns_json(['zones' => $zones]);
}

function api_domains_mine(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        'SELECT s.*, z.name AS zone_name, z.max_records, z.price,
           (SELECT COUNT(*) FROM ' . cns_table('records') . ' r WHERE r.subdomain_id = s.id) AS record_count
         FROM ' . cns_table('subdomains') . ' s JOIN ' . cns_table('zones') . ' z ON z.id = s.zone_id
         WHERE s.user_id = ? AND s.status IN (\'active\',\'expired\') ORDER BY s.id DESC',
        [$user['id']]
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['record_count'] = (int)$r['record_count'];
        $r['max_records'] = (int)$r['max_records'];
        $r['price'] = (int)$r['price'];
        $r['remind_stage'] = (string)($r['remind_stage'] ?? '');
    }
    unset($r);
    cns_json(['subdomains' => $rows]);
}

function api_domains_buy(?array $user, array $params, array $body, array $query): void
{
    $zoneId = (int)($body['zone_id'] ?? 0);
    $prefix = strtolower(trim((string)($body['prefix'] ?? '')));
    $years = min(5, max(1, (int)($body['years'] ?? 1)));

    if (!cns_valid_prefix($prefix)) {
        cns_error('前缀格式不正确：仅允许小写字母、数字、连字符');
    }
    if (cns_is_reserved($prefix)) {
        cns_error('该前缀为保留字，不可使用');
    }
    $zone = cns_one('SELECT * FROM ' . cns_table('zones') . ' WHERE id = ? AND enabled = 1', [$zoneId]);
    if (!$zone) {
        cns_error('域名不存在或已下架');
    }
    $fullName = $prefix . '.' . $zone['name'];
    if (cns_one('SELECT id FROM ' . cns_table('subdomains') . ' WHERE full_name = ?', [$fullName])) {
        cns_error('该子域名已被注册');
    }
    $mineCount = (int)cns_one(
        'SELECT COUNT(*) AS c FROM ' . cns_table('subdomains') . ' WHERE user_id = ? AND zone_id = ? AND status = \'active\'',
        [$user['id'], $zone['id']]
    )['c'];
    if ($mineCount >= (int)$zone['max_per_user']) {
        cns_error('每个用户在该域名下最多持有 ' . $zone['max_per_user'] . ' 个子域名');
    }

    $cost = (int)$zone['price'] * $years;
    $expires = (new DateTimeImmutable('+' . $years * 365 . ' days'))->format('Y-m-d H:i:s');

    try {
        $subId = cns_transaction(function () use ($zone, $prefix, $fullName, $user, $cost, $expires, $years) {
            cns_credit_tx((int)$user['id'], -$cost, '购买域名 ' . $fullName . ' (' . $years . '年)');
            return cns_exec(
                'INSERT INTO ' . cns_table('subdomains') . ' (zone_id, prefix, full_name, user_id, expires_at, created_at) VALUES (?,?,?,?,?,?)',
                [$zone['id'], $prefix, $fullName, $user['id'], $expires, cns_now()]
            );
        });
    } catch (RuntimeException $e) {
        cns_error($e->getMessage());
    }

    // 可选：购买时一并创建解析记录（失败不影响购买，仅提示）
    $resolve = trim((string)($body['resolve'] ?? ''));
    $recordId = null;
    $recordError = '';
    if ($resolve !== '') {
        $sub = cns_one(
            'SELECT s.*, z.name AS zone_name, z.max_records, z.provider_id,
                    p.type AS provider_type, p.config AS provider_config
             FROM ' . cns_table('subdomains') . ' s
             JOIN ' . cns_table('zones') . ' z ON z.id = s.zone_id
             JOIN ' . cns_table('providers') . ' p ON p.id = z.provider_id
             WHERE s.id = ?',
            [$subId]
        );
        $type = cns_valid_ipv4($resolve) ? 'A' : (cns_valid_ipv6($resolve) ? 'AAAA' : 'CNAME');
        try {
            $recordId = cns_create_record_for($sub, [
                'type' => $type, 'label' => '@', 'content' => $resolve, 'ttl' => 1,
                'proxied' => !empty($body['proxied']) && $type === 'A',
            ]);
        } catch (Throwable $e) {
            $recordError = $e->getMessage();
        }
    }

    cns_json([
        'ok' => true, 'id' => $subId, 'cost' => $cost, 'expires_at' => $expires,
        'record_id' => $recordId, 'record_error' => $recordError,
    ]);
}

function api_domains_renew(?array $user, array $params, array $body, array $query): void
{
    $sub = cns_one(
        'SELECT s.*, z.price, z.name AS zone_name, z.provider_id,
                p.type AS provider_type, p.config AS provider_config
         FROM ' . cns_table('subdomains') . ' s
         JOIN ' . cns_table('zones') . ' z ON z.id = s.zone_id
         JOIN ' . cns_table('providers') . ' p ON p.id = z.provider_id
         WHERE s.id = ? AND s.user_id = ? AND s.status IN (\'active\',\'expired\')',
        [(int)$params['id'], $user['id']]
    );
    if (!$sub) {
        cns_error('域名不存在', 404);
    }
    $years = min(5, max(1, (int)($body['years'] ?? 1)));
    $cost = (int)$sub['price'] * $years;

    $now = new DateTimeImmutable('now');
    $current = new DateTimeImmutable((string)$sub['expires_at']);
    $base = $current > $now ? $current : $now;
    $newExpires = $base->modify('+' . $years * 365 . ' days')->format('Y-m-d H:i:s');

    try {
        cns_credit((int)$user['id'], -$cost, '续期域名 ' . $sub['full_name'] . ' (' . $years . '年)');
    } catch (RuntimeException $e) {
        cns_error($e->getMessage());
    }
    cns_exec(
        'UPDATE ' . cns_table('subdomains') . " SET expires_at = ?, status='active', remind_stage='', expired_at = NULL WHERE id = ?",
        [$newExpires, $sub['id']]
    );

    // 到期被暂停过的域名：续期后把本地记录重新推回上游
    $restored = 0;
    $restoreErrors = [];
    if ($sub['status'] === 'expired') {
        $provider = dns_provider((string)$sub['provider_type']);
        $cfg = json_decode((string)($sub['provider_config'] ?? '{}'), true) ?: [];
        foreach (cns_all('SELECT * FROM ' . cns_table('records') . ' WHERE subdomain_id = ?', [$sub['id']]) as $r) {
            if ((string)($r['external_id'] ?? '') !== '') {
                continue;
            }
            try {
                $ext = $provider['create']($cfg, (string)$sub['zone_name'], [
                    'type' => $r['type'], 'name' => $r['name'], 'content' => $r['content'],
                    'ttl' => (int)$r['ttl'], 'proxied' => (bool)(int)$r['proxied'], 'priority' => (int)$r['priority'],
                ]);
                cns_exec('UPDATE ' . cns_table('records') . ' SET external_id = ? WHERE id = ?', [(string)($ext['id'] ?? ''), $r['id']]);
                $restored++;
            } catch (Throwable $e) {
                $restoreErrors[] = $r['name'] . '：' . $e->getMessage();
            }
        }
    }

    cns_json([
        'ok' => true, 'expires_at' => $newExpires, 'cost' => $cost,
        'restored' => $restored, 'restore_errors' => $restoreErrors,
    ]);
}

function cns_owned_sub(int $subId, int $userId, bool $writable = false): ?array
{
    $sub = cns_one(
        'SELECT s.*, z.name AS zone_name, z.max_records, z.price, z.provider_id,
           p.type AS provider_type, p.config AS provider_config
         FROM ' . cns_table('subdomains') . ' s
         JOIN ' . cns_table('zones') . ' z ON z.id = s.zone_id
         JOIN ' . cns_table('providers') . ' p ON p.id = z.provider_id
         WHERE s.id = ? AND s.user_id = ? AND s.status IN (\'active\',\'expired\')',
        [$subId, $userId]
    );
    if ($sub && $writable && $sub['status'] !== 'active') {
        cns_error('域名已到期，续期后才能修改解析记录', 409);
    }
    return $sub;
}

function api_domains_records_list(?array $user, array $params, array $body, array $query): void
{
    $sub = cns_owned_sub((int)$params['id'], (int)$user['id']);
    if (!$sub) {
        cns_error('域名不存在', 404);
    }
    $records = cns_all('SELECT * FROM ' . cns_table('records') . ' WHERE subdomain_id = ? ORDER BY id DESC', [$sub['id']]);
    foreach ($records as &$r) {
        $r['id'] = (int)$r['id'];
        $r['ttl'] = (int)$r['ttl'];
        $r['proxied'] = (bool)(int)$r['proxied'];
        $r['priority'] = (int)$r['priority'];
    }
    unset($r);
    unset($sub['provider_config']);
    $sub['max_records'] = (int)$sub['max_records'];
    $sub['price'] = (int)$sub['price'];
    $sub['remind_stage'] = (string)($sub['remind_stage'] ?? '');
    cns_json(['subdomain' => $sub, 'records' => $records, 'types' => CNS_RECORD_TYPES]);
}

function cns_record_input(array $body, array $sub): array
{
    $type = strtoupper(trim((string)($body['type'] ?? '')));
    $label = trim((string)($body['label'] ?? ''));
    $content = trim((string)($body['content'] ?? ''));
    $ttlRaw = $body['ttl'] ?? 1;
    $ttl = ($ttlRaw === 1 || $ttlRaw === '1' || $ttlRaw === null || $ttlRaw === '') ? 1 : (int)$ttlRaw;
    $prioRaw = $body['priority'] ?? 0;
    $prio = ($prioRaw === '' || $prioRaw === null) ? 0 : (int)$prioRaw;
    $proxied = !empty($body['proxied']);

    $name = cns_record_fqdn($label, (string)$sub['full_name']);
    $err = cns_validate_record($type, $name, $content, $ttl, $prio);
    if ($err !== null) {
        cns_error($err);
    }
    return compact('type', 'name', 'content', 'ttl', 'prio', 'proxied');
}

/** 在指定子域名下创建一条解析（真实调用服务商 API），返回本地记录 id */
function cns_create_record_for(array $sub, array $body): int
{
    $count = (int)cns_one('SELECT COUNT(*) AS c FROM ' . cns_table('records') . ' WHERE subdomain_id = ?', [$sub['id']])['c'];
    if ($count >= (int)$sub['max_records']) {
        throw new RuntimeException('最多可创建 ' . $sub['max_records'] . ' 条记录');
    }
    $in = cns_record_input($body, $sub);
    $provider = dns_provider((string)$sub['provider_type']);
    $cfg = json_decode((string)($sub['provider_config'] ?? '{}'), true) ?: [];

    $external = $provider['create']($cfg, (string)$sub['zone_name'], [
        'type' => $in['type'], 'name' => $in['name'], 'content' => $in['content'],
        'ttl' => $in['ttl'], 'proxied' => $in['proxied'], 'priority' => $in['prio'],
    ]);

    return cns_exec(
        'INSERT INTO ' . cns_table('records') . ' (subdomain_id, type, name, content, ttl, proxied, priority, external_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)',
        [
            $sub['id'], $in['type'], $in['name'], $in['content'], $in['ttl'],
            $sub['provider_type'] === 'cloudflare' ? ($in['proxied'] ? 1 : 0) : 0,
            $in['prio'], (string)($external['id'] ?? ''), cns_now(), cns_now(),
        ]
    );
}

function api_domains_record_create(?array $user, array $params, array $body, array $query): void
{
    $sub = cns_owned_sub((int)$params['id'], (int)$user['id'], true);
    if (!$sub) {
        cns_error('域名不存在', 404);
    }
    try {
        $id = cns_create_record_for($sub, $body);
    } catch (RuntimeException $e) {
        cns_error($e->getMessage());
    }
    cns_json(['ok' => true, 'id' => $id]);
}

function api_domains_record_update(?array $user, array $params, array $body, array $query): void
{
    $sub = cns_owned_sub((int)$params['id'], (int)$user['id'], true);
    if (!$sub) {
        cns_error('域名不存在', 404);
    }
    $rec = cns_one('SELECT * FROM ' . cns_table('records') . ' WHERE id = ? AND subdomain_id = ?', [(int)$params['rid'], $sub['id']]);
    if (!$rec) {
        cns_error('记录不存在', 404);
    }

    $in = cns_record_input($body, $sub);
    $provider = dns_provider((string)$sub['provider_type']);
    $cfg = json_decode((string)($sub['provider_config'] ?? '{}'), true) ?: [];

    $external = $provider['update']($cfg, (string)$sub['zone_name'], (string)$rec['external_id'], [
        'type' => $in['type'], 'name' => $in['name'], 'content' => $in['content'],
        'ttl' => $in['ttl'], 'proxied' => $in['proxied'], 'priority' => $in['prio'],
    ]);

    cns_exec(
        'UPDATE ' . cns_table('records') . ' SET type=?, name=?, content=?, ttl=?, proxied=?, priority=?, external_id=?, updated_at=? WHERE id=?',
        [
            $in['type'], $in['name'], $in['content'], $in['ttl'],
            $sub['provider_type'] === 'cloudflare' ? ($in['proxied'] ? 1 : 0) : 0,
            $in['prio'], (string)($external['id'] ?? $rec['external_id']), cns_now(), $rec['id'],
        ]
    );
    cns_json(['ok' => true]);
}

function api_domains_record_delete(?array $user, array $params, array $body, array $query): void
{
    $sub = cns_owned_sub((int)$params['id'], (int)$user['id'], true);
    if (!$sub) {
        cns_error('域名不存在', 404);
    }
    $rec = cns_one('SELECT * FROM ' . cns_table('records') . ' WHERE id = ? AND subdomain_id = ?', [(int)$params['rid'], $sub['id']]);
    if (!$rec) {
        cns_error('记录不存在', 404);
    }
    if (!empty($rec['external_id'])) {
        $provider = dns_provider((string)$sub['provider_type']);
        $cfg = json_decode((string)($sub['provider_config'] ?? '{}'), true) ?: [];
        $provider['delete']($cfg, (string)$sub['zone_name'], (string)$rec['external_id']);
    }
    cns_exec('DELETE FROM ' . cns_table('records') . ' WHERE id = ?', [$rec['id']]);
    cns_json(['ok' => true]);
}
