
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Inserisci i TUOI valori (o usa .env sul server e sostituisci in build)
const SUPABASE_URL = 'https://umpopyjonjdlrfhrmrpi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcG9weWpvbmpkbHJmaHJtcnBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMzU4ODcsImV4cCI6MjA3NjgxMTg4N30.L7ggbDAe6CzsQ9hIARarJHRLo1NBndES5qFNBk3AAJU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('name');
const setNameBtn = document.getElementById('setName');
const chatInput = document.getElementById('chatInput');
const chatLog = document.getElementById('chatLog');

const $ = (q) => document.querySelector(q);
const authEl = $('#auth');
const emailEl = $('#authEmail');
const passEl  = $('#authPass');
const btnLogin = $('#btnLogin');
const btnRegister = $('#btnRegister');
const authErr = $('#authErr');

const me = { id: null };
let world = { width: 2000, height: 1200 };
const players = {}; // id -> state
let last = performance.now();
let seq = 0;
let connected = false;

let socket;
let pingMs = 0;
const pingSamples = [];

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

function hideAuth() { authEl.style.display = 'none'; }
async function showError(err) { authErr.textContent = err?.message || err || ''; }

// ======== AUTH FLOW ========
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) authEl.style.display = 'grid';
  else await startGameWithSession(session);
})();

btnRegister.addEventListener('click', async () => {
  authErr.textContent = '';
  const { data, error } = await supabase.auth.signUp({ email: emailEl.value, password: passEl.value });
  if (error) return showError(error);
  const { data: sess } = await supabase.auth.getSession();
  if (sess?.session) await startGameWithSession(sess.session);
});

btnLogin.addEventListener('click', async () => {
  authErr.textContent = '';
  const { data, error } = await supabase.auth.signInWithPassword({ email: emailEl.value, password: passEl.value });
  if (error) return showError(error);
  await startGameWithSession(data.session);
});

async function startGameWithSession(session) {
  hideAuth();
  const token = session.access_token;

  // Crea socket passando il JWT
  // Nota: il server validarà il token nel middleware
  // eslint-disable-next-line no-undef
  socket = io({ auth: { token } });

  // Socket handlers
  socket.on('connect', () => {
    connected = true;
    statusEl.textContent = 'online ✓';
  });
  socket.on('disconnect', () => {
    connected = false;
    statusEl.textContent = 'disconnesso';
  });

  socket.on('hello', (payload) => {
    me.id = payload.id;
    world = payload.world;
    Object.assign(players, payload.players);
    log('Sei entrato nel mondo');
  });

  socket.on('join', ({ id, player }) => {
    players[id] = player;
    log(`${player.name} è entrato`);
  });
  socket.on('leave', ({ id }) => {
    const n = players[id]?.name ?? id;
    delete players[id];
    log(`${n} è uscito`);
  });

  socket.on('chat', ({ id, name, text }) => {
    const self = id === me.id;
    log(text, { name, self });
  });

  socket.on('state', ({ players: ps }) => {
    for (const id of Object.keys(ps)) {
      if (!players[id]) players[id] = { x: 0, y: 0, name: '???', color: '#fff', hp: 100 };
      Object.assign(players[id], ps[id]);
    }
    for (const id of Object.keys(players)) {
      if (!ps[id]) delete players[id];
    }
  });

  // Ping ogni 2s
  setInterval(() => {
    const start = performance.now();
    socket.emit('pingCheck', start);
  }, 2000);
  socket.on('pongCheck', (start) => {
    const ms = Math.round(performance.now() - start);
    pingSamples.push(ms);
    if (pingSamples.length > 5) pingSamples.shift();
    pingMs = Math.round(pingSamples.reduce((a, b) => a + b, 0) / pingSamples.length);
    statusEl.textContent = `online ✓ ${pingMs} ms`;
  });

  // Input chat
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = chatInput.value.trim();
      if (text) socket.emit('chat', { text });
      chatInput.value = '';
    }
  });

  // Set name
  setNameBtn.addEventListener('click', () => {
    const v = nameInput.value.trim();
    if (v) socket.emit('setName', v);
  });

  // Start render loop
  requestAnimationFrame(loop);
}

// ======== GAME LOOP & RENDER ========
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return; // non catturare quando scrivi in chat
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function inputDir() {
  let dx = 0, dy = 0;
  if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
  if (keys.has('arrowright') || keys.has('d')) dx += 1;
  if (keys.has('arrowup') || keys.has('w')) dy -= 1;
  if (keys.has('arrowdown') || keys.has('s')) dy += 1;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx/len, dy: dy/len };
}

function cameraFor(mePlayer) {
  const vw = canvas.width, vh = canvas.height;
  const cx = (mePlayer?.x ?? world.width/2) - vw/2;
  const cy = (mePlayer?.y ?? world.height/2) - vh/2;
  return { x: Math.max(0, Math.min(world.width - vw, cx)),
           y: Math.max(0, Math.min(world.height - vh, cy)) };
}

function drawGrid(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let x = 0; x <= world.width; x += 100) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.height); ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += 100) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawPlayers(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const id in players) {
    const p = players[id];
    if (!p) continue;

    // body
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = p.color || '#fff';
    ctx.fill();

    // outline
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();

    // barra vita
    const barW = 36, barH = 5;
    const pct = (p.hp ?? 100) / 100;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - barW / 2, p.y - 28, barW, barH);
    ctx.fillStyle = pct > 0.3 ? '#0f0' : '#f00';
    ctx.fillRect(p.x - barW / 2, p.y - 28, barW * pct, barH);

    // nome
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.fillText(p.name ?? '???', p.x, p.y - 36);
  }

  ctx.restore();
}

function drawMiniMap() {
  const w = 200, h = 120;
  const scaleX = w / world.width;
  const scaleY = h / world.height;

  const pad = 16;
  const x0 = canvas.width - w - pad;
  const y0 = pad;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x0, y0, w, h);

  for (const id in players) {
    const p = players[id];
    const color = id === me.id ? '#00ff9f' : p.color || '#fff';
    ctx.fillStyle = color;
    ctx.fillRect(x0 + p.x * scaleX, y0 + p.y * scaleY, 3, 3);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();
}

function loop(ts) {
  const dt = Math.min(50, ts - last);
  last = ts;

  // invia input al server
  if (socket) {
    const { dx, dy } = inputDir();
    seq++;
    socket.emit('move', { dx, dy, dt, seq });
  }

  const my = players[me.id];
  const cam = cameraFor(my);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(cam);
  drawPlayers(cam);
  drawMiniMap();

  // HUD
  ctx.save();
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Giocatori: ' + Object.keys(players).length, 12, 20);
  ctx.fillText('Ping: ' + (connected ? pingMs + ' ms' : '—'), 12, 40);
  ctx.restore();

  requestAnimationFrame(loop);
}

// Resize 16:9
function resize() {
  const w = Math.min(window.innerWidth - 20, 1280);
  const h = Math.min(window.innerHeight - 200, 720);
  const ratio = 16/9;
  let cw = w, ch = Math.round(w/ratio);
  if (ch > h) { ch = h; cw = Math.round(h*ratio); }
  canvas.width = cw; canvas.height = ch;
}
window.addEventListener('resize', resize);
resize();
