'use strict';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let token = sessionStorage.getItem('iduel_admin') || '';
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
  opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
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

async function load() {
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
    sessionStorage.setItem('iduel_admin', token);
    showApp(true);
    await load();
  } catch (e) {
    token = '';
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

if (token) login(); else showApp(false);
