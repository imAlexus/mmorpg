import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// === CONFIG SUPABASE (le tue chiavi) ===
const SUPABASE_URL  = 'https://umpopyjonjdlrfhrmrpi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcG9weWpvbmpkbHJmaHJtcnBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMzU4ODcsImV4cCI6MjA3NjgxMTg4N30.L7ggbDAe6CzsQ9hIARarJHRLo1NBndES5qFNBk3AAJU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// === DOM ===
const canvas   = document.getElementById('game');
const ctx      = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const nameInput   = document.getElementById('name');
const setNameBtn  = document.getElementById('setName');
const chatInput = document.getElementById('chatInput');
const chatLog   = document.getElementById('chatLog');

const authEl   = document.getElementById('auth');
const emailEl  = document.getElementById('authEmail');
const passEl   = document.getElementById('authPass');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const authErr  = document.getElementById('authErr');

// === Profilo (badge) — opzionale ===
const userProfileEl = document.getElementById('userProfile');
const userButtonEl  = document.getElementById('userButton');
const userAvatarEl  = document.getElementById('userAvatar');
const userNameEl    = document.getElementById('userName');
const userMenuEl    = document.getElementById('userMenu');
const logoutBtn     = document.getElementById('btnLogout');

const hasProfileUI = !!(userProfileEl && userButtonEl && userAvatarEl && userNameEl && userMenuEl && logoutBtn);
if (!hasProfileUI) {
  console.warn('[UI] Badge profilo non trovato in index.html. Il login funziona comunque.');
}

// === Stato locale ===
const me = { id: null };
let world = { width: 2000, height: 1200 };
const players = {};
let last = performance.now();
let seq = 0;
let connected = false;
let socket;
let pingMs = 0;
const pingSamples = [];

// === Utility UI ===
function log(msg, opts = {}) {
  const line = document.createElement('div');
  line.className = 'msg';
  if (opts.self) line.classList.add('self');
  if (opts.name) {
    const n = document.createElement('span');
    n.className = 'name' + (opts.self ? ' self' : '');
    n.textContent = opts.name + ':';
    line.appendChild(n);
  }
  const t = document.createElement('span');
  t.textContent = ' ' + msg;
  line.appendChild(t);
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function showAuthGate(msg = '') {
  authEl.style.display = 'grid';
  if (msg) authErr.textContent = msg;
}
function hideAuthGate() {
  authEl.style.display = 'none';
  authErr.textContent = '';
}

// === Badge profilo (safe) ===
function firstLetter(s) {
  const t = (s || 'Ospite').trim();
  return t ? t[0].toUpperCase() : 'O';
}
function setProfileUI({ name = 'Ospite', email = '', loggedIn = false } = {}) {
  if (!hasProfileUI) return;
  const display = name || (email ? email.split('@')[0] : 'Ospite');
  userNameEl.textContent = display;
  userAvatarEl.textContent = firstLetter(display);
  userProfileEl.classList.toggle('logged-out', !loggedIn);
  userButtonEl.setAttribute('aria-expanded', 'false');
  userMenuEl.classList.remove('open');
}

// === Eventi profilo (safe) ===
if (hasProfileUI) {
  userButtonEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (userProfileEl.classList.contains('logged-out')) {
      showAuthGate();
      return;
    }
    const open = userMenuEl.classList.toggle('open');
    userButtonEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', () => {
    userMenuEl.classList.remove('open');
    userButtonEl.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      userMenuEl.classList.remove('open');
      userButtonEl.setAttribute('aria-expanded', 'false');
    }
  });
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    userMenuEl.classList.remove('open');
    try {
      if (socket) socket.disconnect();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('logout error:', err);
    }
  });
}

// === Flusso principale ===
window.addEventListener('error', (e) => console.error('JS error:', e.message));

async function startGameWithSession(session) {
  if (!session?.access_token) {
    showAuthGate('Non sei loggato. Fai login.');
    return;
  }
  hideAuthGate();

  const token = session.access_token;

  // eslint-disable-next-line no-undef
  socket = io({ auth: { token } });

  socket.on('connect', () => { connected = true; statusEl.textContent = 'online ✓'; });
  socket.on('disconnect', () => { connected = false; statusEl.textContent = 'disconnesso'; });
  socket.on('connect_error', (err) => {
    console.error('connect_error:', err);
    statusEl.textContent = 'errore auth/socket';
    showAuthGate('Accesso scaduto o non valido. Effettua di nuovo il login.');
    setProfileUI({ loggedIn: false });
  });

  // profilo
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const displayName = user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : 'Utente');
    setProfileUI({ name: displayName, email: user?.email, loggedIn: true });
  } catch (e) {
    console.warn('getUser failed:', e);
  }

  // --- eventi gioco ---
  socket.on('hello', (payload) => {
    me.id = payload.id;
    world = payload.world;
    Object.assign(players, payload.players);
    log('Sei entrato nel mondo');
  });
  socket.on('join', ({ id, player }) => { players[id] = player; log(player.name + ' è entrato'); });
  socket.on('leave', ({ id }) => { const n = players[id]?.name ?? id; delete players[id]; log(n + ' è uscito'); });
  socket.on('chat', ({ id, name, text }) => { const self = id === me.id; log(text, { name, self }); });
  socket.on('state', ({ players: ps }) => {
    for (const id of Object.keys(ps)) {
      if (!players[id]) players[id] = { x:0, y:0, name:'???', color:'#fff', hp:100 };
      Object.assign(players[id], ps[id]);
    }
    for (const id of Object.keys(players)) if (!ps[id]) delete players[id];
  });
  setInterval(() => {
    const start = performance.now();
    socket.emit('pingCheck', start);
  }, 2000);
  socket.on('pongCheck', (start) => {
    const ms = Math.round(performance.now() - start);
    pingSamples.push(ms); if (pingSamples.length > 5) pingSamples.shift();
    pingMs = Math.round(pingSamples.reduce((a,b)=>a+b,0)/pingSamples.length);
    statusEl.textContent = `online ✓ ${pingMs} ms`;
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const text = chatInput.value.trim(); if (text) socket.emit('chat', { text }); chatInput.value = ''; }
  });
  setNameBtn.addEventListener('click', () => { const v = nameInput.value.trim(); if (v) socket.emit('setName', v); });

  requestAnimationFrame(loop);
}

// avvio: controlla sessione esistente
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) startGameWithSession(session);
  else showAuthGate();
})();

// ascolta cambi auth
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    await startGameWithSession(session);
  }
  if (event === 'SIGNED_OUT') {
    setProfileUI({ loggedIn: false });
    showAuthGate('Ti sei disconnesso.');
  }
});

// register / login
btnRegister.addEventListener('click', async () => {
  authErr.textContent = '';
  const { data, error } = await supabase.auth.signUp(
    { email: emailEl.value.trim(), password: passEl.value },
    { emailRedirectTo: window.location.origin }
  );
  if (error) { authErr.textContent = error.message; return; }
  authErr.textContent = 'Controlla la tua email per confermare, poi fai Login.';
});
btnLogin.addEventListener('click', async () => {
  authErr.textContent = '';
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailEl.value.trim(),
    password: passEl.value
  });
  if (error) { authErr.textContent = error.message; return; }
});

// ---------- GAME LOOP ----------
const keys = new Set();
window.addEventListener('keydown', (e) => { if (document.activeElement === chatInput) return; keys.add(e.key.toLowerCase()); });
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function inputDir() {
  let dx=0, dy=0;
  if (keys.has('arrowleft')||keys.has('a')) dx-=1;
  if (keys.has('arrowright')||keys.has('d')) dx+=1;
  if (keys.has('arrowup')||keys.has('w')) dy-=1;
  if (keys.has('arrowdown')||keys.has('s')) dy+=1;
  const len = Math.hypot(dx,dy)||1;
  return { dx: dx/len, dy: dy/len };
}

function cameraFor(mePlayer) {
  const vw = canvas.width, vh = canvas.height;
  const cx = (mePlayer?.x ?? world.width/2) - vw/2;
  const cy = (mePlayer?.y ?? world.height/2) - vh/2;
  return { x: Math.max(0, Math.min(world.width - vw, cx)), y: Math.max(0, Math.min(world.height - vh, cy)) };
}

function drawGrid(cam) {
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let x=0; x<=world.width; x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,world.height);ctx.stroke();}
  for (let y=0; y<=world.height; y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(world.width,y);ctx.stroke();}
  ctx.restore();
}

function drawPlayers(cam) {
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  for (const id in players) {
    const p = players[id]; if (!p) continue;
    ctx.beginPath(); ctx.arc(p.x,p.y,16,0,Math.PI*2);
    ctx.fillStyle = p.color || '#fff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.stroke();
    const barW=36, barH=5, pct=(p.hp??100)/100;
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(p.x-barW/2,p.y-28,barW,barH);
    ctx.fillStyle=pct>0.3?'#0f0':'#f00'; ctx.fillRect(p.x-barW/2,p.y-28,barW*pct,barH);
    ctx.font='12px system-ui, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='white'; ctx.fillText(p.name??'???', p.x, p.y-36);
  }
  ctx.restore();
}

function drawMiniMap() {
  const w=200,h=120, scaleX=w/world.width, scaleY=h/world.height;
  const pad=16, x0=canvas.width-w-pad, y0=pad;
  ctx.save(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(x0,y0,w,h);
  for (const id in players) {
    const p = players[id]; const color = id===me.id ? '#00ff9f' : p.color || '#fff';
    ctx.fillStyle = color; ctx.fillRect(x0 + p.x*scaleX, y0 + p.y*scaleY, 3, 3);
  }
  ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.strokeRect(x0,y0,w,h); ctx.restore();
}

function loop(ts) {
  const dt = Math.min(50, ts - last); last = ts;
  if (window.io && socket) { const { dx, dy } = inputDir(); seq++; socket.emit('move', { dx, dy, dt, seq }); }
  const my = players[me.id]; const cam = cameraFor(my);
  ctx.clearRect(0,0,canvas.width,canvas.height); drawGrid(cam); drawPlayers(cam); drawMiniMap();
  ctx.save(); ctx.font='14px system-ui, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.85)';
  ctx.fillText('Giocatori: ' + Object.keys(players).length, 12, 20);
  ctx.fillText('Ping: ' + (connected ? pingMs + ' ms' : '—'), 12, 40); ctx.restore();
  requestAnimationFrame(loop);
}

// Resize canvas (16:9)
function resize() {
  const w = Math.min(window.innerWidth - 20, 1280);
  const h = Math.min(window.innerHeight - 200, 720);
  const ratio = 16/9; let cw=w, ch=Math.round(w/ratio);
  if (ch>h) { ch=h; cw=Math.round(h*ratio); }
  canvas.width=cw; canvas.height=ch;
}
window.addEventListener('resize', resize); resize();
