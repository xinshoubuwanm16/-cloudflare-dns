<?php
/**
 * 认证与签到接口
 */

declare(strict_types=1);

function api_site(?array $user, array $params, array $body, array $query): void
{
    cns_json(['site' => cns_settings([
        'site_name', 'site_subtitle', 'buy_notice', 'credit_rate', 'checkin_base', 'checkin_bonus_max',
        'mail_enabled', 'register_need_email',
    ])]);
}

// 发送邮箱验证码：scene = register | reset
function api_auth_send_code(?array $user, array $params, array $body, array $query): void
{
    cns_rate_limit('auth/send-code', 60, 5);
    if (cns_setting('mail_enabled') !== '1') {
        cns_error('站点未开启邮件服务，请联系管理员');
    }
    $scene = (string)($body['scene'] ?? 'register');
    $email = strtolower(trim((string)($body['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        cns_error('邮箱格式不正确');
    }

    if ($scene === 'register') {
        if (cns_one('SELECT id FROM ' . cns_table('users') . ' WHERE email = ?', [$email])) {
            cns_error('该邮箱已被注册');
        }
        $sceneText = '注册账号';
        $purpose = '注册验证码';
    } elseif ($scene === 'reset') {
        if (!cns_one('SELECT id FROM ' . cns_table('users') . ' WHERE email = ?', [$email])) {
            // 不暴露邮箱是否存在
            cns_json(['ok' => true, 'sent' => true]);
        }
        $sceneText = '重置密码';
        $purpose = '重置密码验证码';
    } else {
        cns_error('未知的验证场景');
    }

    [$ok, $err] = cns_code_send($email, $scene, $sceneText, $purpose);
    if (!$ok) {
        cns_error('邮件发送失败：' . $err);
    }
    cns_json(['ok' => true, 'sent' => true]);
}

function api_auth_register(?array $user, array $params, array $body, array $query): void
{
    cns_rate_limit('auth/register', 60, 10);
    $username = trim((string)($body['username'] ?? ''));
    $email    = strtolower(trim((string)($body['email'] ?? '')));
    $password = (string)($body['password'] ?? '');
    $code     = trim((string)($body['code'] ?? ''));

    if (!preg_match('/^[a-zA-Z0-9_]{3,20}$/', $username)) {
        cns_error('用户名需为 3-20 位字母、数字或下划线');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        cns_error('邮箱格式不正确');
    }
    if (strlen($password) < 6 || strlen($password) > 64) {
        cns_error('密码长度需为 6-64 位');
    }
    $exists = cns_one('SELECT id FROM ' . cns_table('users') . ' WHERE username = ? OR email = ?', [$username, $email]);
    if ($exists) {
        cns_error('用户名或邮箱已被注册');
    }
    $needVerify = cns_setting('mail_enabled') === '1' && cns_setting('register_need_email') === '1';
    if ($needVerify) {
        if ($code === '') {
            cns_error('请填写邮箱验证码');
        }
        if (!cns_code_check($email, 'register', $code)) {
            cns_error('验证码错误或已过期');
        }
    }

    $gift = max(0, (int)cns_setting('register_gift'));
    $id = cns_exec(
        'INSERT INTO ' . cns_table('users') . ' (username, email, email_verified, password_hash, credits) VALUES (?,?,?,?,?)',
        [$username, $email, $needVerify ? 1 : 0, cns_hash_password($password), $gift]
    );
    if ($gift > 0) {
        cns_exec(
            'INSERT INTO ' . cns_table('credit_logs') . ' (user_id, delta, balance, reason, created_at) VALUES (?,?,?,?,?)',
            [$id, $gift, $gift, '注册赠送', cns_now()]
        );
    }
    cns_login($id);
    cns_json(['ok' => true]);
}

function api_auth_login(?array $user, array $params, array $body, array $query): void
{
    cns_rate_limit('auth/login', 60, 10);
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $u = cns_one('SELECT * FROM ' . cns_table('users') . ' WHERE username = ? OR email = ?', [$username, strtolower($username)]);
    if (!$u || !cns_verify_password($password, $u['password_hash'])) {
        cns_error('用户名或密码错误', 401);
    }
    cns_login((int)$u['id']);
    cns_json(['ok' => true, 'is_admin' => (bool)(int)$u['is_admin']]);
}

function api_auth_logout(?array $user, array $params, array $body, array $query): void
{
    cns_logout();
    cns_json(['ok' => true]);
}

// 凭验证码重置密码
function api_auth_reset(?array $user, array $params, array $body, array $query): void
{
    cns_rate_limit('auth/reset', 60, 10);
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $code  = trim((string)($body['code'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        cns_error('邮箱格式不正确');
    }
    if (strlen($password) < 6 || strlen($password) > 64) {
        cns_error('密码长度需为 6-64 位');
    }
    $u = cns_one('SELECT id FROM ' . cns_table('users') . ' WHERE email = ?', [$email]);
    if (!$u) {
        cns_error('该邮箱未注册');
    }
    if ($code === '' || !cns_code_check($email, 'reset', $code)) {
        cns_error('验证码错误或已过期');
    }
    cns_exec('UPDATE ' . cns_table('users') . ' SET password_hash = ? WHERE id = ?', [cns_hash_password($password), $u['id']]);
    cns_json(['ok' => true]);
}

function cns_me_payload(array $u): array
{
    return [
        'id' => (int)$u['id'],
        'username' => $u['username'],
        'email' => $u['email'],
        'email_verified' => (bool)(int)($u['email_verified'] ?? 0),
        'credits' => (int)$u['credits'],
        'is_admin' => (bool)(int)$u['is_admin'],
        'streak' => (int)$u['streak'],
        'last_checkin_date' => $u['last_checkin_date'],
    ];
}

function api_auth_me(?array $user, array $params, array $body, array $query): void
{
    cns_json(['user' => cns_me_payload($user)]);
}

function api_auth_checkin(?array $user, array $params, array $body, array $query): void
{
    cns_rate_limit('auth/checkin', 10, 5);
    $today = cns_local_date();
    if ($user['last_checkin_date'] === $today) {
        cns_error('今天已经签到过了');
    }

    $base = (int)cns_setting('checkin_base') ?: 5;
    $bonusMax = max(0, (int)cns_setting('checkin_bonus_max'));

    $yesterday = cns_local_date(new DateTimeImmutable('-1 day'));
    $streak = $user['last_checkin_date'] === $yesterday ? (int)$user['streak'] + 1 : 1;
    $gain = $base + min($streak - 1, $bonusMax);

    cns_exec(
        'INSERT INTO ' . cns_table('checkins') . ' (user_id, checkin_date, credits, streak, created_at) VALUES (?,?,?,?,?)',
        [$user['id'], $today, $gain, $streak, cns_now()]
    );
    cns_exec('UPDATE ' . cns_table('users') . ' SET streak = ?, last_checkin_date = ? WHERE id = ?', [$streak, $today, $user['id']]);
    $balance = cns_credit((int)$user['id'], $gain, '每日签到 (连续' . $streak . '天)');

    cns_json(['ok' => true, 'gain' => $gain, 'streak' => $streak, 'balance' => $balance]);
}

function api_auth_checkin_calendar(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        'SELECT checkin_date AS date, credits, streak FROM ' . cns_table('checkins') . ' WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 30',
        [$user['id']]
    );
    cns_json(['days' => array_map(static fn($r) => [
        'date' => $r['date'],
        'credits' => (int)$r['credits'],
        'streak' => (int)$r['streak'],
    ], $rows)]);
}

function api_auth_credits_logs(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        'SELECT id, delta, balance, reason, created_at FROM ' . cns_table('credit_logs') . ' WHERE user_id = ? ORDER BY id DESC LIMIT 50',
        [$user['id']]
    );
    cns_json(['logs' => array_map(static fn($r) => [
        'id' => (int)$r['id'],
        'delta' => (int)$r['delta'],
        'balance' => (int)$r['balance'],
        'reason' => $r['reason'],
        'created_at' => $r['created_at'],
    ], $rows)]);
}
