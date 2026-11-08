// Piloto automático de prueba: da 2 vueltas y reporta tiempos.  node tools/bot.js
const C = require('../js/car.js'); global.SURFACES = C.SURFACES;
const T = require('../js/track.js'); Object.assign(global, T); const { Track } = T;
const { TRACK_DEFS } = require('../js/tracks.js');
const tr = new Track(TRACK_DEFS[0]); const DT = 1 / 240;
const [x, y, h] = tr.gridSlot(0); const car = new C.Car(x, y, h); car.idx = tr.query(x, y).i;
let t = 0, hits = 0, grass = 0, maxBeta = 0, dist = 0, lastD = null, laps = [], lapT = null;
const startI = tr.cpIdx[0];
while (t < 200 && laps.length < 2) {
  const q = tr.query(car.x, car.y, car.idx, 12); const surf = tr.surfaceAt(q); if (surf.name === 'pasto') grass++;
  // mirar adelante según velocidad, velocidad objetivo según curvatura próxima
  const look = 4 + car.speed * 0.35; const [tx, ty] = tr.pointAt(q.d + look, 0);
  let ang = Math.atan2(ty - car.y, tx - car.x) - car.angle; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  let kmax = 0; for (let k = 0; k < 60; k++) kmax = Math.max(kmax, Math.abs(tr.curv[tr.wrap(q.i + Math.round(car.speed * 0.6) + k)]));
  const vt = Math.sqrt(1.3 * 9.81 / Math.max(kmax, 1e-3));
  const inp = { throttle: car.speed < vt ? 1 : 0, brake: car.speed > vt + 1.5 ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 6)) };
  car.step(DT, inp, surf);
  C.collideCarWalls(car, tr, (c, j) => { if (j > 300) hits++; });
  const q2 = tr.query(car.x, car.y, car.idx, 12);
  const N = tr.N, b = (q2.i - car.idx + N) % N, a = (startI - car.idx + N) % N;
  if (b > 0 && b < N / 2 && a > 0 && a <= b) { if (lapT != null) laps.push(t - lapT); lapT = t; }
  car.idx = q2.i; maxBeta = Math.max(maxBeta, Math.abs(car.beta || 0)); t += DT;
}
console.log('vueltas:', laps.map(l => l.toFixed(2) + 's').join(' / '), '| golpes', hits, '| pasos en pasto', grass, '| derrape máx', (maxBeta * 57.3).toFixed(1) + '°', '| prom', (tr.length / laps[1] * 3.6).toFixed(0), 'km/h');
