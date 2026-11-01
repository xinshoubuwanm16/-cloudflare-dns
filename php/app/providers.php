<?php
/**
 * DNS 服务商适配器（对应 Node 版 src/providers/*）
 *   cloudflare  Cloudflare API v4
 *   dnspod      腾讯云 DNSPod，TC3-HMAC-SHA256 签名
 *   aliyun      阿里云云解析，RPC HMAC-SHA1 签名
 *   mock        内置演示，记录存本地 JSON，不出网
 */

declare(strict_types=1);

// ---------- 公共 HTTP ----------

function dns_http_json(string $method, string $url, array $headers = [], ?array $body = null): array
{
    $ch = curl_init($url);
    $payload = $body === null ? null : json_encode($body, JSON_UNESCAPED_UNICODE);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) {
        throw new RuntimeException('网络请求失败: ' . $err);
    }
    $data = json_decode((string)$resp, true);
    return [$status, is_array($data) ? $data : []];
}

// 原始 GET（阿里云 RPC 用）
function dns_http_get(string $url): array
{
    return dns_http_json('GET', $url, ['Accept: application/json'], null);
}

function dns_to_sub_label(string $fqdn, string $zoneName): string
{
    if ($fqdn === $zoneName) {
        return '@';
    }
    $suffix = '.' . $zoneName;
    if (str_ends_with($fqdn, $suffix)) {
        return substr($fqdn, 0, -strlen($suffix));
    }
    return $fqdn;
}

// ---------- Cloudflare ----------

function cf_api(array $cfg, string $method, string $path, ?array $body = null): array
{
    $token = $cfg['token'] ?? '';
    if ($token === '') {
        throw new RuntimeException('Cloudflare: 未配置 API Token');
    }
    [$status, $data] = dns_http_json(
        $method,
        'https://api.cloudflare.com/client/v4' . $path,
        ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        $body
    );
    if ($status !== 200 || ($data['success'] ?? false) !== true) {
        $msg = $data['errors'][0]['message'] ?? $data['errors'][0]['code'] ?? ('HTTP ' . $status);
        throw new RuntimeException('Cloudflare: ' . $msg);
    }
    return $data['result'] ?? [];
}

function cf_zone_id(array $cfg, string $zoneName): string
{
    $list = cf_api($cfg, 'GET', '/zones?name=' . urlencode($zoneName) . '&status=active');
    if (empty($list)) {
        throw new RuntimeException('Cloudflare 账户中未找到区域 ' . $zoneName . ' (或未激活)');
    }
    return (string)$list[0]['id'];
}

function cf_record_body(array $rec): array
{
    $body = [
        'type'    => $rec['type'],
        'name'    => $rec['name'],
        'content' => $rec['content'],
        'ttl'     => (int)($rec['ttl'] ?? 1),
        'proxied' => !empty($rec['proxied']),
    ];
    if (!empty($rec['priority']) && $rec['type'] === 'MX') {
        $body['priority'] = (int)$rec['priority'];
    }
    return $body;
}

function cf_test(array $cfg): array
{
    $r = cf_api($cfg, 'GET', '/user/tokens/verify');
    return ['ok' => true, 'message' => 'Token 有效 (' . ($r['status'] ?? 'valid') . ')'];
}

function cf_create(array $cfg, string $zoneName, array $rec): array
{
    $zid = cf_zone_id($cfg, $zoneName);
    $r = cf_api($cfg, 'POST', '/zones/' . $zid . '/dns_records', cf_record_body($rec));
    return ['id' => (string)($r['id'] ?? '')];
}

function cf_update(array $cfg, string $zoneName, string $externalId, array $rec): array
{
    $zid = cf_zone_id($cfg, $zoneName);
    $r = cf_api($cfg, 'PUT', '/zones/' . $zid . '/dns_records/' . $externalId, cf_record_body($rec));
    return ['id' => (string)($r['id'] ?? $externalId)];
}

function cf_delete(array $cfg, string $zoneName, string $externalId): void
{
    $zid = cf_zone_id($cfg, $zoneName);
    cf_api($cfg, 'DELETE', '/zones/' . $zid . '/dns_records/' . $externalId);
}

// ---------- 腾讯云 DNSPod ----------

function tc3_request(array $cfg, string $action, array $payload): array
{
    $secretId  = $cfg['secretId'] ?? '';
    $secretKey = $cfg['secretKey'] ?? '';
    if ($secretId === '' || $secretKey === '') {
        throw new RuntimeException('DNSPod: 未配置 SecretId/SecretKey');
    }
    $endpoint = 'dnspod.tencentcloudapi.com';
    $service  = 'dnspod';
    $version  = '2021-03-23';
    $ts    = time();
    $date  = gmdate('Y-m-d', $ts);
    $body  = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $hashedPayload = hash('sha256', $body);

    $canonicalHeaders = "content-type:application/json; charset=utf-8\nhost:{$endpoint}\nx-tc-action:" . strtolower($action) . "\n";
    $signedHeaders = 'content-type;host;x-tc-action';
    $canonicalRequest = implode("\n", ['POST', '/', '', $canonicalHeaders, $signedHeaders, $hashedPayload]);

    $algorithm = 'TC3-HMAC-SHA256';
    $credentialScope = $date . '/' . $service . '/tc3_request';
    $stringToSign = implode("\n", [$algorithm, $ts, $credentialScope, hash('sha256', $canonicalRequest)]);

    $secretDate    = hash_hmac('sha256', $date, 'TC3' . $secretKey, false);
    $secretService = hash_hmac('sha256', $service, $secretDate, false);
    $secretSigning = hash_hmac('sha256', 'tc3_request', $secretService, false);
    $signature     = hash_hmac('sha256', $stringToSign, $secretSigning, false);

    $authorization = $algorithm . ' Credential=' . $secretId . '/' . $credentialScope
        . ', SignedHeaders=' . $signedHeaders . ', Signature=' . $signature;

    [$status, $data] = dns_http_json('POST', 'https://' . $endpoint, [
        'Authorization: ' . $authorization,
        'Content-Type: application/json; charset=utf-8',
        'X-TC-Action: ' . $action,
        'X-TC-Timestamp: ' . $ts,
        'X-TC-Version: ' . $version,
    ], $payload);

    if (isset($data['Response']['Error'])) {
        $e = $data['Response']['Error'];
        throw new RuntimeException('DNSPod: ' . ($e['Code'] ?? '') . ' ' . ($e['Message'] ?? ''));
    }
    if ($status !== 200 || !isset($data['Response'])) {
        throw new RuntimeException('DNSPod: HTTP ' . $status);
    }
    return $data['Response'];
}

function dnspod_payload(string $zoneName, array $rec): array
{
    $payload = [
        'Domain'     => $zoneName,
        'SubDomain'  => dns_to_sub_label($rec['name'], $zoneName),
        'RecordType' => $rec['type'],
        'RecordLine' => '默认',
        'Value'      => $rec['content'],
        'TTL'        => !empty($rec['ttl']) && (int)$rec['ttl'] !== 1 ? (int)$rec['ttl'] : 600,
    ];
    if ($rec['type'] === 'MX') {
        $payload['MX'] = (int)($rec['priority'] ?? 0) ?: 10;
    }
    return $payload;
}

function dnspod_test(array $cfg): array
{
    $r = tc3_request($cfg, 'DescribeDomainList', ['Offset' => 0, 'Limit' => 1]);
    $total = $r['DomainListInfo']['TotalCount'] ?? '?';
    return ['ok' => true, 'message' => '连接成功，共有 ' . $total . ' 个域名'];
}

function dnspod_create(array $cfg, string $zoneName, array $rec): array
{
    $r = tc3_request($cfg, 'CreateRecord', dnspod_payload($zoneName, $rec));
    return ['id' => (string)($r['RecordId'] ?? '')];
}

function dnspod_update(array $cfg, string $zoneName, string $externalId, array $rec): array
{
    $payload = dnspod_payload($zoneName, $rec);
    $payload['RecordId'] = (int)$externalId;
    $r = tc3_request($cfg, 'ModifyRecord', $payload);
    return ['id' => (string)($r['RecordId'] ?? $externalId)];
}

function dnspod_delete(array $cfg, string $zoneName, string $externalId): void
{
    tc3_request($cfg, 'DeleteRecord', ['Domain' => $zoneName, 'RecordId' => (int)$externalId]);
}

// ---------- 阿里云云解析 ----------

function aliyun_percent_encode(string $str): string
{
    return str_replace(['+', '*', '%7E'], ['%20', '%2B', '~'], urlencode($str));
}

function aliyun_rpc(array $cfg, array $params): array
{
    $accessKeyId = $cfg['accessKeyId'] ?? '';
    $accessKeySecret = $cfg['accessKeySecret'] ?? '';
    if ($accessKeyId === '' || $accessKeySecret === '') {
        throw new RuntimeException('阿里云: 未配置 AccessKeyId/AccessKeySecret');
    }
    $all = array_merge([
        'Format'          => 'JSON',
        'Version'         => '2015-01-09',
        'AccessKeyId'     => $accessKeyId,
        'SignatureMethod' => 'HMAC-SHA1',
        'Timestamp'       => gmdate('Y-m-d\TH:i:s\Z'),
        'SignatureVersion' => '1.0',
        'SignatureNonce'  => bin2hex(random_bytes(16)),
    ], $params);

    ksort($all, SORT_STRING);
    $pairs = [];
    foreach ($all as $k => $v) {
        $pairs[] = aliyun_percent_encode((string)$k) . '=' . aliyun_percent_encode((string)$v);
    }
    $canonicalQuery = implode('&', $pairs);
    $stringToSign = 'GET&%2F&' . aliyun_percent_encode($canonicalQuery);
    $signature = base64_encode(hash_hmac('sha1', $stringToSign, $accessKeySecret . '&', true));

    [$status, $data] = dns_http_get('https://alidns.aliyuncs.com/?' . $canonicalQuery . '&Signature=' . aliyun_percent_encode($signature));

    if (isset($data['Error'])) {
        throw new RuntimeException('阿里云: ' . ($data['Error']['Code'] ?? '') . ' ' . ($data['Error']['Message'] ?? ''));
    }
    if ($status !== 200 || (isset($data['Code']) && isset($data['Message']))) {
        throw new RuntimeException(trim('阿里云: ' . ($data['Code'] ?? ('HTTP ' . $status)) . ' ' . ($data['Message'] ?? '')));
    }
    return $data;
}

function aliyun_test(array $cfg): array
{
    $r = aliyun_rpc($cfg, ['Action' => 'DescribeDomains', 'PageSize' => 1, 'PageNumber' => 1]);
    return ['ok' => true, 'message' => '连接成功，共有 ' . ($r['TotalCount'] ?? '?') . ' 个域名'];
}

function aliyun_create(array $cfg, string $zoneName, array $rec): array
{
    $params = [
        'Action'     => 'AddDomainRecord',
        'DomainName' => $zoneName,
        'RR'         => dns_to_sub_label($rec['name'], $zoneName),
        'Type'       => $rec['type'],
        'Value'      => $rec['content'],
        'TTL'        => !empty($rec['ttl']) && (int)$rec['ttl'] !== 1 ? (int)$rec['ttl'] : 600,
    ];
    if (in_array($rec['type'], ['MX', 'SRV'], true)) {
        $params['Priority'] = (int)($rec['priority'] ?? 0) ?: 10;
    }
    $r = aliyun_rpc($cfg, $params);
    return ['id' => (string)($r['RecordId'] ?? '')];
}

function aliyun_update(array $cfg, string $zoneName, string $externalId, array $rec): array
{
    $params = [
        'Action'   => 'UpdateDomainRecord',
        'RecordId' => $externalId,
        'RR'       => dns_to_sub_label($rec['name'], $zoneName),
        'Type'     => $rec['type'],
        'Value'    => $rec['content'],
        'TTL'      => !empty($rec['ttl']) && (int)$rec['ttl'] !== 1 ? (int)$rec['ttl'] : 600,
    ];
    if (in_array($rec['type'], ['MX', 'SRV'], true)) {
        $params['Priority'] = (int)($rec['priority'] ?? 0) ?: 10;
    }
    $r = aliyun_rpc($cfg, $params);
    return ['id' => (string)($r['RecordId'] ?? $externalId)];
}

function aliyun_delete(array $cfg, string $zoneName, string $externalId): void
{
    aliyun_rpc($cfg, ['Action' => 'DeleteDomainRecord', 'RecordId' => $externalId]);
}

// ---------- 内置演示 (mock) ----------

function mock_file(): string
{
    $dir = rtrim(cns_config()['data_dir'], '/\\');
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/mock-records.json';
}

function mock_load(): array
{
    $f = mock_file();
    if (!is_file($f)) {
        return [];
    }
    $data = json_decode((string)file_get_contents($f), true);
    return is_array($data) ? $data : [];
}

function mock_save(array $data): void
{
    $f = mock_file();
    $ok = @file_put_contents($f, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    if ($ok === false) {
        throw new RuntimeException('演示数据写入失败，请检查 data 目录权限');
    }
}

function mock_test(array $cfg): array
{
    return ['ok' => true, 'message' => '演示模式：记录仅保存在服务器本地'];
}

function mock_create(array $cfg, string $zoneName, array $rec): array
{
    $data = mock_load();
    $id = 'mock_' . dechex(time()) . bin2hex(random_bytes(3));
    $data[$id] = [
        'zone'      => $zoneName,
        'record'    => ['type' => $rec['type'], 'name' => $rec['name'], 'content' => $rec['content'], 'ttl' => $rec['ttl']],
        'createdAt' => time() * 1000,
    ];
    mock_save($data);
    return ['id' => $id];
}

function mock_update(array $cfg, string $zoneName, string $externalId, array $rec): array
{
    $data = mock_load();
    if (!isset($data[$externalId])) {
        throw new RuntimeException('演示记录不存在');
    }
    $data[$externalId]['record'] = ['type' => $rec['type'], 'name' => $rec['name'], 'content' => $rec['content'], 'ttl' => $rec['ttl']];
    mock_save($data);
    return ['id' => $externalId];
}

function mock_delete(array $cfg, string $zoneName, string $externalId): void
{
    $data = mock_load();
    unset($data[$externalId]);
    mock_save($data);
}

// ---------- 注册表 ----------

function dns_providers(): array
{
    return [
        'cloudflare' => [
            'label'       => 'Cloudflare',
            'configFields' => [
                ['key' => 'token', 'label' => 'API Token', 'placeholder' => '需要 Zone → DNS → Edit 权限', 'secret' => true],
            ],
            'test'   => 'cf_test',
            'create' => 'cf_create',
            'update' => 'cf_update',
            'delete' => 'cf_delete',
        ],
        'dnspod' => [
            'label'       => '腾讯云 DNSPod',
            'configFields' => [
                ['key' => 'secretId', 'label' => 'SecretId', 'placeholder' => '腾讯云 API 密钥 ID', 'secret' => false],
                ['key' => 'secretKey', 'label' => 'SecretKey', 'placeholder' => '腾讯云 API 密钥 Key', 'secret' => true],
            ],
            'test'   => 'dnspod_test',
            'create' => 'dnspod_create',
            'update' => 'dnspod_update',
            'delete' => 'dnspod_delete',
        ],
        'aliyun' => [
            'label'       => '阿里云 DNS',
            'configFields' => [
                ['key' => 'accessKeyId', 'label' => 'AccessKeyId', 'placeholder' => '阿里云 AccessKey ID', 'secret' => false],
                ['key' => 'accessKeySecret', 'label' => 'AccessKeySecret', 'placeholder' => '阿里云 AccessKey Secret', 'secret' => true],
            ],
            'test'   => 'aliyun_test',
            'create' => 'aliyun_create',
            'update' => 'aliyun_update',
            'delete' => 'aliyun_delete',
        ],
        'mock' => [
            'label'       => '内置演示(本地)',
            'configFields' => [],
            'test'   => 'mock_test',
            'create' => 'mock_create',
            'update' => 'mock_update',
            'delete' => 'mock_delete',
        ],
    ];
}

function dns_provider(string $type): array
{
    $reg = dns_providers();
    if (!isset($reg[$type])) {
        throw new RuntimeException('未知的服务商类型: ' . $type);
    }
    return $reg[$type];
}
