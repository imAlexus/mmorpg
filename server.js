
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Supabase client per validare JWT lato server
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

// Middleware di autenticazione Socket.IO
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data?.user) return next(new Error('Invalid token'));
    socket.user = data.user; // user.id, user.email
    next();
  } catch (e) {
    next(e);
  }
});

// --- Simple in-memory world state ---
const WORLD = {
  width: 2000,
  height: 1200,
  players: {} // id -> { x, y, name, color, uid, lastInputSeq, hp }
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function randomColor() {
  const hues = [0, 30, 60, 120, 180, 210, 240, 280, 320];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h} 90% 55%)`;
}

function nameFromEmail(email) {
  if (!email) return 'Avventuriero';
  const local = email.split('@')[0];
  return local.slice(0, 20);
}

io.on('connection', (socket) => {
  // Spawn per utente autenticato
  const spawn = {
    x: WORLD.width / 2 + (Math.random() * 200 - 100),
    y: WORLD.height / 2 + (Math.random() * 200 - 100),
    name: nameFromEmail(socket.user?.email),
    color: randomColor(),
    uid: socket.user?.id || null,
    lastInputSeq: 0,
    hp: Math.floor(Math.random() * 50 + 50)
  };
  WORLD.players[socket.id] = spawn;

  // Invia snapshot iniziale
  socket.emit('hello', {
    id: socket.id,
    world: { width: WORLD.width, height: WORLD.height },
    players: WORLD.players
  });

  // Notifica altri
  socket.broadcast.emit('join', { id: socket.id, player: WORLD.players[socket.id] });

  // Movimento
  socket.on('move', (payload) => {
    const p = WORLD.players[socket.id];
    if (!p) return;
    const { dx = 0, dy = 0, dt = 16, seq = 0 } = payload || {};
    const speed = 220; // px/sec
    const nx = p.x + dx * speed * (dt / 1000);
    const ny = p.y + dy * speed * (dt / 1000);
    p.x = clamp(nx, 20, WORLD.width - 20);
    p.y = clamp(ny, 20, WORLD.height - 20);
    p.lastInputSeq = Math.max(p.lastInputSeq, seq);
  });

  // Chat
  socket.on('chat', (msg) => {
    const p = WORLD.players[socket.id];
    const text = ('' + (msg?.text ?? '')).slice(0, 200);
    if (!text.trim()) return;
    io.emit('chat', { id: socket.id, name: p?.name ?? '???', text, ts: Date.now() });
  });

  // Cambia nome/colore
  socket.on('setName', (name) => {
    const p = WORLD.players[socket.id];
    if (!p) return;
    const clean = ('' + name).slice(0, 20).trim();
    if (clean) p.name = clean;
  });
  socket.on('setColor', (color) => {
    const p = WORLD.players[socket.id];
    if (!p) return;
    const clean = ('' + color).trim().slice(0, 10);
    p.color = clean || p.color;
  });

  // Ping round-trip
  socket.on('pingCheck', (clientTs) => {
    socket.emit('pongCheck', clientTs);
  });

  socket.on('disconnect', () => {
    delete WORLD.players[socket.id];
    socket.broadcast.emit('leave', { id: socket.id });
  });
});

// Broadcast stato mondo
setInterval(() => {
  io.emit('state', { players: WORLD.players, ts: Date.now() });
}, 50);

server.listen(PORT, () => {
  console.log('MMO Auth starter on http://localhost:' + PORT);
});
