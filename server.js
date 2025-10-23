
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --- Simple in-memory world state ---
const WORLD = {
  width: 2000,
  height: 1200,
  players: {} // id -> { x, y, name, color, lastInputSeq }
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function randomColor() {
  const hues = [0, 30, 60, 120, 180, 210, 240, 280, 320];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h} 90% 55%)`;
}

function randomName() {
  const animals = ['Volpe','Panda','Lupo','Tigre','Drago','Aquila','Gatto','Delfino','Koala','Ibis'];
  return animals[Math.floor(Math.random() * animals.length)] + '#' + Math.floor(Math.random()*900+100);
}

io.on('connection', (socket) => {
  // Spawn a player in the center
  const spawn = {
    x: WORLD.width / 2 + (Math.random() * 200 - 100),
    y: WORLD.height / 2 + (Math.random() * 200 - 100),
    name: randomName(),
    color: randomColor(),
    lastInputSeq: 0
  };
  WORLD.players[socket.id] = spawn;

  // Send initial snapshot
  socket.emit('hello', {
    id: socket.id,
    world: { width: WORLD.width, height: WORLD.height },
    players: WORLD.players
  });

  // Ping/Pong per misurare il round-trip (latency)
  socket.on('pingCheck', (clientTs) => {
    // Rimanda al client lo stesso timestamp
    socket.emit('pongCheck', clientTs);
  });

  // Let others know
  socket.broadcast.emit('join', { id: socket.id, player: WORLD.players[socket.id] });

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

  socket.on('chat', (msg) => {
    const p = WORLD.players[socket.id];
    const text = ('' + (msg?.text ?? '')).slice(0, 200);
    if (!text.trim()) return;
    io.emit('chat', { id: socket.id, name: p?.name ?? '???', text, ts: Date.now() });
  });

  socket.on('setName', (name) => {
    const p = WORLD.players[socket.id];
    if (!p) return;
    const clean = ('' + name).slice(0, 20);
    if (clean.trim()) p.name = clean;
  });

  socket.on('disconnect', () => {
    delete WORLD.players[socket.id];
    socket.broadcast.emit('leave', { id: socket.id });
  });
});

// Broadcast world state at 20 ticks/sec
setInterval(() => {
  io.emit('state', { players: WORLD.players, ts: Date.now() });
}, 50);

server.listen(PORT, () => {
  console.log('MMORPG starter running on http://localhost:' + PORT);
});
