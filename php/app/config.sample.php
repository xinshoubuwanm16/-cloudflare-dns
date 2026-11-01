<?php
/**
 * CloudNS PHP 版配置文件
 * 复制本文件为 config.php 后，按你的 MySQL 实际信息修改。
 */

return [
    // MySQL 连接（要求 MySQL 5.6+，推荐 5.7）
    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'database' => 'cloudns',
        'username' => 'root',
        'password' => '',
        'charset'  => 'utf8mb4',
    ],

    // 数据表前缀，多套程序共用一个库时可修改
    'table_prefix' => 'cns_',

    // 时区
    'timezone' => 'Asia/Shanghai',

    // 演示数据目录（mock 服务商的记录文件存放处，需有写入权限）
    'data_dir' => __DIR__ . '/../data',
];
