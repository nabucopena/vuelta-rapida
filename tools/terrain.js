// Pruebas de manejo por terreno:  node tools/terrain.js
const C = require('../js/car.js'); const S = C.SURFACES; const DT = 1 / 240;
function radius(surf, v, params) {
  const car = new C.Car(0, 0, 0, params); car.vx = v;
  for (let t = 0; t < 4; t += DT) car.step(DT, { throttle: car.speed < v ? 1 : 0, brake: 0, steer: 1 }, surf);
  return { R: car.speed / Math.abs(car.omega), beta: Math.abs(car.beta) * 57.3, v: car.speed };
}
// "piloto" que entra a una curva de radio fijo acelerando: mide derrape y si se recupera al soltar
function drift(surf, params) {
  const car = new C.Car(0, 0, 0, params); car.vx = 18; let maxB = 0, spun = false;
  for (let t = 0; t < 3; t += DT) {
    car.step(DT, { throttle: 1, brake: 0, steer: t < 0.4 ? 1 : 0.6 }, surf);
    maxB = Math.max(maxB, Math.abs(car.beta)); if (Math.abs(car.beta) > 1.4) spun = true;
  }
  // contravolante simple: dirección opuesta al derrape
  let rec = null;
  for (let t = 0; t < 3; t += DT) {
    const cs = Math.max(-1, Math.min(1, car.beta * 4));
    car.step(DT, { throttle: 0.3, brake: 0, steer: cs }, surf);
    if (rec === null && Math.abs(car.beta) < 0.08) rec = t;
  }
  return { maxB: maxB * 57.3, spun, rec };
}
const fmt = o => Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(1) : v}`).join(' ');
for (const name of ['asphalt', 'dirt', 'mud', 'snow', 'ice', 'grass']) {
  const s = S[name];
  const rs = [10, 20, 30].map(v => radius(s, v)).map((r, i) => `${[36, 72, 108][i]}km/h R=${r.R.toFixed(1)} β=${r.beta.toFixed(0)}°`).join(' | ');
  console.log(name.padEnd(8), rs, '|| drift:', fmt(drift(s)));
}
