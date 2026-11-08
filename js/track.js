'use strict';
// ============================================================================
//  PISTAS
//  Una pista se define (en js/tracks.js) con puntos de control que se unen con
//  una curva suave (Catmull-Rom). Las posiciones a lo largo de la vuelta se
//  indican como fracción de vuelta "f" (0 = primer punto, 0.5 = mitad).
//  A partir de eso se calcula todo: terrenos por tramo, manchas (barro, agua,
//  hielo), bordes (muros, cercos, bosque, bancos de nieve), obstáculos,
//  puente, calle de boxes, largada y checkpoints.
//  "s" = distancia lateral al centro de la pista (+ derecha, - izquierda).
// ============================================================================

// Tipos de borde: rebote, daño que causa el golpe y fricción al rozar
const EDGE_TYPES = {
  wall:     { rest: 0.25, dmg: 1.0,  fric: 0.3 },  // neumáticos / muro
  fence:    { rest: 0.15, dmg: 0.4,  fric: 0.5 },  // cerco de madera
  treeline: { rest: 0.2,  dmg: 1.0,  fric: 0.4 },  // límite del bosque
  snowbank: { rest: 0.05, dmg: 0.15, fric: 0.9 },  // banco de nieve: frena, casi no daña
  rockwall: { rest: 0.3,  dmg: 1.3,  fric: 0.3 },  // paredón de roca
  rail:     { rest: 0.2,  dmg: 0.8,  fric: 0.3 },  // baranda del puente
};
const EDGE_NAMES = Object.keys(EDGE_TYPES);
const TRACK_WIDEN = 2;   // m que se agregan a cada lado de todas las pistas (más anchas)
const SURF_NAMES = Object.keys(SURFACES);

// Obstáculos fijos: radio de choque y daño relativo
const OBSTACLE_TYPES = {
  tree:  { r: 0.45, dmg: 1.2, rest: 0.2 },
  pine:  { r: 0.4,  dmg: 1.2, rest: 0.2 },
  rock:  { r: 1.0,  dmg: 1.4, rest: 0.3 },
  bush:  { r: 0.8,  dmg: 0.2, rest: 0.05 },
  cactus: { r: 0.6, dmg: 0.6, rest: 0.1 },
};

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}
function smoothstep(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

class Track {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.theme = def.theme || 'forest';
    this.hw = def.halfWidth + TRACK_WIDEN;
    const rng = mulberry32(hashStr(def.name));
    // posiciones laterales definidas para el ancho original: lo que está sobre la pista se
    // estira en proporción y lo que está al costado se corre hacia afuera
    const hw0 = def.halfWidth;
    this.shiftS = s => (Math.abs(s) >= hw0 - 0.5 ? s + Math.sign(s) * TRACK_WIDEN : s * (this.hw / hw0));

    // 1) curva fina
    const sc = def.scale || 1;
    const P = def.points.map(([x, y]) => [x * sc, y * sc]), n = P.length, fine = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let k = 0; k < 60; k++) fine.push(catmullRom(p0, p1, p2, p3, k / 60));
    }
    const cum = [0];
    for (let i = 1; i < fine.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
    }
    const last = fine[fine.length - 1];
    const total = cum[cum.length - 1] + Math.hypot(fine[0][0] - last[0], fine[0][1] - last[1]);

    // 2) re-muestreo uniforme cada ~1 m
    const N = Math.round(total);
    this.N = N; this.length = total; this.spacing = total / N;
    this.x = new Float64Array(N); this.y = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = i * this.spacing;
      while (j < fine.length - 1 && cum[j + 1] <= target) j++;
      const a = fine[j], b = j + 1 < fine.length ? fine[j + 1] : fine[0];
      const segEnd = j + 1 < fine.length ? cum[j + 1] : total;
      const t = segEnd > cum[j] ? (target - cum[j]) / (segEnd - cum[j]) : 0;
      this.x[i] = a[0] + (b[0] - a[0]) * t;
      this.y[i] = a[1] + (b[1] - a[1]) * t;
    }
    const D = f => f * total;           // fracción de vuelta -> metros
    const inRange = (i, f0, f1) => {    // índice dentro del rango de fracciones (admite cruzar el 0)
      const fi = i / N;
      return f0 <= f1 ? fi >= f0 && fi < f1 : fi >= f0 || fi < f1;
    };

    // 3) tangentes, normales (a la derecha), rumbo y curvatura
    this.nx = new Float64Array(N); this.ny = new Float64Array(N);
    this.heading = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let tx = this.x[b] - this.x[a], ty = this.y[b] - this.y[a];
      const l = Math.hypot(tx, ty); tx /= l; ty /= l;
      this.nx[i] = -ty; this.ny[i] = tx;
      this.heading[i] = Math.atan2(ty, tx);
    }
    const rawK = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let dA = this.heading[(i + 1) % N] - this.heading[(i - 1 + N) % N];
      while (dA > Math.PI) dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      rawK[i] = dA / (2 * this.spacing);
    }
    this.curv = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -6; k <= 6; k++) s += rawK[(i + k + N) % N];
      this.curv[i] = s / 13;
    }

    // 4) terreno por tramo
    this.surf = new Uint8Array(N).fill(SURF_NAMES.indexOf(def.base || 'asphalt'));
    for (const [f0, f1, type] of def.sections || []) {
      const si = SURF_NAMES.indexOf(type);
      for (let i = 0; i < N; i++) if (inRange(i, f0, f1)) this.surf[i] = si;
    }
    this.offroad = SURFACES[def.offroad || 'grass'];
    // pianos sólo en curvas cerradas de asfalto
    this.curb = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      this.curb[i] = Math.abs(this.curv[i]) > 1 / 75 && SURF_NAMES[this.surf[i]] === 'asphalt' ? 1 : 0;
    }

    // 5) puente (el tramo elevado es la capa 1)
    this.layer = new Uint8Array(N);
    if (def.bridge) {
      const c = D(def.bridge.f), h = def.bridge.half;
      for (let i = 0; i < N; i++) {
        let dd = Math.abs(i * this.spacing - c); dd = Math.min(dd, total - dd);
        if (dd <= h) this.layer[i] = 1;
      }
    }

    // 6) boxes, bordes y muros
    const pit = def.pit;
    this.pitF = new Float64Array(N);
    this.pitOuter = new Float64Array(N);
    this.wallPos = new Float64Array(N); this.wallNeg = new Float64Array(N);
    this.edgePos = new Uint8Array(N); this.edgeNeg = new Uint8Array(N);
    const defEdge = def.edge || { type: 'wall', dist: 4 };
    for (let i = 0; i < N; i++) {
      for (const side of [1, -1]) {
        let type = defEdge.type, dist = defEdge.dist;
        for (const [f0, f1, sd, t, ds] of def.edges || []) {
          if ((sd === 'B' || (sd === 'R') === (side > 0)) && inRange(i, f0, f1)) { type = t; dist = ds; }
        }
        if (this.layer[i]) { type = 'rail'; dist = 0.9; }
        (side > 0 ? this.edgePos : this.edgeNeg)[i] = EDGE_NAMES.indexOf(type);
        (side > 0 ? this.wallPos : this.wallNeg)[i] = this.hw + dist;
      }
    }
    if (pit) {
      const from = D(pit.f0), to = D(pit.f1);
      for (let i = 0; i < N; i++) {
        const d = i * this.spacing;
        let f = 0;
        if (d >= from && d <= to) f = Math.min(smoothstep((d - from) / pit.taper), smoothstep((to - d) / pit.taper));
        this.pitF[i] = f;
        this.pitOuter[i] = this.hw + (pit.gap + pit.laneWidth) * f;
        if (f > 0) {
          const arr = pit.side > 0 ? this.wallPos : this.wallNeg;
          const earr = pit.side > 0 ? this.edgePos : this.edgeNeg;
          if (this.pitOuter[i] + 1.5 > arr[i]) { arr[i] = this.pitOuter[i] + 1.5; earr[i] = EDGE_NAMES.indexOf('wall'); }
        }
      }
    }
    // en curvas muy cerradas el muro interior no puede estar más lejos que el radio
    for (let i = 0; i < N; i++) {
      const k = this.curv[i];
      if (Math.abs(k) > 1e-4) {
        const maxIn = Math.max(this.hw + 0.8, 0.8 / Math.abs(k));
        if (k > 0) this.wallPos[i] = Math.min(this.wallPos[i], maxIn);
        else this.wallNeg[i] = Math.min(this.wallNeg[i], maxIn);
      }
    }

    // 7) largada, checkpoints, boxes
    this.startD = D(def.startLine);
    this.cpIdx = [];
    const ncp = def.checkpoints || 8;
    for (let k = 0; k < ncp; k++) {
      const dd = (this.startD + (k * total) / ncp) % total;
      this.cpIdx.push(Math.floor(dd / this.spacing) % N);
    }
    this.boxes = pit ? (def.boxes || []).map(f => ({ d: D(f), s: pit.side * (this.hw + pit.gap + pit.laneWidth * 0.6) })) : [];

    // 8) manchas de terreno (elipses en coordenadas de pista)
    this.patches = (def.patches || []).map(([f, s, len, w, type]) => ({
      d: D(f), s: this.shiftS(s), len, w: w >= hw0 ? w + TRACK_WIDEN : w * (this.hw / hw0), surf: SURFACES[type], type }));

    // caja contenedora
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
      minY = Math.min(minY, this.y[i]); maxY = Math.max(maxY, this.y[i]);
    }
    this.bounds = { minX, minY, maxX, maxY };

    // 9) obstáculos fijos, decoración y público
    this.buildScenery(rng, D);
  }

  // ---------------------------------------------------------------- escenario
  buildScenery(rng, D) {
    const def = this.def, N = this.N, hw = this.hw;
    const sc = def.scatter || { kinds: ['tree'], density: 0.06 };
    this.obstacles = []; this.decor = []; this.crowds = [];
    const freeOfTrack = (x, y, margin) => {   // lejos de cualquier tramo (incluye el otro lado del puente)
      const q = this.query(x, y);
      return Math.abs(q.s) > this.wallAt(q, Math.sign(q.s) || 1) + margin;
    };
    const runoffOK = (x, y) => {
      const q = this.query(x, y);
      return Math.abs(q.s) > hw + 2.5 && Math.abs(q.s) < this.wallAt(q, Math.sign(q.s) || 1) - 1.2;
    };
    // obstáculos en la zona entre la pista y el borde "bosque"
    const tl = EDGE_NAMES.indexOf('treeline');
    for (let i = 0; i < N; i++) {
      if (this.layer[i] || this.pitF[i] > 0) continue;
      for (const side of [1, -1]) {
        if ((side > 0 ? this.edgePos : this.edgeNeg)[i] !== tl) continue;
        if (rng() > sc.density) continue;
        const wall = (side > 0 ? this.wallPos : this.wallNeg)[i];
        const s = side * (hw + 3 + rng() * Math.max(0, wall - hw - 4.5));
        const x = this.x[i] + this.nx[i] * s, y = this.y[i] + this.ny[i] * s;
        if (!runoffOK(x, y)) continue;
        const kind = sc.kinds[Math.floor(rng() * sc.kinds.length)];
        const T = OBSTACLE_TYPES[kind];
        const r = kind === 'rock' ? T.r * (0.7 + rng() * 0.6) : T.r;
        this.obstacles.push({ x, y, r, kind, dmg: T.dmg, rest: T.rest, seed: rng(), size: 0.8 + rng() * 0.6 });
      }
    }
    // decoración más allá de los bordes (no choca)
    const dk = def.decor || ['tree'];
    for (let i = 0; i < N; i += 2) {
      for (const side of [1, -1]) {
        const wall = (side > 0 ? this.wallPos : this.wallNeg)[i];
        const tries = (side > 0 ? this.edgePos : this.edgeNeg)[i] === tl ? 2 : 1;
        for (let k = 0; k < tries; k++) {
          if (rng() > 0.55) continue;
          const s = side * (wall + 1.5 + Math.pow(rng(), 1.6) * (def.decorRange || 30));
          const x = this.x[i] + this.nx[i] * s, y = this.y[i] + this.ny[i] * s;
          if (!freeOfTrack(x, y, 1.2)) continue;
          this.decor.push({ x, y, kind: dk[Math.floor(rng() * dk.length)], seed: rng(), size: 0.8 + rng() * 0.7 });
        }
      }
    }
    // público
    for (const [f, side] of def.crowds || []) {
      const sd = side === 'R' ? 1 : -1, d0 = D(f);
      for (let k = -14; k <= 14; k += 1.1) {
        for (let row = 0; row < 3; row++) {
          const d = d0 + k + (row % 2) * 0.5, i = this.wrap(Math.round(d / this.spacing));
          const wall = (sd > 0 ? this.wallPos : this.wallNeg)[i];
          const [x, y] = this.pointAt(d, sd * (wall + 1.6 + row * 0.9 + rng() * 0.3));
          if (!freeOfTrack(x, y, 1.0)) continue;
          this.crowds.push({ x, y, seed: rng() });
        }
      }
    }
    // grilla espacial de obstáculos (celdas de 10 m)
    this.obsGrid = new Map();
    for (const o of this.obstacles) {
      const key = Math.floor(o.x / 10) + ',' + Math.floor(o.y / 10);
      if (!this.obsGrid.has(key)) this.obsGrid.set(key, []);
      this.obsGrid.get(key).push(o);
    }
  }

  obstaclesNear(x, y) {
    const cx = Math.floor(x / 10), cy = Math.floor(y / 10), out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = this.obsGrid.get((cx + i) + ',' + (cy + j));
      if (a) out.push(...a);
    }
    return out;
  }

  // objetos empujables (se crean de nuevo en cada carrera)
  makeProps() {
    const out = [];
    for (const [f, s, type, n, spacing] of this.def.props || []) {
      for (let k = 0; k < (n || 1); k++) {
        const [x, y, h] = this.pointAt(f * this.length + k * (spacing || 2), this.shiftS(s));
        out.push(new Prop(type, x, y, h));
      }
    }
    for (const p of out) p.idx = this.query(p.x, p.y).i;
    return out;
  }

  // ---------------------------------------------------------------- consultas
  wrap(i) { return ((i % this.N) + this.N) % this.N; }

  // Punto más cercano sobre la línea central. hint = índice aproximado (búsqueda local).
  query(x, y, hint, win) {
    const N = this.N;
    let from = 0, to = N;
    if (hint != null) { from = hint - (win || 10); to = hint + (win || 10); }
    let best = Infinity, bi = 0, bt = 0;
    for (let k = from; k < to; k++) {
      const i = ((k % N) + N) % N, j = (i + 1) % N;
      const ax = this.x[i], ay = this.y[i];
      const dx = this.x[j] - ax, dy = this.y[j] - ay;
      let t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - x, py = ay + dy * t - y;
      const d2 = px * px + py * py;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    const j = (bi + 1) % N;
    const cx = this.x[bi] + (this.x[j] - this.x[bi]) * bt;
    const cy = this.y[bi] + (this.y[j] - this.y[bi]) * bt;
    const nx = this.nx[bi] + (this.nx[j] - this.nx[bi]) * bt;
    const ny = this.ny[bi] + (this.ny[j] - this.ny[bi]) * bt;
    return { i: bi, t: bt, s: (x - cx) * nx + (y - cy) * ny, d: (bi + bt) * this.spacing };
  }

  normalAt(q) {
    const j = (q.i + 1) % this.N;
    const nx = this.nx[q.i] + (this.nx[j] - this.nx[q.i]) * q.t;
    const ny = this.ny[q.i] + (this.ny[j] - this.ny[q.i]) * q.t;
    const l = Math.hypot(nx, ny);
    return [nx / l, ny / l];
  }

  wallAt(q, side) {
    const arr = side > 0 ? this.wallPos : this.wallNeg, j = (q.i + 1) % this.N;
    return arr[q.i] + (arr[j] - arr[q.i]) * q.t;
  }
  edgeAt(q, side) {
    return EDGE_TYPES[EDGE_NAMES[(side > 0 ? this.edgePos : this.edgeNeg)[q.i]]];
  }

  pointAt(d, s) {
    const f = (((d / this.spacing) % this.N) + this.N) % this.N;
    const i = Math.floor(f), t = f - i, j = (i + 1) % this.N;
    const cx = this.x[i] + (this.x[j] - this.x[i]) * t;
    const cy = this.y[i] + (this.y[j] - this.y[i]) * t;
    const nx = this.nx[i] + (this.nx[j] - this.nx[i]) * t;
    const ny = this.ny[i] + (this.ny[j] - this.ny[i]) * t;
    return [cx + nx * s, cy + ny * s, this.heading[i]];
  }

  patchAt(q) {
    for (const p of this.patches) {
      let dd = Math.abs(q.d - p.d); dd = Math.min(dd, this.length - dd);
      if (dd > p.len) continue;
      const u = dd / p.len, v = (q.s - p.s) / p.w;
      if (u * u + v * v <= 1) return p;
    }
    return null;
  }

  surfaceAt(q) {
    const as = Math.abs(q.s);
    if (!this.layer[q.i]) {
      const patch = this.patchAt(q);
      if (patch) return patch.surf;
    }
    if (as <= this.hw) return this.layer[q.i] ? SURFACES.concrete : SURFACES[SURF_NAMES[this.surf[q.i]]];
    const pit = this.def.pit;
    if (pit && Math.sign(q.s) === pit.side && this.pitF[q.i] > 0.01 && as <= this.pitOuter[q.i]) {
      return SURFACES.concrete;
    }
    if (as <= this.hw + 1.1 && this.curb[q.i]) return SURFACES.curb;
    return this.offroad;
  }

  inPitLane(q) {
    const pit = this.def.pit;
    return !!pit && Math.sign(q.s) === pit.side && this.pitF[q.i] > 0.5 &&
      Math.abs(q.s) >= this.hw + pit.gap - 0.5;
  }

  inBox(q) {
    for (const b of this.boxes) {
      if (Math.abs(q.d - b.d) < 3 && Math.abs(q.s - b.s) < 2.2) return true;
    }
    return false;
  }

  gridSlot(k) {
    const d = this.startD - 7 - k * 7;
    const s = (k % 2 === 0 ? -1 : 1) * 3.2;
    return this.pointAt(d, s);
  }
}

// ---------------------------------------------------------------------------
//  Objetos empujables (fardos, conos, barriles, cubiertas)
// ---------------------------------------------------------------------------
const PROP_TYPES = {
  hay:    { r: 0.7,  m: 140, drag: 5,  dmg: 0.15 },
  cone:   { r: 0.25, m: 4,   drag: 3,  dmg: 0.0 },
  barrel: { r: 0.42, m: 45,  drag: 4,  dmg: 0.3 },
  tire:   { r: 0.45, m: 18,  drag: 4,  dmg: 0.05 },
};

class Prop {
  constructor(type, x, y, angle) {
    this.type = type; this.T = PROP_TYPES[type];
    this.r = this.T.r; this.m = this.T.m;
    this.x = x; this.y = y; this.angle = angle; this.vx = 0; this.vy = 0; this.spin = 0;
    this.idx = 0;
  }
}

function stepProps(dt, props, track) {
  for (const p of props) {
    if (p.vx === 0 && p.vy === 0 && p.spin === 0) continue;
    const k = Math.exp(-p.T.drag * dt);
    p.vx *= k; p.vy *= k; p.spin *= k;
    if (Math.abs(p.vx) + Math.abs(p.vy) < 0.02) { p.vx = 0; p.vy = 0; }
    if (Math.abs(p.spin) < 0.02) p.spin = 0;
    p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.spin * dt;
    // que no atraviese los bordes
    const q = track.query(p.x, p.y, p.idx, 8); p.idx = q.i;
    const side = q.s > 0 ? 1 : -1, w = track.wallAt(q, side) - p.r;
    if (Math.abs(q.s) > w) {
      const [nx, ny] = track.normalAt(q);
      const push = (Math.abs(q.s) - w) * side;
      p.x -= nx * push; p.y -= ny * push;
      const vn = (p.vx * nx + p.vy * ny) * side;
      if (vn > 0) { p.vx -= 1.4 * vn * nx * side; p.vy -= 1.4 * vn * ny * side; }
    }
  }
  // empujones entre objetos
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      const A = props[i], B = props[j];
      const dx = B.x - A.x, dy = B.y - A.y, md = A.r + B.r;
      if (Math.abs(dx) > md || Math.abs(dy) > md) continue;
      const d = Math.hypot(dx, dy);
      if (d >= md || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d, pen = md - d, tm = A.m + B.m;
      A.x -= nx * pen * B.m / tm; A.y -= ny * pen * B.m / tm;
      B.x += nx * pen * A.m / tm; B.y += ny * pen * A.m / tm;
      const vn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (vn < 0) {
        const j2 = -1.3 * vn / (1 / A.m + 1 / B.m);
        A.vx -= j2 * nx / A.m; A.vy -= j2 * ny / A.m; B.vx += j2 * nx / B.m; B.vy += j2 * ny / B.m;
      }
    }
  }
}

// choque auto <-> objeto empujable
function collideCarProps(car, props, onImpact) {
  const rc = car.p.circleRadius;
  for (const p of props) {
    if (Math.abs(p.x - car.x) > 4 || Math.abs(p.y - car.y) > 4) continue;
    for (const [cx, cy, ox, oy] of car.circleCenters()) {
      const dx = p.x - cx, dy = p.y - cy, md = rc + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= md * md) continue;
      const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d, pen = md - d;
      const mc = car.p.mass, tm = mc + p.m;
      car.x -= nx * pen * p.m / tm; car.y -= ny * pen * p.m / tm;
      p.x += nx * pen * mc / tm; p.y += ny * pen * mc / tm;
      const rx = ox + nx * rc, ry = oy + ny * rc;
      const [vcx, vcy] = car.pointVel(rx, ry);
      const vn = (p.vx - vcx) * nx + (p.vy - vcy) * ny;
      if (vn >= 0) continue;
      const rn = rx * ny - ry * nx;
      const j = (-1.4 * vn) / (1 / mc + 1 / p.m + (rn * rn) / car.p.inertia);
      car.applyImpulse(rx, ry, -j * nx, -j * ny);
      p.vx += (j * nx) / p.m; p.vy += (j * ny) / p.m;
      p.spin += (Math.random() - 0.5) * Math.min(20, j / p.m * 2);
      if (onImpact) onImpact(car, j * p.T.dmg, car.x + rx, car.y + ry, p);
    }
  }
}

// choque auto <-> obstáculo fijo (árbol, roca, arbusto)
function collideCarObstacles(car, track, onImpact) {
  const rc = car.p.circleRadius, p = car.p;
  const near = track.obstaclesNear(car.x, car.y);
  if (!near.length) return;
  for (const [cx, cy, ox, oy] of car.circleCenters()) {
    for (const o of near) {
      const dx = cx - o.x, dy = cy - o.y, md = rc + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= md * md) continue;
      const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;  // normal hacia el auto
      car.x += nx * (md - d); car.y += ny * (md - d);
      const rx = ox - nx * rc, ry = oy - ny * rc;
      const [vpx, vpy] = car.pointVel(rx, ry);
      const vn = vpx * nx + vpy * ny;
      if (vn >= 0) continue;
      const rn = rx * ny - ry * nx;
      const j = (-(1 + o.rest) * vn) / (1 / p.mass + (rn * rn) / p.inertia);
      car.applyImpulse(rx, ry, j * nx, j * ny);
      if (onImpact) onImpact(car, j * o.dmg, car.x + rx, car.y + ry, o);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Track, EDGE_TYPES, OBSTACLE_TYPES, PROP_TYPES, Prop, stepProps, collideCarProps, collideCarObstacles };
}
