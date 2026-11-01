<?php
/**
 * 登录态：基于 PHP 会话（对应 Node 版 src/auth.js）
 */

declare(strict_types=1);

function cns_hash_password(string $password): string
{
    return password_hash($password, PASSWORD_BCRYPT);
}

function cns_verify_password(string $password, string $stored): bool
{
    return password_verify($password, $stored);
}

function cns_login(int $userId): void
{
    cns_session_start();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
}

function cns_logout(): void
{
    cns_session_start();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

// 当前登录用户行，未登录返回 null
function cns_current_user(): ?array
{
    cns_session_start();
    $uid = $_SESSION['user_id'] ?? null;
    if (!$uid) {
        return null;
    }
    $u = cns_one('SELECT * FROM ' . cns_table('users') . ' WHERE id = ?', [$uid]);
    if (!$u) {
        unset($_SESSION['user_id']);
        return null;
    }
    return $u;
}

function cns_require_auth(): array
{
    $u = cns_current_user();
    if (!$u) {
        cns_error('请先登录', 401);
    }
    return $u;
}

function cns_require_admin(): array
{
    $u = cns_require_auth();
    if (!(int)$u['is_admin']) {
        cns_error('需要管理员权限', 403);
    }
    return $u;
}

// 积分变动（必须在已开启的事务内调用）：行锁余额、不足时抛出异常
function cns_credit_tx(int $userId, int $delta, string $reason): int
{
    $db = cns_db();
    $st = $db->prepare('SELECT credits FROM ' . cns_table('users') . ' WHERE id = ? FOR UPDATE');
    $st->execute([$userId]);
    $u = $st->fetch();
    if (!$u) {
        throw new RuntimeException('用户不存在');
    }
    $balance = (int)$u['credits'] + $delta;
    if ($balance < 0) {
        throw new RuntimeException('积分不足');
    }
    $db->prepare('UPDATE ' . cns_table('users') . ' SET credits = ? WHERE id = ?')->execute([$balance, $userId]);
    $db->prepare('INSERT INTO ' . cns_table('credit_logs') . ' (user_id, delta, balance, reason, created_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$userId, $delta, $balance, $reason, cns_now()]);
    return $balance;
}

// 独立事务的积分变动
function cns_credit(int $userId, int $delta, string $reason): int
{
    return cns_transaction(fn() => cns_credit_tx($userId, $delta, $reason));
}
