
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('name');
const setNameBtn = document.getElementById('setName');
const colorInput = document.getElementById('color');
const setColorBtn = document.getElementById('setColor');

const chatInput = document.getElementById('chatInput');
const chatLog = document.getElementById('chatLog');

const socket = io();

const me = { id: null };
let world = { width: 2000, height: 1200 };
const players = {}; // id -> state
let last = performance.now();
let seq = 0;
let connected = false;

// Ping data
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
  log('Sei entrato come ' + (players[me.id]?.name ?? '???'));
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
    if (!players[id]) players[id] = { x: 0, y: 0, name: '???', color: '#fff' };
    Object.assign(players[id], ps[id]);
  }
  for (const id of Object.keys(players)) {
    if (!ps[id]) delete players[id];
  }
});

// Name & Color
setNameBtn.addEventListener('click', () => {
  const v = nameInput.value.trim();
  if (v) socket.emit('setName', v);
});
setColorBtn.addEventListener('click', () => {
  socket.emit('setColor', colorInput.value);
});

// Chat input
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = chatInput.value.trim();
    if (text) socket.emit('chat', { text });
    chatInput.value = '';
  }
  e.stopPropagation();
});

// Movement keys
const keys = new Set();
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // non catturare quando si scrive
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
    // name
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.fillText(p.name ?? '???', p.x, p.y - 24);
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
  // background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x0, y0, w, h);

  for (const id in players) {
    const p = players[id];
    const color = id === me.id ? '#00ff9f' : (p.color || '#fff');
    ctx.fillStyle = color;
    ctx.fillRect(x0 + p.x * scaleX, y0 + p.y * scaleY, 3, 3);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();
}

// Ping loop
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

function loop(ts) {
  const dt = Math.min(50, ts - last);
  last = ts;

  // send input
  const { dx, dy } = inputDir();
  seq++;
  socket.emit('move', { dx, dy, dt, seq });

  // render
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
requestAnimationFrame(loop);

// Responsive canvas 16:9
function resize() {
  const w = Math.min(window.innerWidth - 20, 1280);
  const h = Math.min(window.innerHeight - 220, 720);
  const ratio = 16/9;
  let cw = w, ch = Math.round(w/ratio);
  if (ch > h) { ch = h; cw = Math.round(h*ratio); }
  canvas.width = cw; canvas.height = ch;
}
window.addEventListener('resize', resize);
resize();
