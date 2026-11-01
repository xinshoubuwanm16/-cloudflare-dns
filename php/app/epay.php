<?php
/**
 * 彩虹易支付协议（对应 Node 版 src/epay.js）
 * 提交: POST {gateway}/submit.php
 * 签名: MD5( 非空参数按 key ASCII 升序拼 k=v&... 末尾拼商户 KEY )
 */

declare(strict_types=1);

function epay_build_sign(array $params, string $key): string
{
    unset($params['sign'], $params['sign_type']);
    $params = array_filter($params, fn($v) => $v !== '' && $v !== null);
    ksort($params, SORT_STRING);
    $pairs = [];
    foreach ($params as $k => $v) {
        $pairs[] = $k . '=' . $v;
    }
    return md5(implode('&', $pairs) . $key);
}

function epay_verify(array $query, string $key): bool
{
    if (empty($query['sign'])) {
        return false;
    }
    $expect = epay_build_sign($query, $key);
    return hash_equals($expect, (string)$query['sign']);
}

function epay_is_configured(): bool
{
    $s = cns_settings(['epay_gateway', 'epay_pid', 'epay_key']);
    return $s['epay_gateway'] !== '' && $s['epay_pid'] !== '' && $s['epay_key'] !== '';
}

function epay_submit_params(array $cfg, array $order): array
{
    $params = [
        'pid'          => (string)$cfg['epay_pid'],
        'type'         => $order['type'],
        'out_trade_no' => $order['out_trade_no'],
        'notify_url'   => $order['notify_url'],
        'return_url'   => $order['return_url'],
        'name'         => $order['name'],
        'money'        => $order['money'],
    ];
    $params['sign'] = epay_build_sign($params, $cfg['epay_key']);
    $params['sign_type'] = 'MD5';
    return $params;
}
