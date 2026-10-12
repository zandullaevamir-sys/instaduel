'use strict';
/**
 * InstaDuel MVP server — hech qanday tashqi kutubxonasiz (faqat Node.js).
 * Ma'lumotlar DATA_DIR/db.json faylida saqlanadi.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const CATEGORIES = ["Qiziqchi", "Qo'shiqchi", "Brendfeys", "Boshqa"];
const DAY = 24 * 3600 * 1000;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ----------------------------- Ma'lumotlar bazasi ----------------------------- */
let db = { seq: 0, bloggers: [], battles: [], tournaments: [], users: [] };

function normalizePhone(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('998')) return '+' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.startsWith('9') && digits.length === 9) return '+998' + digits;
  if (digits.length >= 9) return '+' + digits;
  return value;
}

function loadDB() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('db.json o‘qishda xato, nusxa saqlanyapti:', e.message);
      try { fs.copyFileSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now()); } catch (_) {}
    }
  }
}
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 400);
}
function saveNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function nextId() { db.seq += 1; return db.seq; }
loadDB();
if (!db.tournaments) db.tournaments = [];
if (!db.users) db.users = [];

/* ----------------------------- Yordamchi funksiyalar ----------------------------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'So‘rov hajmi juda katta')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 50 * 1024);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch (_) { throw new HttpError(400, 'JSON noto‘g‘ri'); }
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// Oddiy tezlik cheklovi: bitta IP dan daqiqasiga 40 ta yozuvchi so'rov
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || h.reset < now) { h = { n: 0, reset: now + 60 * 1000 }; hits.set(ip, h); }
  h.n += 1;
  return h.n > 40;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
}, 60 * 1000).unref();

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Har bir tashrif buyuruvchiga anonim ID (cookie). Bitta duelda bitta ID = bitta ovoz.
function getVoterId(req, res) {
  const c = parseCookies(req);
  if (c.iduel_vid && /^[a-f0-9]{32}$/.test(c.iduel_vid)) return c.iduel_vid;
  const vid = crypto.randomBytes(16).toString('hex');
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `iduel_vid=${vid}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  return vid;
}

function requireAdmin(req) {
  if (!ADMIN_PASSWORD) throw new HttpError(503, 'ADMIN_PASSWORD o‘rnatilmagan (Render → Environment).');
  const h = String(req.headers.authorization || '');
  const given = h.startsWith('Bearer ') ? h.slice(7) : '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Parol noto‘g‘ri');
}

/* ----------------------------- Biznes mantiq ----------------------------- */
function pubBlogger(b) {
  return { id: b.id, name: b.name, username: b.username, category: b.category, avatar: b.avatar || '', followers: b.followers || 0, bio: b.bio || '' };
}

function finishBattle(b) {
  if (b.status === 'finished') return;
  b.status = 'finished';
  b.finishedAt = new Date().toISOString();
  if (b.votesA > b.votesB) b.winnerId = b.aId;
  else if (b.votesB > b.votesA) b.winnerId = b.bId;
  else b.winnerId = null; // durang
  delete b.votes; // joyni tejash uchun
  saveSoon();
}

function tick() {
  const now = Date.now();
  for (const b of db.battles) {
    if (b.status === 'live' && Date.parse(b.endsAt) <= now) finishBattle(b);
  }
  for (const t of db.tournaments) advanceTournament(t);
}
setInterval(tick, 15 * 1000).unref();

function battleView(b, vid) {
  const A = db.bloggers.find((x) => x.id === b.aId);
  const B = db.bloggers.find((x) => x.id === b.bId);
  const total = b.votesA + b.votesB;
  return {
    id: b.id,
    status: b.status,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    finishedAt: b.finishedAt || null,
    votesA: b.votesA,
    votesB: b.votesB,
    total,
    pctA: total ? Math.round((b.votesA / total) * 100) : 50,
    winnerId: b.winnerId === undefined ? null : b.winnerId,
    myVote: b.votes && vid ? (b.votes[vid] || null) : null,
    a: A ? pubBlogger(A) : null,
    b: B ? pubBlogger(B) : null
  };
}

// Hafta dushanba 00:00 (Toshkent, UTC+5) dan boshlanadi va yakshanba kuni tugaydi
function weekStart() {
  const OFFSET = 5 * 3600 * 1000;
  const t = new Date(Date.now() + OFFSET);
  const dow = (t.getUTCDay() + 6) % 7; // dushanba = 0
  t.setUTCHours(0, 0, 0, 0);
  return t.getTime() - dow * DAY - OFFSET;
}

// Natijalar statistikasi: period = 'week' | 'all'

function computeStats(period) {
  const since = period === 'week' ? weekStart() : 0;
  const stats = new Map();
  const get = (id) => {
    if (!stats.has(id)) stats.set(id, { points: 0, wins: 0, draws: 0, losses: 0, votes: 0, duels: 0 });
    return stats.get(id);
  };
  for (const b of db.battles) {
    if (b.status !== 'finished') continue;
    if (Date.parse(b.finishedAt) < since) continue;
    [[b.aId, b.votesA], [b.bId, b.votesB]].forEach(([id, v]) => {
      const r = get(id);
      r.duels += 1;
      r.votes += v;
      if (b.winnerId === id) { r.wins += 1; r.points += 3; }
      else if (b.winnerId === null) { r.draws += 1; r.points += 1; }
      else r.losses += 1;
    });
  }
  return stats;
}

function leaderboard(period, category) {
  const stats = computeStats(period);
  return db.bloggers
    .filter((bl) => !category || bl.category === category)
    .map((bl) => Object.assign({ blogger: pubBlogger(bl) }, stats.get(bl.id) || { points: 0, wins: 0, draws: 0, losses: 0, votes: 0, duels: 0 }))
    .sort((x, y) => y.points - x.points || y.votes - x.votes || y.wins - x.wins);
}

function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function validateBlogger(body) {
  const name = str(body.name, 60);
  const username = str(body.username, 40).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
  if (!name) throw new HttpError(400, 'Ism kiritilishi shart');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new HttpError(400, 'Instagram username noto‘g‘ri (faqat harf, raqam, nuqta, pastki chiziq)');
  const category = CATEGORIES.includes(body.category) ? body.category : 'Boshqa';
  const followers = Math.max(0, Math.min(1e9, parseInt(body.followers, 10) || 0));
  const avatar = str(body.avatar, 300);
  if (avatar && !/^(https:\/\/|\/uploads\/)/.test(avatar)) throw new HttpError(400, 'Rasm havolasi https:// bilan boshlanishi kerak');
  return { name, username, category, followers, avatar, bio: str(body.bio, 160) };
}

function createBattle(aId, bId, hours, meta) {
  aId = Number(aId); bId = Number(bId);
  if (!aId || !bId || aId === bId) throw new HttpError(400, 'Ikki xil bloger tanlang');
  if (!db.bloggers.find((x) => x.id === aId) || !db.bloggers.find((x) => x.id === bId)) throw new HttpError(404, 'Bloger topilmadi');
  const busy = db.battles.find((b) => b.status === 'live' && (b.aId === aId || b.bId === aId || b.aId === bId || b.bId === bId));
  if (busy) throw new HttpError(409, 'Bloggerlardan biri hozir boshqa duelda');
  hours = Math.max(1, Math.min(168, Number(hours) || 24));
  const now = Date.now();
  const b = {
    id: nextId(), aId, bId, status: 'live',
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + hours * 3600 * 1000).toISOString(),
    votesA: 0, votesB: 0, winnerId: null, votes: {}
  };
  if (meta) Object.assign(b, meta);
  db.battles.push(b);
  saveSoon();
  return b;
}

/* ----------------------------- Chempionat ----------------------------- */
function startRound(t, ids) {
  const list = [];
  for (let i = 0; i < ids.length; i += 2) {
    list.push(createBattle(ids[i], ids[i + 1], t.hours, { tournamentId: t.id, round: t.rounds.length }).id);
  }
  t.rounds.push(list);
}

function createTournament(title, rawIds, hours) {
  const ids = [...new Set((rawIds || []).map(Number))];
  if (![4, 8, 16].includes(ids.length)) throw new HttpError(400, 'Chempionat uchun 4, 8 yoki 16 ta bloger tanlang');
  if (ids.some((id) => !db.bloggers.find((x) => x.id === id))) throw new HttpError(404, 'Bloger topilmadi');
  if (db.tournaments.some((t) => t.status === 'running')) throw new HttpError(409, 'Boshqa chempionat hali davom etmoqda');
  const busy = db.battles.some((b) => b.status === 'live' && (ids.includes(b.aId) || ids.includes(b.bId)));
  if (busy) throw new HttpError(409, 'Tanlangan blogerlardan biri hozir boshqa duelda');
  for (let i = ids.length - 1; i > 0; i--) { // tasodifiy juftlash
    const k = crypto.randomInt(i + 1);
    [ids[i], ids[k]] = [ids[k], ids[i]];
  }
  const t = {
    id: nextId(), title: str(title, 60) || 'Chempionat', size: ids.length,
    hours: Math.max(1, Math.min(168, Number(hours) || 24)),
    status: 'running', rounds: [], championId: null, createdAt: new Date().toISOString()
  };
  db.tournaments.push(t);
  startRound(t, ids);
  saveSoon();
  return t;
}

// Joriy raund tugagach g'oliblar keyingi raundga o'tadi. Durang bo'lsa qur'a tashlanadi.
function advanceTournament(t) {
  if (t.status !== 'running') return;
  const cur = t.rounds[t.rounds.length - 1].map((id) => db.battles.find((b) => b.id === id));
  if (cur.some((b) => !b)) { t.status = 'broken'; saveSoon(); return; }
  if (cur.some((b) => b.status !== 'finished')) return;
  const winners = cur.map((b) => {
    if (b.winnerId) return b.winnerId;
    if (!b.advanceId) { b.advanceId = crypto.randomInt(2) === 0 ? b.aId : b.bId; b.coinFlip = true; }
    return b.advanceId;
  });
  if (winners.length === 1) { t.status = 'finished'; t.championId = winners[0]; saveSoon(); return; }
  startRound(t, winners);
  saveSoon();
}

function tournamentView(t) {
  const total = Math.log2(t.size);
  const rounds = [];
  for (let i = 0; i < total; i++) {
    const count = t.size >> (i + 1);
    const label = count === 1 ? 'Final' : '1/' + count;
    let matches;
    if (i < t.rounds.length) {
      matches = t.rounds[i].map((id) => {
        const b = db.battles.find((x) => x.id === id);
        if (!b) return { id: null, status: 'pending', a: null, b: null };
        const v = battleView(b, null);
        return { id: b.id, status: v.status, a: v.a, b: v.b, votesA: v.votesA, votesB: v.votesB, winnerId: b.winnerId || b.advanceId || null, coinFlip: !!b.coinFlip, endsAt: v.endsAt };
      });
    } else {
      matches = Array.from({ length: count }, (_, k) => ({ id: null, status: 'pending', a: null, b: null, from: [2 * k + 1, 2 * k + 2] }));
    }
    rounds.push({ label, matches });
  }
  const champ = t.championId ? db.bloggers.find((x) => x.id === t.championId) : null;
  return { id: t.id, title: t.title, size: t.size, status: t.status, currentRound: t.rounds.length - 1, rounds, champion: champ ? pubBlogger(champ) : null };
}

function seedDemo() {
  if (db.bloggers.length) throw new HttpError(409, 'Baza bo‘sh emas — demo faqat bo‘sh bazaga qo‘shiladi');
  const demo = [
    ['Aylin Demo', 'demo_aylin', 'Qiziqchi', 125000],
    ['Jasur Demo', 'demo_jasur', 'Qiziqchi', 98000],
    ['Madina Demo', 'demo_madina', "Qo'shiqchi", 210000],
    ['Bekzod Demo', 'demo_bekzod', "Qo'shiqchi", 187000],
    ['Zafar Demo', 'demo_zafar', 'Qiziqchi', 64000],
    ['Nargiza Demo', 'demo_nargiza', 'Brendfeys', 72000],
    ['Sardor Demo', 'demo_sardor', 'Brendfeys', 51000],
    ['Dilnoza Demo', 'demo_dilnoza', "Qo'shiqchi", 143000]
  ];
  demo.forEach(([name, username, category, followers]) => {
    db.bloggers.push({ id: nextId(), name, username, category, followers, avatar: '', bio: 'Demo profil', createdAt: new Date().toISOString() });
  });
  createBattle(db.bloggers[0].id, db.bloggers[1].id, 24);
  saveSoon();
}

function upsertTelegramUser(payload) {
  const telegramUserId = payload && payload.telegramUserId ? Number(payload.telegramUserId) : null;
  const phone = normalizePhone((payload && (payload.phone || payload.phoneNumber || payload.telegramPhone)) || '');
  const username = str((payload && (payload.username || payload.userName)) || '', 50);
  const firstName = str((payload && (payload.firstName || payload.first_name)) || '', 60);
  const lastName = str((payload && (payload.lastName || payload.last_name)) || '', 60);

  if (!telegramUserId && !phone) throw new HttpError(400, 'Telegram user ID yoki telefon raqami kerak');

  const existing = db.users.find((u) => {
    if (telegramUserId && u.telegramUserId === telegramUserId) return true;
    if (phone && u.phone && u.phone === phone) return true;
    return false;
  });

  if (existing) {
    if (telegramUserId) existing.telegramUserId = telegramUserId;
    if (phone) existing.phone = phone;
    if (username) existing.username = username;
    if (firstName) existing.firstName = firstName;
    if (lastName) existing.lastName = lastName;
    existing.updatedAt = new Date().toISOString();
    saveSoon();
    return { registered: false, user: existing };
  }

  const user = {
    id: nextId(),
    telegramUserId,
    phone,
    username,
    firstName,
    lastName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.users.push(user);
  saveSoon();
  return { registered: true, user };
}

/* ----------------------------- API ----------------------------- */
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.slice(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const ip = clientIp(req);
  if (method !== 'GET' && method !== 'HEAD' && rateLimited(ip)) {
    throw new HttpError(429, 'So‘rovlar juda ko‘p. Birozdan keyin urinib ko‘ring.');
  }
  tick();

  if (p === '/api/health') return sendJson(res, 200, { ok: true, time: new Date().toISOString() });

  const vid = getVoterId(req, res);
  let m;

  // ---- Telegram auth registration ----
  if (method === 'POST' && p === '/api/auth/telegram') {
    const body = await readJson(req);
    const payload = body && body.user ? body.user : body;
    const result = upsertTelegramUser(payload || {});
    return sendJson(res, 200, {
      ok: true,
      registered: !!result.registered,
      user: {
        id: result.user.id,
        telegramUserId: result.user.telegramUserId || null,
        phone: result.user.phone || '',
        username: result.user.username || '',
        firstName: result.user.firstName || '',
        lastName: result.user.lastName || ''
      }
    });
  }

  // ---- Ommaviy ----
  if (method === 'GET' && p === '/api/state') {
    const live = db.battles.filter((b) => b.status === 'live').sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt)).map((b) => battleView(b, vid));
    const recent = db.battles.filter((b) => b.status === 'finished').sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt)).slice(0, 10).map((b) => battleView(b, vid));
    return sendJson(res, 200, { now: Date.now(), categories: CATEGORIES, live, recent });
  }

  if (method === 'GET' && p === '/api/bloggers') {
    const stats = computeStats('all');
    const list = db.bloggers.map((b) => Object.assign(pubBlogger(b), { stats: stats.get(b.id) || { points: 0, wins: 0, draws: 0, losses: 0, votes: 0, duels: 0 } }));
    return sendJson(res, 200, { bloggers: list });
  }

  if (method === 'GET' && p === '/api/leaderboard') {
    const period = url.searchParams.get('period') === 'all' ? 'all' : 'week';
    const category = CATEGORIES.includes(url.searchParams.get('category')) ? url.searchParams.get('category') : '';
    return sendJson(res, 200, { period, category, rows: leaderboard(period, category) });
  }

  if (method === 'POST' && (m = p.match(/^\/api\/battles\/(\d+)\/vote$/))) {
    const b = db.battles.find((x) => x.id === Number(m[1]));
    if (!b) throw new HttpError(404, 'Duel topilmadi');
    const body = await readJson(req);
    if (body.side !== 'a' && body.side !== 'b') throw new HttpError(400, 'Tomon noto‘g‘ri');
    if (b.status !== 'live') throw new HttpError(409, 'Bu duel tugagan');
    if (b.votes[vid]) throw new HttpError(409, 'Siz bu duelda allaqachon ovoz bergansiz');
    b.votes[vid] = body.side;
    if (body.side === 'a') b.votesA += 1; else b.votesB += 1;
    saveSoon();
    return sendJson(res, 200, { battle: battleView(b, vid) });
  }

  if (method === 'GET' && p === '/api/config') {
    return sendJson(res, 200, { contact: process.env.CONTACT_URL || '' });
  }

  if (method === 'GET' && p === '/api/tournament') {
    const t = db.tournaments.find((x) => x.status === 'running') || db.tournaments.slice().sort((a, b) => b.id - a.id)[0];
    return sendJson(res, 200, { tournament: t ? tournamentView(t) : null });
  }

  // ---- Admin ----
  if (p.startsWith('/api/admin/')) {
    requireAdmin(req);

    if (method === 'GET' && p === '/api/admin/check') return sendJson(res, 200, { ok: true });

    if (method === 'GET' && p === '/api/admin/data') {
      return sendJson(res, 200, {
        categories: CATEGORIES,
        bloggers: db.bloggers.map(pubBlogger),
        battles: db.battles.slice().reverse().slice(0, 50).map((b) => battleView(b, null)),
        tournaments: db.tournaments.slice().reverse().map((t) => ({ id: t.id, title: t.title, size: t.size, status: t.status, round: t.rounds.length }))
      });
    }

    if (method === 'POST' && p === '/api/admin/bloggers') {
      const data = validateBlogger(await readJson(req));
      if (db.bloggers.find((x) => x.username.toLowerCase() === data.username.toLowerCase())) throw new HttpError(409, 'Bu username allaqachon qo‘shilgan');
      const b = Object.assign({ id: nextId(), createdAt: new Date().toISOString() }, data);
      db.bloggers.push(b);
      saveSoon();
      return sendJson(res, 201, { blogger: pubBlogger(b) });
    }

    if (method === 'PUT' && (m = p.match(/^\/api\/admin\/bloggers\/(\d+)$/))) {
      const b = db.bloggers.find((x) => x.id === Number(m[1]));
      if (!b) throw new HttpError(404, 'Bloger topilmadi');
      Object.assign(b, validateBlogger(await readJson(req)));
      saveSoon();
      return sendJson(res, 200, { blogger: pubBlogger(b) });
    }

    if (method === 'DELETE' && (m = p.match(/^\/api\/admin\/bloggers\/(\d+)$/))) {
      const id = Number(m[1]);
      if (db.battles.some((b) => b.aId === id || b.bId === id)) throw new HttpError(409, 'Bu bloggerning duellari bor — o‘chirib bo‘lmaydi');
      db.bloggers = db.bloggers.filter((x) => x.id !== id);
      saveSoon();
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && p === '/api/admin/battles') {
      const body = await readJson(req);
      const b = createBattle(body.aId, body.bId, body.hours);
      return sendJson(res, 201, { battle: battleView(b, null) });
    }

    if (method === 'POST' && (m = p.match(/^\/api\/admin\/battles\/(\d+)\/finish$/))) {
      const b = db.battles.find((x) => x.id === Number(m[1]));
      if (!b) throw new HttpError(404, 'Duel topilmadi');
      finishBattle(b);
      return sendJson(res, 200, { battle: battleView(b, null) });
    }

    if (method === 'DELETE' && (m = p.match(/^\/api\/admin\/battles\/(\d+)$/))) {
      const target = db.battles.find((x) => x.id === Number(m[1]));
      if (target && target.tournamentId && db.tournaments.some((t) => t.id === target.tournamentId)) {
        throw new HttpError(409, 'Bu duel chempionatga tegishli — avval chempionatni o‘chiring');
      }
      db.battles = db.battles.filter((x) => x.id !== Number(m[1]));
      saveSoon();
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && p === '/api/admin/tournaments') {
      const body = await readJson(req);
      const t = createTournament(body.title, body.bloggerIds, body.hours);
      return sendJson(res, 201, { tournament: tournamentView(t) });
    }

    if (method === 'DELETE' && (m = p.match(/^\/api\/admin\/tournaments\/(\d+)$/))) {
      const id = Number(m[1]);
      db.tournaments = db.tournaments.filter((t) => t.id !== id);
      db.battles.forEach((b) => { if (b.tournamentId === id) delete b.tournamentId; });
      saveSoon();
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && p === '/api/admin/upload') {
      const buf = await readBody(req, 2 * 1024 * 1024);
      const type = sniffImage(buf);
      if (!type || !IMG_TYPES[type]) throw new HttpError(400, 'Faqat JPG, PNG yoki WebP rasm (2 MB gacha)');
      const name = crypto.randomBytes(8).toString('hex') + '.' + IMG_TYPES[type];
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      return sendJson(res, 201, { url: '/uploads/' + name });
    }

    if (method === 'POST' && p === '/api/admin/seed') {
      seedDemo();
      return sendJson(res, 201, { ok: true });
    }
  }

  throw new HttpError(404, 'Topilmadi');
}

/* ----------------------------- Statik fayllar ----------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

function serveFile(res, file, cache) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Topilmadi'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': cache
    });
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metod ruxsat etilmagan');
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (_) { throw new HttpError(400, 'Noto‘g‘ri manzil'); }

  if (rel.startsWith('/uploads/')) {
    const name = rel.slice('/uploads/'.length);
    if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(name)) throw new HttpError(404, 'Topilmadi');
    return serveFile(res, path.join(UPLOAD_DIR, name), 'public, max-age=604800');
  }

  if (rel === '/') rel = '/landing.html';
  if (rel === '/app') rel = '/app.html';
  if (rel === '/admin') rel = '/admin.html';
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Taqiqlangan');
  const cache = rel.endsWith('.html') ? 'no-cache' : 'public, max-age=300';
  serveFile(res, file, cache);
}

/* ----------------------------- Server ----------------------------- */
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (res.headersSent) return res.end();
    const msg = status === 500 ? 'Server xatosi' : e.message;
    if (req.url.startsWith('/api/')) sendJson(res, status, { error: msg });
    else { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(msg); }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`InstaDuel ishga tushdi: http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) console.warn('Diqqat: ADMIN_PASSWORD o‘rnatilmagan — admin panel ishlamaydi.');
});

function shutdown() {
  try { if (saveTimer) clearTimeout(saveTimer); saveNow(); } catch (e) { console.error(e); }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
