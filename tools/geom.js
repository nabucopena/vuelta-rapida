// Revisa la geometría de las pistas:  node tools/geom.js
const C = require('../js/car.js'); global.SURFACES = C.SURFACES;
const T = require('../js/track.js'); Object.assign(global, T);
const { TRACK_DEFS } = require('../js/tracks.js');
for (const def of TRACK_DEFS) {
  const t = new T.Track(def);
  let minR = Infinity, minRi = 0;
  for (let i = 0; i < t.N; i++) { const r = 1 / Math.abs(t.curv[i] || 1e-9); if (r < minR) { minR = r; minRi = i; } }
  const bridgeD = def.bridge ? def.bridge.f * t.length : null;
  const nearBridge = i => bridgeD != null && Math.min(Math.abs(i * t.spacing - bridgeD), t.length - Math.abs(i * t.spacing - bridgeD)) < 45;
  let worst = Infinity, wi = 0, wj = 0;
  for (let i = 0; i < t.N; i += 2) for (let j = i; j < t.N; j += 2) {
    const di = Math.min(Math.abs(i - j), t.N - Math.abs(i - j)) * t.spacing; if (di < 90) continue;
    const d = Math.hypot(t.x[i] - t.x[j], t.y[i] - t.y[j]);
    // tramos cruzados por el puente: se permite (uno pasa por arriba)
    if ((t.layer[i] || t.layer[j]) && d < 40) continue;
    const need = Math.max(t.wallPos[i], t.wallNeg[i]) + Math.max(t.wallPos[j], t.wallNeg[j]);
    const margin = d - need;
    if (margin < worst) { worst = margin; wi = i; wj = j; }
  }
  const b = t.bounds;
  console.log(`${def.name.padEnd(22)} largo ${t.length.toFixed(0)}m  radio mín ${minR.toFixed(1)}m (f=${(minRi / t.N).toFixed(2)})  ` +
    `separación mín entre muros ${worst.toFixed(1)}m (f=${(wi / t.N).toFixed(2)} y ${(wj / t.N).toFixed(2)})  tamaño ${(b.maxX - b.minX).toFixed(0)}x${(b.maxY - b.minY).toFixed(0)}  ` +
    `obst ${t.obstacles.length} deco ${t.decor.length} público ${t.crowds.length}`);
}
