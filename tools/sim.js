// Pruebas de física sin navegador:  node tools/sim.js
const C = require('../js/car.js');
global.SURFACES = C.SURFACES;
const T = require('../js/track.js'); Object.assign(global, T); const { Track } = T;
const { TRACK_DEFS } = require('../js/tracks.js');
const { Car, SURFACES } = C;
const DT = 1 / 240;
const run = (car, secs, inp, surf = SURFACES.asphalt) => { for (let t = 0; t < secs; t += DT) car.step(DT, typeof inp === 'function' ? inp(t, car) : inp, surf); };
const kmh = v => (v * 3.6).toFixed(1);

// 1) aceleración y velocidad máxima
let car = new Car(0, 0, 0);
let t100 = null;
for (let t = 0; t < 30; t += DT) { car.step(DT, { throttle: 1, brake: 0, steer: 0 }, SURFACES.asphalt); if (t100 === null && car.speed > 100 / 3.6) t100 = t; }
console.log('vel. máx (30s):', kmh(car.speed), 'km/h  | 0-100:', t100 && t100.toFixed(2), 's');
// 2) frenado 100->0
car = new Car(0, 0, 0); car.vx = 100 / 3.6;
let x0 = car.x, tb = 0; while (car.vLong > 0.6 || tb === 0) { car.step(DT, { throttle: 0, brake: 1, steer: 0 }, SURFACES.asphalt); tb += DT; if (tb > 10) break; }
console.log('frenado 100-0:', (car.x - x0).toFixed(1), 'm en', tb.toFixed(2), 's');
// 3) curva sostenida a fondo con giro completo a varias velocidades
for (const v of [10, 15, 20, 25, 30]) {
  car = new Car(0, 0, 0); car.vx = v;
  run(car, 4, (t, c) => ({ throttle: c.speed < v ? 0.6 : 0, brake: 0, steer: 1 }));
  const beta = Math.atan2(car.vLat, car.vLong) * 180 / Math.PI;
  console.log(`curva @${kmh(v)}km/h: latG=${car.latG.toFixed(2)} radio=${(car.speed/Math.abs(car.omega)).toFixed(1)}m  aF=${car.alphaF.toFixed(3)} aR=${car.alphaR.toFixed(3)} derrape(beta)=${beta.toFixed(1)}°`);
}
// 4) estabilidad: slalom brusco a 25 m/s, y frenar doblando
car = new Car(0, 0, 0); car.vx = 25;
let maxBeta = 0;
run(car, 6, (t, c) => { maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(c.vLat, Math.abs(c.vLong)))); return { throttle: 1, brake: 0, steer: Math.sin(t * 5) > 0 ? 1 : -1 }; });
console.log('slalom: derrape máx', (maxBeta * 180 / Math.PI).toFixed(1), '°  omega', car.omega.toFixed(2));
car = new Car(0, 0, 0); car.vx = 28; maxBeta = 0;
run(car, 2, (t, c) => { if (c.vLong > 0.5) maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(c.vLat, c.vLong))); return { throttle: 0, brake: 1, steer: 1 }; });
console.log('freno+giro: derrape máx', (maxBeta * 180 / Math.PI).toFixed(1), '°');
// 5) pasto
car = new Car(0, 0, 0); run(car, 30, { throttle: 1, brake: 0, steer: 0 }, SURFACES.grass);
console.log('vel. máx en pasto:', kmh(car.speed));
// 6) parado sin input queda quieto, reversa
car = new Car(0, 0, 0); run(car, 3, { throttle: 0, brake: 1, steer: 0 });
console.log('reversa 3s:', kmh(car.vLong));

// la geometría de las pistas se revisa con: node tools/geom.js
