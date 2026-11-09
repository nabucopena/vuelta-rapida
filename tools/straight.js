// ¿Se puede mantener el auto derecho con teclado?  node tools/straight.js ['{"param":valor}']
// Un "jugador" mira el rumbo y toca izquierda/derecha para mantenerlo en 0, con 120 ms de reacción.
const C = require('../js/car.js'); const DT = 1 / 240;
const P = process.argv[2] ? JSON.parse(process.argv[2]) : {};
function run(surf, kmh, damage, seed) {
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const car = new C.Car(0, 0, 0, P); car.vx = kmh / 3.6; car.damage = damage; car.damagePull = 1;
  car.omega = 0.08;                                    // pequeño empujón inicial
  const hist = []; let maxB = 0, maxH = 0, spin = false;
  for (let t = 0; t < 8; t += DT) {
    hist.push(car.angle + car.omega * 0.15);           // lo que el jugador "ve" (con anticipación)
    const seen = hist.length > 29 ? hist[hist.length - 29] : 0;   // 120 ms de reacción
    const steer = Math.abs(seen) < 0.012 ? 0 : (seen > 0 ? -1 : 1);
    car.step(DT, { throttle: car.speed < kmh / 3.6 ? 1 : 0, brake: 0, steer }, surf);
    if (rnd() < 0.002) car.omega += (rnd() - 0.5) * 0.4;   // baches / golpecitos
    maxB = Math.max(maxB, Math.abs(car.beta)); maxH = Math.max(maxH, Math.abs(car.angle));
    if (Math.abs(car.beta) > 0.6) spin = true;
  }
  return `${spin ? 'TROMPO' : 'ok'.padEnd(6)} derrape máx ${(maxB * 57.3).toFixed(0).padStart(2)}° rumbo máx ${(maxH * 57.3).toFixed(0).padStart(2)}°`;
}
for (const [n, s] of [['asfalto', C.SURFACES.asphalt], ['tierra', C.SURFACES.dirt], ['nieve', C.SURFACES.snow]])
  for (const dmg of [0, 70]) console.log(`${n.padEnd(7)} daño ${String(dmg).padStart(2)}% | ` + [100, 180, 230].map(k => `${k}km/h ${run(s, k, dmg, 7)}`).join(' | '));
