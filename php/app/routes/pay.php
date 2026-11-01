<?php
/**
 * 充值与支付接口（彩虹易支付 + 沙盒收银台）
 */

declare(strict_types=1);

function api_pay_config(?array $user, array $params, array $body, array $query): void
{
    cns_json([
        'credit_rate' => (int)cns_setting('credit_rate') ?: 10,
        'min_recharge' => (float)cns_setting('min_recharge') ?: 1,
        'epay_ready' => epay_is_configured(),
    ]);
}

function api_pay_create(?array $user, array $params, array $body, array $query): void
{
    $rate = (int)cns_setting('credit_rate') ?: 10;
    $min = (float)cns_setting('min_recharge') ?: 1;

    $amount = round((float)($body['money'] ?? 0), 2);
    if ($amount < $min) {
        cns_error('最低充值 ' . $min . ' 元');
    }
    if ($amount > 5000) {
        cns_error('单笔充值上限 5000 元');
    }
    $payType = (string)($body['pay_type'] ?? '');
    if (!in_array($payType, ['alipay', 'wxpay', 'qqpay'], true)) {
        cns_error('请选择支付方式');
    }

    $credits = (int)floor($amount * $rate);
    $outTradeNo = cns_gen_order_no();
    cns_exec(
        'INSERT INTO ' . cns_table('orders') . ' (out_trade_no, user_id, money, credits, pay_type, created_at) VALUES (?,?,?,?,?,?)',
        [$outTradeNo, $user['id'], $amount, $credits, $payType, cns_now()]
    );

    if (epay_is_configured()) {
        $cfg = cns_settings(['epay_gateway', 'epay_pid', 'epay_key', 'site_name']);
        $params2 = epay_submit_params($cfg, [
            'out_trade_no' => $outTradeNo,
            'name' => ($cfg['site_name'] ?: 'CloudNS') . '-' . $credits . '积分',
            'money' => number_format($amount, 2, '.', ''),
            'notify_url' => cns_base_url() . cns_app_url('api.php') . '/pay/notify',
            'return_url' => cns_base_url() . cns_app_url('dashboard.php') . '#/recharge?paid=' . $outTradeNo,
            'type' => $payType,
        ]);
        $inputs = '';
        foreach ($params2 as $k => $v) {
            $inputs .= '<input type="hidden" name="' . htmlspecialchars((string)$k) . '" value="' . htmlspecialchars((string)$v) . '"/>';
        }
        $gateway = rtrim((string)$cfg['epay_gateway'], '/');
        cns_json([
            'ok' => true, 'mode' => 'epay', 'out_trade_no' => $outTradeNo,
            'submit_html' => '<form id="epayform" method="post" action="' . htmlspecialchars($gateway) . '/submit.php">' . $inputs . '</form>',
        ]);
    }

    cns_json(['ok' => true, 'mode' => 'sandbox', 'out_trade_no' => $outTradeNo, 'cash_url' => cns_app_url('api.php') . '?api=pay/cashier/' . $outTradeNo]);
}

function api_pay_order(?array $user, array $params, array $body, array $query): void
{
    $o = cns_one('SELECT * FROM ' . cns_table('orders') . ' WHERE out_trade_no = ? AND user_id = ?', [$params['no'], $user['id']]);
    if (!$o) {
        cns_error('订单不存在', 404);
    }
    cns_json(['order' => [
        'out_trade_no' => $o['out_trade_no'],
        'money' => (float)$o['money'],
        'credits' => (int)$o['credits'],
        'status' => $o['status'],
        'pay_type' => $o['pay_type'],
    ]]);
}

function api_pay_orders(?array $user, array $params, array $body, array $query): void
{
    $rows = cns_all(
        'SELECT out_trade_no, money, credits, pay_type, status, created_at, paid_at FROM ' . cns_table('orders') . ' WHERE user_id = ? ORDER BY id DESC LIMIT 50',
        [$user['id']]
    );
    foreach ($rows as &$r) {
        $r['money'] = (float)$r['money'];
        $r['credits'] = (int)$r['credits'];
    }
    unset($r);
    cns_json(['orders' => $rows]);
}

// ---------- 易支付异步通知（纯文本应答） ----------
function api_pay_notify(?array $user, array $params, array $body, array $query): void
{
    header('Content-Type: text/plain; charset=utf-8');
    $key = cns_setting('epay_key');
    if ($key === '' || !epay_verify($query, $key)) {
        http_response_code(400);
        echo 'sign error';
        return;
    }
    $outTradeNo = (string)($query['out_trade_no'] ?? '');
    $tradeNo = (string)($query['trade_no'] ?? '');
    $money = (float)($query['money'] ?? 0);
    $status = (string)($query['trade_status'] ?? '');

    if ($status !== 'TRADE_SUCCESS') {
        echo 'success';
        return;
    }
    $o = cns_one('SELECT * FROM ' . cns_table('orders') . ' WHERE out_trade_no = ?', [$outTradeNo]);
    if (!$o) {
        http_response_code(400);
        echo 'order not found';
        return;
    }
    if ($o['status'] === 'paid') {
        echo 'success';
        return;
    }
    if (abs($money - (float)$o['money']) > 0.001) {
        http_response_code(400);
        echo 'money mismatch';
        return;
    }
    cns_transaction(function () use ($o, $tradeNo) {
        cns_db()->prepare('UPDATE ' . cns_table('orders') . " SET status='paid', trade_no=?, paid_at=? WHERE id=?")
            ->execute([$tradeNo, cns_now(), $o['id']]);
        cns_credit_tx((int)$o['user_id'], (int)$o['credits'], '在线充值 ' . $o['money'] . ' 元 (订单 ' . $o['out_trade_no'] . ')');
    });
    cns_mail_recharge($o);
    echo 'success';
}

// ---------- 沙盒收银台（HTML） ----------
function api_pay_cashier(?array $user, array $params, array $body, array $query): void
{
    header('Content-Type: text/html; charset=utf-8');
    $o = cns_one('SELECT * FROM ' . cns_table('orders') . ' WHERE out_trade_no = ?', [$params['no']]);
    if (!$o) {
        http_response_code(404);
        echo 'order not found';
        return;
    }
    if ($o['status'] === 'paid') {
        header('Location: ' . cns_app_url('dashboard.php') . '#/recharge?paid=' . $o['out_trade_no']);
        return;
    }
    $e = fn($v) => htmlspecialchars((string)$v);
    echo '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>沙盒收银台</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;background:#f2f4f7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:40px;width:340px;text-align:center}
.amount{font-size:40px;font-weight:700;color:#1b1d20;margin:16px 0}
.muted{color:#6b7280;font-size:14px;line-height:1.7}
.btn{display:inline-block;width:100%;padding:12px;border-radius:8px;background:#f6821f;color:#fff;font-size:16px;font-weight:600;text-decoration:none}
.btn:hover{background:#e2740f}
.tag{display:inline-block;background:#fff7ed;color:#c2410c;font-size:12px;padding:2px 10px;border-radius:99px}
</style></head><body><div class="card">
<div class="tag">沙盒演示支付</div>
<div class="amount">&yen;' . $e(number_format((float)$o['money'], 2, '.', '')) . '</div>
<div class="muted">订单号 ' . $e($o['out_trade_no']) . '<br>充值 ' . $e($o['credits']) . ' 积分 &middot; 支付方式 ' . $e($o['pay_type']) . '</div>
<p style="margin-top:20px"><a class="btn" href="' . cns_app_url('api.php') . '?api=pay/sandbox-pay/' . $e($o['out_trade_no']) . '">模拟支付成功</a></p>
<div class="muted" style="margin-top:12px">接入真实易支付后此页自动关闭</div>
</div></body></html>';
}

function api_pay_sandbox(?array $user, array $params, array $body, array $query): void
{
    $o = cns_one('SELECT * FROM ' . cns_table('orders') . ' WHERE out_trade_no = ?', [$params['no']]);
    if (!$o) {
        http_response_code(404);
        echo 'order not found';
        return;
    }
    if ($o['status'] !== 'paid') {
        cns_transaction(function () use ($o) {
            cns_db()->prepare('UPDATE ' . cns_table('orders') . " SET status='paid', trade_no=?, paid_at=? WHERE id=?")
                ->execute(['SANDBOX-' . time(), cns_now(), $o['id']]);
            cns_credit_tx((int)$o['user_id'], (int)$o['credits'], '沙盒充值 ' . $o['money'] . ' 元 (订单 ' . $o['out_trade_no'] . ')');
        });
        cns_mail_recharge($o);
    }
    header('Location: ' . cns_app_url('dashboard.php') . '#/recharge?paid=' . $o['out_trade_no']);
}

/** 充值到账后通知用户（失败不影响主流程） */
function cns_mail_recharge(array $order): void
{
    $u = cns_one('SELECT email FROM ' . cns_table('users') . ' WHERE id = ?', [$order['user_id']]);
    if (!$u || trim((string)$u['email']) === '') {
        return;
    }
    cns_mail_to((string)$u['email'], 'recharge_success', [
        'money' => number_format((float)$order['money'], 2, '.', ''),
        'credits' => (int)$order['credits'],
        'out_trade_no' => $order['out_trade_no'],
    ]);
}
