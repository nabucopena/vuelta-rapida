// ¿Frenar ayuda a doblar?  node tools/turnbrake.js ['{"param":valor}']
const C = require('../js/car.js'); const DT = 1 / 240;
const P = process.argv[2] ? JSON.parse(process.argv[2]) : {};
function run(kmh, mode, surf) {
  const car = new C.Car(0, 0, 0, P); car.vx = kmh / 3.6;
  let maxB = 0, h05 = null;
  for (let t = 0; t < 1.0; t += DT) {
    const inp = { throttle: mode === 'gas' ? 1 : 0, brake: mode === 'freno' ? 1 : 0, steer: 1 };
    car.step(DT, inp, surf);
    if (car.vLong > 1) maxB = Math.max(maxB, Math.abs(car.beta));
    if (h05 === null && t >= 0.5) h05 = car.angle;
  }
  return `${mode.padEnd(6)} giro 0,5s ${(h05 * 57.3).toFixed(0).padStart(3)}° 1s ${(car.angle * 57.3).toFixed(0).padStart(3)}° derrape ${(maxB * 57.3).toFixed(0).padStart(2)}° v final ${(car.speed * 3.6).toFixed(0)}`;
}
for (const [name, s] of [['asfalto', C.SURFACES.asphalt], ['tierra', C.SURFACES.dirt]])
  for (const kmh of [100, 160]) console.log(`${name} ${kmh}km/h | ` + ['suelto', 'freno', 'gas'].map(m => run(kmh, m, s)).join(' | '));
