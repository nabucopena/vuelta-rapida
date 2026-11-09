'use strict';
// ============================================================================
//  PILOTO AUTOMÁTICO
//  1) Calcula una línea de carrera: una trayectoria suave que abre las curvas
//     y toca el vértice, sin salirse del ancho de la pista.
//  2) Calcula la velocidad objetivo en cada punto según la curvatura de esa
//     línea y el agarre del terreno, y la frena hacia atrás con la distancia
//     de frenado del auto (así llega a cada curva a la velocidad justa).
//  3) Maneja siguiendo la línea (dirección analógica) y contravolantea en suelto.
// ============================================================================

const AI = {
  // márgenes de manejo (afinados con tools/aitune.js)
  latG: 5.8,         // margen de curva (calibrado: más alto = más rápido; a partir de ~7 choca)
  brakeG: 4.0,       // margen de frenada (se escala por agarre del terreno)
  edge: 1.2,         // m que deja libres hasta el borde de la pista
  steerGain: 3.5,    // cuánto gira por cada radian de error hacia el punto objetivo
  lookBase: 7,       // m de mirada hacia adelante + lookTime * velocidad
  lookTime: 0.32,

  prepare(track) {
    if (track._ai && track._ai.key === this.key()) return track._ai;
    const N = track.N, ds = track.spacing, lim = track.hw - this.edge;
    const s = new Float64Array(N);
    const px = i => track.x[i] + track.nx[i] * s[i], py = i => track.y[i] + track.ny[i] * s[i];
    // línea de carrera por "banda elástica": cada punto se acerca al promedio de sus vecinos
    for (const [k, iters] of [[24, 120], [10, 120], [4, 120]]) {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < N; i++) {
          if (track.layer[i] && track.layer[track.wrap(i + k)] !== track.layer[track.wrap(i - k)]) continue;
          const a = track.wrap(i - k), b = track.wrap(i + k);
          const mx = (px(a) + px(b)) / 2 - px(i), my = (py(a) + py(b)) / 2 - py(i);
          s[i] = Math.max(-lim, Math.min(lim, s[i] + 0.5 * (mx * track.nx[i] + my * track.ny[i])));
        }
      }
    }
    // curvatura de la línea (círculo por tres puntos separados ~4 m)
    const curv = new Float64Array(N), h = Math.max(2, Math.round(4 / ds));
    for (let i = 0; i < N; i++) {
      const a = track.wrap(i - h), b = track.wrap(i + h);
      const ax = px(a), ay = py(a), bx = px(i), by = py(i), cx = px(b), cy = py(b);
      const cr = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const d1 = Math.hypot(bx - ax, by - ay), d2 = Math.hypot(cx - bx, cy - by), d3 = Math.hypot(cx - ax, cy - ay);
      curv[i] = (2 * cr) / Math.max(1e-6, d1 * d2 * d3);
    }
    const sm = new Float64Array(N);
    for (let i = 0; i < N; i++) { let t = 0; for (let k = -3; k <= 3; k++) t += curv[track.wrap(i + k)]; sm[i] = t / 7; }
    // agarre en cada punto de la línea (incluye barro, hielo, agua...)
    const grip = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const sf = track.surfaceAt({ i, t: 0, s: s[i], d: i * ds });
      grip[i] = sf.grip * (sf.drag > 100 ? 0.8 : 1);
    }
    // velocidad máxima por curvatura y luego "hacia atrás" por distancia de frenado
    const v = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const g = Math.min(grip[i], grip[track.wrap(i + 3)], grip[track.wrap(i - 3)]);
      v[i] = Math.min(75, Math.sqrt((this.latG * 9.81 * g) / Math.max(Math.abs(sm[i]), 1e-4)));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 2 * N - 1; k >= 0; k--) {
        const i = k % N, j = (i + 1) % N;
        const vb = Math.sqrt(v[j] * v[j] + 2 * this.brakeG * 9.81 * grip[i] * ds);
        if (vb < v[i]) v[i] = vb;
      }
    }
    track._ai = { key: this.key(), s, v, px, py };
    return track._ai;
  },
  key() { return [this.latG, this.brakeG, this.edge].join(','); },

  drive(car, track) {
    const ai = this.prepare(track), N = track.N, ds = track.spacing;
    const q = track.query(car.x, car.y, car.idx, 14), i = q.i, v = car.speed;
    // punto objetivo sobre la línea, más adelante según la velocidad
    const j = track.wrap(i + Math.round((this.lookBase + this.lookTime * v) / ds));
    const tx = ai.px(j), ty = ai.py(j);
    let ang = Math.atan2(ty - car.y, tx - car.x) - car.angle;
    ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    // contravolante si la cola se escapa en terreno suelto
    const cs = car.loose > 0.3 ? car.beta * 1.2 : 0;
    const steer = Math.max(-1, Math.min(1, ang * this.steerGain / Math.max(0.12, car.p.maxSteer) + cs));
    // velocidad: mira un poco adelante (tiempo de reacción del auto)
    const vt = Math.min(ai.v[i], ai.v[track.wrap(i + Math.round((0.15 * v + 2) / ds))]);
    const err = vt - v;
    let throttle = 0, brake = 0;
    if (err > 0.8) throttle = 1;
    else if (err > -0.8) throttle = 0.4;
    else brake = Math.min(1, -err / 5);
    // si se salió mucho de la línea o está cruzado, aflojar
    if (Math.abs(car.beta) > 0.35) throttle = Math.min(throttle, 0.3);
    return { throttle, brake, steer, analog: true };
  },
};

if (typeof module !== 'undefined') module.exports = { AI };
