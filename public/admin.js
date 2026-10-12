'use strict';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Telegram ichida ochilsa, kirish Telegram akkaunt orqali bo'ladi (parol shart emas)
const tg = window.Telegram && window.Telegram.WebApp;
const inTelegram = !!(tg && tg.initData);
if (inTelegram) { try { tg.ready(); tg.expand(); tg.setHeaderColor('#0d0e12'); tg.setBackgroundColor('#0d0e12'); } catch (_) { /* eski versiya */ } }

let token = inTelegram ? '' : (sessionStorage.getItem('iduel_admin') || '');
let lastError = '';
let data = { bloggers: [], battles: [], tournaments: [], categories: [] };

function note(text, ok) {
  const el = $('#note');
  el.textContent = text;
  el.className = 'toast ' + (ok ? 'ok' : 'err');
  el.hidden = false;
  clearTimeout(note.t);
  note.t = setTimeout(() => { el.hidden = true; }, 6000);
}

async function api(path, opts) {
  opts = opts || {};
  const auth = {};
  if (token) auth.Authorization = 'Bearer ' + token;
  if (inTelegram) auth['X-Telegram-Init-Data'] = tg.initData;
  opts.headers = Object.assign(auth, opts.headers || {});
  const res = await fetch(path, opts);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Xatolik yuz berdi');
  return out;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

function selectedTournamentIds() {
  return [...document.querySelectorAll('#tPicks input:checked')].map((x) => Number(x.value));
}
function updateCount() { $('#tCount').textContent = 'Tanlandi: ' + selectedTournamentIds().length; }

function statCard(title, rows) {
  return `<div class="stat-card"><h3>${esc(title)}</h3>${rows.map(([k, v]) => `<div class="stat-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
}

async function loadStats() {
  const s = await api('/api/admin/stats');
  $('#stats-cards').innerHTML =
    statCard('Bugun', [['Kirishlar', s.today.visits], ['Noyob tashrifchi', s.today.unique], ['Telegramdan', s.today.tgUnique], ['Ovozlar', s.today.votes], ['Ovoz berganlar', s.today.voters]]) +
    statCard('Oxirgi 7 kun', [['Kirishlar', s.week.visits], ['Noyob tashrifchi', s.week.unique], ['Ovozlar', s.week.votes], ['Ovoz berganlar', s.week.voters]]) +
    statCard('Umumiy', [['Blogerlar', s.totals.bloggers], ['Janglar', s.totals.battles], ['Faol janglar', s.totals.live], ['Chempionatlar', s.totals.tournaments]]);
  const maxV = Math.max(1, ...s.days.map((d) => d.visits));
  const maxO = Math.max(1, ...s.days.map((d) => d.votes));
  $('#stats-table').innerHTML = '<tr><th>Sana</th><th>Kirish</th><th>Noyob</th><th>Telegram</th><th>Ovoz</th><th>Muxlis</th></tr>' +
    s.days.slice().reverse().map((d) => `<tr><td>${esc(d.date.slice(5))}</td><td>${d.visits}<i class="bar"><u style="width:${Math.round(d.visits / maxV * 100)}%"></u></i></td><td>${d.unique}</td><td>${d.tgUnique}</td><td>${d.votes}<i class="bar v"><u style="width:${Math.round(d.votes / maxO * 100)}%"></u></i></td><td>${d.both}</td></tr>`).join('');
}

async function load() {
  loadStats().catch(() => {});
  data = await api('/api/admin/data');
  const opts = data.bloggers.map((b) => `<option value="${b.id}">${esc(b.name)} (@${esc(b.username)})</option>`).join('');
  $('#duelA').innerHTML = opts;
  $('#duelB').innerHTML = opts;
  if (data.bloggers.length > 1) $('#duelB').selectedIndex = 1;
  $('#bCat').innerHTML = data.categories.map((c) => `<option>${esc(c)}</option>`).join('');

  $('#tPicks').innerHTML = data.bloggers.map((b) => `<div class="pick"><input type="checkbox" id="tp${b.id}" value="${b.id}"><label for="tp${b.id}">${esc(b.name)}</label></div>`).join('') || '<div class="sub">Avval blogerlarni qo‘shing.</div>';
  updateCount();

  $('#tList').innerHTML = (data.tournaments || []).map((t) => `
    <div class="item">
      <div class="who"><b>${esc(t.title)}</b> <span>${t.size} bloger, ${t.status === 'running' ? 'davom etmoqda (' + t.round + '-raund)' : t.status === 'finished' ? 'tugagan' : 'xato'}</span></div>
      <button class="abtn danger sm" data-del-t="${t.id}" type="button">O‘chirish</button>
    </div>`).join('');

  $('#bloggers').innerHTML = data.bloggers.length ? data.bloggers.map((b) => `
    <div class="item">
      <div class="who"><b>${esc(b.name)}</b> <span>@${esc(b.username)}, ${esc(b.category)}</span></div>
      <button class="abtn danger sm" data-del-blogger="${b.id}" type="button">O‘chirish</button>
    </div>`).join('') : '<div class="sub">Hali bloger yo‘q.</div>';

  $('#battles').innerHTML = data.battles.length ? data.battles.map((b) => {
    const name = (x) => (x ? esc(x.name) : 'o‘chirilgan');
    return `<div class="item">
      <div class="who"><b>${name(b.a)} va ${name(b.b)}</b> <span>${b.status === 'live' ? 'davom etmoqda' : 'tugagan'}, ${b.votesA} : ${b.votesB}</span></div>
      <div class="actions">
        ${b.status === 'live' ? `<button class="abtn alt sm" data-finish="${b.id}" type="button">Hozir yakunlash</button>` : ''}
        ${b.status === 'finished' && b.winnerId ? `<button class="abtn alt sm" data-copy-card="${b.id}" type="button">G‘olib havolasi</button>` : ''}
        <button class="abtn danger sm" data-del-battle="${b.id}" type="button">O‘chirish</button>
      </div>
    </div>`;
  }).join('') : '<div class="sub">Hali jang yo‘q.</div>';
}

function showApp(logged) {
  $('#login').hidden = logged;
  $('#app').hidden = !logged;
}

async function login() {
  token = $('#pw').value || token;
  try {
    await api('/api/admin/check');
    if (token) sessionStorage.setItem('iduel_admin', token);
    showApp(true);
    await load();
  } catch (e) {
    token = '';
    lastError = e.message;
    sessionStorage.removeItem('iduel_admin');
    note(e.message, false);
    showApp(false);
  }
}

$('#loginBtn').addEventListener('click', login);
$('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('#tPicks').addEventListener('change', updateCount);

$('#createDuel').addEventListener('click', async () => {
  try {
    await api('/api/admin/battles', json('POST', { aId: $('#duelA').value, bId: $('#duelB').value, hours: $('#hours').value }));
    note('Jang boshlandi', true);
    await load();
  } catch (e) { note(e.message, false); }
});

$('#createT').addEventListener('click', async () => {
  try {
    await api('/api/admin/tournaments', json('POST', { title: $('#tTitle').value, bloggerIds: selectedTournamentIds(), hours: $('#tHours').value }));
    note('Chempionat boshlandi', true);
    await load();
  } catch (e) { note(e.message, false); }
});

$('#addBlogger').addEventListener('click', async () => {
  try {
    let avatar = $('#bAva').value.trim();
    const file = $('#bFile').files[0];
    if (file) {
      const up = await api('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      avatar = up.url;
    }
    await api('/api/admin/bloggers', json('POST', {
      name: $('#bName').value, username: $('#bUser').value, category: $('#bCat').value, followers: $('#bFol').value, avatar
    }));
    ['#bName', '#bUser', '#bFol', '#bAva', '#bFile'].forEach((s) => { $(s).value = ''; });
    note('Bloger qo‘shildi', true);
    await load();
  } catch (e) { note(e.message, false); }
});

$('#seed').addEventListener('click', async () => {
  try { await api('/api/admin/seed', json('POST')); note('Demo ma‘lumot qo‘shildi', true); await load(); }
  catch (e) { note(e.message, false); }
});

document.addEventListener('click', async (e) => {
  const t = e.target;
  try {
    if (t.dataset.copyCard) {
      const url = location.origin + '/app#natija-' + t.dataset.copyCard;
      try { await navigator.clipboard.writeText(url); note('Havola nusxalandi: ' + url, true); } catch (_) { window.prompt('Havolani nusxalang:', url); }
      return;
    }
    if (t.dataset.delBlogger) {
      if (!confirm('Bloggerni o‘chirasizmi?')) return;
      await api('/api/admin/bloggers/' + t.dataset.delBlogger, { method: 'DELETE' });
    } else if (t.dataset.delBattle) {
      if (!confirm('Jangni o‘chirasizmi? Natijalar reytingdan ham yo‘qoladi.')) return;
      await api('/api/admin/battles/' + t.dataset.delBattle, { method: 'DELETE' });
    } else if (t.dataset.delT) {
      if (!confirm('Chempionatni o‘chirasizmi? Janglar qoladi, lekin chempionatdan ajraladi.')) return;
      await api('/api/admin/tournaments/' + t.dataset.delT, { method: 'DELETE' });
    } else if (t.dataset.finish) {
      await api('/api/admin/battles/' + t.dataset.finish + '/finish', json('POST'));
    } else return;
    await load();
  } catch (err) { note(err.message, false); }
});

setInterval(() => { if ((token || inTelegram) && !$('#app').hidden) loadStats().catch(() => {}); }, 30000);
(async function init() {
  let cfg = {};
  try { cfg = await (await fetch('/api/config')).json(); } catch (_) { /* sozlama olinmasa parol formasi ko'rinadi */ }
  const msg = $('#login-msg');
  if (!cfg.adminPassword) { $('#login-fields').hidden = true; $('#loginBtn').hidden = true; }
  if (inTelegram) {
    msg.textContent = 'Telegram akkauntingiz tekshirilmoqda...';
    await login();
    if ($('#app').hidden) msg.textContent = lastError || 'Kirib bo‘lmadi.';
    return;
  }
  if (!cfg.adminPassword) { msg.textContent = 'Admin panel Telegram ichida ochiladi: botga /admin yuboring.'; showApp(false); return; }
  if (token) login(); else showApp(false);
})();
