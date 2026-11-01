<?php
/**
 * 邮件发送：内置 SMTP 客户端（465 SSL / 587 STARTTLS / 25 明文）+ 模板渲染 + 发送日志
 * 不依赖任何扩展组件，只用 openssl + socket。
 */

declare(strict_types=1);

/**
 * 底层 SMTP 投递。成功返回 true，失败抛出 RuntimeException。
 */
function smtp_send(string $to, string $subject, string $html, string $text = ''): true
{
    $cfg = cns_settings(['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_from_name', 'smtp_verify']);
    $host = $cfg['smtp_host'];
    if ($host === '') {
        throw new RuntimeException('未配置 SMTP 服务器');
    }
    $port = (int)($cfg['smtp_port'] ?: 465);
    $secure = strtolower($cfg['smtp_secure'] ?: 'ssl');
    $from = $cfg['smtp_from'] !== '' ? $cfg['smtp_from'] : $cfg['smtp_user'];
    if ($from === '') {
        throw new RuntimeException('未配置发件邮箱');
    }
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('收件邮箱格式不正确');
    }

    $verify = $cfg['smtp_verify'] !== '0';
    $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $ctx = stream_context_create([
        'ssl' => [
            'verify_peer'      => $verify,
            'verify_peer_name' => $verify,
            'peer_name'        => $host,
            'SNI_enabled'      => true,
        ],
    ]);
    $sock = @stream_socket_client($remote, $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $ctx);
    if (!$sock) {
        throw new RuntimeException(
            '连接 SMTP 失败: ' . $errstr . ' (' . $errno . ')'
            . ($verify && stripos($errstr, 'certificate') !== false ? '；证书校验未通过，可在邮件设置里关闭证书校验' : '')
        );
    }
    stream_set_timeout($sock, 12);

    $cmd = static function (string $line) use ($sock): string {
        fwrite($sock, $line . "\r\n");
        return smtp_read($sock);
    };
    $expect = static function (string $resp, int $code) use ($host): void {
        if ((int)$resp !== $code) {
            throw new RuntimeException($host . ' 应答异常 [' . $code . ']: ' . preg_replace('/\s+/', ' ', $resp));
        }
    };

    try {
        $expect(smtp_read($sock), 220);
        $hello = explode(':', $host)[0];
        $expect($cmd('EHLO ' . $hello), 250);

        if ($secure === 'tls') {
            $expect($cmd('STARTTLS'), 220);
            stream_context_set_option($sock, 'ssl', 'peer_name', $host);
            $ok = @stream_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT);
            if (!$ok) {
                throw new RuntimeException('STARTTLS 握手失败' . ($verify ? '；证书校验未通过时可在邮件设置里关闭' : ''));
            }
            smtp_reset($sock);
            $expect($cmd('EHLO ' . $hello), 250);
        }

        if ($cfg['smtp_user'] !== '') {
            $expect($cmd('AUTH LOGIN'), 334);
            $expect($cmd(base64_encode($cfg['smtp_user'])), 334);
            $expect($cmd(base64_encode($cfg['smtp_pass'])), 235);
        }

        $expect($cmd('MAIL FROM:<' . $from . '>'), 250);
        $expect($cmd('RCPT TO:<' . $to . '>'), 250);
        $expect($cmd('DATA'), 354);

        $boundary = 'cns_' . bin2hex(random_bytes(8));
        $eol = "\r\n";
        $headers = [
            'Date: ' . gmdate('r'),
            'From: ' . smtp_address_header($cfg['smtp_from_name'] ?: $from, $from),
            'To: <' . $to . '>',
            'Subject: ' . smtp_mime_header($subject),
        ];
        $msg = implode($eol, $headers) . $eol
            . 'MIME-Version: 1.0' . $eol
            . 'Content-Type: multipart/alternative; boundary="' . $boundary . '"' . $eol . $eol
            . '--' . $boundary . $eol
            . 'Content-Type: text/plain; charset=UTF-8' . $eol
            . 'Content-Transfer-Encoding: base64' . $eol . $eol
            . chunk_split(base64_encode($text !== '' ? $text : strip_tags($html))) . $eol
            . '--' . $boundary . $eol
            . 'Content-Type: text/html; charset=UTF-8' . $eol
            . 'Content-Transfer-Encoding: base64' . $eol . $eol
            . chunk_split(base64_encode($html)) . $eol
            . '--' . $boundary . '--' . $eol;

        // 透传行以 . 开头的内容
        $msg = str_replace($eol . '.', $eol . '..', $msg);
        $expect($cmd($msg . $eol . '.'), 250);
        $cmd('QUIT');
    } finally {
        fclose($sock);
    }

    return true;
}

/** 读取 SMTP 多行应答，返回最后一行（含状态码） */
function smtp_read($sock): string
{
    $lines = [];
    while (($line = fgets($sock, 1024)) !== false) {
        $line = rtrim($line, "\r\n");
        $lines[] = $line;
        if (strlen($line) < 4 || $line[3] !== '-') {
            break;
        }
    }
    return $lines ? implode(' ', $lines) : '';
}

/** STARTTLS 后需要重新读取服务器主动推送的应答缓冲 */
function smtp_reset($sock): void
{
    stream_set_timeout($sock, 1);
    smtp_read($sock);
    stream_set_timeout($sock, 12);
}

function smtp_address_header(string $name, string $email): string
{
    return ($name !== '' && $name !== $email ? smtp_mime_header($name) . ' ' : '') . '<' . $email . '>';
}

/** RFC 2047 编码（含非 ASCII 时必须） */
function smtp_mime_header(string $value): string
{
    if (preg_match('/^[\x20-\x7E]+$/', $value)) {
        return str_replace(["\r", "\n"], ' ', $value);
    }
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

/**
 * 统一出口：渲染模板 → 发送 → 记日志。失败不抛异常，返回 [bool, 错误信息]。
 */
function cns_mail(string $to, string $subject, string $html, string $text = ''): array
{
    $error = '';
    $ok = false;
    try {
        if (cns_setting('mail_enabled') !== '1') {
            $error = '邮件服务未启用';
        } else {
            smtp_send($to, $subject, $html, $text);
            $ok = true;
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
    try {
        cns_exec(
            'INSERT INTO ' . cns_table('mail_logs') . ' (recipient, subject, status, error, created_at) VALUES (?,?,?,?,?)',
            [$to, mb_substr($subject, 0, 190), $ok ? 'sent' : 'failed', mb_substr($error, 0, 490), cns_now()]
        );
    } catch (Throwable $e) {
        // 日志表不可用不影响主流程
    }
    return [$ok, $error];
}

/** 模板外壳：统一的 Cloudflare 风格邮件正文 */
function cns_mail_shell(string $title, string $bodyHtml, string $intro = ''): string
{
    $site = htmlspecialchars(cns_setting('site_name'), ENT_QUOTES);
    $home = cns_base_url() . cns_app_url('dashboard.php');
    $introHtml = $intro !== '' ? '<p style="margin:0 0 18px;color:#4d5562;line-height:1.7">' . $intro . '</p>' : '';
    return '<div style="background:#f2f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,PingFang SC,sans-serif">'
        . '<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e1e4ea;border-radius:12px;padding:28px">'
        . '<div style="font-size:15px;font-weight:800;color:#f6821f;margin-bottom:20px">' . $site . '</div>'
        . '<h1 style="font-size:20px;margin:0 0 12px;color:#1b1d20">' . htmlspecialchars($title, ENT_QUOTES) . '</h1>'
        . $introHtml
        . $bodyHtml
        . '<div style="margin-top:26px;padding-top:16px;border-top:1px solid #eef0f3;font-size:12px;color:#8a919c">'
        . '<a href="' . $home . '" style="color:#2563eb;text-decoration:none">进入控制台</a> · 本邮件由系统自动发送，请勿直接回复'
        . '</div></div></div>';
}

/**
 * 业务邮件模板。$vars 按模板取用。
 * 返回 [subject, html, text]
 */
function cns_mail_render(string $key, array $vars): array
{
    $site = cns_setting('site_name');
    $esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES);
    switch ($key) {
        case 'email_code':
            $subject = $vars['purpose'] . '验证码 - ' . $site;
            $code = $esc($vars['code']);
            $html = cns_mail_shell(
                $vars['purpose'],
                '<div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#1b1d20;background:#f6f7f9;border:1px solid #e1e4ea;border-radius:10px;padding:18px;text-align:center;margin-bottom:16px">'
                . $code . '</div>'
                . '<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7">验证码 10 分钟内有效，请勿转发给他人。若并非本人操作，请忽略本邮件。</p>',
                '您正在' . $esc($vars['scene_text']) . '，请使用以下验证码：'
            );
            return [$subject, $html, $vars['purpose'] . '验证码：' . $vars['code'] . '（10 分钟内有效）'];

        case 'expire_reminder':
            $subject = '域名 ' . $vars['full_name'] . ' 将在 ' . $vars['days_left'] . ' 天后到期';
            $html = cns_mail_shell(
                '域名到期提醒',
                '<table style="width:100%;border-collapse:collapse;font-size:14px">'
                . '<tr><td style="padding:8px 0;color:#6b7280;width:88px">域名</td><td style="padding:8px 0;font-weight:600">' . $esc($vars['full_name']) . '</td></tr>'
                . '<tr><td style="padding:8px 0;color:#6b7280">到期时间</td><td style="padding:8px 0">' . $esc($vars['expires_at']) . '</td></tr>'
                . '<tr><td style="padding:8px 0;color:#6b7280">续期价格</td><td style="padding:8px 0">' . $esc($vars['price']) . ' 积分/年</td></tr>'
                . '</table>'
                . '<p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.7">到期后将先进入宽限期并暂停解析，宽限期结束后解析记录会被自动删除。可在控制台「我的域名」随时续期。</p>',
                '您的域名 ' . $esc($vars['full_name']) . ' 将在 ' . $esc($vars['days_left']) . ' 天后到期。'
            );
            return [$subject, $html, '域名 ' . $vars['full_name'] . ' 将于 ' . $vars['expires_at'] . ' 到期，请提前续期。'];

        case 'expire_paused':
            $subject = '域名 ' . $vars['full_name'] . ' 已到期，解析已暂停';
            $html = cns_mail_shell(
                '解析已暂停',
                '<p style="margin:0 0 12px;color:#4d5562;line-height:1.7">域名 <b>' . $esc($vars['full_name']) . '</b> 已于 ' . $esc($vars['expired_at'])
                . ' 到期，解析记录已暂停。宽限期 <b>' . $esc($vars['grace']) . ' 天</b>（至 ' . $esc($vars['deadline']) . '）内完成续期，解析会自动恢复。</p>'
                . '<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7">超过宽限期仍未续期，该域名将被回收并删除全部解析记录，且无法恢复。</p>',
                ''
            );
            return [$subject, $html, '域名 ' . $vars['full_name'] . ' 已到期，解析暂停，请在 ' . $vars['deadline'] . ' 前续期。'];

        case 'expire_deleted':
            $subject = '域名 ' . $vars['full_name'] . ' 已到期并被回收';
            $html = cns_mail_shell(
                '域名回收通知',
                '<p style="margin:0 0 12px;color:#4d5562;line-height:1.7">域名 <b>' . $esc($vars['full_name']) . '</b> 已于 ' . $esc($vars['expired_at'])
                . ' 到期，且在 ' . $esc($vars['grace']) . ' 天宽限期内未完成续期，系统已删除其全部解析记录并回收该域名。</p>'
                . '<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7">如仍需使用，可到控制台重新购买（前缀可能已被他人注册）。</p>',
                ''
            );
            return [$subject, $html, '域名 ' . $vars['full_name'] . ' 已到期并被回收。'];

        case 'recharge_success':
            $subject = '充值成功：' . $vars['credits'] . ' 积分已到账';
            $html = cns_mail_shell(
                '充值到账',
                '<table style="width:100%;border-collapse:collapse;font-size:14px">'
                . '<tr><td style="padding:8px 0;color:#6b7280;width:88px">金额</td><td style="padding:8px 0;font-weight:600">' . $esc($vars['money']) . ' 元</td></tr>'
                . '<tr><td style="padding:8px 0;color:#6b7280">到账积分</td><td style="padding:8px 0">' . $esc($vars['credits']) . '</td></tr>'
                . '<tr><td style="padding:8px 0;color:#6b7280">订单号</td><td style="padding:8px 0;font-family:monospace">' . $esc($vars['out_trade_no']) . '</td></tr>'
                . '</table>',
                ''
            );
            return [$subject, $html, '充值 ' . $vars['money'] . ' 元，到账 ' . $vars['credits'] . ' 积分。'];

        case 'password_reset':
            $subject = '重置密码验证码 - ' . $site;
            $html = cns_mail_shell(
                '重置密码',
                '<div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#1b1d20;background:#f6f7f9;border:1px solid #e1e4ea;border-radius:10px;padding:18px;text-align:center;margin-bottom:16px">'
                . $esc($vars['code']) . '</div>'
                . '<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7">验证码 10 分钟内有效。若非本人操作，请立即检查账号安全。</p>',
                '您正在重置密码，验证码：' . $vars['code']
            );
            return [$subject, $html, '重置密码验证码：' . $vars['code']];

        default:
            throw new RuntimeException('未知邮件模板 ' . $key);
    }
}

/** 发送模板邮件给某个收件人 */
function cns_mail_to(string $to, string $key, array $vars): array
{
    [$subject, $html, $text] = cns_mail_render($key, $vars);
    return cns_mail($to, $subject, $html, $text);
}
