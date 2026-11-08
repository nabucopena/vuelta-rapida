'use strict';
// ============================================================================
//  ARTE ESTILO MAQUETA
//  Todo se genera por código (sin imágenes): texturas, escenario y autos.
//  El suelo de cada pista se pinta UNA vez en un canvas grande ("ground"); las
//  copas de los árboles van en otro canvas ("canopy") que se dibuja encima de
//  los autos, y el puente en un tercero. Las huellas de los neumáticos se
//  pintan directamente sobre el suelo, así quedan marcadas toda la carrera.
//  Luz desde arriba a la izquierda => sombras hacia abajo a la derecha.
// ============================================================================

const THEMES = {
  forest: { bg: '#4b6a2e', grass: ['#5f8238', '#54762f', '#6e9343'], shoulder: '#6f5b3b',
    leaf: ['#3d6a28', '#4c7d31', '#2f5a22', '#5a8a38'], dust: '#d9c39c', flowers: true },
  snow:   { bg: '#e4ebf3', grass: ['#f2f6fb', '#e3ebf5', '#ffffff'], shoulder: '#d8e1ec',
    leaf: ['#2f5a3a', '#3b6b46', '#264b31', '#457a52'], dust: '#ffffff', snowy: true },
  farm:   { bg: '#9c9a52', grass: ['#a8a55c', '#9a984f', '#b7b168'], shoulder: '#8e7550',
    leaf: ['#5f7d33', '#6f8f3d', '#4f6c2b', '#7c9a45'], dust: '#e0cda5', fields: true },
  desert: { bg: '#c9a46c', grass: ['#d6b47e', '#cca66f', '#dfc08e'], shoulder: '#b48a58',
    leaf: ['#5f7a37', '#6f8c40', '#4c6630', '#86a050'], dust: '#ead3a8', sandy: true },
  park:   { bg: '#4f7f36', grass: ['#5f913e', '#558636', '#6aa046'], shoulder: '#6d6a5c',
    leaf: ['#3f7a2e', '#4f8c37', '#336a27', '#5c9a40'], dust: '#d6c8aa', flowers: true },
};

const MARK_STYLE = {   // huellas que deja cada terreno
  asfalto: null, cemento: null, piano: null, agua: null,
  tierra: ['rgba(78,54,30,0.16)', 0.34], barro: ['rgba(38,24,12,0.32)', 0.4],
  nieve: ['rgba(140,160,190,0.30)', 0.36], 'nieve profunda': ['rgba(150,170,200,0.4)', 0.45],
  hielo: ['rgba(255,255,255,0.18)', 0.25], pasto: ['rgba(55,75,25,0.22)', 0.36],
  arena: ['rgba(140,110,60,0.22)', 0.38],
};
const SKID_STYLE = ['rgba(22,22,24,0.32)', 0.3];

// mismo color con otra opacidad (los degradados deben desvanecerse hacia el MISMO color,
// si no el canvas mezcla con negro y oscurece los bordes)
function withAlpha(col, a) {
  if (col.startsWith('#')) {
    const n = parseInt(col.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = col.match(/rgba?\(([^)]+)\)/);
  const [r, g, b] = m[1].split(',').map(v => v.trim());
  return `rgba(${r},${g},${b},${a})`;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
function hexShade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const Art = {
  ppm: 7,
  tiles: {},
  soft: {},
  cars: {},

  // ------------------------------------------------------------ texturas
  tile(key, painter) {
    if (this.tiles[key]) return this.tiles[key];
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    painter(g, S, mulberry32(hashStr(key)));
    return (this.tiles[key] = c);
  },
  // dibuja con repetición en los bordes para que la textura no tenga costuras
  wrapDraw(S, x, y, r, fn) {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox + r < 0 || x + ox - r > S || y + oy + r < 0 || y + oy - r > S) continue;
      fn(x + ox, y + oy);
    }
  },
  speckle(g, S, rng, n, colors, r0, r1, a0, a1) {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = a0 + rng() * (a1 - a0); g.fillStyle = colors[(rng() * colors.length) | 0];
      const x = rng() * S, y = rng() * S, r = r0 + rng() * (r1 - r0);
      this.wrapDraw(S, x, y, r, (px, py) => { g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); });
    }
    g.globalAlpha = 1;
  },
  blobs(g, S, rng, n, colors, r0, r1, a) {
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, r = r0 + rng() * (r1 - r0), col = colors[(rng() * colors.length) | 0];
      this.wrapDraw(S, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, col); gr.addColorStop(1, withAlpha(col, 0));
        g.globalAlpha = a; g.fillStyle = gr; g.fillRect(px - r, py - r, 2 * r, 2 * r);
      });
    }
    g.globalAlpha = 1;
  },
  strokes(g, S, rng, n, colors, len0, len1, width, a, angle) {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, l = len0 + rng() * (len1 - len0);
      const ang = angle != null ? angle + (rng() - 0.5) * 0.6 : rng() * Math.PI * 2;
      g.strokeStyle = colors[(rng() * colors.length) | 0]; g.globalAlpha = a; g.lineWidth = width;
      this.wrapDraw(S, x, y, l, (px, py) => {
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l); g.stroke();
      });
    }
    g.globalAlpha = 1;
  },
  surfaceTile(name, theme) {
    const T = THEMES[theme];
    const key = name + ':' + (['grass', 'shoulder'].includes(name) ? theme : '');
    return this.tile(key, (g, S, rng) => {
      const base = (c) => { g.fillStyle = c; g.fillRect(0, 0, S, S); };
      switch (name) {
        case 'grass':
          base(T.grass[0]);
          this.blobs(g, S, rng, 40, [T.grass[1], T.grass[2]], 18, 60, 0.45);
          if (T.snowy) {
            this.blobs(g, S, rng, 30, ['#d3dfec', '#ffffff'], 15, 50, 0.6);
            this.speckle(g, S, rng, 700, ['#ffffff'], 0.4, 1, 0.8, 1);
            this.speckle(g, S, rng, 400, ['#c4d2e3'], 0.4, 1, 0.3, 0.5);
          } else if (T.sandy) {
            this.speckle(g, S, rng, 3500, [hexShade(T.grass[0], 1.12), hexShade(T.grass[0], 0.82)], 0.4, 1.0, 0.3, 0.6);
            this.strokes(g, S, rng, 60, [hexShade(T.grass[0], 0.88)], 20, 60, 2, 0.25, 0.3);   // ondas de arena
            this.speckle(g, S, rng, 60, ['#9a8f80', '#7f7668'], 1.2, 2.2, 0.8, 1);
          } else {
            this.strokes(g, S, rng, 5000, [hexShade(T.grass[0], 0.75), hexShade(T.grass[0], 1.25), hexShade(T.grass[0], 0.9)], 2, 4, 1, 0.45);
            if (T.flowers) this.speckle(g, S, rng, 40, ['#f5f0d8', '#f2d94e', '#d98bb7'], 0.8, 1.3, 0.85, 1);
          }
          break;
        case 'shoulder':
          base(T.shoulder);
          this.blobs(g, S, rng, 30, [hexShade(T.shoulder, 1.15), hexShade(T.shoulder, 0.85)], 15, 50, 0.5);
          this.speckle(g, S, rng, 1500, [hexShade(T.shoulder, 1.3), hexShade(T.shoulder, 0.7)], 0.5, 1.2, 0.3, 0.6);
          break;
        case 'dirt':
          base('#9a7650');
          this.blobs(g, S, rng, 40, ['#ab875e', '#86643f', '#9f7b52'], 15, 55, 0.5);
          this.speckle(g, S, rng, 2600, ['#c5a780', '#6f5236', '#b29270'], 0.5, 1.3, 0.35, 0.65);
          this.speckle(g, S, rng, 90, ['#8e877b', '#a69e91', '#7a7369'], 1.4, 2.6, 0.9, 1);
          break;
        case 'asphalt': case 'curb':
          base('#56575d');
          this.blobs(g, S, rng, 30, ['#606168', '#4b4c51'], 20, 70, 0.5);
          this.speckle(g, S, rng, 7000, ['#6e6f75', '#434448', '#7d7e84'], 0.4, 0.9, 0.35, 0.6);
          this.strokes(g, S, rng, 8, ['#3c3d41'], 10, 30, 1, 0.4);
          break;
        case 'concrete':
          base('#aba9a2');
          this.blobs(g, S, rng, 25, ['#b6b4ad', '#9d9b95'], 20, 70, 0.5);
          this.speckle(g, S, rng, 4000, ['#c1bfb8', '#8f8d87'], 0.4, 0.9, 0.3, 0.5);
          g.strokeStyle = 'rgba(80,78,72,0.35)'; g.lineWidth = 1.2;
          for (let k = 0; k < S; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
          break;
        case 'snow':
          base('#dbe4ef');
          this.blobs(g, S, rng, 50, ['#cad6e5', '#eef3f9', '#bfcde0'], 12, 50, 0.6);
          this.speckle(g, S, rng, 900, ['#ffffff'], 0.4, 1.0, 0.8, 1);
          this.speckle(g, S, rng, 700, ['#bccbdf'], 0.4, 1.0, 0.25, 0.45);
          break;
        case 'deepsnow':
          base('#f4f7fb');
          this.blobs(g, S, rng, 60, ['#dfe7f2', '#ffffff', '#d2dded'], 18, 60, 0.7);
          this.speckle(g, S, rng, 900, ['#ffffff'], 0.4, 1.0, 0.9, 1);
          break;
        case 'ice':
          base('#bfe1ef');
          this.blobs(g, S, rng, 30, ['#d8f0f8', '#a6d0e4'], 20, 60, 0.55);
          this.strokes(g, S, rng, 140, ['#ffffff'], 15, 60, 1.5, 0.35);
          this.strokes(g, S, rng, 40, ['#8dbdd4'], 8, 25, 0.8, 0.6);
          break;
        case 'mud':
          base('#5a4029');
          this.blobs(g, S, rng, 50, ['#47311d', '#6b4d32', '#3d2a18'], 10, 45, 0.6);
          this.speckle(g, S, rng, 500, ['#9b8670'], 0.6, 1.6, 0.15, 0.3);
          this.speckle(g, S, rng, 60, ['#d8dde2'], 1, 3, 0.08, 0.16);
          break;
        case 'water':
          base('#3c7ca1');
          this.blobs(g, S, rng, 40, ['#4b8fb4', '#326b8e'], 15, 50, 0.5);
          this.strokes(g, S, rng, 160, ['#cfe8f5'], 5, 14, 1, 0.3);
          break;
        case 'sand':
          base('#d4ba86');
          this.blobs(g, S, rng, 40, ['#dfc897', '#c4a874'], 15, 55, 0.5);
          this.speckle(g, S, rng, 3000, ['#ead7ad', '#b39661'], 0.4, 1.0, 0.3, 0.6);
          break;
      }
    });
  },
  pattern(g, name, theme) {
    const p = g.createPattern(this.surfaceTile(name, theme), 'repeat');
    p.setTransform(new DOMMatrix([1 / this.ppm, 0, 0, 1 / this.ppm, 0, 0]));
    return p;
  },

  // sprite redondo difuso de un color (humo, polvo, salpicaduras)
  softSprite(color) {
    if (this.soft[color]) return this.soft[color];
    const S = 64, c = makeCanvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, withAlpha(color, 1)); gr.addColorStop(0.55, withAlpha(color, 0.6)); gr.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return (this.soft[color] = c);
  },

  // ------------------------------------------------------------ escenario
  build(track) {
    const T = THEMES[track.theme], b = track.bounds, M = 60;
    let ppm = 7;   // resolución del escenario (px por metro); baja sólo si la pista es muy grande
    const ww = b.maxX - b.minX + 2 * M, wh = b.maxY - b.minY + 2 * M;
    ppm = Math.min(ppm, 5800 / ww, 5800 / wh);
    this.ppm = ppm;
    const ox = b.minX - M, oy = b.minY - M, W = Math.ceil(ww * ppm), H = Math.ceil(wh * ppm);
    // las copas de los árboles van a menor resolución (son difusas): ahorra memoria
    const cppm = ppm * 0.6;
    const ground = makeCanvas(W, H), canopy = makeCanvas(Math.ceil(ww * cppm), Math.ceil(wh * cppm));
    const g = ground.getContext('2d'), c = canopy.getContext('2d');
    g.setTransform(ppm, 0, 0, ppm, -ox * ppm, -oy * ppm);
    c.setTransform(cppm, 0, 0, cppm, -ox * cppm, -oy * cppm);
    const rng = mulberry32(hashStr(track.name + ':art'));
    const art = { ground, canopy, ox, oy, ppm, cppm, W, H, theme: T };

    // 1) terreno base
    g.fillStyle = this.pattern(g, 'grass', track.theme);
    if (track.offroad.name === 'nieve profunda') g.fillStyle = this.pattern(g, 'deepsnow', track.theme);
    if (track.offroad.name === 'arena') g.fillStyle = this.pattern(g, 'sand', track.theme);
    g.fillRect(ox, oy, ww, wh);
    // grandes manchas de luz/sombra (relieve)
    for (let i = 0; i < 120; i++) {
      const x = ox + rng() * ww, y = oy + rng() * wh, r = 10 + rng() * 35;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const col = rng() < 0.35 ? 'rgba(255,250,230,0.06)' : (T.snowy ? 'rgba(150,170,200,0.10)' : 'rgba(20,30,10,0.12)');
      gr.addColorStop(0, col); gr.addColorStop(1, withAlpha(col, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (T.fields) this.drawFields(track, g, rng, ox, oy, ww, wh);

    // 2) banquinas
    const P = this.paths(track);
    g.lineJoin = 'round'; g.lineCap = 'butt';
    g.globalAlpha = 0.55; g.strokeStyle = this.pattern(g, 'shoulder', track.theme);
    g.lineWidth = track.hw * 2 + 3.2; for (const p of P.ground) g.stroke(p.path);
    g.globalAlpha = 0.9; g.lineWidth = track.hw * 2 + 1.4; for (const p of P.ground) g.stroke(p.path);
    g.globalAlpha = 1;

    // 3) calle de boxes
    g.fillStyle = this.pattern(g, 'concrete', track.theme);
    for (const p of P.pit) g.fill(p);

    // 4) superficie de la pista por tramos
    for (const run of P.ground) {
      g.strokeStyle = this.pattern(g, run.surf, track.theme);
      g.lineWidth = track.hw * 2; g.stroke(run.path);
    }
    // 5) huellas fijas en tramos sueltos, líneas y pianos en asfalto
    for (const run of P.ground) {
      if (run.surf === 'asphalt') continue;
      const col = run.surf === 'snow' ? 'rgba(150,170,200,0.35)' : 'rgba(60,40,20,0.18)';
      for (const off of [-3.2, -1.3, 1.3, 3.2]) {
        g.strokeStyle = col; g.lineWidth = 0.5 + rng() * 0.3;
        g.stroke(this.line(track, run.a, run.b, () => off + (rng() - 0.5) * 0.05));
      }
    }
    g.strokeStyle = 'rgba(240,240,235,0.85)'; g.lineWidth = 0.22;
    for (const run of P.ground) {
      if (run.surf !== 'asphalt') continue;
      g.stroke(this.line(track, run.a, run.b, () => track.hw - 0.4));
      g.stroke(this.line(track, run.a, run.b, () => -(track.hw - 0.4)));
    }
    g.lineWidth = 1.0;
    for (const p of P.curbs) {
      g.setLineDash([]); g.strokeStyle = '#f2f2f2'; g.stroke(p);
      g.setLineDash([1.4, 1.4]); g.strokeStyle = '#d32f2f'; g.stroke(p);
    }
    g.setLineDash([]);
    g.lineWidth = 0.22; g.strokeStyle = 'rgba(240,240,235,0.85)';
    for (const p of P.pitLines) g.stroke(p);

    // 6) manchas: barro, agua, hielo
    for (const pa of track.patches) this.drawPatch(track, g, pa, rng);

    // 7) largada, grilla, boxes
    this.drawStartAndPit(track, g);

    // 8) bordes
    this.drawEdges(track, g, c, rng);

    // 9) obstáculos, decoración y público
    for (const o of track.obstacles) this.drawObject(g, c, o.kind, o.x, o.y, o.kind === 'rock' ? o.r : o.size * 0.75, T, mulberry32((o.seed * 1e9) | 0), true);
    for (const o of track.decor) this.drawObject(g, c, o.kind, o.x, o.y, o.size, T, mulberry32((o.seed * 1e9) | 0), false);
    for (const p of track.crowds) this.drawPerson(g, p.x, p.y, mulberry32((p.seed * 1e9) | 0));

    // 10) puente
    if (track.def.bridge) art.bridge = this.buildBridge(track, P);

    // copia del suelo limpio (para borrar las huellas entre carreras), guardada comprimida
    art.base = null;
    if (ground.toBlob) ground.toBlob(b => { art.base = b; }, 'image/png');
    track.art = art;
    return art;
  },

  resetMarks(track) {
    const a = track.art;
    if (!a || !a.base || !a.dirty) return;          // si todavía no se pintó nada, ya está limpio
    a.dirty = false;
    createImageBitmap(a.base).then(img => {
      const g = a.ground.getContext('2d');
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(img, 0, 0); g.restore();
      img.close && img.close();
    });
  },

  paint(track, x1, y1, x2, y2, style) {
    const a = track.art; if (!a || !style) return;
    a.dirty = true;
    const g = a.ground.getContext('2d');
    g.strokeStyle = style[0]; g.lineWidth = style[1]; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  },

  line(track, from, to, sFn, closed) {
    const p = new Path2D();
    for (let k = from; k <= to; k++) {
      const i = track.wrap(k), s = sFn(i);
      const x = track.x[i] + track.nx[i] * s, y = track.y[i] + track.ny[i] * s;
      if (k === from) p.moveTo(x, y); else p.lineTo(x, y);
    }
    if (closed) p.closePath();
    return p;
  },
  ranges(track, pred) {
    const N = track.N;
    let start = 0; while (start < N && pred(start)) start++;
    if (start === N) return [[0, N]];
    const out = []; let a = -1;
    for (let k = start; k < start + N; k++) {
      const i = track.wrap(k);
      if (pred(i) && a < 0) a = k;
      if (!pred(i) && a >= 0) { out.push([a, k]); a = -1; }
    }
    if (a >= 0) out.push([a, start + N]);
    return out;
  },

  paths(track) {
    const P = { ground: [], pit: [], pitLines: [], curbs: [] }, pit = track.def.pit;
    // tramos del suelo agrupados por terreno (el tramo del puente va aparte)
    const key = i => track.layer[i] ? 255 : track.surf[i];
    let start = 0; while (key(start) === key(track.wrap(start - 1)) && start < track.N) start++;
    if (start >= track.N) start = 0;
    let a = start;
    for (let k = start + 1; k <= start + track.N; k++) {
      if (k === start + track.N || key(track.wrap(k)) !== key(track.wrap(a))) {
        if (key(track.wrap(a)) !== 255) {
          P.ground.push({ surf: SURF_NAMES[track.surf[track.wrap(a)]], a, b: k, path: this.line(track, a - 1, k + 1, () => 0) });
        }
        a = k;
      }
    }
    for (const [ra, rb] of this.ranges(track, i => track.curb[i] === 1 && !track.layer[i])) {
      P.curbs.push(this.line(track, ra, rb, () => track.hw + 0.45));
      P.curbs.push(this.line(track, ra, rb, () => -(track.hw + 0.45)));
    }
    if (pit) {
      for (const [ra, rb] of this.ranges(track, i => track.pitF[i] > 0.002)) {
        const poly = new Path2D();
        for (let k = ra; k <= rb; k++) {
          const i = track.wrap(k), s = pit.side * (track.hw - 0.5);
          const x = track.x[i] + track.nx[i] * s, y = track.y[i] + track.ny[i] * s;
          k === ra ? poly.moveTo(x, y) : poly.lineTo(x, y);
        }
        for (let k = rb; k >= ra; k--) {
          const i = track.wrap(k), s = pit.side * track.pitOuter[i];
          poly.lineTo(track.x[i] + track.nx[i] * s, track.y[i] + track.ny[i] * s);
        }
        poly.closePath(); P.pit.push(poly);
        P.pitLines.push(this.line(track, ra, rb, i => pit.side * (track.pitOuter[i] - 0.3)));
      }
      for (const [ra, rb] of this.ranges(track, i => track.pitF[i] > 0.97)) {
        P.pitLines.push(this.line(track, ra, rb, () => pit.side * (track.hw + pit.gap)));
      }
    }
    return P;
  },

  drawFields(track, g, rng, ox, oy, ww, wh) {
    // campos arados lejos de la pista
    for (let k = 0; k < 14; k++) {
      const x = ox + rng() * ww, y = oy + rng() * wh, w = 30 + rng() * 40, h = 20 + rng() * 30, a = (rng() - 0.5) * 0.6;
      const q = track.query(x, y);
      if (Math.abs(q.s) < Math.max(w, h) * 0.75 + track.wallAt(q, Math.sign(q.s) || 1) + 4) continue;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = rng() < 0.5 ? '#8e7a4e' : '#a39a55'; g.globalAlpha = 0.8;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(60,45,25,0.35)'; g.lineWidth = 0.5;
      for (let yy = -h / 2 + 1; yy < h / 2; yy += 1.6) { g.beginPath(); g.moveTo(-w / 2, yy); g.lineTo(w / 2, yy); g.stroke(); }
      g.restore(); g.globalAlpha = 1;
    }
  },

  blobPath(track, pa, rng, grow) {
    const p = new Path2D(), n = 28;
    const wob = Array.from({ length: n }, () => 0.9 + rng() * 0.2);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2, w = wob[k % n] + grow;
      const [x, y] = track.pointAt(pa.d + Math.cos(a) * pa.len * w, pa.s + Math.sin(a) * pa.w * w);
      k ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return p;
  },

  drawPatch(track, g, pa, rng) {
    const seed = (rng() * 1e9) | 0;
    const shape = grow => this.blobPath(track, pa, mulberry32(seed), grow);
    if (pa.type === 'water') {
      g.fillStyle = 'rgba(45,35,20,0.45)'; g.fill(shape(0.12));      // orilla mojada
      g.fillStyle = this.pattern(g, 'water'); g.globalAlpha = 0.92; g.fill(shape(0)); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(220,240,250,0.5)'; g.lineWidth = 0.25; g.stroke(shape(-0.04));
    } else if (pa.type === 'mud') {
      g.fillStyle = 'rgba(40,28,15,0.4)'; g.fill(shape(0.15));
      g.fillStyle = this.pattern(g, 'mud'); g.fill(shape(0));
    } else if (pa.type === 'ice') {
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill(shape(0.08));
      g.fillStyle = this.pattern(g, 'ice'); g.globalAlpha = 0.95; g.fill(shape(0)); g.globalAlpha = 1;
    } else {
      g.fillStyle = this.pattern(g, pa.type === 'deepsnow' ? 'deepsnow' : pa.type); g.fill(shape(0));
    }
  },

  drawStartAndPit(track, g) {
    const [sx, sy, sh] = track.pointAt(track.startD, 0);
    g.save(); g.translate(sx, sy); g.rotate(sh);
    for (let r = 0; r < 2; r++) for (let k = -track.hw; k < track.hw; k++) {
      g.fillStyle = (r + k) % 2 === 0 ? '#f4f4f0' : '#1c1c1c'; g.fillRect(r * 0.8, k, 0.8, 1);
    }
    g.restore();
    // pórtico de largada (sombra + estructura)
    g.save(); g.translate(sx, sy); g.rotate(sh);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-0.4 + 0.8, -track.hw - 1.2 + 1.2, 0.8, 2 * track.hw + 2.4);
    g.fillStyle = '#2b3a55'; g.fillRect(-0.4, -track.hw - 1.2, 0.8, 2 * track.hw + 2.4);
    g.fillStyle = '#f2c94c'; g.fillRect(-0.25, -track.hw + 0.5, 0.5, 2 * track.hw - 1);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.18;
    for (let k = 0; k < 4; k++) {
      const [gx, gy, gh] = track.gridSlot(k);
      g.save(); g.translate(gx, gy); g.rotate(gh);
      g.beginPath(); g.moveTo(1.3, -1.2); g.lineTo(2.3, -1.2); g.lineTo(2.3, 1.2); g.lineTo(1.3, 1.2); g.stroke();
      g.restore();
    }
    const pit = track.def.pit;
    if (!pit) return;
    for (const b of track.boxes) {
      const [x, y, h] = track.pointAt(b.d, b.s);
      g.save(); g.translate(x, y); g.rotate(h);
      g.fillStyle = 'rgba(255,213,79,0.18)'; g.fillRect(-2.8, -1.9, 5.6, 3.8);
      g.strokeStyle = '#f2c94c'; g.lineWidth = 0.18; g.strokeRect(-2.8, -1.9, 5.6, 3.8);
      g.restore();
    }
    const [lx, ly, lh] = track.pointAt(pit.f0 * track.length + pit.taper + 6, pit.side * (track.hw + pit.gap + pit.laneWidth / 2));
    g.save(); g.translate(lx, ly); g.rotate(lh);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = 'bold 1.6px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PIT 60', 0, 0);
    g.restore();
  },

  drawEdges(track, g, c, rng) {
    const T = THEMES[track.theme];
    for (const side of [1, -1]) {
      const earr = side > 0 ? track.edgePos : track.edgeNeg, warr = side > 0 ? track.wallPos : track.wallNeg;
      for (const type of EDGE_NAMES) {
        if (type === 'rail') continue;
        const ti = EDGE_NAMES.indexOf(type);
        for (const [a, b] of this.ranges(track, i => earr[i] === ti && !track.layer[i])) {
          const at = (k, extra) => {
            const i = track.wrap(Math.round(k)), s = side * (warr[i] + extra);
            return [track.x[i] + track.nx[i] * s, track.y[i] + track.ny[i] * s];
          };
          const path = extra => this.line(track, a, b, i => side * (warr[i] + extra));
          if (type === 'wall') {
            g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.3;
            g.save(); g.translate(0.4, 0.55); g.stroke(path(0.6)); g.restore();
            for (let k = a; k < b; k += 1) {                         // pilas de neumáticos
              const [x, y] = at(k, 0.6);
              const red = Math.floor(k / 3) % 2 === 0;
              g.fillStyle = '#26272a'; g.beginPath(); g.arc(x, y, 0.55, 0, 7); g.fill();
              g.fillStyle = red ? '#c0392b' : '#ececec'; g.beginPath(); g.arc(x, y, 0.42, 0, 7); g.fill();
              g.fillStyle = '#26272a'; g.beginPath(); g.arc(x, y, 0.2, 0, 7); g.fill();
            }
          } else if (type === 'fence') {
            g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.35;
            g.save(); g.translate(0.35, 0.5); g.stroke(path(0.3)); g.restore();
            g.strokeStyle = '#6e4f2c'; g.lineWidth = 0.32; g.stroke(path(0.3));
            g.strokeStyle = '#c29a66'; g.lineWidth = 0.1; g.stroke(path(0.24));
            for (let k = a; k < b; k += 2.5) {
              const [x, y] = at(k, 0.3);
              g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 0.12 + 0.3, y - 0.12 + 0.45, 0.28, 0.28);
              g.fillStyle = '#5e4326'; g.fillRect(x - 0.2, y - 0.2, 0.4, 0.4);
            }
          } else if (type === 'snowbank') {
            g.lineCap = 'round';
            g.strokeStyle = 'rgba(120,140,170,0.35)'; g.lineWidth = 2.6;
            g.save(); g.translate(0.4, 0.5); g.stroke(path(0.9)); g.restore();
            g.strokeStyle = '#f7f9fc'; g.lineWidth = 2.2; g.stroke(path(0.9));
            g.strokeStyle = 'rgba(200,215,235,0.8)'; g.lineWidth = 0.6; g.stroke(path(1.4));
            g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 0.5; g.stroke(path(0.5));
            g.lineCap = 'butt';
          } else if (type === 'rockwall') {
            for (let k = a; k < b; k += 1.2) {
              const [x, y] = at(k, 0.9 + rng() * 0.4);
              this.drawRock(g, x, y, 0.8 + rng() * 0.6, mulberry32((rng() * 1e9) | 0), T);
            }
          } else if (type === 'treeline') {
            for (let k = a; k < b; k += 1.6) {                       // sotobosque
              const [x, y] = at(k, 0.4 + rng() * 0.6);
              this.drawBush(g, x, y, 0.7 + rng() * 0.5, mulberry32((rng() * 1e9) | 0), T);
            }
            for (let k = a; k < b; k += 2.6) {                       // línea de árboles
              const [x, y] = at(k, 2.2 + rng() * 3.5);
              const q = track.query(x, y);
              if (Math.abs(q.s) < track.wallAt(q, Math.sign(q.s) || 1) + 1) continue;
              this.drawTree(g, c, x, y, 0.9 + rng() * 0.6, rng() < 0.3 ? 'pine' : 'tree', T, mulberry32((rng() * 1e9) | 0));
            }
          }
        }
      }
    }
  },

  // ------------------------------------------------------------ objetos
  drawObject(g, c, kind, x, y, size, T, rng, isObstacle) {
    if (kind === 'tree' || kind === 'pine') {
      if (isObstacle) { g.fillStyle = '#4a3523'; g.beginPath(); g.arc(x, y, 0.45, 0, 7); g.fill(); }
      this.drawTree(g, c, x, y, isObstacle ? size * 0.8 : size, kind, T, rng);
    } else if (kind === 'rock') this.drawRock(g, x, y, size, rng, T);
    else if (kind === 'bush') this.drawBush(g, x, y, size, rng, T);
    else if (kind === 'hay') this.drawHayBale(g, x, y, size * 0.9, rng);
    else if (kind === 'cactus') this.drawCactus(g, c, x, y, size, rng, T);
  },

  drawCactus(g, c, x, y, size, rng, T) {
    const r = 0.7 * size;
    g.fillStyle = 'rgba(60,35,10,0.3)'; g.beginPath(); g.ellipse(x + r * 1.1, y + r * 1.4, r * 1.3, r * 0.8, 0.6, 0, 7); g.fill();
    const arms = [[0, 0, r]];
    for (let k = 0; k < 2 + ((rng() * 2) | 0); k++) { const a = rng() * 7; arms.push([Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1, r * 0.55]); }
    for (const [px, py, rr] of arms) {
      const gr = c.createRadialGradient(x + px - rr * 0.3, y + py - rr * 0.3, 0, x + px, y + py, rr);
      gr.addColorStop(0, T.leaf[3]); gr.addColorStop(1, T.leaf[2]);
      c.fillStyle = gr; c.beginPath(); c.arc(x + px, y + py, rr, 0, 7); c.fill();
      c.strokeStyle = 'rgba(30,45,15,0.5)'; c.lineWidth = 0.05;
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.moveTo(x + px, y + py); c.lineTo(x + px + Math.cos(a) * rr, y + py + Math.sin(a) * rr); c.stroke(); }
    }
  },

  drawTree(g, c, x, y, size, kind, T, rng) {
    const R = (kind === 'pine' ? 1.8 : 2.3) * size;
    // sombra en el suelo
    g.fillStyle = 'rgba(15,25,10,0.28)';
    g.beginPath(); g.ellipse(x + R * 0.7, y + R * 0.9, R * 1.05, R * 0.9, 0.6, 0, 7); g.fill();
    if (kind === 'pine') {
      const layers = [[1, T.leaf[2]], [0.75, T.leaf[0]], [0.5, T.leaf[1]], [0.25, T.leaf[3]]];
      for (const [f, col] of layers) {
        const r = R * f, n = 9;
        c.fillStyle = col; c.beginPath();
        for (let k = 0; k <= n * 2; k++) {
          const a = (k / (n * 2)) * Math.PI * 2 + rng() * 0.1, rr = k % 2 ? r * 0.62 : r;
          const px = x - (1 - f) * R * 0.15 + Math.cos(a) * rr, py = y - (1 - f) * R * 0.15 + Math.sin(a) * rr;
          k ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath(); c.fill();
        if (T.snowy) {
          c.fillStyle = 'rgba(255,255,255,0.75)';
          c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7); c.fill();
        }
      }
    } else {
      const blobs = 5 + ((rng() * 3) | 0);
      const pts = [[0, 0, R * 0.62]];
      for (let k = 0; k < blobs; k++) {
        const a = rng() * Math.PI * 2, d = R * (0.3 + rng() * 0.25);
        pts.push([Math.cos(a) * d, Math.sin(a) * d, R * (0.38 + rng() * 0.2)]);
      }
      c.fillStyle = 'rgba(0,0,0,0.18)';
      for (const [px, py, r] of pts) { c.beginPath(); c.arc(x + px + 0.2, y + py + 0.25, r, 0, 7); c.fill(); }
      for (const [px, py, r] of pts) {
        const gr = c.createRadialGradient(x + px - r * 0.35, y + py - r * 0.35, r * 0.1, x + px, y + py, r);
        gr.addColorStop(0, T.leaf[3]); gr.addColorStop(0.6, T.leaf[1]); gr.addColorStop(1, T.leaf[2]);
        c.fillStyle = gr; c.beginPath(); c.arc(x + px, y + py, r, 0, 7); c.fill();
      }
      if (T.snowy) {
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.beginPath(); c.arc(x - R * 0.25, y - R * 0.25, R * 0.4, 0, 7); c.fill();
      }
    }
  },

  drawRock(g, x, y, r, rng, T) {
    const n = 8, pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push([Math.cos(a) * r * (0.75 + rng() * 0.35), Math.sin(a) * r * (0.75 + rng() * 0.35)]); }
    const poly = (dx, dy) => { g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(x + px + dx, y + py + dy) : g.moveTo(x + px + dx, y + py + dy))); g.closePath(); };
    g.fillStyle = 'rgba(0,0,0,0.3)'; poly(r * 0.35, r * 0.45); g.fill();
    const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
    gr.addColorStop(0, '#b3ada3'); gr.addColorStop(0.5, '#8e8880'); gr.addColorStop(1, '#5f5a54');
    g.fillStyle = gr; poly(0, 0); g.fill();
    g.strokeStyle = 'rgba(40,36,32,0.5)'; g.lineWidth = 0.08; g.stroke();
    if (T && T.snowy) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.5, r * 0.32, -0.5, 0, 7); g.fill(); }
  },

  drawBush(g, x, y, r, rng, T) {
    g.fillStyle = 'rgba(10,20,5,0.25)'; g.beginPath(); g.arc(x + r * 0.4, y + r * 0.5, r * 1.05, 0, 7); g.fill();
    for (let k = 0; k < 4; k++) {
      const a = rng() * 7, d = r * 0.35 * rng(), rr = r * (0.55 + rng() * 0.3);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      const gr = g.createRadialGradient(px - rr * 0.3, py - rr * 0.3, 0, px, py, rr);
      gr.addColorStop(0, T.snowy ? '#f4f7fb' : T.leaf[3]); gr.addColorStop(1, T.snowy ? '#9fb2a4' : T.leaf[2]);
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, rr, 0, 7); g.fill();
    }
  },

  drawHayBale(g, x, y, r, rng) {
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.arc(x + r * 0.35, y + r * 0.45, r, 0, 7); g.fill();
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    gr.addColorStop(0, '#f1d98a'); gr.addColorStop(1, '#b8913f');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(120,85,30,0.6)'; g.lineWidth = 0.06;
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(x, y, r * k / 3.6, rng() * 6, rng() * 6 + 5); g.stroke(); }
  },

  drawPerson(g, x, y, rng) {
    const shirts = ['#d64545', '#2f6fd6', '#f2c94c', '#3aa35b', '#ffffff', '#e67e22', '#8e44ad', '#1abc9c'];
    const skins = ['#f1c9a5', '#d9a77c', '#a8754f', '#7a4f32'];
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 0.25, y + 0.32, 0.32, 0.22, 0.5, 0, 7); g.fill();
    g.fillStyle = shirts[(rng() * shirts.length) | 0];
    g.beginPath(); g.ellipse(x, y, 0.32, 0.22, rng() - 0.5, 0, 7); g.fill();
    g.fillStyle = skins[(rng() * skins.length) | 0];
    g.beginPath(); g.arc(x, y, 0.14, 0, 7); g.fill();
  },

  buildBridge(track, P) {
    const idx = []; for (let i = 0; i < track.N; i++) if (track.layer[i]) idx.push(i);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of idx) {
      minX = Math.min(minX, track.x[i]); maxX = Math.max(maxX, track.x[i]);
      minY = Math.min(minY, track.y[i]); maxY = Math.max(maxY, track.y[i]);
    }
    const M = track.hw + 8, ppm = this.ppm;
    const ox = minX - M, oy = minY - M, W = Math.ceil((maxX - minX + 2 * M) * ppm), H = Math.ceil((maxY - minY + 2 * M) * ppm);
    const cv = makeCanvas(W, H), g = cv.getContext('2d');
    g.setTransform(ppm, 0, 0, ppm, -ox * ppm, -oy * ppm);
    const [ra, rb] = this.ranges(track, i => track.layer[i] === 1)[0];
    const center = this.line(track, ra, rb, () => 0);
    g.lineCap = 'butt'; g.lineJoin = 'round';
    // sombra sobre el suelo y la pista de abajo
    g.save(); g.translate(1.6, 2.2);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = track.hw * 2 + 2.2; g.stroke(center);
    g.restore();
    // pilares
    for (let k = ra + 8; k < rb - 6; k += 12) {
      const i = track.wrap(k);
      for (const s of [-track.hw - 0.2, track.hw + 0.2]) {
        const x = track.x[i] + track.nx[i] * s, y = track.y[i] + track.ny[i] * s;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 0.4, y + 0.6, 1.2, 1.2);
      }
    }
    g.strokeStyle = '#8c8a84'; g.lineWidth = track.hw * 2 + 2.0; g.stroke(center);
    g.strokeStyle = this.pattern(g, 'concrete', track.theme); g.lineWidth = track.hw * 2 + 1.6; g.stroke(center);
    g.strokeStyle = this.pattern(g, 'asphalt', track.theme); g.lineWidth = track.hw * 2; g.stroke(center);
    g.strokeStyle = 'rgba(240,240,235,0.85)'; g.lineWidth = 0.22;
    g.stroke(this.line(track, ra, rb, () => track.hw - 0.4)); g.stroke(this.line(track, ra, rb, () => -(track.hw - 0.4)));
    // juntas de dilatación
    g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 0.12;
    for (let k = ra; k <= rb; k += 10) {
      const i = track.wrap(k);
      g.beginPath();
      g.moveTo(track.x[i] - track.nx[i] * (track.hw + 0.8), track.y[i] - track.ny[i] * (track.hw + 0.8));
      g.lineTo(track.x[i] + track.nx[i] * (track.hw + 0.8), track.y[i] + track.ny[i] * (track.hw + 0.8));
      g.stroke();
    }
    // barandas
    for (const side of [1, -1]) {
      const rail = this.line(track, ra, rb, () => side * (track.hw + 0.75));
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.4;
      g.save(); g.translate(0.25, 0.35); g.stroke(rail); g.restore();
      g.strokeStyle = '#d9dcdf'; g.lineWidth = 0.3; g.stroke(rail);
      g.strokeStyle = '#7d8288'; g.lineWidth = 0.08; g.stroke(rail);
    }
    return { canvas: cv, ox, oy, W, H };
  },

  // ------------------------------------------------------------ autos
  carSprites(player, num) {
    const key = player.color + num;
    if (this.cars[key]) return this.cars[key];
    const S = 28, Lh = 1.95, Wh = 0.9, pad = 0.3;
    const W = Math.ceil((Lh + pad) * 2 * S), H = Math.ceil((Wh + pad) * 2 * S);
    const mk = () => { const cv = makeCanvas(W, H), g = cv.getContext('2d'); g.setTransform(S, 0, 0, S, W / 2, H / 2); return [cv, g]; };
    const col = player.color, acc = player.accent;
    const L = 1.9, Wd = 0.86;
    const body = g => {
      g.beginPath();
      g.moveTo(L - 0.3, -Wd + 0.1);
      g.quadraticCurveTo(L + 0.02, -Wd + 0.16, L, -0.32);
      g.lineTo(L, 0.32);
      g.quadraticCurveTo(L + 0.02, Wd - 0.16, L - 0.3, Wd - 0.1);
      g.lineTo(-L + 0.22, Wd - 0.04);
      g.quadraticCurveTo(-L, Wd - 0.08, -L, Wd - 0.38);
      g.lineTo(-L, -Wd + 0.38);
      g.quadraticCurveTo(-L, -Wd + 0.08, -L + 0.22, -Wd + 0.04);
      g.closePath();
    };
    // --- carrocería
    const [cv, g] = mk();
    body(g);
    const gr = g.createLinearGradient(0, -Wd, 0, Wd);
    gr.addColorStop(0, hexShade(col, 0.62)); gr.addColorStop(0.22, col); gr.addColorStop(0.45, hexShade(col, 1.18));
    gr.addColorStop(0.75, col); gr.addColorStop(1, hexShade(col, 0.55));
    g.fillStyle = gr; g.fill();
    g.save(); body(g); g.clip();
    // franjas de la decoración
    g.fillStyle = acc; g.globalAlpha = 0.95;
    g.fillRect(-L, -0.3, 2 * L, 0.11); g.fillRect(-L, 0.19, 2 * L, 0.11);
    g.globalAlpha = 1;
    // pasarruedas
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (const ax of [1.15, -1.2]) for (const sy of [-1, 1]) { g.beginPath(); g.ellipse(ax, sy * Wd, 0.42, 0.14, 0, 0, 7); g.fill(); }
    g.restore();
    g.strokeStyle = hexShade(col, 0.4); g.lineWidth = 0.04; body(g); g.stroke();
    // capot: pliegues
    g.strokeStyle = hexShade(col, 0.8); g.lineWidth = 0.025;
    g.beginPath(); g.moveTo(1.75, -0.45); g.lineTo(1.0, -0.5); g.moveTo(1.75, 0.45); g.lineTo(1.0, 0.5); g.stroke();
    // parabrisas
    const glass = (pts, light) => {
      g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      const gg = g.createLinearGradient(pts[0][0], -0.6, pts[2][0], 0.6);
      gg.addColorStop(0, '#16202b'); gg.addColorStop(light, '#4a6178'); gg.addColorStop(1, '#1b2632');
      g.fillStyle = gg; g.fill();
    };
    glass([[0.98, -0.66], [0.98, 0.66], [0.42, 0.6], [0.42, -0.6]], 0.35);
    glass([[-0.98, -0.6], [-0.98, 0.6], [-1.34, 0.52], [-1.34, -0.52]], 0.6);
    // ventanillas laterales
    g.fillStyle = '#1f2a36';
    g.fillRect(-0.95, -0.73, 1.37, 0.1); g.fillRect(-0.95, 0.63, 1.37, 0.1);
    // techo
    g.beginPath(); g.roundRect(-0.98, -0.62, 1.42, 1.24, 0.12);
    const rg = g.createLinearGradient(0, -0.62, 0, 0.62);
    rg.addColorStop(0, hexShade(col, 0.85)); rg.addColorStop(0.4, hexShade(col, 1.22)); rg.addColorStop(1, hexShade(col, 0.8));
    g.fillStyle = rg; g.fill();
    g.fillStyle = acc; g.fillRect(-0.98, -0.3, 1.42, 0.11); g.fillRect(-0.98, 0.19, 1.42, 0.11);
    // número en el techo
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-0.27, 0, 0.3, 0, 7); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 0.03; g.stroke();
    g.save(); g.translate(-0.27, 0); g.rotate(Math.PI / 2);
    g.fillStyle = '#1b1b1b'; g.font = 'bold 0.4px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), 0, 0.02); g.restore();
    // brillo
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.ellipse(0.1, -0.35, 1.2, 0.12, 0, 0, 7); g.fill();
    // alerón
    g.fillStyle = hexShade(col, 0.5); g.fillRect(-1.92, -0.8, 0.16, 1.6);
    g.fillStyle = acc; g.fillRect(-1.92, -0.8, 0.05, 1.6);
    // faros y luces traseras
    g.fillStyle = '#fff7d6';
    g.beginPath(); g.roundRect(1.76, -0.7, 0.13, 0.32, 0.05); g.fill();
    g.beginPath(); g.roundRect(1.76, 0.38, 0.13, 0.32, 0.05); g.fill();
    g.fillStyle = '#ffe680'; g.fillRect(1.86, -0.15, 0.05, 0.3);  // faros auxiliares de rally
    g.fillStyle = '#b71c1c';
    g.fillRect(-1.9, -0.72, 0.09, 0.28); g.fillRect(-1.9, 0.44, 0.09, 0.28);
    // espejos
    g.fillStyle = hexShade(col, 0.6);
    g.fillRect(0.55, -0.98, 0.16, 0.12); g.fillRect(0.55, 0.86, 0.16, 0.12);

    // --- sombra (difusa)
    const [sh, sg] = mk();
    for (let k = 6; k >= 0; k--) {
      sg.globalAlpha = 0.09; sg.fillStyle = '#000';
      sg.beginPath(); sg.roundRect(-L - k * 0.04, -Wd - k * 0.04, 2 * L + k * 0.08, 2 * Wd + k * 0.08, 0.35 + k * 0.04); sg.fill();
    }
    // --- tierra pegada
    const [dirt, dg] = mk();
    dg.save(); body(dg); dg.clip();
    const rr = mulberry32(hashStr(key));
    for (let k = 0; k < 700; k++) {
      const x = -L + rr() * 2 * L, y = (rr() < 0.5 ? -1 : 1) * Wd * (1 - Math.pow(rr(), 2.2));
      const back = x < 0 ? 1.3 : 0.8;
      dg.globalAlpha = 0.25 + rr() * 0.5 * back; dg.fillStyle = rr() < 0.5 ? '#6b4f30' : '#8c6a44';
      dg.beginPath(); dg.arc(x, y, 0.03 + rr() * 0.08, 0, 7); dg.fill();
    }
    dg.globalAlpha = 0.35; dg.fillStyle = '#7a5a38'; dg.fillRect(-L, -Wd, 0.5, 2 * Wd);
    dg.restore();
    // --- hollín (daño)
    const [soot, so] = mk();
    so.save(); body(so); so.clip();
    for (let k = 0; k < 60; k++) {
      const x = -L + rr() * 2 * L, y = (rr() - 0.5) * 2 * Wd, r = 0.15 + rr() * 0.35;
      const sgd = so.createRadialGradient(x, y, 0, x, y, r);
      sgd.addColorStop(0, 'rgba(20,18,16,0.55)'); sgd.addColorStop(1, 'rgba(20,18,16,0)');
      so.fillStyle = sgd; so.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    so.restore();
    return (this.cars[key] = { body: cv, shadow: sh, dirt, soot, w: W / S, h: H / S });
  },
};
