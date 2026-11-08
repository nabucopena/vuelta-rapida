// Efecto de la asistencia de dirección:  node tools/assist.js
const C = require('../js/car.js'); const DT = 1 / 240;
function settle(params, surf) {   // auto que viene rotando y el jugador suelta la dirección
  const car = new C.Car(0, 0, 0, params); car.vx = 30; car.omega = 0.35;
  for (let t = 0; t < 2; t += DT) car.step(DT, { throttle: 0.5, brake: 0, steer: 0 }, surf);
  return (car.angle * 57.3).toFixed(1) + '° de desvío';
}
function drift(params, surf) {
  const car = new C.Car(0, 0, 0, params); car.vx = 18; let mb = 0;
  for (let t = 0; t < 3; t += DT) { car.step(DT, { throttle: 1, brake: 0, steer: t < 0.4 ? 1 : 0.6 }, surf); mb = Math.max(mb, Math.abs(car.beta)); }
  return (mb * 57.3).toFixed(0) + '°';
}
function brakeTurn(params, surf) {
  const car = new C.Car(0, 0, 0, params); car.vx = 100 / 3.6; let mb = 0, h = 0;
  for (let t = 0; t < 1; t += DT) { car.step(DT, { throttle: 0, brake: 1, steer: 1 }, surf); if (car.vLong > 1) mb = Math.max(mb, Math.abs(car.beta)); if (t < 0.5) h = car.angle; }
  return `${(mb * 57.3).toFixed(0)}° (giro 0,5s ${(h * 57.3).toFixed(0)}°)`;
}
for (const [label, P] of [['sin asistencia', { steerAssistGain: 0 }], ['con asistencia', {}]]) {
  console.log(label.padEnd(15), ['asphalt', 'dirt', 'snow'].map(k =>
    `${k}: suelta ${settle(P, C.SURFACES[k])}, derrape ${drift(P, C.SURFACES[k])}, frena+gira ${brakeTurn(P, C.SURFACES[k])}`).join(' | '));
}
