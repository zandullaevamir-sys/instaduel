'use strict';
const $ = (s) => document.querySelector(s);

function timeLeft(endsAt) {
  const ms = Date.parse(endsAt) - Date.now();
  if (!(ms > 0)) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const p = (n) => String(n).padStart(2, '0');
  return (d ? d + ' kun ' : '') + p(Math.floor((s % 86400) / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
}

(async function () {
  // Hamkorlik tugmasi faqat CONTACT_URL berilgan bo'lsa ko'rinadi
  try {
    const cfg = await (await fetch('/api/config')).json();
    const tgBtn = $('#tg-btn');
    if (cfg.botUsername) {
      tgBtn.href = cfg.appName ? `https://t.me/${cfg.botUsername}/${cfg.appName}` : `https://t.me/${cfg.botUsername}`;
      tgBtn.hidden = false;
    }
    const btn = $('#partner-btn');
    if (cfg.contact && /^(https:\/\/|mailto:)/.test(cfg.contact)) { btn.href = cfg.contact; btn.hidden = false; }
    else { btn.closest('.sec').hidden = true; $('#nav-partner').hidden = true; }
  } catch (_) { /* e'tiborsiz */ }

  // Tashrifni hisoblash (bir sessiyada bir marta)
  try {
    if (!sessionStorage.getItem('iduel_hit_landing')) {
      sessionStorage.setItem('iduel_hit_landing', '1');
      fetch('/api/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'landing' }) }).catch(() => {});
    }
  } catch (_) { /* e'tiborsiz */ }

  // Bugungi jang kartasi: haqiqiy ma'lumot bo'lsa shuni ko'rsatamiz
  async function loadLive() {
    try {
      const { live } = await (await fetch('/api/state')).json();
      const b = live.find((x) => x.a && x.b);
      if (!b) return;
      $('#h-a').textContent = b.a.name;
      $('#h-b').textContent = b.b.name;
      $('#h-bar').style.width = b.pctA + '%';
      const t = $('#h-timer');
      t.dataset.end = b.endsAt;
      t.textContent = timeLeft(b.endsAt);
    } catch (_) { /* e'tiborsiz */ }
  }
  await loadLive();
  setInterval(() => {
    const t = $('#h-timer');
    if (t.dataset.end) t.textContent = timeLeft(t.dataset.end);
  }, 1000);
  setInterval(loadLive, 15000);
})();
