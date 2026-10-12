'use strict';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TABS = ['jang', 'liga', 'turnir', 'profil'];
const PILLS = { jang: 'Kun jangi, 1 va 1', liga: 'Hafta yakuni: yakshanba', turnir: '', profil: 'Anonim' };

// Telegram Mini App ichida ochilgan bo'lsa, Telegram obyekti va imzolangan initData bo'ladi
const tg = window.Telegram && window.Telegram.WebApp;
const inTelegram = !!(tg && tg.initData);
let startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
if (inTelegram) {
  try { tg.ready(); tg.expand(); tg.setHeaderColor('#0d0e12'); tg.setBackgroundColor('#0d0e12'); } catch (_) { /* eski Telegram versiyasi */ }
}

const state = {
  config: {},
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
  opts = opts || {};
  if (inTelegram) opts.headers = Object.assign({ 'X-Telegram-Init-Data': tg.initData }, opts.headers || {});
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
  const blocked = !!(state.config.requireTelegram && !inTelegram);
  const msg = state.msgs[b.id];
  const btn = (key) => {
    const picked = b.myVote === key;
    const text = picked ? `Tanlandi: ${key.toUpperCase()}` : `${key.toUpperCase()} uchun ovoz`;
    return `<button type="button" class="v${key}${picked ? ' picked' : ''}" data-vote="${key}" data-id="${b.id}"${voted || blocked ? ' disabled' : ''}>${text}</button>`;
  };
  const bothBtn = `<button type="button" class="vboth${b.myVote === 'both' ? ' picked' : ''}" data-vote="both" data-id="${b.id}"${voted || blocked ? ' disabled' : ''}>${b.myVote === 'both' ? 'Ikkalasiga ham muxlisman: tanlandi' : 'Ikkalasiga ham muxlisman'}</button>`;
  const tgLink = state.config.botUsername ? ` <a href="https://t.me/${esc(state.config.botUsername)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">Botni ochish</a>` : '';
  let noteHTML;
  if (blocked) noteHTML = `<div class="note err" role="status">Ovoz berish uchun InstaDuel ni Telegram ichida oching.${tgLink}</div>`;
  else if (msg && msg.err) noteHTML = `<div class="note err" role="status">${esc(msg.text)}</div>`;
  else if (b.myVote === 'both') noteHTML = `<div class="note ok" role="status"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>Ikkala blogerni ham qo‘llab-quvvatladingiz. Rahmat!</div>`;
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
    <div class="share-nums"><span class="a">${b.pctA}%</span><span class="mid">${b.total ? b.total + ' ovoz' + (b.both ? ', ' + b.both + ' muxlis' : '') : 'Ovozlar taqsimoti'}</span><span class="b">${pctB}%</span></div>
  </div>
  <div class="votes">${btn('a')}${btn('b')}</div>
  ${bothBtn}
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
  const key = JSON.stringify([cur, valid.length, state.idx, state.msgs, state.recent.map((b) => b.id), !cur && lastDone ? lastDone.id : 0]);
  if (!force && key === state.jangJson) return;
  state.jangJson = key;
  const box = $('#screen-jang');
  if (cur) { box.innerHTML = duelHTML(cur) + winnersHTML(); return; }
  box.innerHTML = `<div class="empty"><b>Hozir faol jang yo‘q</b>Yangi jang tez orada boshlanadi.</div>` + (lastDone ? resultHTML(lastDone) : '') + winnersHTML();
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
      const pick = btn.dataset.vote === 'both' ? 'Ikkalasi' : (btn.dataset.vote === 'a' ? battle.a : battle.b).name;
      saveMine({ id, a: battle.a.name, b: battle.b.name, pick, ts: Date.now() });
    } catch (err) {
      state.msgs[id] = { text: err.message, err: true };
      await refresh();
    }
    renderJang(true);
    return;
  }
  const card = e.target.closest('[data-card]');
  if (card) { openCard(Number(card.dataset.card)); return; }
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


/* ---------- G'oliblar ro'yxati va kartochkalar ---------- */
const RED = '#f03e4c';
const BLUE = '#3b82ff';
const KIND = {
  win: { pill: 'G‘OLIB', file: 'golib', tag: 'Muxlislarga rahmat!' },
  lose: { pill: 'MAG‘LUBIYAT', file: 'maglub', tag: 'Kuchli kurashdi. Revansh kutilmoqda!' },
  draw: { pill: 'DURANG', file: 'durang', tag: 'Kuch teng, jang qizg‘in bo‘ldi!' }
};

function winnerOf(b) {
  if (!b || !b.a || !b.b || !b.winnerId) return null;
  return b.winnerId === b.a.id
    ? { p: b.a, side: 'a', pct: b.pctA, votes: b.votesA, other: b.b }
    : { p: b.b, side: 'b', pct: 100 - b.pctA, votes: b.votesB, other: b.a };
}

function sideData(b, side) {
  const p = side === 'a' ? b.a : b.b;
  const other = side === 'a' ? b.b : b.a;
  return {
    p, other, side,
    votes: side === 'a' ? b.votesA : b.votesB,
    pct: side === 'a' ? b.pctA : 100 - b.pctA,
    kind: !b.winnerId ? 'draw' : (b.winnerId === p.id ? 'win' : 'lose')
  };
}

function winnersHTML() {
  const list = state.recent.filter((b) => b.a && b.b).slice(0, 5);
  if (!list.length) return '';
  const rows = list.map((b) => {
    const w = winnerOf(b);
    if (!w) {
      return `<button type="button" class="row win-row" data-card="${b.id}"><span class="rank">=</span><div class="who"><b>Durang</b><span class="sub">${esc(b.a.name)} va ${esc(b.b.name)}, ${b.votesA}:${b.votesB}</span></div><span class="go">Kartochka</span></button>`;
    }
    return `<button type="button" class="row win-row" data-card="${b.id}">
      ${face(w.p)}
      <div class="who"><b>${esc(w.p.name)}</b><span class="sub">${w.pct}%, ${w.votes} ovoz, ${esc(w.other.name)} ustidan</span></div>
      <span class="go">Kartochka</span>
    </button>`;
  }).join('');
  return `<div><h2 class="sec-title">Oxirgi natijalar</h2><div class="list">${rows}</div></div>`;
}

function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.referrerPolicy = 'no-referrer';
    const t = setTimeout(() => resolve(null), 5000);
    im.onload = () => { clearTimeout(t); resolve(im); };
    im.onerror = () => { clearTimeout(t); resolve(null); };
    im.src = src;
  });
}

function fitText(ctx, text, maxW, size, weight, family) {
  let s = size;
  for (; s > 28; s -= 4) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  ctx.font = `${weight} ${s}px ${family}`;
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

async function drawCard(b, side) {
  const s = sideData(b, side);
  const k = KIND[s.kind];
  const cv = $('#card');
  const ctx = cv.getContext('2d');
  const accent = side === 'a' ? RED : BLUE;
  try { await Promise.all([document.fonts.load('800 80px Unbounded'), document.fonts.load('800 40px Manrope')]); } catch (_) { /* zaxira shrift ishlaydi */ }
  const D = "Unbounded, 'Segoe UI', sans-serif";
  const M = "Manrope, 'Segoe UI', sans-serif";
  const img = await loadImg(s.p.avatar);

  ctx.clearRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#0d0e12';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.globalAlpha = s.kind === 'win' ? 0.16 : 0.09;
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(540, 700, 640, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // Logotip: Insta (qizil) + Duel (ko'k)
  ctx.font = `800 56px ${D}`;
  ctx.textAlign = 'left';
  const w1 = ctx.measureText('Insta').width;
  const w2 = ctx.measureText('Duel').width;
  const x0 = 540 - (w1 + w2) / 2;
  ctx.fillStyle = RED; ctx.fillText('Insta', x0, 150);
  ctx.fillStyle = BLUE; ctx.fillText('Duel', x0 + w1, 150);
  ctx.textAlign = 'center';

  // Natija belgisi: g'olib to'ldirilgan, boshqalari konturli
  ctx.font = `800 44px ${D}`;
  const pw = Math.max(400, ctx.measureText(k.pill).width + 110);
  roundRect(ctx, 540 - pw / 2, 230, pw, 96, 48);
  if (s.kind === 'win') {
    ctx.fillStyle = accent; ctx.fill();
    ctx.fillStyle = '#0d0e12';
  } else {
    ctx.lineWidth = 6;
    ctx.strokeStyle = s.kind === 'lose' ? accent : '#f3efe6';
    ctx.stroke();
    ctx.fillStyle = s.kind === 'lose' ? accent : '#f3efe6';
  }
  ctx.fillText(k.pill, 540, 297);

  // Dumaloq rasm
  const cx = 540, cy = 700, r = 250;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  if (img) {
    const kk = Math.max((2 * r) / img.width, (2 * r) / img.height);
    ctx.drawImage(img, cx - (img.width * kk) / 2, cy - (img.height * kk) / 2, img.width * kk, img.height * kk);
  } else {
    ctx.fillStyle = '#0d0e12';
    ctx.beginPath(); ctx.arc(cx, cy - 50, 85, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy + 215, 190, 150, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (s.kind === 'lose') { ctx.fillStyle = 'rgba(13,14,18,0.28)'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r); }
  ctx.restore();
  ctx.lineWidth = 14;
  ctx.strokeStyle = s.kind === 'lose' ? '#9aa0ae' : '#f3efe6';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = '#f3efe6';
  fitText(ctx, s.p.name, 900, 84, 800, D);
  ctx.fillText(s.p.name, 540, 1100);

  ctx.fillStyle = accent;
  fitText(ctx, '@' + s.p.username, 900, 46, 800, M);
  ctx.fillText('@' + s.p.username, 540, 1175);

  ctx.fillStyle = '#9aa0ae';
  ctx.font = `600 38px ${M}`;
  ctx.fillText(s.p.category, 540, 1240);

  ctx.fillStyle = s.kind === 'lose' ? '#b4b9c5' : '#f3efe6';
  ctx.font = `800 200px ${D}`;
  ctx.fillText(s.pct + '%', 540, 1480);

  ctx.fillStyle = '#9aa0ae';
  const line = s.kind === 'win' ? `${s.votes} ovoz, ${s.other.name} ustidan`
    : s.kind === 'lose' ? `${s.votes} ovoz, g‘olib: ${s.other.name}`
    : `${s.votes} ovoz, ${s.other.name} bilan teng`;
  fitText(ctx, line, 900, 44, 600, M);
  ctx.fillText(line, 540, 1560);

  roundRect(ctx, 140, 1620, 800, 28, 14);
  ctx.fillStyle = '#1f222b'; ctx.fill();
  roundRect(ctx, 140, 1620, Math.max(28, (800 * s.pct) / 100), 28, 14);
  ctx.fillStyle = accent; ctx.fill();

  ctx.fillStyle = '#b4b9c5';
  fitText(ctx, k.tag, 900, 38, 600, M);
  ctx.fillText(k.tag, 540, 1712);

  // InstaDuel havolasi
  ctx.fillStyle = '#f3efe6';
  const link = `${location.host}/app`;
  fitText(ctx, link, 900, 58, 800, M);
  ctx.fillText(link, 540, 1798);

  ctx.fillStyle = '#9aa0ae';
  ctx.font = `600 32px ${M}`;
  const bot = state.config && state.config.botUsername ? `   t.me/${state.config.botUsername}` : '';
  ctx.fillText(`${fmtDate(b.finishedAt || b.endsAt)}${bot}`, 540, 1866);
}

let cardBattle = null;
let cardSide = 'a';
let lastFocus = null;

function shareLink(id) {
  const c = state.config || {};
  if (c.botUsername && c.appName) return `https://t.me/${c.botUsername}/${c.appName}?startapp=natija-${id}`;
  if (c.botUsername) return `https://t.me/${c.botUsername}?startapp=natija-${id}`;
  return `${location.origin}/app#natija-${id}`;
}

function canvasBlob() {
  return new Promise((resolve) => $('#card').toBlob(resolve, 'image/png'));
}

function renderCardTabs() {
  const b = cardBattle;
  $('#card-tabs').innerHTML = ['a', 'b'].map((sd) => `<button type="button" data-cside="${sd}" aria-pressed="${sd === cardSide}">${esc((sd === 'a' ? b.a : b.b).name)}</button>`).join('');
}

async function openCard(id, side) {
  let b = state.recent.find((x) => x.id === id) || state.live.find((x) => x.id === id);
  if (!b || !b.a || !b.b) {
    try { b = (await api('/api/battles/' + id)).battle; } catch (_) { b = null; }
  }
  lastFocus = document.activeElement;
  const ok = !!(b && b.a && b.b && b.status === 'finished');
  cardBattle = ok ? b : null;
  ['#card', '#card-tabs', '#card-dl', '#card-tg', '#card-link', '#card-hint'].forEach((s) => { $(s).hidden = !ok; });
  $('#card-share').hidden = true;
  $('#card-browser').hidden = true;
  const msg = $('#card-msg');
  msg.hidden = ok;
  if (!ok) msg.textContent = !b ? 'Jang topilmadi.' : 'Bu jang hali tugamagan. Kartochkalar jang tugagach paydo bo‘ladi.';
  $('#modal').hidden = false;
  $('#card-close').focus();
  if (!ok) return;
  cardSide = side || (winnerOf(b) ? winnerOf(b).side : 'a');
  renderCardTabs();
  await drawCard(b, cardSide);
  if (inTelegram) $('#card-browser').hidden = false;
  try {
    const probe = new File([''], 'x.png', { type: 'image/png' });
    if (!inTelegram && navigator.canShare && navigator.canShare({ files: [probe] })) $('#card-share').hidden = false;
  } catch (_) { /* ulashish qo'llab-quvvatlanmaydi */ }
}

function closeModal(silent) {
  const modal = $('#modal');
  if (modal.hidden) return;
  modal.hidden = true;
  cardBattle = null;
  if (!silent && /^#natija-/.test(location.hash)) history.replaceState(null, '', location.pathname + '#jang');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

$('#card-close').addEventListener('click', () => closeModal(false));
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(false); });

$('#card-tabs').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-cside]');
  if (!t || !cardBattle) return;
  cardSide = t.dataset.cside;
  renderCardTabs();
  await drawCard(cardBattle, cardSide);
});

$('#card-dl').addEventListener('click', async () => {
  if (!cardBattle) return;
  const s = sideData(cardBattle, cardSide);
  const blob = await canvasBlob();
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `instaduel-${KIND[s.kind].file}-${s.p.username}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

$('#card-share').addEventListener('click', async () => {
  if (!cardBattle) return;
  const s = sideData(cardBattle, cardSide);
  const blob = await canvasBlob();
  if (!blob) return;
  const file = new File([blob], `instaduel-${KIND[s.kind].file}.png`, { type: 'image/png' });
  try { await navigator.share({ files: [file], title: 'InstaDuel', text: `InstaDuel: ${cardBattle.a.name} va ${cardBattle.b.name} jangi tugadi` }); } catch (_) { /* bekor qilindi */ }
});

$('#card-tg').addEventListener('click', () => {
  if (!cardBattle) return;
  const text = `InstaDuel: ${cardBattle.a.name} va ${cardBattle.b.name} jangi tugadi. Natijani ko‘ring!`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(shareLink(cardBattle.id))}&text=${encodeURIComponent(text)}`;
  if (inTelegram && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank', 'noopener');
});

$('#card-browser').addEventListener('click', () => {
  if (!cardBattle) return;
  const url = `${location.origin}/app#natija-${cardBattle.id}`;
  if (inTelegram && tg.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener');
});

$('#card-link').addEventListener('click', async () => {
  if (!cardBattle) return;
  const url = shareLink(cardBattle.id);
  const btn = $('#card-link');
  try { await navigator.clipboard.writeText(url); btn.textContent = 'Nusxalandi'; }
  catch (_) { window.prompt('Havolani nusxalang:', url); }
  setTimeout(() => { btn.textContent = 'Havolani nusxalash'; }, 2000);
});

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
function route() {
  let h = location.hash.slice(1);
  if (!h && startParam) { h = startParam; startParam = ''; }
  const m = h.match(/^natija-(\d+)$/);
  if (m) { show('jang'); openCard(Number(m[1])); return; }
  closeModal(true);
  show(h);
}
window.addEventListener('hashchange', route);

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

function countVisit() {
  try {
    if (sessionStorage.getItem('iduel_hit_app')) return;
    sessionStorage.setItem('iduel_hit_app', '1');
  } catch (_) { /* sessionStorage yo'q bo'lsa har safar sanaladi */ }
  api('/api/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'app' }) }).catch(() => {});
}

(async function init() {
  try { state.config = await api('/api/config'); } catch (_) { state.config = {}; }
  countVisit();
  await refresh();
  route();
  setInterval(tickTimer, 1000);
  setInterval(refresh, 8000);
  setInterval(() => {
    if (state.tab === 'liga') loadLiga();
    if (state.tab === 'turnir') loadTurnir();
  }, 30000);
})();
