// Cuánto "se mueve" el auto al intentar ir derecho con teclado en asfalto:  node tools/wobble2.js ['{"param":v}']
const C = require('../js/car.js'); const DT = 1 / 240;
const P = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const DELAY = +(process.argv[3] || 120), ANTIC = process.argv[4] === undefined ? 0.15 : +process.argv[4];
function run(kmh, surf, seed) {
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const car = new C.Car(0, 0, 0, P); car.vx = kmh / 3.6;
  const hist = []; let sum2 = 0, n = 0, flips = 0, lastSide = 0, maxH = 0, maxB = 0;
  for (let t = 0; t < 10; t += DT) {
    hist.push(car.angle + car.omega * ANTIC);
    const lag = Math.round(DELAY / 1000 * 240); const seen = hist.length > lag ? hist[hist.length - lag] : 0;
    const steer = Math.abs(seen) < 0.012 ? 0 : (seen > 0 ? -1 : 1);
    car.step(DT, { throttle: car.speed < kmh / 3.6 ? 1 : 0, brake: 0, steer }, surf);
    if (rnd() < 0.003) car.omega += (rnd() - 0.5) * 0.3;            // baches
    if (t > 1) { sum2 += car.angle ** 2; n++; maxH = Math.max(maxH, Math.abs(car.angle)); maxB = Math.max(maxB, Math.abs(car.beta)); }
    const side = Math.sign(Math.round(car.angle * 573) / 573);
    if (side && side !== lastSide) { if (lastSide) flips++; lastSide = side; }
  }
  return { rms: Math.sqrt(sum2 / n) * 57.3, maxH: maxH * 57.3, maxB: maxB * 57.3, flips };
}
const out = [];
for (const kmh of [120, 180, 230]) {
  const rs = [1, 7, 42].map(sd => run(kmh, C.SURFACES.asphalt, sd));
  const avg = k => (rs.reduce((a, x) => a + x[k], 0) / rs.length).toFixed(1);
  out.push(`${kmh}km/h desvío prom ${avg('rms')}° máx ${avg('maxH')}° derrape ${avg('maxB')}° cambios de lado ${avg('flips')}`);
}
console.log(out.join(' | '));
