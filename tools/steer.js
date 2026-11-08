// Mide la respuesta de la dirección a toques cortos:  node tools/steer.js
const C = require('../js/car.js'); const DT = 1 / 240;
function tap(params, ms, kmh) {
  const car = new C.Car(0, 0, 0, params); car.vx = kmh / 3.6;
  let maxSteer = 0;
  for (let t = 0; t < 1.5; t += DT) {
    car.step(DT, { throttle: car.speed < kmh / 3.6 ? 1 : 0, brake: 0, steer: t < ms / 1000 ? 1 : 0 }, C.SURFACES.asphalt);
    maxSteer = Math.max(maxSteer, car.steer);
  }
  return `${ms}ms: rueda ${(maxSteer * 57.3).toFixed(1)}°, rumbo ${(car.angle * 57.3).toFixed(1)}°`;
}
const P = process.argv[2] ? JSON.parse(process.argv[2]) : {};
for (const kmh of [60, 100, 180]) console.log(`${kmh} km/h  | ` + [30, 60, 120, 250, 500].map(ms => tap(P, ms, kmh)).join(' | '));
