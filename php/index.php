<?php
/**
 * CloudNS 首页 · 介绍页
 */

declare(strict_types=1);

$siteName = 'CloudNS';
$subtitle = '二级域名分发平台';
try {
    if (is_file(__DIR__ . '/app/config.php')) {
        require_once __DIR__ . '/app/bootstrap.php';
        $s = cns_settings(['site_name', 'site_subtitle']);
        $siteName = $s['site_name'] !== '' ? $s['site_name'] : $siteName;
        $subtitle = $s['site_subtitle'] !== '' ? $s['site_subtitle'] : $subtitle;
    }
} catch (Throwable $e) {
    // 未安装时使用默认文案
}

$cloud = '<svg viewBox="0 0 64 40" fill="#F6821F" aria-hidden="true"><path d="M44.6 33.6c.5-1.8.3-3.5-.6-4.7-.8-1.1-2.2-1.8-3.9-1.8l-31.6-.4c-.2 0-.4-.1-.5-.3-.1-.2-.1-.4 0-.6.1-.3.4-.5.7-.5l31.9-.4c3.8-.2 7.9-3.2 9.3-7l1.8-4.8c.1-.2.1-.4.1-.6C50.5 5.3 43.9 0 36 0c-7.1 0-13.2 4.6-15.4 11-2.8-2.1-6.5-3.1-10.4-2.4C3.6 9.8-.5 15.5.05 22.1c.5 5.9 5.2 10.6 11 11.4h31.9c.3 0 .6-.2.7-.5l1-3.4z"/></svg>';
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="<?= htmlspecialchars($siteName) ?> · <?= htmlspecialchars($subtitle) ?>：积分购买二级域名，DNS 记录直连 Cloudflare / 腾讯云 / 阿里云。">
<title><?= htmlspecialchars($siteName) ?> · <?= htmlspecialchars($subtitle) ?></title>
<link rel="stylesheet" href="./assets/css/landing.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 40'><path fill='%23F6821F' d='M44.6 33.6c.5-1.8.3-3.5-.6-4.7-.8-1.1-2.2-1.8-3.9-1.8l-31.6-.4c-.2 0-.4-.1-.5-.3-.1-.2-.1-.4 0-.6.1-.3.4-.5.7-.5l31.9-.4c3.8-.2 7.9-3.2 9.3-7l1.8-4.8c.1-.2.1-.4.1-.6C50.5 5.3 43.9 0 36 0c-7.1 0-13.2 4.6-15.4 11-2.8-2.1-6.5-3.1-10.4-2.4C3.6 9.8-.5 15.5.05 22.1c.5 5.9 5.2 10.6 11 11.4h31.9c.3 0 .6-.2.7-.5l1-3.4z'/></svg>">
</head>
<body>

<header class="lnav">
  <div class="wrap lnav-inner">
    <a class="lnav-logo" href="./"><?= $cloud ?><span><?= htmlspecialchars($siteName) ?></span></a>
    <nav class="lnav-links">
      <a href="#features">功能</a>
      <a href="#how">流程</a>
      <a href="#pricing">价格</a>
      <a href="#faq">常见问题</a>
    </nav>
    <div class="lnav-right">
      <a class="lbtn ghost" href="./dashboard.php#login">登录</a>
      <a class="lbtn orange" href="./dashboard.php#register">免费注册</a>
    </div>
  </div>
</header>

<section class="hero">
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <div class="hero-kicker">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z" stroke-linejoin="round"/></svg>
        DNS · 二级域名 · 积分制
      </div>
      <h1>给自己的应用<br>一个体面的域名</h1>
      <p class="lead">在 <?= htmlspecialchars($siteName) ?> 用积分注册主域名下的二级域名，A、CNAME、TXT 等记录实时同步到真实 DNS 服务商。签到、充值都能攒积分，最低 10 积分就能拿到一个年域名。</p>
      <div class="hero-cta">
        <a class="lbtn orange lg" href="./dashboard.php#register">注册领 10 积分</a>
        <a class="lbtn navy-outline lg" href="./dashboard.php#login">已有账号，登录</a>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><div class="n">8 种</div><div class="l">支持的记录类型</div></div>
        <div class="hero-stat"><div class="n">3 家</div><div class="l">可对接的 DNS 服务商</div></div>
        <div class="hero-stat"><div class="n">分钟级</div><div class="l">解析全球生效</div></div>
      </div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <svg viewBox="0 0 400 320" fill="none">
        <circle cx="200" cy="160" r="95" stroke="#2c6266" stroke-width="1.5"/>
        <ellipse cx="200" cy="160" rx="95" ry="38" stroke="#2c6266" stroke-width="1.2"/>
        <ellipse cx="200" cy="160" rx="38" ry="95" stroke="#2c6266" stroke-width="1.2"/>
        <ellipse cx="200" cy="160" rx="95" ry="38" stroke="#f6821f" stroke-width="2" stroke-dasharray="4 7" transform="rotate(-24 200 160)"/>
        <circle cx="200" cy="160" r="5" fill="#f6821f"/>
        <g fill="#9ecac5">
          <circle cx="118" cy="118" r="3.5"/><circle cx="286" cy="132" r="3.5"/>
          <circle cx="152" cy="230" r="3.5"/><circle cx="262" cy="212" r="3.5"/>
          <circle cx="200" cy="65" r="3.5"/><circle cx="200" cy="255" r="3.5"/>
        </g>
        <path d="M296 96c.9-3.2.5-6.2-1.2-8.4-1.5-2-4.1-3.2-7.1-3.2l-22.3-.3c-.4 0-.7-.2-.8-.5-.1-.3-.1-.7.1-1 .2-.5 1-.9 1.6-.9l22.6-.3c2.7-.2 5.6-2.3 6.6-5l1.3-3.4c.1-.3.1-.5.1-.8-1.5-5.6-6.1-9.4-11.7-9.4-5 0-9.3 3.3-10.9 7.8-2-1.5-4.6-2.2-7.3-1.7-4.4.8-7.3 4.8-6.9 9.4.4 4.2 3.7 7.5 7.8 8.1h22.5c.5 0 .9-.3 1-.7l1-2.4z" fill="#F6821F" transform="translate(30 40) scale(1.5)"/>
      </svg>
    </div>
  </div>
</section>

<section class="section soft" id="features">
  <div class="wrap">
    <h2>面板上能做的事</h2>
    <p class="sec-sub">没有多余的功能堆砌，把域名注册、解析管理、积分账务这一条链路做扎实。</p>
    <div class="feat-grid">
      <div class="feat">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/></svg></div>
        <h3>二级域名注册</h3>
        <p>挑选主域名下的前缀，1-3 年有效期，到期倒计时与原价续期。保留前缀与非法字符在服务端拦截。</p>
      </div>
      <div class="feat">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r=".9" fill="currentColor"/><circle cx="7" cy="16.5" r=".9" fill="currentColor"/></svg></div>
        <h3>DNS 记录管理</h3>
        <p>A / AAAA / CNAME / TXT / MX / NS / SRV / CAA 全类型，TTL、MX 优先级、Cloudflare 橙云代理开关。</p>
      </div>
      <div class="feat">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.7-3.2 8-7.5 9.5-4.3-1.5-7.5-4.8-7.5-9.5V6z"/></svg></div>
        <h3>直连真实服务商</h3>
        <p>记录实时写入 Cloudflare、腾讯云 DNSPod 或阿里云云解析；上游报错即时返回，本地不落库，保证两侧一致。</p>
      </div>
      <div class="feat">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18" stroke-linecap="round"/><circle cx="16.5" cy="15" r="1" fill="currentColor" stroke="none"/></svg></div>
        <h3>积分与充值</h3>
        <p>接入彩虹易支付（支付宝 / 微信 / QQ），1 元 10 积分；每日签到攒积分，连续签到奖励递增。回调验签、金额核对、重复通知幂等入账。</p>
      </div>
      <div class="feat">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.8 6.5L12 13l8.2-6.5" stroke-linecap="round"/></svg></div>
        <h3>邮件通知与到期处理</h3>
        <p>内置 SMTP 客户端（465 SSL / 587 STARTTLS），注册验证码、找回密码、到期前 7、3、1 天提醒；逾期暂停解析，宽限期后按计划任务自动删除。</p>
      </div>
      <div class="feat">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.36.95a7 7 0 0 0-2.42-1.4L13.7 2.5h-3.4l-.38 2.64a7 7 0 0 0-2.42 1.4l-2.36-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.42 1.4l.38 2.64h3.4l.38-2.64a7 7 0 0 0 2.42-1.4l2.36.95 2-3.46-2-1.55c.09-.46.14-.92.14-1.4z"/></svg></div>
        <h3>管理后台</h3>
        <p>服务商凭据、主域名定价与限额、用户积分、订单流水、站点设置，全部在面板内完成，无需改代码。</p>
      </div>
    </div>
  </div>
</section>

<section class="section" id="how">
  <div class="wrap">
    <h2>从注册到解析，四步</h2>
    <p class="sec-sub">整个流程都在浏览器里完成，手机端同样可用。</p>
    <div class="steps">
      <div class="step"><div class="no">1</div><h4>注册账号</h4><p>用户名加邮箱，开启邮件服务后填一个 6 位验证码即可注册，注册赠 10 积分。</p></div>
      <div class="step"><div class="no">2</div><h4>攒积分</h4><p>充值或每日签到，连续签到奖励递增。</p></div>
      <div class="step"><div class="no">3</div><h4>挑一个前缀</h4><p>在可售主域名下查询前缀占用情况，确认年限后扣积分下单。</p></div>
      <div class="step"><div class="no">4</div><h4>指向源站</h4><p>购买时填一个 IP 或目标域名就自动生成 @ 记录；之后随时增删改，保存后写入上游 DNS。</p></div>
    </div>
  </div>
</section>

<section class="section soft" id="pricing">
  <div class="wrap">
    <h2>价格</h2>
    <p class="sec-sub">按年计费，积分抵扣。续期按原价，没有任何隐藏费用。</p>
    <div class="price-band">
      <div class="txt">
        <h3>二级域名 · 按主域名定价</h3>
        <p>演示主域名 10-30 积分/年，实际价格由站长在主域名设置里定义。购买记录、积分流水随时可查。</p>
      </div>
      <div>
        <div class="num">10<small>积分/年起</small></div>
      </div>
      <a class="lbtn orange lg" href="./dashboard.php#register">进入控制台</a>
    </div>
  </div>
</section>

<section class="section" id="faq">
  <div class="wrap">
    <h2>常见问题</h2>
    <p class="sec-sub"></p>
    <div class="faq">
      <details open>
        <summary>买的域名是真的能解析吗？</summary>
        <div class="a">是。你在面板里添加的每条记录都会通过 API 写入上游 DNS 服务商（Cloudflare / DNSPod / 阿里云），与服务商控制台操作等价。</div>
      </details>
      <details>
        <summary>域名到期会怎样？</summary>
        <div class="a">到期前 7、3、1 天各寄一封提醒邮件。到期当天上游解析记录被摘除、面板标注"已到期"，进入宽限期（默认 7 天）；宽限期内按原价续期会自动重新发布全部记录，超出宽限期则域名与记录一并删除，前缀释放给其他人注册。</div>
      </details>
      <details>
        <summary>忘记密码了怎么办？</summary>
        <div class="a">在登录页点"忘记密码"，用注册邮箱收 6 位验证码直接设置新密码。站点未配置 SMTP 时该入口会提示联系站长处理。</div>
      </details>
      <details>
        <summary>积分可以退吗？</summary>
        <div class="a">积分用于域名注册和续期，一经消耗不可退换；充值订单在未消耗前可联系站长处理。</div>
      </details>
      <details>
        <summary>哪些前缀不能注册？</summary>
        <div class="a">www、mail、ns1、admin、api 等保留前缀不可使用，完整列表在购买页的校验提示中，服务端强制生效。</div>
      </details>
    </div>
  </div>
</section>

<section class="lfoot-cta">
  <h2>挑一个前缀，今天就让它上线</h2>
  <p>注册即赠 10 积分，签到几天就能白嫖一个年域名。</p>
  <a class="lbtn orange lg" href="./dashboard.php#register">免费开始</a>
</section>

<footer class="lfoot">
  <div class="wrap">
    <div class="lfoot-grid">
      <div style="max-width:280px">
        <a class="lnav-logo" href="./" style="color:#fff"><?= $cloud ?><span><?= htmlspecialchars($siteName) ?></span></a>
        <p style="margin:10px 0 0"><?= htmlspecialchars($subtitle) ?> · 积分制域名注册与 DNS 管理。</p>
      </div>
      <div>
        <h5>产品</h5>
        <a href="#features">功能一览</a>
        <a href="#pricing">价格</a>
        <a href="./dashboard.php#market">可售域名</a>
      </div>
      <div>
        <h5>账号</h5>
        <a href="./dashboard.php#register">注册</a>
        <a href="./dashboard.php#login">登录</a>
        <a href="./dashboard.php#checkin">每日签到</a>
      </div>
      <div>
        <h5>帮助</h5>
        <a href="#faq">常见问题</a>
        <a href="./dashboard.php">控制台</a>
      </div>
    </div>
    <div class="lfoot-copy">
      <span>&copy; <?= date('Y') ?> <?= htmlspecialchars($siteName) ?></span>
      <span>基于 CloudNS 构建</span>
    </div>
  </div>
</footer>

</body>
</html>
