<?php
/**
 * 校验与工具函数（对应 Node 版 src/helpers.js）
 */

declare(strict_types=1);

const CNS_RESERVED_PREFIX = [
    'www', 'mail', 'smtp', 'pop', 'imap', 'ns', 'ns1', 'ns2',
    'ftp', 'admin', 'api', 'webmail', 'mx', 'mx1', 'mx2',
];

const CNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'];

function cns_gen_order_no(): string
{
    return strtoupper(dechex((int)(microtime(true) * 1000))) . strtoupper(bin2hex(random_bytes(4)));
}

function cns_valid_prefix($prefix): bool
{
    if (!is_string($prefix)) {
        return false;
    }
    $prefix = strtolower(trim($prefix));
    if ($prefix === '' || strlen($prefix) > 62) {
        return false;
    }
    return (bool)preg_match(
        '/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/',
        $prefix
    );
}

function cns_is_reserved(string $prefix): bool
{
    $first = explode('.', strtolower(trim($prefix)))[0];
    return in_array($first, CNS_RESERVED_PREFIX, true);
}

function cns_valid_hostname($h): bool
{
    if (!is_string($h) || strlen($h) > 253 || !str_contains($h, '.')) {
        return false;
    }
    return (bool)preg_match(
        '/^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.?$/i',
        $h
    );
}

function cns_valid_ipv4(string $s): bool
{
    return (bool)preg_match(
        '/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/',
        $s
    );
}

function cns_valid_ipv6(string $s): bool
{
    return preg_match('/^[0-9a-fA-F:]+$/', $s) === 1 && str_contains($s, ':');
}

/**
 * 校验记录内容，返回错误信息或 null
 */
function cns_validate_record(string $type, string $name, string $content, int $ttl, int $priority): ?string
{
    if (!in_array($type, CNS_RECORD_TYPES, true)) {
        return '不支持的记录类型';
    }
    if ($ttl !== 1 && ($ttl < 60 || $ttl > 86400)) {
        return 'TTL 需为自动或 60-86400 之间的整数';
    }
    switch ($type) {
        case 'A':
            if (!cns_valid_ipv4($content)) {
                return 'A 记录内容需为 IPv4 地址';
            }
            break;
        case 'AAAA':
            if (!cns_valid_ipv6($content)) {
                return 'AAAA 记录内容需为 IPv6 地址';
            }
            break;
        case 'CNAME':
        case 'NS':
            if (!cns_valid_hostname($content)) {
                return '内容需为有效的域名';
            }
            break;
        case 'MX':
            if (!cns_valid_hostname($content)) {
                return 'MX 内容需为邮件服务器域名';
            }
            if ($priority < 0 || $priority > 65535) {
                return 'MX 优先级需为 0-65535';
            }
            break;
        case 'SRV':
            if (!preg_match('/^\d+\s+\d+\s+\d+\s+\S+$/', $content)) {
                return 'SRV 内容格式: 优先级 权重 端口 目标';
            }
            break;
        case 'TXT':
            if ($content === '' || strlen($content) > 500) {
                return 'TXT 内容长度需为 1-500';
            }
            break;
        case 'CAA':
            if (!preg_match('/^\d+\s+(issue|issuewild|iodef)\s+\S+$/i', $content)) {
                return 'CAA 内容格式: 0 issue "ca.example.com"';
            }
            break;
    }
    return null;
}

// 相对标签 -> 完整 FQDN
function cns_record_fqdn($label, string $subdomainFqdn): string
{
    $label = is_string($label) ? trim($label) : '';
    if ($label === '' || $label === '@') {
        return $subdomainFqdn;
    }
    return $label . '.' . $subdomainFqdn;
}

// 主域名格式（至少两级）
function cns_valid_zone_name($name): bool
{
    if (!is_string($name)) {
        return false;
    }
    return (bool)preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/', strtolower(trim($name)));
}

function cns_local_date(?\DateTimeInterface $d = null): string
{
    $d = $d ?? new DateTimeImmutable('now');
    return $d->format('Y-m-d');
}

function cns_now(): string
{
    return (new DateTimeImmutable('now'))->format('Y-m-d H:i:s');
}

// 相对当前入口生成同目录路径（支持子目录部署；命令行下退回站点根目录）
function cns_app_url(string $path): string
{
    $dir = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/\\');
    if (PHP_SAPI === 'cli' || ($dir === '' || $dir === '.' || $dir === '\\')) {
        $dir = '';
    }
    return $dir . '/' . ltrim($path, '/');
}
