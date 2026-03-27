'use strict';

/* ═══════════════════════════════════════
   KNIVES CONFIG
═══════════════════════════════════════ */
const KNIVES = [
  { name: 'Rusty Knife',     rarity: 'common',    value: 5,   emoji: '🗡️' },
  { name: 'Forest Blade',    rarity: 'uncommon',  value: 15,  emoji: '🔪' },
  { name: 'Crimson Edge',    rarity: 'rare',      value: 25,  emoji: '🔪' },
  { name: 'Shadow Cutter',   rarity: 'epic',      value: 40,  emoji: '⚔️' },
  { name: 'Golden Blade',    rarity: 'legendary', value: 60,  emoji: '🗡️' },
  { name: 'Void Dagger',     rarity: 'mythical',  value: 80,  emoji: '🗡️' },
  { name: 'Celestial Knife', rarity: 'celestial', value: 100, emoji: '✨' },
];

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1486783614388666448/yTR9D5E-hSwzP2Yn2am1ig81dWMDrDpCzlS-yXTTH_OrX3xvw-j4C4QDWuSgk9FFpBDN';

const CASE_COST   = 10;
const ITEM_W      = 108;
const ITEM_GAP    = 10;
const ITEM_TOTAL  = ITEM_W + ITEM_GAP;
const STRIP_COUNT = 60;
const WINNER_IDX  = 45;

/* ═══════════════════════════════════════
   STORAGE HELPERS
═══════════════════════════════════════ */
const ADMIN_PW_HASH = btoa('KnifeAdmin123' + 'kc_salt_2024');

function hashPw(pw) { return btoa(pw + 'kc_salt_2024'); }

function loadUsers()     { return JSON.parse(localStorage.getItem('kc_users')     || '[]'); }
function loadInventory() { return JSON.parse(localStorage.getItem('kc_inventory') || '[]'); }
function saveUsers(u)    { localStorage.setItem('kc_users', JSON.stringify(u)); }
function saveInventory(i){ localStorage.setItem('kc_inventory', JSON.stringify(i)); }
function genId()         { return Date.now() + Math.floor(Math.random() * 10000); }

function ensureAdmin() {
  const users = loadUsers();
  if (!users.find(u => u.username === 'admin')) {
    users.unshift({ id: 1, username: 'admin', password: ADMIN_PW_HASH, keys: 999999, isAdmin: true });
    saveUsers(users);
  }
}

/* ═══════════════════════════════════════
   SESSION STATE
═══════════════════════════════════════ */
let currentUser    = null;
let isSpinning     = false;
let selectedInvIds = new Set();
let inventoryData  = [];

/* ═══════════════════════════════════════
   SOUND (Web Audio API)
═══════════════════════════════════════ */
let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function note(freq, type, start, dur, vol, ctx) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.start(start); o.stop(start + dur + 0.01);
}

function playTick(vol) {
  try { const ctx = getCtx(); note(800, 'square', ctx.currentTime, 0.04, vol || 0.06, ctx); } catch(e) {}
}

function playWin(rarity) {
  try {
    const ctx = getCtx();
    const scales = {
      common:    [440, 523],
      uncommon:  [440, 523, 659],
      rare:      [440, 554, 659, 784],
      epic:      [523, 659, 784, 988],
      legendary: [523, 659, 784, 988, 1047],
      mythical:  [659, 784, 988, 1175, 1319],
      celestial: [659, 784, 988, 1175, 1319, 1568, 2093],
    };
    (scales[rarity] || scales.common).forEach((f, i) => note(f, 'sine', ctx.currentTime + i * 0.13, 0.45, 0.18, ctx));
  } catch(e) {}
}

function playCoin() {
  try {
    const ctx = getCtx();
    [1047, 1319, 1568].forEach((f, i) => note(f, 'sine', ctx.currentTime + i * 0.1, 0.3, 0.12, ctx));
  } catch(e) {}
}

function playWithdraw() {
  try {
    const ctx = getCtx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(200, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.4);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    o.start(); o.stop(ctx.currentTime + 0.6);
    setTimeout(() => { try { note(1047, 'sine', getCtx().currentTime, 0.3, 0.12, getCtx()); } catch(e) {} }, 500);
  } catch(e) {}
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
function showAuthTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('atab-login').classList.toggle('active', tab === 'login');
  document.getElementById('atab-register').classList.toggle('active', tab === 'register');
  document.getElementById('l-err').textContent = '';
  document.getElementById('r-err').textContent = '';
}

function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('l-user').value.trim();
  const password = document.getElementById('l-pass').value;
  const errEl    = document.getElementById('l-err');
  errEl.textContent = '';

  if (username === 'admin') {
    if (hashPw(password) !== ADMIN_PW_HASH) { errEl.textContent = 'Invalid password'; return; }
    ensureAdmin();
    const users = loadUsers();
    const admin = users.find(u => u.username === 'admin');
    setUser(admin); return;
  }

  const users = loadUsers();
  const user  = users.find(u => u.username === username && u.password === hashPw(password));
  if (!user) { errEl.textContent = 'Invalid username or password'; return; }
  setUser(user);
}

function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('r-user').value.trim();
  const password = document.getElementById('r-pass').value;
  const errEl    = document.getElementById('r-err');
  errEl.textContent = '';

  if (username.toLowerCase() === 'admin') { errEl.textContent = 'Username not available'; return; }
  if (username.length < 3) { errEl.textContent = 'Username must be at least 3 characters'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters'; return; }

  const users = loadUsers();
  if (users.find(u => u.username === username)) { errEl.textContent = 'Username already taken'; return; }

  const newUser = { id: genId(), username, password: hashPw(password), keys: 0, isAdmin: false };
  users.push(newUser);
  saveUsers(users);
  setUser(newUser);
}

function setUser(user) {
  currentUser = { ...user };
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('uname-display').textContent = user.username;
  updateKeys(user.keys);
  if (user.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
  initPossibleDrops();
  buildIdleReel();
  switchTab('case');
}

function logout() {
  currentUser    = null;
  isSpinning     = false;
  selectedInvIds = new Set();
  inventoryData  = [];
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  showAuthTab('login');
}

function updateKeys(keys) {
  if (currentUser) {
    currentUser.keys = keys;
    const users = loadUsers();
    const idx   = users.findIndex(u => u.id === currentUser.id);
    if (idx !== -1) { users[idx].keys = keys; saveUsers(users); }
  }
  document.getElementById('keys-count').textContent = keys;
}

/* ═══════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════ */
function switchTab(tab) {
  ['case','inventory','admin'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`ntab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'inventory') loadInventory();
  if (tab === 'admin')     loadAdminUsers();
}

/* ═══════════════════════════════════════
   POSSIBLE DROPS
═══════════════════════════════════════ */
function initPossibleDrops() {
  document.getElementById('possible-grid').innerHTML = KNIVES.map(k => `
    <div class="icard rarity-${k.rarity}">
      <div class="icard-emoji">${k.emoji}</div>
      <div class="iname">${k.name}</div>
      <div class="ival">🪙 ${k.value}</div>
      <div class="rarity-badge ${k.rarity}">${k.rarity}</div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════
   REEL
═══════════════════════════════════════ */
function knifeAt(winner, idx) {
  return idx === WINNER_IDX ? winner : KNIVES[Math.floor(Math.random() * KNIVES.length)];
}

function makeReelCard(knife) {
  const d = document.createElement('div');
  d.className = `ri ri-${knife.rarity}`;
  d.innerHTML = `
    <span class="ri-emoji">${knife.emoji}</span>
    <div class="ri-name">${knife.name}</div>
    <div class="ri-val">🪙${knife.value}</div>
  `;
  return d;
}

function getStartX() {
  const vp = document.getElementById('reel-viewport');
  return (vp.offsetWidth || 800) / 2 - ITEM_W / 2;
}

function buildIdleReel() {
  const strip = document.getElementById('reel-strip');
  strip.innerHTML = '';
  strip.style.transition = 'none';
  strip.style.transform  = `translateX(${getStartX()}px)`;
  for (let i = 0; i < STRIP_COUNT; i++) {
    strip.appendChild(makeReelCard(KNIVES[Math.floor(Math.random() * KNIVES.length)]));
  }
}

function buildWinnerReel(winner) {
  const strip  = document.getElementById('reel-strip');
  strip.innerHTML = '';
  strip.style.transition = 'none';
  strip.style.transform  = `translateX(${getStartX()}px)`;
  strip.offsetHeight; // reflow
  for (let i = 0; i < STRIP_COUNT; i++) {
    strip.appendChild(makeReelCard(knifeAt(winner, i)));
  }
}

function scheduleTickSounds() {
  let t = 0, interval = 28;
  while (t < 5900) {
    const vol = Math.max(0.012, 0.07 - (t / 6000) * 0.058);
    setTimeout(() => playTick(vol), t);
    interval = Math.min(interval * 1.075, 430);
    t += interval;
  }
}

/* ═══════════════════════════════════════
   CASE OPENING
═══════════════════════════════════════ */
function openCase() {
  if (isSpinning || !currentUser) return;
  if (currentUser.keys < CASE_COST) {
    alert("You don't have enough keys! Ask an admin for more.");
    return;
  }

  isSpinning = true;
  const btn = document.getElementById('open-btn');
  btn.disabled = true;
  btn.textContent = 'SPINNING...';

  // Deduct keys immediately
  updateKeys(currentUser.keys - CASE_COST);

  // Pick winner (fair — equal 1/7 chance)
  const winner = KNIVES[Math.floor(Math.random() * KNIVES.length)];

  // Add item to inventory
  const inv = loadInventory();
  const newItem = { id: genId(), userId: currentUser.id, itemName: winner.name, rarity: winner.rarity, value: winner.value, obtainedAt: new Date().toISOString() };
  inv.push(newItem);
  saveInventory(inv);

  // Build reel with winner at slot 45
  buildWinnerReel(winner);

  const startX = getStartX();
  const endX   = startX - WINNER_IDX * ITEM_TOTAL + Math.floor(Math.random() * 30) - 15;

  // Animate
  setTimeout(() => {
    const strip = document.getElementById('reel-strip');
    strip.style.transition = 'transform 6s cubic-bezier(0.12, 0.85, 0.25, 1)';
    strip.style.transform  = `translateX(${endX}px)`;
    scheduleTickSounds();

    setTimeout(() => {
      // Highlight winner card
      const cards = document.getElementById('reel-strip').querySelectorAll('.ri');
      if (cards[WINNER_IDX]) cards[WINNER_IDX].classList.add('winner');
      playWin(winner.rarity);

      setTimeout(() => {
        showWinModal(winner, currentUser.keys);
        isSpinning = false;
        btn.disabled = false;
        btn.textContent = '⚡ OPEN CASE';
      }, 700);
    }, 6100);
  }, 30);
}

/* ═══════════════════════════════════════
   WIN MODAL
═══════════════════════════════════════ */
function showWinModal(knife, keysLeft) {
  document.getElementById('mknife-emoji').textContent = knife.emoji;
  document.getElementById('mname').textContent        = knife.name;
  document.getElementById('mcoins').textContent       = `🪙 ${knife.value} Coins = ${knife.value} Robux`;
  document.getElementById('mkeys').textContent        = `🗝️ ${keysLeft} keys remaining`;
  const badge = document.getElementById('mbadge');
  badge.textContent = knife.rarity;
  badge.className   = `rarity-badge mbadge ${knife.rarity}`;
  const glow = document.getElementById('modal-glow');
  glow.className = `modal-glow ${knife.rarity}`;
  document.getElementById('win-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('win-modal').classList.add('hidden');
}

/* ═══════════════════════════════════════
   INVENTORY
═══════════════════════════════════════ */
function loadInventory() {
  selectedInvIds.clear();
  updateWithdrawBar();
  if (!currentUser) return;

  inventoryData = (loadInventory_raw()).filter(i => i.userId === currentUser.id);
  const grid    = document.getElementById('inv-grid');
  document.getElementById('inv-badge').textContent = `${inventoryData.length} item${inventoryData.length !== 1 ? 's' : ''}`;

  if (inventoryData.length === 0) {
    grid.innerHTML = '<div class="empty-msg">No items yet — open a case!</div>';
    return;
  }

  grid.innerHTML = inventoryData.map(item => {
    const knife = KNIVES.find(k => k.name === item.itemName);
    const emoji = knife ? knife.emoji : '🔪';
    return `
      <div class="icard inv-item rarity-${item.rarity}" data-id="${item.id}" data-val="${item.value}" onclick="toggleItem(this)">
        <div class="sel-overlay"><span class="sel-check">✓</span></div>
        <div class="icard-emoji">${emoji}</div>
        <div class="iname">${item.itemName}</div>
        <div class="ival">🪙 ${item.value}</div>
        <div class="rarity-badge ${item.rarity}">${item.rarity}</div>
      </div>
    `;
  }).join('');
}

function loadInventory_raw() {
  return JSON.parse(localStorage.getItem('kc_inventory') || '[]');
}

function toggleItem(el) {
  const id = parseInt(el.dataset.id);
  if (selectedInvIds.has(id)) { selectedInvIds.delete(id); el.classList.remove('selected'); }
  else                         { selectedInvIds.add(id);    el.classList.add('selected'); }
  updateWithdrawBar();
}

function updateWithdrawBar() {
  const count = selectedInvIds.size;
  const total = inventoryData.filter(i => selectedInvIds.has(i.id)).reduce((s, i) => s + i.value, 0);
  document.getElementById('sel-count').textContent = `${count} selected`;
  document.getElementById('sel-robux').textContent = `${total} Robux`;
  document.getElementById('wb-bar').classList.toggle('hidden', count === 0);
}

async function withdraw() {
  if (selectedInvIds.size === 0 || !currentUser) return;

  const ids   = Array.from(selectedInvIds);
  const items = inventoryData.filter(i => ids.includes(i.id));
  const total = items.reduce((s, i) => s + i.value, 0);
  const list  = items.map(i => `• ${i.itemName} — ${i.value} Robux`).join('\n');

  const payload = {
    embeds: [{
      title: '🔪 KnifeCase Withdrawal',
      color: 0xf0bf30,
      fields: [
        { name: '👤 Player',     value: currentUser.username,        inline: true },
        { name: '💰 Total Value', value: `${total} Robux`,           inline: true },
        { name: '📦 Items',       value: list || 'none', inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'KnifeCase • Withdrawal' },
    }],
  };

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch(e) { /* Discord CORS on some origins — ignore */ }

  // Remove from inventory
  const allInv = loadInventory_raw().filter(i => !ids.includes(i.id));
  saveInventory(allInv);

  playWithdraw();
  alert(`✅ Withdrawn! ${items.length} item(s) worth ${total} Robux sent to Discord.`);
  loadInventory();
}

/* ═══════════════════════════════════════
   ADMIN PANEL
═══════════════════════════════════════ */
function loadAdminUsers() {
  if (!currentUser?.isAdmin) return;
  const users = loadUsers().filter(u => !u.isAdmin);
  const list  = document.getElementById('users-list');

  if (users.length === 0) {
    list.innerHTML = '<div class="empty-msg">No regular users registered yet.</div>';
    return;
  }

  list.innerHTML = users.map(u => `
    <div class="user-row" id="urow-${u.id}">
      <div class="ur-name">👤 ${u.username}</div>
      <div class="ur-keys" id="ukeys-${u.id}">🗝️ ${u.keys} keys</div>
      <div class="ur-give">
        <input type="number" id="ugive-${u.id}" placeholder="Amount" min="1" max="9999" value="10" />
        <button class="btn-give" onclick="giveKeys(${u.id})">GIVE KEYS</button>
      </div>
      <span class="ur-fb" id="ufb-${u.id}"></span>
    </div>
  `).join('');
}

function giveKeys(userId) {
  if (!currentUser?.isAdmin) return;
  const input  = document.getElementById(`ugive-${userId}`);
  const amount = parseInt(input.value);
  const fb     = document.getElementById(`ufb-${userId}`);
  const keysEl = document.getElementById(`ukeys-${userId}`);

  if (isNaN(amount) || amount <= 0) {
    fb.textContent = 'Enter a valid amount'; fb.className = 'ur-fb err'; return;
  }

  const users = loadUsers();
  const idx   = users.findIndex(u => u.id === userId);
  if (idx === -1) { fb.textContent = 'User not found'; fb.className = 'ur-fb err'; return; }

  users[idx].keys += amount;
  saveUsers(users);
  playCoin();

  keysEl.textContent = `🗝️ ${users[idx].keys} keys`;
  fb.textContent  = `✓ Gave ${amount} keys!`;
  fb.className    = 'ur-fb ok';
  input.value     = '10';
  setTimeout(() => { fb.textContent = ''; }, 3000);
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  ensureAdmin();
  showAuthTab('login');
});
