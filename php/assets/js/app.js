/* CloudNS 前端 —— Cloudflare 新版仪表盘风格 SPA (PHP 版) */
'use strict';

const CNS_API = window.CNS_API || './api.php';
const CNS_HOME = window.CNS_HOME || './';

// ================= 工具 =================
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toast').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

async function api(path, opts = {}) {
  const res = await fetch(CNS_API + '?api=' + encodeURIComponent(path), {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function fmtDate(s) {
  if (!s) return '-';
  return s.replace('T', ' ').slice(0, 16);
}

function daysLeft(expires) {
  return Math.max(0, Math.ceil((new Date(expires) - Date.now()) / 86400000));
}

// 本地日期 YYYY-MM-DD
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('已复制', 'ok')).catch(() => toast('复制失败', 'err'));
}

// SVG 图标
const I = {
  cloud: `<svg viewBox="0 0 64 40" fill="#F6821F"><path d="M44.6 33.6c.5-1.8.3-3.5-.6-4.7-.8-1.1-2.2-1.8-3.9-1.8l-31.6-.4c-.2 0-.4-.1-.5-.3-.1-.2-.1-.4 0-.6.1-.3.4-.5.7-.5l31.9-.4c3.8-.2 7.9-3.2 9.3-7l1.8-4.8c.1-.2.1-.4.1-.6C50.5 5.3 43.9 0 36 0c-7.1 0-13.2 4.6-15.4 11-2.8-2.1-6.5-3.1-10.4-2.4C3.6 9.8-.5 15.5.05 22.1c.5 5.9 5.2 10.6 11 11.4h31.9c.3 0 .6-.2.7-.5l1-3.4z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.8.35-1.1.9-1.1 1.8" stroke-linecap="round"/><circle cx="12" cy="16.8" r=".6" fill="currentColor" stroke="none"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.5-3.2 4.3-4.8 7.5-4.8s6 1.6 7.5 4.8" stroke-linecap="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.6 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20.5 8H6"/></svg>`,
  dns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r=".8" fill="currentColor"/><circle cx="7" cy="16.5" r=".8" fill="currentColor"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18" stroke-linecap="round"/><circle cx="16.5" cy="15" r="1" fill="currentColor" stroke="none"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="9" width="16" height="12" rx="1.5"/><path d="M4 13h16M12 9v12M12 9s-4.5.3-5.5-2C5.8 5.4 7.3 4 8.7 4 11 4 12 9 12 9zm0 0s4.5.3 5.5-2c.7-1.6-.8-3-2.2-3C13 4 12 9 12 9z"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r=".9" fill="currentColor" stroke="none"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.7-3.2 8-7.5 9.5-4.3-1.5-7.5-4.8-7.5-9.5V6z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.36.95a7 7 0 0 0-2.42-1.4L13.7 2.5h-3.4l-.38 2.64a7 7 0 0 0-2.42 1.4l-2.36-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.42 1.4l.38 2.64h3.4l.38-2.64a7 7 0 0 0 2.42-1.4l2.36.95 2-3.46-2-1.55c.09-.46.14-.92.14-1.4z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`,
  cloudOn: `<svg class="cloud" viewBox="0 0 64 40" fill="currentColor"><path d="M44.6 33.6c.5-1.8.3-3.5-.6-4.7-.8-1.1-2.2-1.8-3.9-1.8l-31.6-.4c-.2 0-.4-.1-.5-.3-.1-.2-.1-.4 0-.6.1-.3.4-.5.7-.5l31.9-.4c3.8-.2 7.9-3.2 9.3-7l1.8-4.8c.1-.2.1-.4.1-.6C50.5 5.3 43.9 0 36 0c-7.1 0-13.2 4.6-15.4 11-2.8-2.1-6.5-3.1-10.4-2.4C3.6 9.8-.5 15.5.05 22.1c.5 5.9 5.2 10.6 11 11.4h31.9c.3 0 .6-.2.7-.5l1-3.4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3.5l3.5 3.5L8 19.5l-4.5 1 1-4.5z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8a8.2 8.2 0 0 0-14.6-1.5M4 4v4h4M4 16a8.2 8.2 0 0 0 14.6 1.5M20 20v-4h-4"/></svg>`,
  empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M8.5 13.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" stroke-linecap="round"/><circle cx="9" cy="10" r=".7" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".7" fill="currentColor" stroke="none"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3c1 3.2-2.4 4.6-2.4 7.6 0 1.3.8 2.4 2 2.7-.3-1.6.6-2.6 1.6-3.6.4 1.2 1.6 1.9 2.2 3.1.9 1.9-.4 4.6-2.6 5.6-3.8 1.7-8-.7-8-4.9C4.8 9 9 7.6 12 3z"/></svg>`,
  chevR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  chevD: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9" stroke-linecap="round"/></svg>`,
  caret: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10l4-4 4 4M8 14l4 4 4-4"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.8 6.5L12 13l8.2-6.5" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 2.4"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M20 18v3H6.5"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5" stroke-linecap="round"/><circle cx="12" cy="7.8" r=".7" fill="currentColor" stroke="none"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l12 8-12 8z"/></svg>`,
};

function emptyBox(text) {
  return `<div class="empty">${I.empty}<div>${esc(text)}</div></div>`;
}

// ================= 全局状态 =================
const state = { user: null, site: null, sidebarOpen: false };

async function boot() {
  try {
    const [site, me] = await Promise.all([api('/site'), api('/auth/me').catch(() => null)]);
    state.site = site.site;
    state.user = me ? me.user : null;
  } catch {
    state.site = { site_name: 'CloudNS' };
  }
  render();
  window.addEventListener('hashchange', render);
}

function go(hash) { location.hash = hash; }

// ================= 登录/注册/找回密码 =================
function needEmailCode() {
  const s = state.site || {};
  return s.mail_enabled === '1' && s.register_need_email === '1';
}

function authView(mode = 'login') {
  const s = state.site || {};
  const title = { login: '登录', register: '注册', forgot: '找回密码' }[mode] || '登录';
  const withCode = needEmailCode();

  let form;
  if (mode === 'register') {
    form = `
      <form id="register-form">
        <label class="f"><span>用户名</span><input class="f" name="username" required pattern="[a-zA-Z0-9_]{3,20}" title="3-20 位字母、数字或下划线" autocomplete="username"></label>
        <label class="f"><span>邮箱</span><input class="f" type="email" id="rg-email" name="email" required autocomplete="email"></label>
        ${withCode ? `
        <label class="f"><span>邮箱验证码</span>
          <div class="code-row">
            <input class="f" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码">
            <button class="btn outline" type="button" id="rg-send">获取验证码</button>
          </div>
          <div class="hint">验证码 10 分钟内有效。若收不到，请确认邮箱已注册或联系管理员检查 SMTP。</div>
        </label>` : ''}
        <label class="f"><span>密码</span><input class="f" type="password" name="password" required minlength="6" autocomplete="new-password"></label>
        <button class="btn lg" style="width:100%" type="submit">创建账号</button>
      </form>
      <div class="auth-switch">已有账号？<a href="#/login">直接登录</a></div>`;
  } else if (mode === 'forgot') {
    form = `
      <form id="forgot-form">
        <label class="f"><span>注册邮箱</span><input class="f" type="email" name="email" id="fg-email" required autocomplete="email"></label>
        <label class="f"><span>验证码</span>
          <div class="code-row">
            <input class="f" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码">
            <button class="btn outline" type="button" id="fg-send">获取验证码</button>
          </div>
        </label>
        <label class="f"><span>新密码</span><input class="f" type="password" name="password" required minlength="6" autocomplete="new-password"></label>
        <button class="btn lg" style="width:100%" type="submit">重置密码</button>
      </form>
      <div class="auth-switch">想起来了？<a href="#/login">返回登录</a></div>`;
  } else {
    form = `
      <form id="login-form">
        <label class="f"><span>用户名或邮箱</span><input class="f" name="username" required autocomplete="username"></label>
        <label class="f"><span>密码</span><input class="f" type="password" name="password" required autocomplete="current-password"></label>
        <div class="auth-alt"><a href="#/register">创建账号</a><a href="#/forgot">忘记密码</a></div>
        <button class="btn lg" style="width:100%" type="submit">登 录</button>
      </form>`;
  }

  $('#root').innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo">${I.cloud}<div class="auth-title">${esc(s.site_name || 'CloudNS')}</div><div class="auth-sub">${esc(s.site_subtitle || '二级域名分发平台')}</div></div>
      <div class="auth-tabs">
        <a href="#/login" class="${mode === 'login' || mode === 'forgot' ? 'on' : ''}">登录</a>
        <a href="#/register" class="${mode === 'register' ? 'on' : ''}">注册</a>
      </div>
      <div id="auth-alert"></div>
      ${form}
      <div class="auth-home"><a href="${CNS_HOME}">${I.back} 返回首页</a></div>
    </div>
  </div>`;

  const alertBox = msg => { $('#auth-alert').innerHTML = `<div class="alert err">${esc(msg)}</div>`; };

  // 发送验证码（注册 / 找回密码共用）
  const bindSend = (btnId, emailId, scene) => {
    const btn = $(btnId);
    if (!btn) return;
    btn.onclick = async () => {
      const email = $(emailId).value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alertBox('请先填写正确的邮箱地址');
      btn.disabled = true;
      let left = 60;
      btn.textContent = `${left}s 后重发`;
      const timer = setInterval(() => {
        left -= 1;
        if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '获取验证码'; }
        else btn.textContent = `${left}s 后重发`;
      }, 1000);
      try {
        await api('/auth/send-code', { method: 'POST', body: { email, scene } });
        toast(scene === 'reset' ? '重置验证码已发送至邮箱' : '验证码已发送至邮箱', 'ok');
      } catch (e) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '获取验证码';
        alertBox(e.message);
      }
    };
  };
  bindSend('#rg-send', '#rg-email', 'register');
  bindSend('#fg-send', '#fg-email', 'reset');

  const formEl = $('#login-form') || $('#register-form') || $('#forgot-form');
  formEl.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(formEl));
    const submitBtn = formEl.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    try {
      if (mode === 'login') {
        const r = await api('/auth/login', { method: 'POST', body });
        if (r.is_admin) toast('欢迎回来，管理员', 'ok');
      } else if (mode === 'forgot') {
        await api('/auth/reset', { method: 'POST', body });
        toast('密码已重置，请用新密码登录', 'ok');
        go('#/login');
        render();
        return;
      } else {
        await api('/auth/register', { method: 'POST', body });
      }
      state.user = (await api('/auth/me')).user;
      go('#/');
      render();
    } catch (err) {
      submitBtn.disabled = false;
      alertBox(err.message);
    }
  };
}

// ================= 应用外壳 =================
const NAV_ACCT = [
  { hash: '#/my', icon: I.globe, label: '我的域名' },
  { hash: '#/market', icon: I.cart, label: '购买域名' },
  { hash: '#/recharge', icon: I.wallet, label: '充值积分' },
  { hash: '#/checkin', icon: I.gift, label: '每日签到' },
  { hash: '#/credits', icon: I.list, label: '积分日志' },
];

// zoneId 为空时是账户菜单，否则是当前域名的层级菜单
function navItems(zoneId) {
  if (zoneId) {
    const z = suffix => `#/zone/${zoneId}${suffix}`;
    return [
      { hash: z(''), icon: I.home, label: '域名概述', exact: true },
      { label: 'DNS', icon: I.dns, children: [{ hash: z('/dns'), icon: I.list, label: '记录' }] },
      { label: '账户', icon: I.user, children: NAV_ACCT },
      ...(state.user?.is_admin ? [{ label: '管理', icon: I.shield, children: [{ hash: '#/admin', icon: I.settings, label: '管理后台', exact: true }] }] : []),
    ];
  }
  return [
    { hash: '#/', icon: I.home, label: '概述', exact: true },
    { label: '域名', icon: I.globe, children: [NAV_ACCT[0], NAV_ACCT[1]] },
    { label: '积分', icon: I.wallet, children: NAV_ACCT.slice(2) },
    ...(state.user?.is_admin ? [{ label: '管理', icon: I.shield, children: [{ hash: '#/admin', icon: I.settings, label: '管理后台', exact: true }] }] : []),
  ];
}

const NAV_OPEN_KEY = 'cns-nav-open';

function navOpenState() {
  try {
    const raw = sessionStorage.getItem(NAV_OPEN_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* 忽略 */ }
  return null;
}

function isActive(it) {
  return it.exact ? location.hash === it.hash : location.hash.startsWith(it.hash);
}

function navHTML(items, remembered) {
  return items.map((it, i) => {
    if (!it.children) {
      return `<a class="sb-item sb-row ${isActive(it) ? 'active' : ''}" href="${it.hash}">${it.icon}<span>${it.label}</span></a>`;
    }
    const open = remembered ? remembered.has(it.label) : true;
    const kidActive = it.children.some(isActive);
    const kids = it.children.map(k => `<a class="sb-item sb-row ${isActive(k) ? 'active' : ''}" href="${k.hash}">${k.icon || '<span class="sb-dot"></span>'}<span>${k.label}</span>${k.badge ? `<span class="sb-badge">${k.badge}</span>` : ''}</a>`).join('');
    return `<button class="sb-item sb-row sb-parent ${open || kidActive ? 'open' : ''}" type="button" data-nav="${esc(it.label)}">${it.icon}<span>${it.label}</span><span class="chev">${I.chevR}</span></button>
      <div class="sb-sub" ${open || kidActive ? '' : 'hidden'}>${kids}</div>`;
  }).join('');
}

function shellHTML(pageTitle, contentHTML, opts = {}) {
  const u = state.user;
  const s = state.site || {};
  const items = navItems(opts.zone);
  const remembered = navOpenState();

  return `
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sb-head">
        <a class="sb-account" href="${opts.zone ? '#/zone/' + opts.zone : '#/'}">
          <span class="sb-logo">${I.cloud}</span>
          <span style="min-width:0"><div class="sb-account-name">${esc(s.site_name || 'CloudNS')}</div><div class="sb-account-sub">${esc(u.username)}</div></span>
        </a>
        <button class="sb-close" id="sb-close" title="关闭菜单">${I.x}</button>
      </div>
      <div class="sb-search">
        ${I.search}<input placeholder="快速搜索..." id="sb-search" autocomplete="off"><kbd>Ctrl K</kbd>
      </div>
      ${opts.back ? `<a class="sb-back" href="${opts.back.href}">${I.back}<span>${esc(opts.back.label)}</span></a>` : ''}
      <nav class="sb-nav" id="sb-nav">${navHTML(items, remembered)}</nav>
      <div class="sb-foot">
        <div class="sb-credits">
          <span>积分余额 <b>${u.credits}</b></span>
          <button class="icon-btn" id="btn-logout" title="退出登录">${I.logout}</button>
        </div>
      </div>
    </aside>
    <div class="overlay" id="overlay"></div>
    <div class="main">
      <div class="topbar">
        <button class="icon-btn" id="btn-menu" title="菜单">${I.menu}</button>
        <span class="tb-brand">${I.cloud}<span>${esc(s.site_name || 'CloudNS')}</span></span>
        <button class="icon-btn" id="btn-top-user" title="账号">${I.user}</button>
      </div>
      <div class="pchead">
        <button class="icon-btn" id="btn-top-search" title="搜索（Ctrl K）">${I.search}</button>
        <button class="icon-btn" id="btn-top-help" title="帮助">${I.help}</button>
        <button class="icon-btn" id="btn-top-user" title="账号">${I.user}</button>
      </div>
      <div class="content">${contentHTML}</div>
    </div>
  </div>`;
}

function closeDrawer() {
  $('#sidebar')?.classList.remove('open');
  $('#overlay')?.classList.remove('show');
}

function bindShell() {
  const sb = $('#sidebar'), ov = $('#overlay');
  $('#btn-menu')?.addEventListener('click', () => { sb.classList.add('open'); ov.classList.add('show'); });
  ov?.addEventListener('click', closeDrawer);
  $('#sb-close')?.addEventListener('click', closeDrawer);
  $('#btn-top-user')?.addEventListener('click', () => {
    const el = $('#btn-top-user');
    popupMenu([
      { label: '充值积分', icon: I.wallet, onClick: () => go('#/recharge') },
      { label: '积分日志', icon: I.list, onClick: () => go('#/credits') },
      { label: '退出登录', icon: I.logout, danger: true, onClick: logoutNow },
    ], el);
  });
  $('#btn-logout')?.addEventListener('click', logoutNow);

  // 展开/收起子菜单
  $$('.sb-parent').forEach(b => b.addEventListener('click', () => {
    const sub = b.nextElementSibling;
    const open = b.classList.toggle('open');
    sub.hidden = !open;
    const set = new Set($$('.sb-parent.open').map(x => x.dataset.nav));
    try { sessionStorage.setItem(NAV_OPEN_KEY, JSON.stringify([...set])); } catch { /* 忽略 */ }
  }));
  $$('.sb-nav .sb-item[href]').forEach(a => a.addEventListener('click', closeDrawer));

  // 快速搜索：过滤菜单项，回车跳转
  const search = $('#sb-search');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    $$('.sb-sub').forEach(s => { if (q) s.hidden = false; });
    $$('.sb-nav .sb-row').forEach(row => {
      row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  search?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const first = $$('.sb-nav .sb-row[href]').find(a => a.style.display !== 'none');
    if (first) { location.hash = first.getAttribute('href'); closeDrawer(); }
    else go('#/my?q=' + encodeURIComponent(search.value.trim()));
  });
  $('#btn-top-search')?.addEventListener('click', () => { sb?.classList.add('open'); ov?.classList.add('show'); $('#sb-search')?.focus(); });

  document.addEventListener('keydown', function onkey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      sb?.classList.add('open');
      ov?.classList.add('show');
      $('#sb-search')?.focus();
    }
    if (e.key === 'Escape') closeDrawer();
    document.removeEventListener('keydown', onkey);
  });
}

async function logoutNow() {
  await api('/auth/logout', { method: 'POST' });
  state.user = null;
  go('#/login');
  render();
}

// ================= 弹窗 =================
function modal(html, { wide = false } = {}) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
  document.body.appendChild(mask);
  return mask;
}

function confirmModal(title, text, okLabel = '确认删除') {
  return new Promise(resolve => {
    const m = modal(`
      <h2>${esc(title)}</h2>
      <p class="muted">${esc(text)}</p>
      <div class="modal-foot">
        <button class="btn outline" data-x="0">取消</button>
        <button class="btn danger" data-x="1">${esc(okLabel)}</button>
      </div>`);
    m.querySelector('[data-x="0"]').onclick = () => { m.remove(); resolve(false); };
    m.querySelector('[data-x="1"]').onclick = () => { m.remove(); resolve(true); };
  });
}

// 右键式菜单
function popupMenu(items, anchor) {
  $$('.menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}<span>${esc(it.label)}</span></button>`).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8) + 'px';
  menu.style.left = Math.min(r.left - 130 + r.width, innerWidth - menu.offsetWidth - 8) + 'px';
  menu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    menu.remove();
    items[+b.dataset.i].onClick();
  });
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', h); }
  }), 0);
}

// ================= 页面：概述 =================
async function dashboardView(el) {
  const [me, zones, mine] = await Promise.all([api('/auth/me'), api('/domains/zones'), api('/domains/mine')]);
  state.user = me.user;
  const u = me.user;
  const today = todayStr();
  const y = new Date().getFullYear(), m = new Date().getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const checkedSet = new Set((await api('/auth/checkin/calendar')).days.map(d => d.date));

  el.innerHTML = shellHTML('概述', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>你好，${esc(u.username)}</h1>
        <p class="cf-sub">欢迎使用 ${esc(state.site.site_name || 'CloudNS')}，在这里管理和分发你的二级域名。</p>
      </div>
      <div class="cf-head-actions">
        <button class="btn" id="btn-buy-now">${I.plus} 购买域名</button>
      </div>
    </div>
    <div class="grid grid-4">
      <div class="card stat"><div class="num">${u.credits}</div><div class="lbl">当前积分</div></div>
      <div class="card stat"><div class="num">${mine.subdomains.length}</div><div class="lbl">持有域名</div></div>
      <div class="card stat"><div class="num">${zones.zones.length}</div><div class="lbl">可售主域名</div></div>
      <div class="card stat"><div class="num">${u.streak || 0}<span style="font-size:14px;color:var(--muted)"> 天</span></div><div class="lbl">连续签到</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card checkin-hero" style="margin:0">
        <div class="muted">每日签到</div>
        <div class="big big-ico ${checkedSet.has(today) ? 'ok' : 'todo'}">${checkedSet.has(today) ? I.check : I.gift}</div>
        ${u.last_checkin_date === today
          ? '<div class="muted">今天已签到，明天再来吧</div>'
          : '<button class="btn orange lg" id="btn-checkin-now">立即签到领积分</button>'}
        <div class="streak-flame" style="margin-top:8px">${I.flame}已连续签到 ${u.streak || 0} 天</div>
      </div>
      <div class="card" style="margin:0">
        <h3>本月签到日历</h3>
        <div class="cal">
          ${Array.from({ length: daysInMonth }, (_, i) => {
            const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
            const on = checkedSet.has(ds);
            const isToday = ds === today;
            return `<div class="cal-cell ${on ? 'on' : ''} ${isToday ? 'today' : ''}" title="${ds}">${i + 1}</div>`;
          }).join('')}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="flex-between"><h3 class="mt0 mb0">最近持有的域名</h3><a href="#/my">查看全部</a></div>
      ${mine.subdomains.length ? `<div class="rlist" style="margin-top:12px">${mine.subdomains.slice(0, 5).map(s => `
        <div class="ritem">
          <div class="ritem-main">
            <span class="rtype">${esc(s.zone_name.split('.').pop().toUpperCase())}</span>
            <div class="rbody">
              <div class="rname"><a class="cf-dom" href="#/zone/${s.id}">${esc(s.full_name)}</a></div>
              <div class="rmeta">${s.record_count} / ${s.max_records} 条记录 · 到期 ${esc(s.expires_at.slice(0, 10))}（剩 ${daysLeft(s.expires_at)} 天）</div>
            </div>
            <a class="btn sm outline" href="#/zone/${s.id}/dns">DNS 记录</a>
          </div>
        </div>`).join('')}</div>` : emptyBox('还没有域名，去购买一个吧')}
    </div>
  `);
  bindShell();
  $('#btn-buy-now').onclick = () => go('#/market');
  $('#btn-checkin-now')?.addEventListener('click', async () => {
    try {
      const r = await api('/auth/checkin', { method: 'POST' });
      toast(`签到成功，获得 ${r.gain} 积分（连续 ${r.streak} 天）`, 'ok');
      dashboardView(el);
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ================= 页面：购买域名 =================
async function marketView(el) {
  const [me, data] = await Promise.all([api('/auth/me'), api('/domains/zones')]);
  state.user = me.user;
  const zones = data.zones;
  el.innerHTML = shellHTML('购买域名', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>购买域名</h1>
        <p class="cf-sub">选择主域名和前缀，用积分按年注册二级域名，提交后立即生效。</p>
      </div>
    </div>
    ${state.site.buy_notice ? `<details class="cf-fold" open><summary>${I.info}<span>购买须知</span><span class="tag-hint">重要</span><span class="chev">${I.chevD}</span></summary><div class="fold-body">${esc(state.site.buy_notice)}</div></details>` : ''}
    <div class="grid grid-3">
      ${zones.map(z => `
        <div class="card" style="margin:0;display:flex;flex-direction:column;gap:10px">
          <div class="flex-between">
            <div style="font-weight:800;font-size:17px" class="mono">${esc(z.name)}</div>
            <span class="badge ${z.provider_type === 'cloudflare' ? 'amber' : z.provider_type === 'dnspod' ? 'blue' : 'gray'}">${esc(z.provider_name)}</span>
          </div>
          <div class="muted small">${z.note ? esc(z.note) : '无备注'}</div>
          <div class="flex-between">
            <div><b style="font-size:22px">${z.price}</b> <span class="muted small">积分/年</span></div>
            <div class="muted small">已售 ${z.sold_count} · 限持 ${z.max_per_user}</div>
          </div>
          <button class="btn" data-zone="${z.id}" data-name="${esc(z.name)}" data-price="${z.price}">${I.plus} 立即注册</button>
        </div>`).join('') || `<div class="card">${emptyBox('暂无可售域名')}</div>`}
    </div>
  `);
  bindShell();
  $$('button[data-zone]', el).forEach(b => b.onclick = () => buyDialog(b.dataset.zone, b.dataset.name, b.dataset.price, el));
}

function buyDialog(zoneId, zoneName, price, refreshEl) {
  const u = state.user;
  const m = modal(`
    <h2>注册子域名</h2>
    <label class="f"><span>完整域名</span>
      <div class="flex" style="gap:8px">
        <input class="f" id="buy-prefix" placeholder="前缀，如 blog" style="flex:1">
        <span class="mono" style="font-weight:700">.${esc(zoneName)}</span>
      </div>
      <div class="hint">仅允许小写字母、数字和连字符；购买后立即扣除积分。</div>
    </label>
    <label class="f"><span>有效期</span>
      <select class="f" id="buy-years">
        <option value="1">1 年 — ${price} 积分</option>
        <option value="2">2 年 — ${price * 2} 积分</option>
        <option value="3">3 年 — ${price * 3} 积分</option>
      </select>
    </label>
    <label class="f"><span>立即解析到（可选）</span>
      <input class="f" id="buy-resolve" placeholder="IPv4 地址或目标域名，如 1.2.3.4 / cname.example.com">
      <div class="hint">填写后会自动创建一条 @ 记录（IPv4 生成 A，域名生成 CNAME），无需再手动添加。</div>
    </label>
    <div class="alert info">当前积分：<b id="buy-balance">${u.credits}</b>，购买后余额 <b id="buy-after">-</b></div>
    <div id="buy-alert"></div>
    <div class="modal-foot">
      <button class="btn outline" id="buy-cancel">取消</button>
      <button class="btn" id="buy-ok">确认购买</button>
    </div>
  `);
  const years = $('#buy-years', m), prefix = $('#buy-prefix', m);
  const upd = () => {
    const cost = price * (+years.value);
    $('#buy-after', m).textContent = u.credits - cost;
  };
  years.onchange = upd; upd();
  $('#buy-cancel', m).onclick = () => m.remove();
  $('#buy-ok', m).onclick = async () => {
    const okBtn = $('#buy-ok', m);
    okBtn.disabled = true;
    try {
      const r = await api('/domains/buy', {
        method: 'POST',
        body: {
          zone_id: +zoneId,
          prefix: prefix.value.trim().toLowerCase(),
          years: +years.value,
          resolve: $('#buy-resolve', m).value.trim(),
        },
      });
      m.remove();
      if (r.record_error) toast(`域名已注册，但自动解析失败：${r.record_error}`, 'err');
      else if (r.record_id) toast(`购买成功，花费 ${r.cost} 积分，解析已生效`, 'ok');
      else toast(`购买成功！花费 ${r.cost} 积分`, 'ok');
      go('#/zone/' + r.id + '/dns');
    } catch (e) {
      okBtn.disabled = false;
      $('#buy-alert', m).innerHTML = `<div class="alert err">${esc(e.message)}</div>`;
    }
  };
  prefix.focus();
}

// ================= 页面：我的域名 =================
const SUB_SORTS = { name: s => s.full_name, status: s => subState(s).rank, records: s => s.record_count / (s.max_records || 1), expires: s => s.expires_at };
let domSort = { key: 'name', dir: 1 };

function subState(s) {
  if (s.status === 'expired') return { label: '已到期', cls: 'red', rank: 0 };
  const d = daysLeft(s.expires_at);
  if (d <= 3) return { label: '即将到期', cls: 'red', rank: 1 };
  if (d <= 15) return { label: '快到期', cls: 'amber', rank: 2 };
  return { label: '正常', cls: 'green', rank: 3 };
}

const PROVIDER_CN = { cloudflare: 'Cloudflare', dnspod: '腾讯云 DNSPod', aliyun: '阿里云 DNS', mock: '内置演示' };

function remindLabel(stage) {
  const parts = String(stage || '').split(',').filter(Boolean);
  if (!parts.length) return '未提醒';
  if (parts.includes('paused')) return '已暂停解析';
  return parts.join('、') + ' 天提醒已发';
}

async function myZonesView(el, q = '') {
  const data = await api('/domains/mine');
  const urlQ = new URLSearchParams(location.hash.split('?')[1] || '');
  const qv = q || urlQ.get('q') || '';
  const kw = qv.toLowerCase();
  let rows = data.subdomains.filter(s => !kw || s.full_name.toLowerCase().includes(kw));
  const cmp = SUB_SORTS[domSort.key] || SUB_SORTS.name;
  rows = rows.slice().sort((a, b) => {
    const x = cmp(a), y = cmp(b);
    return (x > y ? 1 : x < y ? -1 : 0) * domSort.dir;
  });

  const th = (key, label, left = false) => `<span class="cf-cell${left ? ' left' : ''}"><button class="sort ${domSort.key === key ? 'act' : ''}" data-sort="${key}">${label}${domSort.key === key ? I.caret : ''}</button></span>`;
  el.innerHTML = shellHTML('域名', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>域名</h1>
        <p class="cf-sub">你注册的二级域名。到期前 7、3、1 天会收到邮件提醒，逾期进入宽限期，超期后域名与解析记录将被删除。</p>
      </div>
      <div class="cf-head-actions">
        <a class="doclink" href="${CNS_HOME}">${I.book} 使用说明</a>
        <button class="btn" id="btn-tomarket">${I.plus} 购买域名</button>
      </div>
    </div>
    <input class="search-box" id="my-search" placeholder="按域名搜索" value="${esc(qv)}">
    <div class="cf-table">
      <div class="cf-tr cf-th">
        <span>${th('name', '域')}</span>
        ${th('status', '状态')}${th('records', '记录')}${th('expires', '到期')}
        <span class="cf-cell"></span>
      </div>
      ${rows.map(s => {
        const st = subState(s);
        return `<div class="cf-tr">
          <a class="cf-dom" href="#/zone/${s.id}">${esc(s.full_name)}</a>
          <span class="cf-cell"><span class="badge ${st.cls}"><span class="dot"></span>${st.label}</span></span>
          <span class="cf-cell">${s.record_count} / ${s.max_records}</span>
          <span class="cf-cell">${esc(s.expires_at.slice(0, 10))}<span class="muted"> · 剩 ${daysLeft(s.expires_at)} 天</span></span>
          <button class="icon-btn" data-menu="${s.id}" title="更多操作">${I.dots}</button>
        </div>`;
      }).join('') || `<div class="cf-tr" style="display:block">${emptyBox(rows.length ? '没有匹配的域名' : '还没有域名，先购买一个')}</div>`}
      ${rows.length ? `<div class="cf-foot">显示 1-${rows.length} 条，共 ${data.subdomains.length} 个域名</div>` : ''}
    </div>
  `);
  bindShell();
  $('#btn-tomarket').onclick = () => go('#/market');
  const search = $('#my-search');
  search.oninput = () => {
    const kw2 = search.value.trim().toLowerCase();
    $$('.cf-table .cf-tr:not(.cf-th)').forEach(r => {
      r.style.display = !kw2 || r.textContent.toLowerCase().includes(kw2) ? '' : 'none';
    });
  };
  search.onkeydown = e => { if (e.key === 'Enter') go('#/my?q=' + encodeURIComponent(search.value.trim())); };
  $$('button[data-sort]', el).forEach(b => b.onclick = () => {
    const key = b.dataset.sort;
    domSort = { key, dir: domSort.key === key ? -domSort.dir : 1 };
    myZonesView(el, qv);
  });
  $$('button[data-menu]', el).forEach(b => b.onclick = () => {
    const sub = rows.find(r => String(r.id) === b.dataset.menu);
    popupMenu([
      { label: 'DNS 记录', icon: I.dns, onClick: () => go('#/zone/' + sub.id + '/dns') },
      { label: '域名概述', icon: I.info, onClick: () => go('#/zone/' + sub.id) },
      { label: '复制域名', icon: I.copy, onClick: () => copyText(sub.full_name) },
      { label: sub.status === 'expired' ? '续期恢复' : '续期', icon: I.wallet, onClick: () => renewDialog(sub, () => myZonesView(el, qv)) },
    ], b);
  });
}

// ================= 页面：域名概述 =================
async function zoneOverviewView(el, subId) {
  let data;
  try {
    data = await api(`/domains/${subId}/records`);
  } catch { go('#/my'); return; }
  const sub = data.subdomain;
  const st = subState(sub);
  const used = data.records.length;

  el.innerHTML = shellHTML('域名概述', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>${esc(sub.full_name)}</h1>
        <p class="cf-sub">${sub.status === 'expired' ? '该域名已到期，解析已暂停。在宽限期内续期可恢复全部记录。' : '这个域名的到期状态、解析用量和所属服务商。'}</p>
      </div>
      <div class="cf-head-actions">
        <button class="btn outline" id="zo-copy">${I.copy} 复制域名</button>
        <button class="btn" id="zo-dns">${I.dns} 管理记录</button>
      </div>
    </div>
    <div class="grid grid-4">
      <div class="card stat"><div class="num">${daysLeft(sub.expires_at)}</div><div class="lbl">剩余天数（到期 ${esc(sub.expires_at.slice(0, 10))}）</div></div>
      <div class="card stat"><div class="num">${used}<span style="font-size:14px;color:var(--muted)"> / ${sub.max_records}</span></div><div class="lbl">已用解析记录</div></div>
      <div class="card stat"><div class="num" style="font-size:20px"><span class="badge ${st.cls}"><span class="dot"></span>${st.label}</span></div><div class="lbl">域名状态</div></div>
      <div class="card stat"><div class="num" style="font-size:18px">${esc(PROVIDER_CN[sub.provider_type] || sub.provider_type)}</div><div class="lbl">DNS 服务商</div></div>
    </div>
    <div class="card">
      <h3>到期与提醒</h3>
      <div class="usage">
        <span>单价 <b>${sub.price}</b> 积分/年</span><span class="sep">·</span>
        <span>注册于 <b>${esc(String(sub.created_at).slice(0, 10))}</b></span><span class="sep">·</span>
        <span>提醒阶段 <b>${esc(remindLabel(sub.remind_stage))}</b></span>
      </div>
      <p class="muted small mb0">到期前 7、3、1 天各发送一封提醒邮件；到期后解析暂停并进入宽限期，宽限期内续期会自动重新发布全部记录。</p>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn outline" id="zo-renew">${I.refresh} ${sub.status === 'expired' ? '续期并恢复解析' : '续期'}</button>
      </div>
    </div>
  `, { zone: subId });
  bindShell();
  $('#zo-copy').onclick = () => copyText(sub.full_name);
  $('#zo-dns').onclick = () => go('#/zone/' + subId + '/dns');
  $('#zo-renew').onclick = () => renewDialog(sub, () => zoneOverviewView(el, subId));
}

function renewDialog(sub, refresh) {
  const expired = sub.status === 'expired';
  const m = modal(`
    <h2>续期 ${esc(sub.full_name)}</h2>
    ${expired ? '<div class="alert err">该域名已到期、解析已暂停。续期后原有记录会自动重新发布。</div>' : ''}
    <label class="f"><span>续期时长（单价 ${sub.price} 积分/年）</span>
      <select class="f" id="renew-years">
        <option value="1">1 年 — ${sub.price} 积分</option>
        <option value="2">2 年 — ${sub.price * 2} 积分</option>
        <option value="3">3 年 — ${sub.price * 3} 积分</option>
      </select>
    </label>
    <div class="modal-foot">
      <button class="btn outline" id="rn-cancel">取消</button>
      <button class="btn" id="rn-ok">确认续期</button>
    </div>`);
  $('#rn-cancel', m).onclick = () => m.remove();
  $('#rn-ok', m).onclick = async () => {
    const okBtn = $('#rn-ok', m);
    okBtn.disabled = true;
    try {
      const r = await api(`/domains/${sub.id}/renew`, { method: 'POST', body: { years: +$('#renew-years', m).value } });
      m.remove();
      if (r.restore_errors && r.restore_errors.length) toast(`续期成功，但有 ${r.restore_errors.length} 条记录未能恢复`, 'err');
      else if (r.restored) toast(`续期成功，花费 ${r.cost} 积分，已恢复 ${r.restored} 条解析`, 'ok');
      else toast(`续期成功，花费 ${r.cost} 积分`, 'ok');
      refresh();
    } catch (e) {
      okBtn.disabled = false;
      toast(e.message, 'err');
    }
  };
}

// ================= 页面：DNS 记录管理 =================
async function recordsView(el, subId) {
  let data;
  try {
    const [d, me] = await Promise.all([api(`/domains/${subId}/records`), api('/auth/me')]);
    data = d;
    state.user = me.user;
  } catch { go('#/my'); return; }
  const { subdomain: sub, records, types } = data;
  const isCF = sub.provider_type === 'cloudflare';
  const expired = sub.status === 'expired';
  const sel = new Set();
  const refresh = () => recordsView(el, subId);

  const row = r => `
    <div class="ritem" data-rec="${r.id}">
      <div class="ritem-main">
        <button class="rcheck" data-check="${r.id}" aria-label="选择该记录" title="选择">${I.check}</button>
        <span class="rtype">${esc(r.type)}</span>
        ${isCF ? `<span class="rproxy ${r.proxied ? 'on' : ''}" title="${r.proxied ? '已通过 Cloudflare 代理' : '仅 DNS 解析'}">${I.cloudOn}</span>` : ''}
        <div class="rbody">
          <div class="rname">${esc(r.name)}</div>
          <div class="rmeta">${esc(r.content)}${r.priority ? `<span class="muted"> · 优先级 ${r.priority}</span>` : ''}</div>
        </div>
        <button class="icon-btn rmore" data-more="${r.id}" title="更多操作">${I.dots}</button>
      </div>
      <div class="ritem-foot">
        <span class="k">TTL</span><span>${r.ttl === 1 ? '自动' : r.ttl + ' 秒'}</span>
        <span class="vsep">|</span>
        <span class="k">状态</span><span>已启用</span>
        ${isCF ? `<span class="vsep">|</span><span>${r.proxied ? '已代理' : '仅 DNS'}</span>` : ''}
        <span class="spacer"></span>
        <span>更新于 ${fmtDate(r.updated_at)}</span>
      </div>
    </div>`;

  el.innerHTML = shellHTML('DNS 记录', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>${esc(sub.full_name)} 的 DNS 记录</h1>
        <p class="cf-sub">管理 Internet 如何查找你的 Web 内容、验证服务以及路由流量。</p>
      </div>
      <div class="cf-head-actions">
        <div class="btn-group">
          <button class="btn" id="btn-add" ${expired ? 'disabled' : ''}>${I.plus} 添加记录</button>
          <button class="btn outline sq" id="btn-add-quick" ${expired ? 'disabled' : ''} title="按类型快速添加">${I.chevD}</button>
        </div>
      </div>
    </div>
    ${expired ? `<div class="alert err">该域名已到期，解析已暂停。${esc(String(sub.expires_at).slice(0, 10))} 后进入删除队列，<b>续期</b>可立即恢复全部记录。</div>` : ''}
    <details class="cf-fold">
      <summary>${I.info}<span>推荐</span><span class="tag-hint">上手提示</span><span class="chev">${I.chevD}</span></summary>
      <div class="fold-body">
        <ul>
          <li>网站指向服务器：添加 <b>A</b> 记录，名称填 <code class="chip">@</code>，内容填 IPv4 地址。</li>
          <li>指向另一个域名或 CDN：<b>CNAME</b>，内容以点结尾的目标域名会自动补全。</li>
          <li>验证域名所有权用 <b>TXT</b>，邮件收发用 <b>MX</b> 加优先级。</li>
          <li>修改记录后全球生效需要等待 TTL 过期，${esc(PROVIDER_CN[sub.provider_type] || sub.provider_type)} 侧会同步更新。</li>
        </ul>
      </div>
    </details>
    <div class="usage">
      <button class="txtbtn" id="btn-select-all">${I.check} 全选</button>
      <span class="sep">|</span>
      <span>已使用 <b>${records.length}</b> / ${sub.max_records} 条记录</span>
      <span class="bar"><i style="width:${Math.min(100, Math.round(records.length / (sub.max_records || 1) * 100))}%"></i></span>
      <span class="sep">|</span>
      <span>到期 <b>${esc(String(sub.expires_at).slice(0, 10))}</b>（剩 ${daysLeft(sub.expires_at)} 天）</span>
      <span class="spacer"></span>
      <button class="txtbtn" id="btn-open-overview">域名概述</button>
    </div>
    <div class="bulk" id="bulk" hidden>
      <span>已选择 <b id="bulk-n">0</b> 条记录</span>
      <span class="spacer"></span>
      <button class="btn sm outline" id="bulk-clear">取消</button>
      <button class="btn sm danger" id="bulk-del" ${expired ? 'disabled' : ''}>删除所选</button>
    </div>
    <div class="rlist">
      ${records.map(row).join('') || emptyBox('暂无 DNS 记录，点击右上角「添加记录」创建第一条解析')}
    </div>
  `, { zone: subId, back: { href: '#/my', label: '返回域名列表' } });
  bindShell();
  $('#btn-open-overview').onclick = () => go('#/zone/' + subId);

  const syncSel = () => {
    $$('.rcheck').forEach(c => c.classList.toggle('on', sel.has(c.dataset.check)));
    $('#bulk').hidden = sel.size === 0;
    $('#bulk-n').textContent = sel.size;
  };
  $$('.rcheck', el).forEach(c => c.onclick = e => {
    e.stopPropagation();
    const id = c.dataset.check;
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    syncSel();
  });
  $('#btn-select-all').onclick = () => {
    if (sel.size === records.length) sel.clear();
    else records.forEach(r => sel.add(String(r.id)));
    syncSel();
  };
  $('#bulk-clear').onclick = () => { sel.clear(); syncSel(); };
  $('#bulk-del').onclick = async () => {
    if (!await confirmModal('删除所选记录', `将删除 ${sel.size} 条记录，并同步删除服务商处的解析。`, '删除 ' + sel.size + ' 条')) return;
    let done = 0, failed = 0;
    for (const id of sel) {
      try { await api(`/domains/${subId}/records/${id}`, { method: 'DELETE' }); done += 1; }
      catch { failed += 1; }
    }
    toast(failed ? `已删除 ${done} 条，${failed} 条失败` : `已删除 ${done} 条记录`, failed ? 'err' : 'ok');
    refresh();
  };

  const openEdit = r => recordDialog(sub, types, r, isCF, refresh);
  $('#btn-add').onclick = () => recordDialog(sub, types, null, isCF, refresh);
  $('#btn-add-quick').onclick = () => popupMenu(
    types.map(t => ({ label: t, icon: I.plus, onClick: () => recordDialog(sub, types, null, isCF, refresh, t) })),
    $('#btn-add-quick')
  );
  $$('.ritem .rbody', el).forEach(b => {
    b.style.cursor = 'pointer';
    b.onclick = () => openEdit(records.find(r => String(r.id) === b.closest('.ritem').dataset.rec));
  });
  $$('button[data-more]', el).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const rec = records.find(r => String(r.id) === b.dataset.more);
    popupMenu([
      { label: '编辑记录', icon: I.edit, onClick: () => openEdit(rec) },
      { label: '复制记录值', icon: I.copy, onClick: () => copyText(rec.content) },
      { label: '删除记录', icon: I.trash, danger: true, onClick: () => deleteRecord(subId, rec, refresh) },
    ], b);
  });
}

async function deleteRecord(subId, rec, refresh) {
  if (!await confirmModal('删除 DNS 记录', `确定删除 ${rec.name} (${rec.type}) → ${rec.content} 吗？此操作会同步删除服务商处的记录。`)) return;
  try {
    await api(`/domains/${subId}/records/${rec.id}`, { method: 'DELETE' });
    toast('记录已删除', 'ok');
    refresh();
  } catch (e) { toast(e.message, 'err'); }
}

const CONTENT_LABEL = {
  A: 'IPv4 地址', AAAA: 'IPv6 地址', CNAME: '目标域名', MX: '邮件服务器',
  TXT: '文本内容', SRV: '服务地址', NS: '名称服务器', CAA: '证书颁发机构',
};

function recordDialog(sub, types, rec, isCF, refresh, presetType) {
  const editing = !!rec;
  const m = modal(`
    <h2>${editing ? '编辑记录' : '添加记录'}</h2>
    <div class="grid grid-2">
      <label class="f"><span>记录类型</span>
        <select class="f" id="rf-type">${types.map(t => `<option ${((editing ? rec.type : presetType) || t) === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </label>
      <label class="f"><span>TTL</span>
        <select class="f" id="rf-ttl">
          <option value="1" ${!editing || rec.ttl === 1 ? 'selected' : ''}>自动</option>
          <option value="60" ${rec?.ttl === 60 ? 'selected' : ''}>60 秒</option>
          <option value="300" ${rec?.ttl === 300 ? 'selected' : ''}>5 分钟</option>
          <option value="3600" ${rec?.ttl === 3600 ? 'selected' : ''}>1 小时</option>
          <option value="86400" ${rec?.ttl === 86400 ? 'selected' : ''}>1 天</option>
        </select>
      </label>
    </div>
    <label class="f"><span>名称</span>
      <div class="flex" style="gap:8px">
        <input class="f" id="rf-label" placeholder="@ 或子前缀，如 www" style="flex:1" value="${editing && rec.name !== sub.full_name ? esc(rec.name.replace(new RegExp('\\.' + sub.full_name.replace(/\./g, '\\.') + '$'), '')) : ''}">
        <span class="mono" style="color:var(--muted)">.${esc(sub.full_name)}</span>
      </div>
    </label>
    <label class="f"><span id="rf-content-label">内容</span>
      <input class="f" id="rf-content" value="${editing ? esc(rec.content) : ''}">
    </label>
    <label class="f" id="rf-priority-wrap"><span>MX / SRV 优先级</span>
      <input class="f" id="rf-priority" type="number" min="0" max="65535" value="${editing ? rec.priority || 0 : 10}">
    </label>
    ${isCF ? `
    <div class="switch-row">
      <div><div class="switch-t">代理状态</div><div class="switch-d">已代理时隐藏源站 IP 并启用 CDN；仅 DNS 时只做解析。</div></div>
      <label class="switch">
        <input type="checkbox" id="rf-proxied" ${rec?.proxied ? 'checked' : ''}>
        <span class="sl"></span><span class="sv">${I.cloudOn}</span>
      </label>
    </div>` : ''}
    <div id="rf-alert"></div>
    <div class="modal-foot">
      <button class="btn outline" id="rf-cancel">取消</button>
      <button class="btn" id="rf-ok">${editing ? '保存' : '添加记录'}</button>
    </div>`, { wide: true });

  const typeEl = $('#rf-type', m);
  const syncType = () => {
    const t = typeEl.value;
    $('#rf-content-label', m).textContent = CONTENT_LABEL[t] || '内容';
    $('#rf-content', m).placeholder = t === 'A' ? '例如 1.2.3.4'
      : t === 'AAAA' ? '例如 2400:320::1'
        : t === 'CNAME' ? '例如 target.example.com'
          : t === 'TXT' ? '例如 v=spf1 -all' : '';
    const needPrio = t === 'MX' || t === 'SRV';
    $('#rf-priority-wrap', m).hidden = !needPrio;
    if (isCF) $('#rf-proxied', m).closest('.switch-row').hidden = !['A', 'AAAA', 'CNAME'].includes(t);
  };
  typeEl.onchange = syncType;
  syncType();

  $('#rf-cancel', m).onclick = () => m.remove();
  $('#rf-ok', m).onclick = async () => {
    const okBtn = $('#rf-ok', m);
    okBtn.disabled = true;
    const body = {
      type: typeEl.value,
      label: $('#rf-label', m).value.trim(),
      content: $('#rf-content', m).value.trim(),
      ttl: +$('#rf-ttl', m).value,
      priority: $('#rf-priority', m).value === '' ? 0 : +$('#rf-priority', m).value,
      proxied: $('#rf-proxied', m)?.checked || false,
    };
    try {
      if (editing) await api(`/domains/${sub.id}/records/${rec.id}`, { method: 'PUT', body });
      else await api(`/domains/${sub.id}/records`, { method: 'POST', body });
      m.remove();
      toast(editing ? '记录已更新' : '记录已添加', 'ok');
      refresh();
    } catch (e) {
      okBtn.disabled = false;
      $('#rf-alert', m).innerHTML = `<div class="alert err">${esc(e.message)}</div>`;
    }
  };
  $('#rf-label', m).focus();
}

// ================= 页面：充值 =================
async function rechargeView(el, notice) {
  const [cfg, orders] = await Promise.all([api('/pay/config'), api('/pay/orders')]);
  const u = (await api('/auth/me')).user;
  state.user = u;
  el.innerHTML = shellHTML('充值积分', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>充值积分</h1>
        <p class="cf-sub">1 元 = ${cfg.credit_rate} 积分，最低充值 ${cfg.min_recharge} 元。充值后积分实时到账。</p>
      </div>
    </div>
    ${notice ? `<div class="alert ok">订单 ${esc(notice)} 支付成功，积分已到账！</div>` : ''}
    ${cfg.epay_ready
      ? `<div class="alert info">已接入易支付，支持支付宝 / 微信 / QQ 支付。</div>`
      : `<div class="alert info">当前为<b>沙盒演示模式</b>（未配置易支付），支付走站内模拟收银台。在管理后台 → 系统设置填入易支付网关、商户 ID 与密钥后自动切换为真实支付。</div>`}
    <div class="grid grid-2">
      <div class="card">
        <h3>充值金额</h3>
        <label class="f"><span>金额（元）</span><input class="f" id="rc-money" type="number" min="${cfg.min_recharge}" step="0.01" value="10"></label>
        <label class="f"><span>支付方式</span>
        <div class="btn-row" id="rc-types">
          <button class="btn outline" data-t="alipay">支付宝</button>
          <button class="btn outline" data-t="wxpay">微信支付</button>
          <button class="btn outline" data-t="qqpay">QQ 钱包</button>
        </div></label>
        <div class="flex-between" style="margin:10px 0">
          <span class="muted">可获得积分</span><b style="font-size:22px" id="rc-credits">100</b>
        </div>
        <button class="btn lg" style="width:100%" id="rc-go">立即充值</button>
      </div>
      <div class="card">
        <h3>充值记录</h3>
        ${orders.orders.length ? orders.orders.map(o => `
          <div class="rec-row" style="padding:10px 0">
            <div class="rec-body">
              <div class="rec-name small mono">${esc(o.out_trade_no)}</div>
              <div class="rec-content">¥${o.money.toFixed(2)} → ${o.credits} 积分 · ${fmtDate(o.created_at)}</div>
            </div>
            <span class="badge ${o.status === 'paid' ? 'green' : 'gray'}">${o.status === 'paid' ? '已到账' : '待支付'}</span>
          </div>`).join('') : emptyBox('暂无充值记录')}
      </div>
    </div>
  `);
  bindShell();

  let payType = 'alipay';
  const moneyEl = $('#rc-money'), creditsEl = $('#rc-credits');
  const upd = () => creditsEl.textContent = Math.max(0, Math.floor((+moneyEl.value || 0) * cfg.credit_rate));
  moneyEl.oninput = upd;
  const typeBtns = $$('#rc-types button');
  typeBtns.forEach(b => b.onclick = () => {
    payType = b.dataset.t;
    typeBtns.forEach(x => x.classList.toggle('sel', x === b));
  });
  typeBtns[0]?.classList.add('sel');
  upd();
  $('#rc-go').onclick = async () => {
    try {
      const r = await api('/pay/create', { method: 'POST', body: { money: +moneyEl.value, pay_type: payType } });
      if (r.mode === 'epay') {
        document.body.insertAdjacentHTML('beforeend', r.submit_html);
        document.getElementById('epayform').submit();
      } else {
        location.href = r.cash_url; // 沙盒收银台（服务端页面）
      }
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ================= 页面：签到 =================
async function checkinView(el) {
  const [me, cal] = await Promise.all([api('/auth/me'), api('/auth/checkin/calendar')]);
  state.user = me.user;
  const u = me.user;
  const today = todayStr();
  const checked = u.last_checkin_date === today;
  el.innerHTML = shellHTML('每日签到', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>每日签到</h1>
        <p class="cf-sub">坚持签到可获得更多积分：连续签到时间越长，每日奖励越高。</p>
      </div>
    </div>
    <div class="card checkin-hero">
      <div class="streak-flame">${I.flame}连续签到 ${u.streak || 0} 天</div>
      <div class="big big-ico ${checked ? 'ok' : 'todo'}">${checked ? I.check : I.gift}</div>
      ${checked
        ? `<div class="muted">今天已经签到过了，明天再来</div>`
        : `<button class="btn orange lg" id="ck-btn">立即签到</button>`}
      <div class="muted small" style="margin-top:10px">签到奖励 = 基础 ${esc(state.site.checkin_base)} 积分 + 连续奖励（每日 +1，上限 ${esc(state.site.checkin_bonus_max)}）</div>
    </div>
    <div class="card">
      <h3>最近 30 天签到记录</h3>
      <div class="grid grid-2">
        ${cal.days.length ? cal.days.map(d => `
          <div class="rec-row" style="padding:10px 0;border:none;border-bottom:1px solid var(--border)">
            <div class="rec-body"><div class="rec-name">${esc(d.date)}</div></div>
            <span class="badge green">+${d.credits} · 连${d.streak}天</span>
          </div>`).join('') : emptyBox('还没有签到记录')}
      </div>
    </div>
  `);
  bindShell();
  $('#ck-btn')?.addEventListener('click', async () => {
    try {
      const r = await api('/auth/checkin', { method: 'POST' });
      toast(`签到成功，获得 ${r.gain} 积分（连续 ${r.streak} 天）`, 'ok');
      checkinView(el);
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ================= 页面：积分日志 =================
async function creditsView(el) {
  const data = await api('/auth/credits/logs');
  const me = (await api('/auth/me')).user;
  state.user = me;
  el.innerHTML = shellHTML('积分日志', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>积分日志</h1>
        <p class="cf-sub">当前余额 <b>${me.credits}</b> 积分，下面是最近 50 条变动。</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>时间</th><th>变动</th><th>余额</th><th>说明</th></tr></thead>
        <tbody>${data.logs.map(l => `
          <tr>
            <td class="muted">${esc(l.created_at)}</td>
            <td><b style="color:${l.delta > 0 ? 'var(--green)' : 'var(--red)'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></td>
            <td>${l.balance}</td>
            <td>${esc(l.reason)}</td>
          </tr>`).join('') || `<tr><td colspan="4">${emptyBox('暂无记录')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `);
  bindShell();
}

// ================= 页面：管理后台 =================
async function adminView(el, tab = 'overview') {
  const tabs = [
    ['overview', '概览'], ['providers', 'DNS 服务商'], ['zones', '主域名'],
    ['subdomains', '已售域名'], ['users', '用户'], ['orders', '订单'],
    ['mail', '邮件与到期'], ['settings', '系统设置'],
  ];
  el.innerHTML = shellHTML('管理后台', `
    <div class="cf-head">
      <div class="cf-head-main">
        <h1>管理后台</h1>
        <p class="cf-sub">服务商凭据、主域名与售价、用户和订单都在这里配置。</p>
      </div>
    </div>
    <div class="cf-tabs">
      ${tabs.map(([k, label]) => `<button class="${tab === k ? 'act' : ''}" data-tab="${k}">${label}</button>`).join('')}
    </div>
    <div id="admin-body"><div class="empty">加载中...</div></div>
  `);
  bindShell();
  $$('button[data-tab]', el).forEach(b => b.onclick = () => go('#/admin/' + b.dataset.tab));
  const body = $('#admin-body', el);
  try {
    if (tab === 'overview') await adminOverview(body);
    else if (tab === 'providers') await adminProviders(body);
    else if (tab === 'zones') await adminZones(body);
    else if (tab === 'subdomains') await adminSubs(body);
    else if (tab === 'users') await adminUsers(body);
    else if (tab === 'orders') await adminOrders(body);
    else if (tab === 'mail') await adminMail(body);
    else if (tab === 'settings') await adminSettings(body);
  } catch (e) {
    body.innerHTML = `<div class="alert err">${esc(e.message)}</div>`;
  }
}

async function adminOverview(el) {
  const s = await api('/admin/stats');
  el.innerHTML = `
    <div class="grid grid-4">
      <div class="card stat"><div class="num">${s.users}</div><div class="lbl">用户数</div></div>
      <div class="card stat"><div class="num">${s.subs}</div><div class="lbl">已售域名</div></div>
      <div class="card stat"><div class="num">${s.records}</div><div class="lbl">DNS 记录</div></div>
      <div class="card stat"><div class="num">¥${(+s.paid_sum).toFixed(2)}</div><div class="lbl">充值总额</div></div>
    </div>
    <div class="grid grid-3" style="margin-top:14px">
      <div class="card stat"><div class="num">${s.zones}</div><div class="lbl">主域名</div></div>
      <div class="card stat"><div class="num">${s.today_checkins}</div><div class="lbl">今日签到人数</div></div>
    </div>`;
}

const PROVIDER_LABELS = { cloudflare: 'Cloudflare', dnspod: '腾讯云 DNSPod', aliyun: '阿里云 DNS', mock: '内置演示(本地)' };

async function adminProviders(el) {
  const data = await api('/admin/providers');
  const cfgSummary = p => {
    let cfg = {};
    try { cfg = JSON.parse(p.config || '{}'); } catch {}
    const fields = p.fields || [];
    if (!fields.length) return '<span class="muted small">无需凭据，记录保存在服务器本地</span>';
    return fields.map(f => {
      const v = cfg[f.key];
      return `<span class="kbd-pill" style="margin:0 6px 6px 0;display:inline-block">${esc(f.label)}: ${v ? esc(String(v)) : '<span style="color:var(--muted)">未填写</span>'}</span>`;
    }).join('');
  };
  el.innerHTML = `
    <div class="flex-between" style="margin-bottom:14px">
      <p class="muted mb0">配置上游 DNS 服务商 API 凭据，主域名绑定服务商后即可同步解析记录。</p>
      <button class="btn" id="ap-add">${I.plus} 添加服务商</button>
    </div>
    <div class="grid grid-2">
      ${data.providers.map(p => `
        <div class="card">
          <div class="flex-between">
            <div><b>${esc(p.name)}</b> <span class="badge gray">${esc(p.label || p.type)}</span></div>
            <div class="btn-row">
              <button class="btn sm outline" data-test="${p.id}">测试连接</button>
              <button class="btn sm outline" data-editp="${p.id}">编辑</button>
              <button class="btn sm danger-outline" data-delp="${p.id}">删除</button>
            </div>
          </div>
          <div style="margin-top:10px">${cfgSummary(p)}</div>
          <div id="test-${p.id}" style="margin-top:8px"></div>
        </div>`).join('') || `<div class="card">${emptyBox('还没有服务商')}</div>`}
    </div>`;

  $('#ap-add').onclick = () => providerDialog(null, () => adminProviders(el));
  $$('button[data-test]', el).forEach(b => b.onclick = async () => {
    $('#test-' + b.dataset.test).innerHTML = `<span class="muted small">测试中...</span>`;
    const r = await api(`/admin/providers/${b.dataset.test}/test`, { method: 'POST' });
    $('#test-' + b.dataset.test).innerHTML = `<span class="badge ${r.ok ? 'green' : 'red'}">${esc(r.message)}</span>`;
  });
  $$('button[data-editp]', el).forEach(b => b.onclick = () => {
    providerDialog(data.providers.find(p => String(p.id) === b.dataset.editp), () => adminProviders(el));
  });
  $$('button[data-delp]', el).forEach(b => b.onclick = async () => {
    if (!await confirmModal('删除服务商', '确定删除该 DNS 服务商？')) return;
    try { await api('/admin/providers/' + b.dataset.delp, { method: 'DELETE' }); adminProviders(el); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function providerDialog(p, refresh) {
  const type = p?.type || 'cloudflare';
  const m = modal(`
    <h2>${p ? '编辑' : '添加'} DNS 服务商</h2>
    <label class="f"><span>类型</span>
      <select class="f" id="pv-type" ${p ? 'disabled' : ''}>
        ${Object.entries(PROVIDER_LABELS).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </label>
    <label class="f"><span>名称</span><input class="f" id="pv-name" value="${esc(p?.name || '')}" placeholder="如：我的 Cloudflare"></label>
    <div id="pv-fields"></div>
    <div class="modal-foot">
      <button class="btn outline" id="pv-cancel">取消</button>
      <button class="btn" id="pv-ok">保存</button>
    </div>`);
  const renderFields = () => {
    const t = $('#pv-type', m).value;
    const fields = {
      cloudflare: [['token', 'API Token', true]],
      dnspod: [['secretId', 'SecretId'], ['secretKey', 'SecretKey', true]],
      aliyun: [['accessKeyId', 'AccessKeyId'], ['accessKeySecret', 'AccessKeySecret', true]],
      mock: [],
    }[t] || [];
    const cfg = p?.type === t ? JSON.parse(p.config || '{}') : {};
    $('#pv-fields', m).innerHTML = fields.map(([k, label, secret]) =>
      `<label class="f"><span>${label}</span><input class="f" id="pv-${k}" type="${secret ? 'password' : 'text'}" value="${esc(cfg[k] || '')}"></label>`
    ).join('') || '<div class="alert info">内置演示模式无需配置，记录保存在服务器本地。</div>';
  };
  $('#pv-type', m).onchange = renderFields;
  renderFields();
  $('#pv-cancel', m).onclick = () => m.remove();
  $('#pv-ok', m).onclick = async () => {
    const t = $('#pv-type', m).value;
    const fieldKeys = { cloudflare: ['token'], dnspod: ['secretId', 'secretKey'], aliyun: ['accessKeyId', 'accessKeySecret'], mock: [] }[t];
    const config = {};
    for (const k of fieldKeys) config[k] = $(`#pv-${k}`, m)?.value || '';
    try {
      if (p) await api(`/admin/providers/${p.id}`, { method: 'PUT', body: { name: $('#pv-name', m).value, config: JSON.stringify(config) } });
      else await api('/admin/providers', { method: 'POST', body: { type: t, name: $('#pv-name', m).value, config } });
      m.remove(); toast('已保存', 'ok'); refresh();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function adminZones(el) {
  const [data, provs] = await Promise.all([api('/admin/zones'), api('/admin/providers')]);
  el.innerHTML = `
    <div class="flex-between" style="margin-bottom:14px">
      <p class="muted mb0">主域名是可分发的根域名，用户购买的是其下的子域名。</p>
      <button class="btn" id="az-add" ${provs.providers.length ? '' : 'disabled'}>${I.plus} 添加主域名</button>
    </div>
    ${provs.providers.length ? '' : '<div class="alert err">请先在「DNS 服务商」中添加至少一个服务商。</div>'}
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>域名</th><th>服务商</th><th>价格/年</th><th>记录上限</th><th>限持</th><th>已售</th><th>状态</th><th></th></tr></thead>
        <tbody>
          ${data.zones.map(z => `
          <tr>
            <td class="mono" style="font-weight:700">${esc(z.name)}</td>
            <td>${esc(z.provider_name)}</td>
            <td>${z.price} 积分</td>
            <td>${z.max_records}</td>
            <td>${z.max_per_user}</td>
            <td>${z.sold_count}</td>
            <td><span class="badge ${z.enabled ? 'green' : 'gray'}">${z.enabled ? '上架' : '下架'}</span></td>
            <td style="text-align:right">
              <button class="icon-btn" data-editz="${z.id}">${I.edit}</button>
            </td>
          </tr>`).join('') || `<tr><td colspan="8">${emptyBox('暂无主域名')}</td></tr>`}
        </tbody>
      </table>
    </div>`;
  $('#az-add').onclick = () => zoneDialog(null, provs.providers, () => adminZones(el));
  $$('button[data-editz]', el).forEach(b => b.onclick = () => {
    zoneDialog(data.zones.find(z => String(z.id) === b.dataset.editz), provs.providers, () => adminZones(el));
  });
}

function zoneDialog(z, providers, refresh) {
  const m = modal(`
    <h2>${z ? '编辑' : '添加'}主域名</h2>
    <label class="f"><span>根域名</span><input class="f" id="zn-name" placeholder="example.com" value="${esc(z?.name || '')}"></label>
    <label class="f"><span>DNS 服务商</span>
      <select class="f" id="zn-provider">${providers.map(p => `<option value="${p.id}" ${z?.provider_id === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.type)})</option>`).join('')}</select>
    </label>
    <div class="grid grid-3">
      <label class="f"><span>积分/年</span><input class="f" id="zn-price" type="number" min="0" value="${z?.price ?? 10}"></label>
      <label class="f"><span>记录上限</span><input class="f" id="zn-maxrec" type="number" min="1" value="${z?.max_records ?? 10}"></label>
      <label class="f"><span>每人限持</span><input class="f" id="zn-maxuser" type="number" min="1" value="${z?.max_per_user ?? 5}"></label>
    </div>
    <label class="f"><span>备注</span><input class="f" id="zn-note" value="${esc(z?.note || '')}"></label>
    ${z ? `<label class="f" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="zn-enabled" ${z.enabled ? 'checked' : ''}><span style="margin:0">上架销售</span></label>` : ''}
    <div class="modal-foot">
      <button class="btn outline" id="zn-cancel">取消</button>
      <button class="btn" id="zn-ok">保存</button>
    </div>`);
  $('#zn-cancel', m).onclick = () => m.remove();
  $('#zn-ok', m).onclick = async () => {
    const body = {
      name: $('#zn-name', m).value.trim().toLowerCase(),
      provider_id: +$('#zn-provider', m).value,
      price: +$('#zn-price', m).value,
      max_records: +$('#zn-maxrec', m).value,
      max_per_user: +$('#zn-maxuser', m).value,
      note: $('#zn-note', m).value,
      enabled: $('#zn-enabled', m)?.checked,
    };
    try {
      if (z) await api('/admin/zones/' + z.id, { method: 'PUT', body });
      else await api('/admin/zones', { method: 'POST', body });
      m.remove(); toast('已保存', 'ok'); refresh();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function adminSubs(el) {
  const data = await api('/admin/subdomains');
  const STATUS = { active: ['green', '使用中'], expired: ['amber', '到期暂停'], recycled: ['red', '已删除'] };
  el.innerHTML = `
    <p class="muted">所有已售出的子域名（最近 200 条）。到期状态由 cron.php 每天推进：提醒 → 暂停 → 宽限期后删除。</p>
    <div class="cf-table">
      <div class="cf-tr cf-th"><span>域名</span><span class="cf-cell">用户</span><span class="cf-cell">状态</span><span class="cf-cell">到期</span><span class="cf-cell">提醒阶段</span><span class="cf-cell">注册时间</span></div>
      ${data.subdomains.map(s => `<div class="cf-tr">
        <span class="cf-dom mono">${esc(s.full_name)}</span>
        <span class="cf-cell">${esc(s.username)}</span>
        <span class="cf-cell"><span class="badge ${(STATUS[s.status] || ['gray', s.status])[0]}">${(STATUS[s.status] || [null, s.status])[1] || s.status}</span></span>
        <span class="cf-cell">${esc(String(s.expires_at).slice(0, 10))}</span>
        <span class="cf-cell">${esc(remindLabel(s.remind_stage))}</span>
        <span class="cf-cell">${esc(String(s.created_at).slice(0, 10))}</span>
      </div>`).join('') || `<div class="cf-tr" style="display:block">${emptyBox('暂无数据')}</div>`}
    </div>`;
}

async function adminUsers(el) {
  const data = await api('/admin/users');
  el.innerHTML = `
    <p class="muted">用户管理：调整积分、设为管理员、重置密码。</p>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>积分</th><th>域名</th><th>角色</th><th>注册时间</th><th></th></tr></thead>
        <tbody>${data.users.map(u => `
          <tr>
            <td>${u.id}</td>
            <td style="font-weight:600">${esc(u.username)}</td>
            <td class="muted small">${esc(u.email)}</td>
            <td><b>${u.credits}</b></td>
            <td>${u.sub_count}</td>
            <td>${u.is_admin ? '<span class="badge blue">管理员</span>' : '<span class="badge gray">用户</span>'}</td>
            <td class="muted small">${esc(u.created_at.slice(0, 10))}</td>
            <td style="text-align:right"><button class="icon-btn" data-user="${u.id}" data-name="${esc(u.username)}">${I.dots}</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  $$('button[data-user]', el).forEach(b => b.onclick = () => {
    const uid = b.dataset.user;
    popupMenu([
      {
        label: '调整积分', icon: I.wallet, onClick: () => {
          const m = modal(`
            <h2>调整积分</h2>
            <label class="f"><span>变动值（正数增加，负数扣除）</span><input class="f" id="cu-delta" type="number" value="10"></label>
            <div class="modal-foot">
              <button class="btn outline" id="cu-c">取消</button>
              <button class="btn" id="cu-ok">确认</button>
            </div>`);
          $('#cu-c', m).onclick = () => m.remove();
          $('#cu-ok', m).onclick = async () => {
            try {
              await api(`/admin/users/${uid}/credits`, { method: 'PUT', body: { delta: +$('#cu-delta', m).value } });
              m.remove(); toast('已调整', 'ok'); adminUsers(el);
            } catch (e) { toast(e.message, 'err'); }
          };
        },
      },
      {
        label: '切换管理员', icon: I.shield, onClick: async () => {
          await api(`/admin/users/${uid}/admin`, { method: 'PUT', body: { is_admin: b.closest('tr').querySelector('.badge.blue') ? false : true } });
          toast('已更新', 'ok'); adminUsers(el);
        },
      },
      {
        label: '重置密码', icon: I.edit, onClick: () => {
          const m = modal(`
            <h2>重置密码</h2>
            <label class="f"><span>新密码（至少 6 位）</span><input class="f" id="cu-pw" type="password"></label>
            <div class="modal-foot">
              <button class="btn outline" id="cu-c2">取消</button>
              <button class="btn" id="cu-ok2">确认</button>
            </div>`);
          $('#cu-c2', m).onclick = () => m.remove();
          $('#cu-ok2', m).onclick = async () => {
            try {
              await api(`/admin/users/${uid}/password`, { method: 'PUT', body: { password: $('#cu-pw', m).value } });
              m.remove(); toast('密码已重置', 'ok');
            } catch (e) { toast(e.message, 'err'); }
          };
        },
      },
    ], b);
  });
}

async function adminOrders(el) {
  const data = await api('/admin/orders');
  el.innerHTML = `
    <p class="muted">充值订单（最近 200 条）。</p>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>订单号</th><th>用户</th><th>金额</th><th>积分</th><th>方式</th><th>状态</th><th>时间</th></tr></thead>
        <tbody>${data.orders.map(o => `
          <tr>
            <td class="mono small">${esc(o.out_trade_no)}</td>
            <td>${esc(o.username)}</td>
            <td>¥${(+o.money).toFixed(2)}</td>
            <td>+${o.credits}</td>
            <td>${{ alipay: '支付宝', wxpay: '微信', qqpay: 'QQ' }[o.pay_type] || o.pay_type}</td>
            <td><span class="badge ${o.status === 'paid' ? 'green' : o.status === 'pending' ? 'amber' : 'gray'}">${{ paid: '已支付', pending: '待支付', closed: '已关闭' }[o.status]}</span></td>
            <td class="muted small">${esc(o.created_at)}</td>
          </tr>`).join('') || `<tr><td colspan="7">${emptyBox('暂无订单')}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ---------- 后台：邮件与到期 ----------
function sw(id, label, desc, on) {
  return `<div class="switch-row">
    <div><div class="switch-t">${label}</div><div class="switch-d">${desc}</div></div>
    <label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="sl"></span></label>
  </div>`;
}

async function adminMail(el) {
  const [cfgData, logData, expData] = await Promise.all([api('/admin/settings'), api('/admin/mail/logs'), api('/admin/expiring')]);
  const s = cfgData.settings;
  const token = s.cron_token || '';
  const cronUrl = new URL('cron.php', location.href).href;

  el.innerHTML = `
    <div class="card">
      <h3>SMTP 发件配置</h3>
      ${sw('mt-mail_enabled', '开启邮件服务', '关闭后所有邮件只写入日志、不发送；注册验证码与到期提醒都会随之停用。', s.mail_enabled === '1')}
      ${sw('mt-register_need_email', '注册需要邮箱验证码', '开启后注册必须填写邮箱收到的 6 位验证码。', s.register_need_email === '1')}
      <div class="grid grid-2" style="margin-top:14px">
        <label class="f"><span>SMTP 服务器</span><input class="f" id="st-smtp_host" placeholder="smtp.example.com" value="${esc(s.smtp_host)}"></label>
        <label class="f"><span>端口</span>
          <select class="f" id="st-smtp_port">
            ${['465', '587', '25'].map(p => `<option value="${p}" ${String(s.smtp_port) === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
          <div class="hint">465 为 SSL 直连，587 使用 STARTTLS。</div>
        </label>
        <label class="f"><span>加密方式</span>
          <select class="f" id="st-smtp_secure">
            ${[['ssl', 'SSL'], ['tls', 'STARTTLS'], ['none', '不加密']].map(([v, l]) => `<option value="${v}" ${s.smtp_secure === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="f"><span>站点地址（邮件里的链接前缀）</span><input class="f" id="st-site_url" placeholder="https://ns.example.com" value="${esc(s.site_url)}"></label>
        <label class="f"><span>账号</span><input class="f" id="st-smtp_user" value="${esc(s.smtp_user)}"></label>
        <label class="f"><span>密码 / 授权码</span><input class="f" id="st-smtp_pass" type="password" autocomplete="new-password" placeholder="${s.smtp_pass ? '已保存，留空则不修改' : ''}"></label>
        <label class="f"><span>发件邮箱</span><input class="f" id="st-smtp_from" placeholder="no-reply@example.com" value="${esc(s.smtp_from)}"></label>
        <label class="f"><span>发件人名称</span><input class="f" id="st-smtp_from_name" value="${esc(s.smtp_from_name)}"></label>
      </div>
      ${sw('mt-smtp_verify', '校验 SMTP 服务器证书', '关闭后不再校验 TLS 证书，仅用于内网或自签名证书的邮件服务器。', s.smtp_verify !== '0')}
      <div class="flex" style="gap:8px">
        <input class="f" id="mt-to" placeholder="收件测试邮箱" style="flex:1">
        <button class="btn outline" id="mt-test">发送测试邮件</button>
      </div>
      <div id="mt-result" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h3>到期提醒与自动删除</h3>
      ${sw('mt-expire_notify', '发送到期提醒邮件', '到期前 7、3、1 天各发一封，同一阶段只发一次。', s.expire_notify === '1')}
      ${sw('mt-expire_auto_delete', '宽限期后自动删除', '到期后解析暂停并进入宽限期，超期删除域名与全部解析记录。', s.expire_auto_delete === '1')}
      <label class="f" style="max-width:240px"><span>宽限期天数</span><input class="f" id="st-expire_grace_days" type="number" min="0" max="60" value="${esc(s.expire_grace_days)}"></label>
      <div class="flex" style="gap:8px;flex-wrap:wrap">
        <button class="btn outline" id="mt-run">${I.play} 立即执行一次到期检查</button>
        <span class="muted small">建议在计划任务里每天执行，手动执行不影响下次自动运行。</span>
      </div>
      <div id="mt-run-result" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h3>计划任务</h3>
      <p class="muted small">宝塔 → 计划任务 → 添加「Shell 脚本」，周期选每天一次，脚本内容：</p>
      <pre class="codeblock">${esc(`php ${cronUrl} >/dev/null 2>&1`)}</pre>
      <p class="muted small">无法登录服务器执行 PHP 时，可用带密钥的 URL（外部访问计划任务）：</p>
      <pre class="codeblock">${esc(`${cronUrl}?token=${token || '尚未生成'}`)}</pre>
      <div class="flex" style="gap:8px;flex-wrap:wrap">
        <button class="btn outline sm" id="mt-token">${token ? '重新生成密钥' : '生成访问密钥'}</button>
        <button class="btn outline sm" id="mt-copy-cron">${I.copy} 复制 URL</button>
        <span class="muted small">留空密钥时，cron.php 仅允许在服务器本机命令行执行。</span>
      </div>
    </div>

    <div class="card">
      <h3>14 天内到期</h3>
      <div class="cf-table">
        <div class="cf-tr cf-th"><span>域名</span><span class="cf-cell">用户</span><span class="cf-cell">到期</span><span class="cf-cell">剩余</span><span class="cf-cell">提醒阶段</span></div>
        ${expData.subdomains.map(x => `<div class="cf-tr">
          <span class="cf-dom mono">${esc(x.full_name)}</span>
          <span class="cf-cell">${esc(x.username)}</span>
          <span class="cf-cell">${esc(String(x.expires_at).slice(0, 10))}</span>
          <span class="cf-cell">${x.days_left < 0 ? `<b style="color:var(--red)">已过期 ${-x.days_left} 天</b>` : x.days_left + ' 天'}</span>
          <span class="cf-cell">${esc(remindLabel(x.remind_stage))}</span>
        </div>`).join('') || `<div class="cf-tr" style="display:block">${emptyBox('14 天内没有到期的域名')}</div>`}
      </div>
    </div>

    <div class="card">
      <h3>最近 50 封邮件</h3>
      <div class="cf-table">
        <div class="cf-tr cf-th"><span>收件人</span><span class="cf-cell">主题</span><span class="cf-cell">状态</span><span class="cf-cell">时间</span></div>
        ${logData.logs.map(l => `<div class="cf-tr">
          <span class="cf-dom">${esc(l.recipient)}</span>
          <span class="cf-cell">${esc(l.subject)}</span>
          <span class="cf-cell">${l.status === 'sent' ? '<span class="badge green">已发送</span>' : `<span class="badge red" title="${esc(l.error || '')}">失败</span>`}</span>
          <span class="cf-cell">${esc(l.created_at)}</span>
        </div>`).join('') || `<div class="cf-tr" style="display:block">${emptyBox('还没有发送邮件')}</div>`}
      </div>
    </div>

    <button class="btn lg" id="mt-save">保存邮件与到期设置</button>`;

  $('#mt-save').onclick = async () => {
    const body = {
      mail_enabled: $('#mt-mail_enabled').checked ? '1' : '0',
      register_need_email: $('#mt-register_need_email').checked ? '1' : '0',
      smtp_verify: $('#mt-smtp_verify').checked ? '1' : '0',
      expire_notify: $('#mt-expire_notify').checked ? '1' : '0',
      expire_auto_delete: $('#mt-expire_auto_delete').checked ? '1' : '0',
      expire_grace_days: $('#st-expire_grace_days').value,
      smtp_host: $('#st-smtp_host').value.trim(),
      smtp_port: $('#st-smtp_port').value,
      smtp_secure: $('#st-smtp_secure').value,
      smtp_user: $('#st-smtp_user').value.trim(),
      smtp_from: $('#st-smtp_from').value.trim(),
      smtp_from_name: $('#st-smtp_from_name').value.trim(),
      site_url: $('#st-site_url').value.trim(),
    };
    const pw = $('#st-smtp_pass').value;
    if (pw) body.smtp_pass = pw;
    try {
      await api('/admin/settings', { method: 'PUT', body });
      state.site = (await api('/site')).site;
      toast('已保存', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  $('#mt-test').onclick = async () => {
    const btn = $('#mt-test');
    btn.disabled = true;
    $('#mt-result').innerHTML = '<span class="muted small">正在连接 SMTP 服务器…</span>';
    try {
      await api('/admin/mail/test', { method: 'POST', body: { to: $('#mt-to').value.trim() } });
      $('#mt-result').innerHTML = '<div class="alert ok">测试邮件已发出，请查收。配置可用，可以开启邮件服务。</div>';
    } catch (e) {
      $('#mt-result').innerHTML = `<div class="alert err">${esc(e.message)}</div>`;
    }
    btn.disabled = false;
  };

  $('#mt-run').onclick = async () => {
    const btn = $('#mt-run');
    btn.disabled = true;
    $('#mt-run-result').innerHTML = '<span class="muted small">执行中…</span>';
    try {
      const r = await api('/admin/expire/run', { method: 'POST' });
      $('#mt-run-result').innerHTML = r.log.length
        ? `<div class="alert info">${r.log.map(esc).join('<br>')}</div>`
        : '<div class="alert info">没有需要处理的域名。</div>';
    } catch (e) {
      $('#mt-run-result').innerHTML = `<div class="alert err">${esc(e.message)}</div>`;
    }
    btn.disabled = false;
  };

  $('#mt-token').onclick = async () => {
    await api('/admin/cron-token', { method: 'POST' });
    toast('密钥已生成', 'ok');
    adminMail(el);
  };
  $('#mt-copy-cron').onclick = () => copyText(cronUrl + '?token=' + token);
}

async function adminSettings(el) {
  const data = await api('/admin/settings');
  const s = data.settings;
  el.innerHTML = `
    <div class="card">
      <h3>基础设置</h3>
      <div class="grid grid-2">
        <label class="f"><span>站点名称</span><input class="f" id="st-site_name" value="${esc(s.site_name)}"></label>
        <label class="f"><span>站点副标题</span><input class="f" id="st-site_subtitle" value="${esc(s.site_subtitle)}"></label>
      </div>
      <label class="f"><span>购买须知</span><textarea class="f" id="st-buy_notice" rows="2">${esc(s.buy_notice)}</textarea></label>
    </div>
    <div class="card">
      <h3>积分规则</h3>
      <div class="grid grid-2">
        <label class="f"><span>1 元兑换积分</span><input class="f" id="st-credit_rate" type="number" value="${esc(s.credit_rate)}"><div class="hint">用户充值 1 元获得的积分数</div></label>
        <label class="f"><span>最低充值金额（元）</span><input class="f" id="st-min_recharge" type="number" value="${esc(s.min_recharge)}"></label>
        <label class="f"><span>注册赠送积分</span><input class="f" id="st-register_gift" type="number" value="${esc(s.register_gift)}"></label>
        <label class="f"><span>签到基础积分</span><input class="f" id="st-checkin_base" type="number" value="${esc(s.checkin_base)}"></label>
        <label class="f"><span>连续签到递增上限</span><input class="f" id="st-checkin_bonus_max" type="number" value="${esc(s.checkin_bonus_max)}"></label>
      </div>
    </div>
    <div class="card">
      <h3>易支付配置</h3>
      <div class="alert info">填入后立即启用真实支付（彩虹易支付协议）；留空则使用沙盒演示模式。</div>
      <label class="f"><span>支付网关地址</span><input class="f" id="st-epay_gateway" placeholder="https://pay.example.com" value="${esc(s.epay_gateway)}"></label>
      <div class="grid grid-2">
        <label class="f"><span>商户 PID</span><input class="f" id="st-epay_pid" value="${esc(s.epay_pid)}"></label>
        <label class="f"><span>商户密钥 KEY</span><input class="f" id="st-epay_key" value="${esc(s.epay_key)}"></label>
      </div>
    </div>
    <button class="btn lg" id="st-save">保存全部设置</button>`;

  $('#st-save').onclick = async () => {
    const keys = ['site_name', 'site_subtitle', 'buy_notice', 'credit_rate', 'min_recharge', 'register_gift', 'checkin_base', 'checkin_bonus_max', 'epay_gateway', 'epay_pid', 'epay_key'];
    const body = {};
    for (const k of keys) body[k] = $(`#st-${k}`).value;
    try {
      await api('/admin/settings', { method: 'PUT', body });
      state.site = (await api('/site')).site;
      toast('设置已保存', 'ok');
      render();
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ================= 路由 =================
function render() {
  $$('.menu').forEach(m => m.remove());
  const hash = location.hash || '#/';
  const [path, query] = hash.split('?');
  const parts = path.replace(/^#\/?/, '').split('/').filter(Boolean);
  const root = $('#root');

  if (parts[0] === 'login') return authView('login');
  if (parts[0] === 'register') return authView('register');
  if (parts[0] === 'forgot') return authView('forgot');

  if (!state.user) return authView('login');

  if (parts.length === 0) return dashboardView(root);
  if (parts[0] === 'market') return marketView(root);
  if (parts[0] === 'my') return myZonesView(root, decodeURIComponent(query || '').replace(/^q=/, ''));
  if (parts[0] === 'zone' && parts[1]) return parts[2] === 'dns' ? recordsView(root, parts[1]) : zoneOverviewView(root, parts[1]);
  if (parts[0] === 'recharge') return rechargeView(root, new URLSearchParams(query || '').get('paid'));
  if (parts[0] === 'checkin') return checkinView(root);
  if (parts[0] === 'credits') return creditsView(root);
  if (parts[0] === 'admin') return adminView(root, parts[1] || 'overview');

  return dashboardView(root);
}

boot();
