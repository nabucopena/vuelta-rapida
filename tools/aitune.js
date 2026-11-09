// Prueba el piloto automático sin navegador:  node tools/aitune.js [pistas] ['{"latG":3.6,...}']
const S = require('../js/sim.js');
const { AI } = require('../js/ai.js');
const tracks = (process.argv[2] || '0,1,2,3').split(',').map(Number);
const over = process.argv[3] ? JSON.parse(process.argv[3]) : {};
Object.assign(AI, over);
let total = 0, okAll = true;
for (const T of tracks) {
  const sim = new S.RaceSim(T, { laps: 2, damage: true }, [{ id: 1, name: 'IA', color: '#e53935', accent: '#fff' }]);
  const car = sim.cars[0]; let off = 0, n = 0, maxB = 0, hits = 0;
  const onHit = sim.onImpact.bind(sim); sim.onImpact = (c, j, ...r) => { if (j > 600) hits++; onHit(c, j, ...r); };
  for (let t = 0; t < 600 && !car.finished; t += S.SIM_DT) {
    sim.step(S.SIM_DT, c => AI.drive(c, sim.track));
    if (sim.state === 'race') { n++; if (car.offroad) off++; maxB = Math.max(maxB, Math.abs(car.beta)); }
  }
  const best = car.best, ok = car.finished;
  okAll = okAll && ok; total += best || 999;
  console.log(`${sim.track.name.padEnd(22)} ${ok ? 'vuelta ' + best.toFixed(2) + ' s' : 'NO TERMINÓ'}  prom ${(sim.track.length / (best || 1) * 3.6).toFixed(0)} km/h  fuera de pista ${(off / Math.max(1, n) * 100).toFixed(1)}%  golpes ${hits}  daño ${car.damage.toFixed(0)}%  derrape máx ${(maxB * 57.3).toFixed(0)}°`);
}
console.log('suma de mejores vueltas:', total.toFixed(2), okAll ? '' : '(alguna no terminó)');
