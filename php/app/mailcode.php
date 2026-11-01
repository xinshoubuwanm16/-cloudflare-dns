<?php
/**
 * 邮箱验证码：签发与校验（只存哈希，10 分钟有效，单码最多试 5 次）
 */

declare(strict_types=1);

const CNS_CODE_TTL_MIN = 10;
const CNS_CODE_MAX_TRY = 5;

/** 签发验证码并发送，返回 [bool 是否送达, string 错误信息] */
function cns_code_send(string $email, string $scene, string $sceneText, string $purpose): array
{
    $code = (string)random_int(100000, 999999);
    cns_exec(
        'DELETE FROM ' . cns_table('email_codes') . ' WHERE email = ? AND scene = ?',
        [$email, $scene]
    );
    cns_exec(
        'INSERT INTO ' . cns_table('email_codes') . ' (email, scene, code_hash, expires_at, created_at) VALUES (?,?,?,?,?)',
        [$email, $scene, hash('sha256', $email . '|' . $scene . '|' . $code),
         date('Y-m-d H:i:s', time() + CNS_CODE_TTL_MIN * 60), cns_now()]
    );
    return cns_mail_to($email, 'email_code', [
        'code' => $code,
        'scene_text' => $sceneText,
        'purpose' => $purpose,
    ]);
}

/** 校验验证码；成功即作废，失败累加尝试次数 */
function cns_code_check(string $email, string $scene, string $code): bool
{
    $row = cns_one(
        'SELECT * FROM ' . cns_table('email_codes') . ' WHERE email = ? AND scene = ? ORDER BY id DESC LIMIT 1',
        [$email, $scene]
    );
    if (!$row) {
        return false;
    }
    if (strtotime((string)$row['expires_at']) < time()) {
        cns_exec('DELETE FROM ' . cns_table('email_codes') . ' WHERE id = ?', [$row['id']]);
        return false;
    }
    $hash = hash('sha256', $email . '|' . $scene . '|' . $code);
    if (!hash_equals((string)$row['code_hash'], $hash)) {
        $tries = (int)$row['attempts'] + 1;
        if ($tries >= CNS_CODE_MAX_TRY) {
            cns_exec('DELETE FROM ' . cns_table('email_codes') . ' WHERE id = ?', [$row['id']]);
        } else {
            cns_exec('UPDATE ' . cns_table('email_codes') . ' SET attempts = ? WHERE id = ?', [$tries, $row['id']]);
        }
        return false;
    }
    cns_exec('DELETE FROM ' . cns_table('email_codes') . ' WHERE id = ?', [$row['id']]);
    return true;
}
