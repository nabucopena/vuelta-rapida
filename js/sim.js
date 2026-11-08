'use strict';
// ============================================================================
//  SIMULACIÓN DE CARRERA (compartida)
//  La misma lógica corre en el navegador (modo local) y en el servidor (modo
//  en red): física, choques, vueltas, checkpoints, daño, boxes y llegada.
//  No dibuja ni hace sonidos: deja "eventos" (choques, pitidos, vueltas) para
//  que quien la use los muestre.
// ============================================================================

if (typeof module !== 'undefined' && typeof Car === 'undefined') {
  // en Node: cargar los módulos y exponerlos como globales (igual que en el navegador)
  const C = require('./car.js'); Object.assign(global, C);
  const T = require('./track.js'); Object.assign(global, T);
  Object.assign(global, require('./tracks.js'));
}

const SIM_DT = 1 / 240;          // paso fijo de física
const PIT_LIMIT = 60 / 3.6;      // m/s
const REPAIR_RATE = 30;          // % por segundo detenido en el box
const NO_FINISH_TIMEOUT = 45;    // s después del ganador para cerrar la carrera

class RaceSim {
  // players: [{ id, name, color, accent, num }] · track: Track ya construida (opcional)
  constructor(trackIndex, settings, players, track) {
    this.settings = settings;
    this.track = track || new Track(TRACK_DEFS[trackIndex]);
    this.props = this.track.makeProps();
    this.cars = players.map((pl, k) => {
      const [x, y, h] = this.track.gridSlot(k);
      const car = new Car(x, y, h);
      car.id = pl.id; car.player = pl; car.num = pl.num || k + 1;
      car.idx = this.track.query(x, y).i; car.layer = this.track.layer[car.idx];
      car.lap = 0; car.nextCp = 0; car.lapStart = 0; car.best = null; car.lapTimes = [];
      car.finished = false; car.finishTime = null; car.finishPos = 0; car.position = k + 1;
      car.surfF = car.surfR = SURFACES.asphalt; car.surfName = '';
      car.inPit = false; car.repairing = false; car.offroad = false; car.d = 0;
      return car;
    });
    this.state = 'countdown';
    this.countT = 0; this.goTime = 3; this.lastCount = 4;
    this.raceTime = 0; this.endTimer = 0; this.firstFinish = null; this.finishCount = 0;
    this.events = [];
    this.order = this.cars.slice();
  }

  // inputs: función (car) => { throttle, brake, steer }
  step(dt, inputOf) {
    const tr = this.track;
    if (this.state === 'countdown') {
      this.countT += dt;
      const n = Math.ceil(this.goTime - this.countT);
      if (n < this.lastCount && n > 0) { this.lastCount = n; this.events.push({ type: 'beep', f: 440, d: 0.15 }); }
      if (this.countT >= this.goTime) { this.state = 'race'; this.raceTime = 0; this.events.push({ type: 'beep', f: 880, d: 0.4 }); }
    } else if (this.state === 'race') {
      this.raceTime += dt;
    }
    const idle = { throttle: 0, brake: 0, steer: 0 };

    for (const car of this.cars) {
      const c = Math.cos(car.angle), s = Math.sin(car.angle);
      const a = car.p.cgToFront, b = car.p.cgToRear;
      const q = tr.query(car.x, car.y, car.idx, 12);
      const qF = tr.query(car.x + c * a, car.y + s * a, q.i, 8);
      const qR = tr.query(car.x - c * b, car.y - s * b, q.i, 8);
      car.surfF = tr.surfaceAt(qF); car.surfR = tr.surfaceAt(qR);
      car.inPit = tr.inPitLane(q);
      car.speedLimit = car.inPit ? PIT_LIMIT : Infinity;
      car.step(dt, this.state === 'race' ? (inputOf(car) || idle) : idle, car.surfF, car.surfR);
    }
    const hit = (car, j, px, py, obj) => this.onImpact(car, j, px, py, obj);
    for (let i = 0; i < this.cars.length; i++) {
      for (let k = i + 1; k < this.cars.length; k++) {
        const A = this.cars[i], B = this.cars[k];
        // uno arriba del puente y otro abajo: no chocan
        const far = Math.min(Math.abs(A.idx - B.idx), tr.N - Math.abs(A.idx - B.idx)) > 60;
        if (A.layer !== B.layer && far) continue;
        collideCars(A, B, hit);
      }
    }
    for (const car of this.cars) {
      collideCarWalls(car, tr, hit);
      if (!car.layer) {
        collideCarObstacles(car, tr, hit);
        collideCarProps(car, this.props, hit);
      }
    }
    stepProps(dt, this.props, tr);

    for (const car of this.cars) {
      const q = tr.query(car.x, car.y, car.idx, 12);
      if (this.state === 'race') this.checkpoints(car, car.idx, q.i);
      car.idx = q.i; car.d = q.d; car.s = q.s; car.layer = tr.layer[q.i];
      const surf = tr.surfaceAt(q);
      car.surfName = surf.name; car.offroad = surf === tr.offroad;
      car.repairing = false;
      if (this.settings.damage && car.damage > 0 && car.speed < 1.0 && tr.inBox(q)) {
        car.damage = Math.max(0, car.damage - REPAIR_RATE * dt);
        car.repairing = true;
      }
    }
    this.updateOrder();
    this.checkEnd(dt);
  }

  checkpoints(car, prev, cur) {
    const tr = this.track, N = tr.N;
    const b = (cur - prev + N) % N;
    if (b === 0 || b > N / 2) return;          // quieto o marcha atrás
    const cp = tr.cpIdx[car.nextCp];
    const a = (cp - prev + N) % N;
    if (a === 0 || a > b) return;              // no cruzó el próximo checkpoint
    if (car.nextCp === 0) this.crossLine(car);
    car.nextCp = (car.nextCp + 1) % tr.cpIdx.length;
  }

  crossLine(car) {
    if (car.finished) return;
    const t = this.raceTime;
    if (car.lap > 0) {
      const lt = t - car.lapStart;
      car.lapTimes.push(lt);
      const isBest = car.best == null || lt < car.best;
      if (isBest) car.best = lt;
      this.events.push({ type: 'lap', id: car.id, text: (isBest ? '★ ' : '') + fmtTime(lt) });
    }
    if (car.lap >= this.settings.laps) {
      car.finished = true; car.finishTime = t;
      car.finishPos = ++this.finishCount;
      if (this.firstFinish == null) this.firstFinish = t;
      this.events.push({ type: 'beep', f: 660, d: 0.3 });
    } else {
      car.lap++; car.lapStart = t;
      if (car.lap === this.settings.laps && this.settings.laps > 1) this.events.push({ type: 'lap', id: car.id, text: '¡ÚLTIMA VUELTA!' });
    }
  }

  onImpact(car, j, px, py, obj) {
    if (j > 350) {
      const kind = obj ? (obj.kind || obj.type) : 'wall';
      this.events.push({ type: 'hit', id: car.id, x: +px.toFixed(2), y: +py.toFixed(2), j: Math.round(j), kind, vx: +car.vx.toFixed(1), vy: +car.vy.toFixed(1) });
    }
    if (this.settings.damage && this.state === 'race') {
      car.damage = Math.min(100, car.damage + Math.max(0, j - 900) / 110);
    }
  }

  updateOrder() {
    const L = this.track.length, sd = this.track.startD;
    const prog = c => c.lap * L + ((c.d - sd + L) % L);
    this.order = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishPos - b.finishPos;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return prog(b) - prog(a);
    });
    this.order.forEach((c, i) => (c.position = i + 1));
  }

  checkEnd(dt) {
    if (this.state !== 'race' || !this.cars.length) return;
    const all = this.cars.every(c => c.finished);
    const timeout = this.firstFinish != null && this.raceTime - this.firstFinish > NO_FINISH_TIMEOUT;
    if (all || timeout) {
      this.endTimer += dt;
      if (this.endTimer > 1.5 || timeout) { this.state = 'results'; this.events.push({ type: 'results' }); }
    }
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
}

// ---------------------------------------------------------------------------
//  Empaquetado del estado de un auto para mandarlo por la red (array compacto)
// ---------------------------------------------------------------------------
const SNAP_NUM = ['x', 'y', 'angle', 'vx', 'vy', 'omega', 'steer', 'throttle', 'brake', 'speed', 'damage',
  'alphaF', 'alphaR', 'alphaPeak', 'beta', 'loose', 'usageF', 'd', 'best', 'finishTime', 'lapStart'];
const SNAP_INT = ['lap', 'finishPos', 'position', 'layer', 'idx'];
const SNAP_BOOL = ['finished', 'inPit', 'repairing', 'offroad'];
const SNAP_LERP = ['x', 'y', 'vx', 'vy', 'omega', 'steer', 'throttle', 'brake', 'speed'];  // se interpolan
const SURF_KEYS = Object.keys(SURFACES);
const r3 = v => (v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000);

function packCar(c) {
  const out = [c.id];
  for (const k of SNAP_NUM) out.push(r3(c[k]));
  for (const k of SNAP_INT) out.push(c[k]);
  for (const k of SNAP_BOOL) out.push(c[k] ? 1 : 0);
  out.push(SURF_KEYS.findIndex(n => SURFACES[n] === c.surfF), SURF_KEYS.findIndex(n => SURFACES[n] === c.surfR), c.surfName);
  return out;
}
function unpackCar(a) {
  const o = { id: a[0] }; let i = 1;
  for (const k of SNAP_NUM) o[k] = a[i++];
  for (const k of SNAP_INT) o[k] = a[i++];
  for (const k of SNAP_BOOL) o[k] = !!a[i++];
  o.surfF = SURFACES[SURF_KEYS[a[i++]]] || SURFACES.asphalt;
  o.surfR = SURFACES[SURF_KEYS[a[i++]]] || SURFACES.asphalt;
  o.surfName = a[i++];
  return o;
}

function fmtTime(t) {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

if (typeof module !== 'undefined') module.exports = { RaceSim, SIM_DT, fmtTime, packCar, unpackCar };
