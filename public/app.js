'use strict';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TABS = ['jang', 'liga', 'turnir', 'profil'];
const PILLS = { jang: 'Kun jangi, 1 va 1', liga: 'Hafta yakuni: yakshanba', turnir: '', profil: 'Anonim' };

const state = {
  tab: 'jang',
  live: [], recent: [], categories: [],
  idx: 0,
  ligaCat: '',
  round: null,
  tournament: null,
  msgs: {},
  jangJson: ''
};

/* ---------- Yordamchi ---------- */
const SILHOUETTE = '<circle cx="28" cy="20" r="9"/><path d="M10 48c2-10 9-15 18-15s16 5 18 15z"/>';
const SILHOUETTE_LINE = '<circle cx="28" cy="20" r="9"/><path d="M10 48c2-10 9-15 18-15s16 5 18 15"/>';

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

function timeLeft(endsAt) {
  const ms = Date.parse(endsAt) - Date.now();
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (d ? d + ' kun ' : '') + hh + ':' + mm + ':' + ss;
}

function bigPic(b) {
  if (b && b.avatar) {
    return `<img src="${esc(b.avatar)}" alt="${esc(b.name)}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
  }
  return `<svg viewBox="0 0 56 56" aria-hidden="true">${SILHOUETTE}</svg>`;
}

function face(b) {
  if (b && b.avatar) return `<span class="face"><img src="${esc(b.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  return `<span class="face"><svg viewBox="0 0 56 56" aria-hidden="true">${SILHOUETTE_LINE}</svg></span>`;
}

function igLink(b) {
  return `https://instagram.com/${encodeURIComponent(b.username)}`;
}

/* ---------- Mahalliy ovozlar tarixi (Profil uchun) ---------- */
function loadMine() {
  try { return JSON.parse(localStorage.getItem('iduel_mine') || '[]'); } catch (_) { return []; }
}
function saveMine(entry) {
  try {
    const list = loadMine().filter((x) => x.id !== entry.id);
    list.unshift(entry);
    localStorage.setItem('iduel_mine', JSON.stringify(list.slice(0, 50)));
  } catch (_) { /* brauzer saqlashga ruxsat bermasa, o'tkazib yuboramiz */ }
}

/* ---------- Jang ---------- */
function fighterHTML(b, key, battle) {
  let cls = 'fighter ' + key;
  if (battle.status === 'finished' && battle.winnerId) cls += battle.winnerId === b.id ? ' win' : ' lose';
  return `
  <div class="${cls}">
    <span class="mark" aria-hidden="true">${key.toUpperCase()}</span>
    <div class="pic">${bigPic(b)}</div>
    <div class="nm"><b>${esc(b.name)}</b><a href="${igLink(b)}" target="_blank" rel="noopener noreferrer">@${esc(b.username)}</a></div>
    <span class="tag">${esc(b.category)}</span>
  </div>`;
}

function duelHTML(b) {
  const pctB = 100 - b.pctA;
  const voted = !!b.myVote;
  const msg = state.msgs[b.id];
  const btn = (key) => {
    const picked = b.myVote === key;
    const text = picked ? `Tanlandi: ${key.toUpperCase()}` : `${key.toUpperCase()} uchun ovoz`;
    return `<button type="button" class="v${key}${picked ? ' picked' : ''}" data-vote="${key}" data-id="${b.id}"${voted ? ' disabled' : ''}>${text}</button>`;
  };
  let noteHTML;
  if (msg && msg.err) noteHTML = `<div class="note err" role="status">${esc(msg.text)}</div>`;
  else if (voted) noteHTML = `<div class="note ok" role="status"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>Ovozingiz qabul qilindi. Rahmat!</div>`;
  else noteHTML = `<div class="note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4L3 11l6 2 2 6 3-4 5 3z"/></svg>Har bir duelda bitta ovoz beriladi. Tanlovni o‘zgartirib bo‘lmaydi.</div>`;

  const pager = state.live.length > 1 ? `
    <div class="pager">
      <button type="button" data-page="-1" aria-label="Oldingi jang"${state.idx === 0 ? ' disabled' : ''}>&#8249;</button>
      <span>Jang ${state.idx + 1} / ${state.live.length}</span>
      <button type="button" data-page="1" aria-label="Keyingi jang"${state.idx === state.live.length - 1 ? ' disabled' : ''}>&#8250;</button>
    </div>` : '';

  return `
  <div class="live-head">
    <span class="live-label"><span class="live-dot"></span>Jonli, jang tugashiga</span>
    <span class="timer" id="timer" data-end="${esc(b.endsAt)}">${timeLeft(b.endsAt)}</span>
  </div>
  ${pager}
  <div class="fighters">
    ${fighterHTML(b.a, 'a', b)}
    ${fighterHTML(b.b, 'b', b)}
    <div class="vs" aria-hidden="true">VS</div>
  </div>
  <div class="share">
    <div class="share-bar" role="img" aria-label="${esc(b.a.name)} ${b.pctA}%, ${esc(b.b.name)} ${pctB}%"><div class="share-a" style="width:${b.pctA}%"></div><div class="share-b"></div></div>
    <div class="share-nums"><span class="a">${b.pctA}%</span><span class="mid">${b.total ? b.total + ' ovoz' : 'Ovozlar taqsimoti'}</span><span class="b">${pctB}%</span></div>
  </div>
  <div class="votes">${btn('a')}${btn('b')}</div>
  ${noteHTML}`;
}

function resultHTML(b) {
  const pctB = 100 - b.pctA;
  const label = !b.winnerId ? 'Durang' : (b.winnerId === b.a.id ? b.a.name : b.b.name) + ' g‘olib bo‘ldi';
  return `
  <div class="live-head">
    <span class="live-label">Oxirgi natija</span>
    <span class="screen-sub" style="font-weight:800;color:var(--text)">${esc(label)}</span>
  </div>
  <div class="fighters">
    ${fighterHTML(b.a, 'a', b)}
    ${fighterHTML(b.b, 'b', b)}
    <div class="vs" aria-hidden="true">VS</div>
  </div>
  <div class="share">
    <div class="share-bar"><div class="share-a" style="width:${b.pctA}%"></div><div class="share-b"></div></div>
    <div class="share-nums"><span class="a">${b.pctA}%</span><span class="mid">${b.total} ovoz</span><span class="b">${pctB}%</span></div>
  </div>`;
}

function renderJang(force) {
  const valid = state.live.filter((b) => b.a && b.b);
  if (state.idx >= valid.length) state.idx = Math.max(0, valid.length - 1);
  const cur = valid[state.idx];
  const lastDone = state.recent.find((b) => b.a && b.b);
  const key = JSON.stringify([cur, valid.length, state.idx, state.msgs, !cur && lastDone ? lastDone.id : 0]);
  if (!force && key === state.jangJson) return;
  state.jangJson = key;
  const box = $('#screen-jang');
  if (cur) { box.innerHTML = duelHTML(cur); return; }
  box.innerHTML = `<div class="empty"><b>Hozir faol jang yo‘q</b>Yangi jang tez orada boshlanadi.</div>` + (lastDone ? resultHTML(lastDone) : '');
}

function tickTimer() {
  const el = $('#timer');
  if (!el) return;
  el.textContent = timeLeft(el.dataset.end);
  if (Date.parse(el.dataset.end) <= Date.now()) refresh();
}

document.addEventListener('click', async (e) => {
  const page = e.target.closest('[data-page]');
  if (page) {
    state.idx = Math.max(0, Math.min(state.live.length - 1, state.idx + Number(page.dataset.page)));
    renderJang(true);
    return;
  }
  const btn = e.target.closest('[data-vote]');
  if (btn) {
    const id = Number(btn.dataset.id);
    btn.disabled = true;
    try {
      const { battle } = await api(`/api/battles/${id}/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ side: btn.dataset.vote })
      });
      const i = state.live.findIndex((x) => x.id === id);
      if (i >= 0) state.live[i] = battle;
      delete state.msgs[id];
      const chosen = btn.dataset.vote === 'a' ? battle.a : battle.b;
      saveMine({ id, a: battle.a.name, b: battle.b.name, pick: chosen.name, ts: Date.now() });
    } catch (err) {
      state.msgs[id] = { text: err.message, err: true };
      await refresh();
    }
    renderJang(true);
    return;
  }
  const go = e.target.closest('[data-go-battle]');
  if (go) {
    const i = state.live.findIndex((x) => x.id === Number(go.dataset.goBattle));
    if (i >= 0) { state.idx = i; location.hash = '#jang'; }
  }
});

/* ---------- Liga ---------- */
function renderLigaTabs() {
  const box = $('#liga-tabs');
  if (box.dataset.ready || !state.categories.length) return;
  box.dataset.ready = '1';
  state.ligaCat = state.categories[0];
  box.innerHTML = state.categories.map((c) => `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === state.ligaCat}">${esc(c)}</button>`).join('');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.ligaCat = b.dataset.cat;
    box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    loadLiga();
  });
}

async function loadLiga() {
  if (!state.ligaCat) return;
  const q = new URLSearchParams({ period: 'week', category: state.ligaCat });
  const { rows } = await api('/api/leaderboard?' + q);
  const box = $('#liga-list');
  if (!rows.length) { box.innerHTML = '<div class="empty"><b>Bu toifada blogerlar yo‘q</b>Admin panel orqali blogerlarni qo‘shing.</div>'; return; }
  box.innerHTML = rows.map((r, i) => `
    <div class="row">
      <span class="rank${i < 3 && r.points > 0 ? ' top' : ''}">${i + 1}</span>
      ${face(r.blogger)}
      <div class="who"><b>${esc(r.blogger.name)}</b><a href="${igLink(r.blogger)}" target="_blank" rel="noopener noreferrer">@${esc(r.blogger.username)}</a></div>
      <span class="pts"><b>${r.points}</b> ball</span>
    </div>`).join('');
}

/* ---------- Turnir ---------- */
function matchHTML(m) {
  const winnerOut = (side) => (m.status === 'finished' && m.winnerId && m[side] && m.winnerId !== m[side].id) ? ' out' : '';
  const name = (x, fromIdx) => (x ? esc(x.name) : `Jang ${fromIdx} g‘olibi`);
  let badge = '<span class="tiny">VS</span>';
  if (m.status === 'live') badge = '<span class="tiny live">Jonli</span>';
  else if (m.status === 'finished') badge = `<span class="tiny">${m.votesA}:${m.votesB}</span>`;
  const inner = `
    <span class="dot a"></span>
    <span class="side${winnerOut('a')}">${name(m.a, m.from ? m.from[0] : '')}</span>
    ${badge}
    <span class="side r${winnerOut('b')}">${name(m.b, m.from ? m.from[1] : '')}</span>
    <span class="dot b"></span>`;
  if (m.status === 'live') return `<button type="button" class="match" data-go-battle="${m.id}">${inner}</button>`;
  return `<div class="match">${inner}</div>`;
}

function renderTurnir() {
  const box = $('#turnir-body');
  const t = state.tournament;
  if (!t) {
    box.innerHTML = '<div class="empty"><b>Hozircha chempionat yo‘q</b>Yangi chempionat boshlanganda juftliklar shu yerda ko‘rinadi.</div>';
    $('#pill').textContent = 'Tez orada';
    return;
  }
  if (state.round === null || state.round >= t.rounds.length) state.round = Math.max(0, t.currentRound);
  $('#pill').textContent = t.size + ' bloger';
  const tabs = t.rounds.map((r, i) => `<button type="button" data-round="${i}" aria-pressed="${i === state.round}">${esc(r.label)}</button>`).join('');
  const champ = t.champion ? `<div class="champion">${face(t.champion)}<div><b>${esc(t.champion.name)}</b><span>${esc(t.title)} chempioni</span></div></div>` : '';
  box.innerHTML = `${champ}<div class="tabs" id="round-tabs" style="margin:${champ ? '16px' : '0'} 0 16px">${tabs}</div><div class="list">${t.rounds[state.round].matches.map(matchHTML).join('')}</div>`;
  $('#round-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-round]');
    if (!b) return;
    state.round = Number(b.dataset.round);
    renderTurnir();
  });
}

async function loadTurnir() {
  const { tournament } = await api('/api/tournament');
  state.tournament = tournament;
  renderTurnir();
}

/* ---------- Profil ---------- */
function renderProfil() {
  const mine = loadMine();
  $('#my-count').textContent = mine.length;
  $('#my-votes').innerHTML = mine.length
    ? mine.slice(0, 20).map((m) => `<div class="mine"><b>${esc(m.a)} va ${esc(m.b)}</b><span>Tanlovingiz: ${esc(m.pick)}</span></div>`).join('')
    : '<div class="empty"><b>Hali ovoz bermagansiz</b>Jang bo‘limiga o‘tib birinchi ovozingizni bering.</div>';
}

/* ---------- Yo'naltirish ---------- */
function show(tab) {
  if (!TABS.includes(tab)) tab = 'jang';
  state.tab = tab;
  TABS.forEach((t) => { $('#screen-' + t).hidden = t !== tab; });
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#pill').textContent = PILLS[tab];
  if (tab === 'jang') renderJang(true);
  if (tab === 'liga') { renderLigaTabs(); loadLiga(); }
  if (tab === 'turnir') loadTurnir();
  if (tab === 'profil') renderProfil();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

/* ---------- Ma'lumot yangilash ---------- */
async function refresh() {
  try {
    const data = await api('/api/state');
    state.live = data.live;
    state.recent = data.recent;
    if (!state.categories.length) state.categories = data.categories;
    if (state.tab === 'jang') renderJang(false);
    if (state.tab === 'liga') renderLigaTabs();
  } catch (_) { /* tarmoq xatosi, keyingi urinishda */ }
}

(async function init() {
  await refresh();
  show(location.hash.slice(1));
  setInterval(tickTimer, 1000);
  setInterval(refresh, 8000);
  setInterval(() => {
    if (state.tab === 'liga') loadLiga();
    if (state.tab === 'turnir') loadTurnir();
  }, 30000);
})();
