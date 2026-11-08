'use strict';
// ============================================================================
//  SERVIDOR PARA JUGAR EN RED LOCAL
//  Uso:  npm install   (una sola vez)
//        npm start     (o: node server.js)
//  Después, cada compu de la red abre en el navegador la dirección que se
//  muestra (http://IP:8080) y elige "Modo: En red".
//
//  El servidor sirve los archivos del juego y simula la carrera (es el árbitro):
//  recibe los controles de cada jugador y manda a todos el estado ~60 veces/s.
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { RaceSim, SIM_DT, packCar } = require('./js/sim.js');

let PORT = +process.env.PORT || 8080;
const ROOT = __dirname;
const MAX_PLAYERS = 8;
const SEND_HZ = 60;
const COLORS = [
  ['#e53935', '#ffffff'], ['#1e88e5', '#ffeb3b'], ['#43a047', '#ffffff'], ['#fdd835', '#212121'],
  ['#8e24aa', '#ffffff'], ['#fb8c00', '#212121'], ['#00acc1', '#ffffff'], ['#6d4c41', '#ffe082'],
];

// ------------------------------------------------------------ archivos del juego
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(ROOT, url));
  const allowed = file === path.join(ROOT, 'index.html') || file.startsWith(path.join(ROOT, 'js') + path.sep);
  if (!allowed) { res.writeHead(404); return res.end('No encontrado'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

// ------------------------------------------------------------ sala y carrera
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map();          // ws -> { id, name, color, accent, input }
let nextId = 1, hostId = null;
let settings = { track: 0, laps: 3, damage: true };
let state = 'lobby';                // lobby | race
let sim = null, simTime = 0, resultsAt = null, startMsg = null;

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const broadcast = o => { const s = JSON.stringify(o); for (const ws of clients.keys()) if (ws.readyState === 1) ws.send(s); };
const clean = s => String(s || '').replace(/[<>&"']/g, '').trim().slice(0, 16);

function lobbyMsg() {
  return {
    t: 'lobby', state, hostId, settings, urls: lanUrls(),
    players: [...clients.values()].map(c => ({ id: c.id, name: c.name, color: c.color })),
  };
}

function freeColor() {
  const used = new Set([...clients.values()].map(c => c.color));
  return COLORS.find(([c]) => !used.has(c)) || COLORS[0];
}

wss.on('connection', ws => {
  if (clients.size >= MAX_PLAYERS) { send(ws, { t: 'full' }); return ws.close(); }
  const [color, accent] = freeColor();
  const me = { id: nextId++, name: `Jugador ${nextId - 1}`, color, accent, input: { throttle: 0, brake: 0, steer: 0 } };
  clients.set(ws, me);
  if (hostId == null) hostId = me.id;
  send(ws, { t: 'welcome', id: me.id });
  broadcast(lobbyMsg());
  if (state === 'race' && startMsg) send(ws, startMsg);   // llega tarde: mira la carrera

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'i') {
      const n = v => (typeof v === 'number' && isFinite(v) ? v : 0);
      me.input = { throttle: Math.max(0, Math.min(1, n(m.th))), brake: Math.max(0, Math.min(1, n(m.br))), steer: Math.max(-1, Math.min(1, n(m.st))) };
    } else if (m.t === 'name') {
      me.name = clean(m.name) || me.name; broadcast(lobbyMsg());
    } else if (m.t === 'settings' && me.id === hostId && state === 'lobby') {
      const tr = +m.track, laps = +m.laps;
      if (Number.isInteger(tr) && tr >= 0 && tr < TRACK_DEFS.length) settings.track = tr;
      if (Number.isInteger(laps) && laps >= 1 && laps <= 20) settings.laps = laps;
      if (typeof m.damage === 'boolean') settings.damage = m.damage;
      broadcast(lobbyMsg());
    } else if (m.t === 'start' && me.id === hostId && state === 'lobby') {
      startRace();
    } else if (m.t === 'lobby' && me.id === hostId && state === 'race') {
      endRace();
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (hostId === me.id) hostId = clients.size ? [...clients.values()][0].id : null;
    if (!clients.size) endRace(true);
    else broadcast(lobbyMsg());
  });
});

function startRace() {
  const players = [...clients.values()].map((c, k) => ({ id: c.id, name: c.name, color: c.color, accent: c.accent, num: k + 1 }));
  sim = new RaceSim(settings.track, Object.assign({}, settings), players);
  simTime = 0; resultsAt = null; state = 'race';
  startMsg = { t: 'start', track: settings.track, laps: settings.laps, damage: settings.damage, players };
  broadcast(startMsg);
  broadcast(lobbyMsg());
  console.log(`Carrera: ${TRACK_DEFS[settings.track].name}, ${settings.laps} vueltas, ${players.length} jugadores`);
}

function endRace(silent) {
  sim = null; state = 'lobby'; startMsg = null;
  if (!silent) broadcast(lobbyMsg());
}

// bucle de simulación: física a 240 Hz, envío a ~60 Hz
let last = process.hrtime.bigint(), acc = 0;
setInterval(() => {
  const now = process.hrtime.bigint();
  acc += Number(now - last) / 1e9; last = now;
  if (!sim) { acc = 0; return; }
  const inputs = new Map([...clients.values()].map(c => [c.id, c.input]));
  let n = 0;
  while (acc >= SIM_DT && n++ < 60) { sim.step(SIM_DT, car => inputs.get(car.id)); acc -= SIM_DT; simTime += SIM_DT; }
  if (n >= 60) acc = 0;
  if (sim.state === 'results' && resultsAt == null) resultsAt = simTime;
  const props = [];
  for (const p of sim.props) props.push(Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.angle * 100) / 100);
  broadcast({ t: 's', tm: +simTime.toFixed(4), st: sim.state, rt: +sim.raceTime.toFixed(3), ct: +sim.countT.toFixed(3),
    gt: sim.goTime, c: sim.cars.map(packCar), p: props, e: sim.takeEvents() });
  if (resultsAt != null && simTime - resultsAt > 30) endRace();   // vuelve sola a la sala
}, 1000 / SEND_HZ);

// si el puerto está ocupado por otro programa, probar con el siguiente
let tries = 0;
server.on('error', err => {
  if (err.code === 'EADDRINUSE' && tries++ < 10) {
    console.log(`  El puerto ${PORT} está ocupado, pruebo con ${PORT + 1}…`);
    PORT++; setTimeout(() => server.listen(PORT, '0.0.0.0'), 100);
  } else { console.error(err); process.exit(1); }
});
wss.on('error', () => {});   // los errores de puerto se manejan arriba
server.on('listening', () => {
  console.log('\n  Vuelta Rápida — servidor en red local');
  console.log('  Abrí en cada compu de la red (mismo Wi-Fi / cable):');
  for (const u of lanUrls()) console.log('     ' + u);
  console.log(`  En esta compu también: http://localhost:${PORT}`);
  console.log('  Elegí "Modo: En red" en el menú. Ctrl+C para cerrar.\n');
});
server.listen(PORT, '0.0.0.0');
