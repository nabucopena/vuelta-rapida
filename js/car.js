'use strict';
// ============================================================================
//  FÍSICA DEL AUTO (turismo de rally, tracción integral)
//  Modelo "bicicleta" (eje delantero + eje trasero) con:
//   - transferencia de carga longitudinal
//   - neumáticos con ángulo de deslizamiento (curva tipo Pacejka simplificada)
//   - círculo de fricción (agarre combinado lateral + longitudinal)
//   - cada eje lee el terreno que tiene abajo (un charco puede tocar solo la cola)
//   - en asfalto: ayudas (ESC/TC) => casi sin derrape
//   - en terreno suelto (tierra, barro, nieve): ayudas casi apagadas, neumático
//     más progresivo y cola más suelta => se dobla derrapando, con contravolante
//  Unidades: metros, segundos, kg, newtons, radianes.
//  Coordenadas de mundo: x a la derecha, y hacia abajo (igual que la pantalla).
//  Marco del auto: x = adelante, y = derecha. angle crece en sentido horario.
// ============================================================================

const GRAVITY = 9.81;

// grip: multiplica el agarre · drag: freno por arrastre · loose: 0 firme .. 1 suelto (rally)
const SURFACES = {
  asphalt:  { name: 'asfalto',        grip: 1.0,  drag: 0,   loose: 0 },
  curb:     { name: 'piano',          grip: 0.95, drag: 8,   loose: 0 },
  concrete: { name: 'cemento',        grip: 0.95, drag: 0,   loose: 0 },
  dirt:     { name: 'tierra',         grip: 0.8,  drag: 8,   loose: 1 },
  mud:      { name: 'barro',          grip: 0.58, drag: 45,  loose: 1 },
  snow:     { name: 'nieve',          grip: 0.64, drag: 12,  loose: 1 },
  ice:      { name: 'hielo',          grip: 0.3,  drag: 2,   loose: 0.7 },
  water:    { name: 'agua',           grip: 0.55, drag: 160, loose: 0.6 },
  grass:    { name: 'pasto',          grip: 0.55, drag: 110, loose: 0.8 },
  deepsnow: { name: 'nieve profunda', grip: 0.35, drag: 110, loose: 1 },
  sand:     { name: 'arena',          grip: 0.45, drag: 80,  loose: 1 },
};

// Todos los números de "cómo se maneja" están acá. Tocar de a uno.
const CAR_PARAMS = {
  mass: 240,             // kg (escala de juego: valores livianos = respuesta ágil)
  inertia: 280,          // kg·m² momento de inercia en guiñada
  cgToFront: 1.15,       // m, centro de gravedad -> eje delantero
  cgToRear: 1.2,         // m, centro de gravedad -> eje trasero
  cgHeight: 0.18,        // m, altura del CG (transferencia de carga)
  length: 3.8, width: 1.75,

  enginePower: 120000,    // W
  maxDriveForce: 7000,   // N  tope de fuerza motriz a baja velocidad
  driveFront: 0.35,      // tracción integral: parte de la fuerza que va adelante
  reverseForce: 1400,    // N
  maxReverseSpeed: 6,    // m/s
  brakeForce: 11000,      // N  total (el ABS lo limita al agarre disponible)
  brakeBiasFront: 0.72,
  rearBrakeMax: 0.32,     // el freno trasero nunca usa más de 30% del agarre trasero

  drag: 0.30,            // N/(m/s)²  resistencia aerodinámica (define la velocidad punta)
  rollRes: 8,            // N/(m/s)   resistencia a la rodadura

  muFront: 4.5,          // coeficiente de agarre adelante
  muRear: 5.1,           // más agarre atrás => en asfalto no se cruza
  tireB: 13,             // rigidez de la curva del neumático
  tireC: 1.7,           // forma de la curva del neumático
  tireE: 0.6,              // curvatura (Pacejka E): >0 pico más ancho, caída más suave
  relaxLength: 0.15,      // m que recorre el neumático hasta armar la fuerza lateral
  loadSensExp: 0.85,     // sensibilidad a la carga: agarre ∝ carga^n (n<1 = realista)
  cgHeightLat: 0.12,     // m: altura efectiva para la transferencia lateral
  trackWidth: 1.55,      // m: trocha
  rollStiffFront: 0.62,  // parte de la rigidez antivuelco adelante (>0.5 = más estable)
  minLongGrip: 0.3,      // fracción mínima de agarre longitudinal aunque esté doblando al límite
  tractionLimit: 0.95,   // control de tracción / ABS
  lowSpeed: 2.0,         // m/s, estabiliza el cálculo de deslizamiento a baja velocidad

  maxSteer: 0.5,         // rad, giro máximo de ruedas parado
  steerGripG: 3.4,       // g de giro que pide el volante a fondo (más alto = gira más cerrado)
  steerAssist: 1.0,      // ángulo de deslizamiento delantero que se suma (1 = justo el pico de agarre)
  steerRate: 5,          // rad/s al girar
  steerRampTime: 0.15,   // s para llevar el volante a fondo manteniendo la tecla (parado)
  steerRampSpeed: 70,    // m/s: a esta velocidad la rampa tarda el doble
  steerReturnTime: 0.12, // s para volver al centro al soltar
  steerCurve: 1.4,       // >1 = el primer tramo del volante gira poco (correcciones suaves)
  steerAssistGain: 0.35, // asistencia suave a la dirección (0 = apagada)
  steerAssistMax: 0.05,  // rad: lo máximo que la asistencia puede girar la rueda (~3°)
  steerLoadGain: 1.0,    // cuánto más se puede girar con la trompa cargada (frenando)
  steerReturnRate: 8,    // rad/s al volver al centro
  escStrength: 20000,    // N·m por rad de derrape: control de estabilidad
  escThreshold: 0.03,    // rad de derrape a partir del cual actúa
  throttleTime: 0.12,    // s para pasar de 0 a fondo
  brakeTime: 0.08,
  loadTransferRate: 8,   // qué tan rápido se transfiere la carga (1/s)

  // --- comportamiento en terreno suelto (multiplicados por "loose" del terreno)
  looseSoftness: 0.5,    // neumático más progresivo (pico a mayor ángulo)
  looseRearLoss: 0.06,   // la cola agarra un poco menos que la trompa => tiende a derrapar
  looseEscCut: 0.75,     // cuánto se apaga el control de estabilidad
  loosePowerSlide: 0.35,  // cuánto acelerador se deja pasar aunque la cola deslice
  looseCounterSteer: 1.5,// giro extra disponible para contravolantear
  looseSteerBoost: 0.4,  // giro extra a baja velocidad

  circleOffsets: [1.1, -1.1], // colisión: dos círculos a lo largo del auto
  circleRadius: 0.88,
  restitution: 0.25,     // rebote entre autos

  damagePowerLoss: 0.45, // con 100% de daño pierde 45% de potencia
  damageGripLoss: 0.2,   // y 20% de agarre
  damageSteerPull: 0.035 // y la dirección "tira" hacia un lado (rad)
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function approach(cur, target, maxDelta) {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}
// Fórmula mágica de Pacejka: D·sin(C·atan(B·x − E·(B·x − atan(B·x)))) con D = 1 (fracción del agarre)
function tireCurve(alpha, B, C, E) {
  const bx = B * alpha;
  return Math.sin(C * Math.atan(bx - (E || 0) * (bx - Math.atan(bx))));
}
const _peakCache = new Map();
function tirePeak(B, C, E) {     // ángulo de máximo agarre (se busca numéricamente y se guarda)
  const key = B.toFixed(3) + ',' + C.toFixed(3) + ',' + (E || 0).toFixed(3);
  let v = _peakCache.get(key);
  if (v === undefined) {
    let best = 0; v = 0.1;
    for (let a = 0.005; a < 0.8; a += 0.002) { const f = tireCurve(a, B, C, E); if (f > best) { best = f; v = a; } }
    _peakCache.set(key, v);
  }
  return v;
}

class Car {
  constructor(x, y, angle, params) {
    this.p = Object.assign({}, CAR_PARAMS, params || {});
    this.x = x; this.y = y; this.angle = angle;
    this.vx = 0; this.vy = 0;  // velocidad en el mundo
    this.omega = 0;            // velocidad angular (rad/s)
    this.steer = 0; this.steerIn = 0; this.throttle = 0; this.brake = 0;
    this.aFe = 0; this.aRe = 0; this.ayLat = 0;   // deslizamiento "relajado" y aceleración lateral suavizada
    this.axLong = 0;           // aceleración longitudinal suavizada (para carga)
    this.damage = 0;           // 0..100
    this.damagePull = Math.random() < 0.5 ? -1 : 1;
    this.speedLimit = Infinity;
    // telemetría
    this.vLong = 0; this.vLat = 0; this.speed = 0; this.beta = 0;
    this.alphaF = 0; this.alphaR = 0; this.usageF = 0; this.usageR = 0;
    this.latG = 0; this.longG = 0; this.alphaPeak = tirePeak(this.p.tireB, this.p.tireC);
    this.loose = 0;
  }

  // surfF / surfR: terreno bajo el eje delantero / trasero
  step(dt, inp, surfF, surfR) {
    surfR = surfR || surfF;
    const p = this.p;
    const a = p.cgToFront, b = p.cgToRear, L = a + b, m = p.mass;
    const dmg = this.damage / 100;
    const looseF = surfF.loose, looseR = surfR.loose, loose = (looseF + looseR) / 2;

    this.throttle = approach(this.throttle, inp.throttle, dt / p.throttleTime);
    this.brake = approach(this.brake, inp.brake, dt / p.brakeTime);

    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const vx = this.vx * c + this.vy * s;     // adelante
    const vy = -this.vx * s + this.vy * c;    // derecha
    const speed = Math.hypot(this.vx, this.vy);

    // --- Neumáticos según terreno
    const BF = p.tireB * (1 - p.looseSoftness * looseF), CF = p.tireC - 0.2 * looseF;
    const BR = p.tireB * (1 - p.looseSoftness * looseR), CR = p.tireC - 0.2 * looseR;
    const peakF = tirePeak(BF, CF, p.tireE), peakR = tirePeak(BR, CR, p.tireE);
    const dmgGrip = 1 - p.damageGripLoss * dmg;
    const gripF = surfF.grip * dmgGrip;
    const gripR = surfR.grip * (1 - p.looseRearLoss * looseR) * dmgGrip;

    // --- Carga sobre cada eje (frenar carga la trompa: más agarre adelante, cola más liviana)
    const W = m * GRAVITY;
    let Fzf = (W * b - m * this.axLong * p.cgHeight) / L;
    let Fzr = (W * a + m * this.axLong * p.cgHeight) / L;
    Fzf = Math.max(Fzf, 0.15 * W); Fzr = Math.max(Fzr, 0.15 * W);
    const frontLoad = Fzf / (W * b / L);   // 1 = carga normal; >1 frenando

    // --- Dirección: giro máximo según velocidad (regla fija => respuesta pareja).
    //     Ángulo geométrico para doblar a steerGripG (escalado por el agarre del terreno)
    //     + el ángulo de máximo agarre + margen de contravolante en terreno suelto.
    const v2 = Math.max(speed, 1) ** 2;
    const steerMax = Math.min(
      p.maxSteer * (1 + p.looseSteerBoost * loose),
      (L * p.steerGripG * GRAVITY * (gripF + gripR) / 2) * Math.pow(frontLoad, p.steerLoadGain) / v2
        + peakF * (p.steerAssist + p.looseCounterSteer * loose));
    // Dirección progresiva (pensada para teclado): mantener la tecla va girando de a poco,
    // con una curva suave al principio => los toques cortos corrigen poquito.
    const ramp = p.steerRampTime * (1 + speed / p.steerRampSpeed);
    const goingOut = Math.abs(inp.steer) > Math.abs(this.steerIn) && inp.steer * this.steerIn >= 0;
    this.steerIn = approach(this.steerIn, inp.steer, dt / (goingOut ? ramp : p.steerReturnTime));
    const shaped = Math.sign(this.steerIn) * Math.pow(Math.abs(this.steerIn), p.steerCurve);
    // Asistencia suave: (1) contravolante leve si la cola desliza; (2) sin tocar la dirección,
    // frena de a poco la rotación para que el auto siga derecho. Limitada a unos pocos grados.
    let assist = 0;
    if (p.steerAssistGain > 0 && speed > 5 && vx > 0) {
      const alphaRnow = Math.atan2(vy - this.omega * b, Math.max(Math.abs(vx), p.lowSpeed));
      const thr = peakR * 1.1;                     // sólo cuando la cola pasa su máximo agarre (se escapa)
      if (Math.abs(alphaRnow) > thr) assist += p.steerAssistGain * 2 * (alphaRnow - Math.sign(alphaRnow) * thr);
      if (Math.abs(inp.steer) < 0.01) assist -= p.steerAssistGain * 0.6 * (this.omega * L / vx);
      assist = clamp(assist, -p.steerAssistMax, p.steerAssistMax);
    }
    const target = shaped * steerMax + assist + dmg * p.damageSteerPull * this.damagePull;
    const returning = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0;
    this.steer = approach(this.steer, target, (returning ? p.steerReturnRate : p.steerRate) * dt);
    const d = this.steer, cd = Math.cos(d), sd = Math.sin(d);

    // agarre de cada eje: sensibilidad a la carga (crece como carga^n, n<1) y transferencia
    // lateral repartida según la rigidez antivuelco (el eje que más transfiere pierde más)
    const latT = m * Math.abs(this.ayLat) * p.cgHeightLat / p.trackWidth;
    const axleGrip = (Fz, Fz0, share) => {
      const half = Fz / 2, dF = Math.min(latT * share, half * 0.95), h0 = Fz0 / 2, n = p.loadSensExp;
      return Fz0 * (Math.pow((half - dF) / h0, n) + Math.pow((half + dF) / h0, n)) / 2;
    };
    const Fzf0 = W * b / L, Fzr0 = W * a / L;
    const FmaxF = p.muFront * gripF * axleGrip(Fzf, Fzf0, p.rollStiffFront);
    const FmaxR = p.muRear * gripR * axleGrip(Fzr, Fzr0, 1 - p.rollStiffFront);

    // --- Ángulos de deslizamiento
    const vyF = vy + this.omega * a;
    const vyR = vy - this.omega * b;
    const vxFw = vx * cd + vyF * sd;          // velocidad en el marco de la rueda delantera
    const vyFw = -vx * sd + vyF * cd;
    const alphaF = Math.atan2(vyFw, Math.max(Math.abs(vxFw), p.lowSpeed));
    const alphaR = Math.atan2(vyR, Math.max(Math.abs(vx), p.lowSpeed));
    // largo de relajación: la fuerza lateral se arma tras recorrer ~relaxLength metros
    const kRel = Math.min(1, Math.max(Math.abs(vx), p.lowSpeed) * dt / p.relaxLength);
    this.aFe += (alphaF - this.aFe) * kRel;
    this.aRe += (alphaR - this.aRe) * kRel;
    let fyF = -tireCurve(this.aFe, BF, CF, p.tireE);   // fracción del agarre máximo
    let fyR = -tireCurve(this.aRe, BR, CR, p.tireE);

    // --- Motor / freno (tracción integral)
    const power = p.enginePower * (1 - p.damagePowerLoss * dmg);
    const thr = this.throttle, brk = this.brake;
    let drive = 0, brakeF = 0;
    if (vx > 0.5) {
      drive = vx < this.speedLimit ? thr * Math.min(p.maxDriveForce, power / Math.max(vx, 1)) : 0;
      brakeF = brk * p.brakeForce;
    } else if (vx < -0.5) {
      drive = vx > -p.maxReverseSpeed ? -brk * p.reverseForce : 0;
      brakeF = thr * p.brakeForce;
    } else {
      drive = thr * p.maxDriveForce - brk * p.reverseForce;
    }
    const dir = vx >= 0 ? 1 : -1;
    let fxF = (drive * p.driveFront - dir * brakeF * p.brakeBiasFront) / FmaxF;
    const rearBrake = Math.min(brakeF * (1 - p.brakeBiasFront) / FmaxR, p.rearBrakeMax);
    let fxR = (drive * (1 - p.driveFront)) / FmaxR - dir * rearBrake;
    // TC: si la cola desliza se le quita fuerza (en suelto casi no actúa => derrape con acelerador)
    const rearSlack = clamp(1 - Math.abs(alphaR) / peakR, 0.2 + 0.7 * looseR, 1);
    fxR = clamp(fxR, -rearSlack, rearSlack);

    // --- Círculo de fricción, prioridad lateral (relajada en terreno suelto)
    const combine = (fx, fy, ls) => {
      let lim = Math.sqrt(Math.max(0, 1 - fy * fy));
      lim = Math.max(lim, p.minLongGrip + p.loosePowerSlide * ls) * p.tractionLimit;
      fx = clamp(fx, -lim, lim);
      const tot = fx * fx + fy * fy;
      if (tot > 1) fy *= Math.sqrt(Math.max(0, 1 - fx * fx)) / Math.abs(fy);
      return [fx, fy];
    };
    [fxF, fyF] = combine(fxF, fyF, 0);   // adelante siempre prioriza la dirección (se puede doblar frenando)
    [fxR, fyR] = combine(fxR, fyR, looseR);

    const FxFw = fxF * FmaxF, FyFw = fyF * FmaxF;
    const FxR = fxR * FmaxR, FyR = fyR * FmaxR;

    let Fx = FxR + FxFw * cd - FyFw * sd;
    let Fy = FyR + FxFw * sd + FyFw * cd;
    let torque = a * (FxFw * sd + FyFw * cd) - b * FyR;

    // --- ESC: si el auto sobrevira (rota hacia un lado y desliza hacia el otro)
    //     se aplica un torque que frena esa rotación. En terreno suelto casi apagado.
    const beta = Math.atan2(vy, Math.max(Math.abs(vx), p.lowSpeed));
    this.escActive = false;
    const esc = p.escStrength * (1 - p.looseEscCut * loose);
    if (vx > 3 && Math.abs(beta) > p.escThreshold && Math.sign(this.omega) === -Math.sign(beta)) {
      const k = (Math.abs(beta) - p.escThreshold) * esc * Math.min(1, vx / 10);
      torque += Math.sign(beta) * k;
      Fx -= k * 0.5;            // frenar ruedas cuesta un poco de velocidad
      this.escActive = true;
    }

    // --- Resistencias
    const sDrag = (surfF.drag + surfR.drag) / 2;
    Fx -= p.drag * vx * Math.abs(vx) + (p.rollRes + sDrag) * vx;
    Fy -= sDrag * 0.5 * vy;
    if (vx > this.speedLimit) Fx -= (vx - this.speedLimit) * 350; // limitador de boxes

    // --- Integración (semi-implícita) en el mundo
    const Fwx = Fx * c - Fy * s, Fwy = Fx * s + Fy * c;
    this.vx += (Fwx / m) * dt;
    this.vy += (Fwy / m) * dt;
    this.omega += (torque / p.inertia) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.omega * dt;

    this.axLong += (Fx / m - this.axLong) * Math.min(1, dt * p.loadTransferRate);
    this.ayLat += (Fy / m - this.ayLat) * Math.min(1, dt * p.loadTransferRate);

    // telemetría
    this.vLong = vx; this.vLat = vy; this.speed = speed; this.beta = beta;
    this.alphaF = alphaF; this.alphaR = alphaR; this.alphaPeak = peakR; this.loose = loose;
    this.usageF = Math.hypot(fxF, fyF); this.usageR = Math.hypot(fxR, fyR);
    this.longG = Fx / m / GRAVITY; this.latG = Fy / m / GRAVITY;
  }

  applyImpulse(rx, ry, jx, jy) {
    this.vx += jx / this.p.mass;
    this.vy += jy / this.p.mass;
    this.omega += (rx * jy - ry * jx) / this.p.inertia;
  }

  // velocidad de un punto del auto (r relativo al CG, en el mundo)
  pointVel(rx, ry) {
    return [this.vx - this.omega * ry, this.vy + this.omega * rx];
  }

  circleCenters() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return this.p.circleOffsets.map(o => [this.x + c * o, this.y + s * o, c * o, s * o]);
  }

  wheelPositions() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const a = this.p.cgToFront, b = this.p.cgToRear, t = 0.78;
    const pt = (lx, ly) => [this.x + c * lx - s * ly, this.y + s * lx + c * ly];
    return [pt(a, -t), pt(a, t), pt(-b, -t), pt(-b, t)]; // FI, FD, TI, TD
  }
}

// ---------------------------------------------------------------------------
//  Colisiones (impulsos de cuerpo rígido)
// ---------------------------------------------------------------------------
function collideCarWalls(car, track, onImpact) {
  const p = car.p, r = p.circleRadius;
  for (const [cx, cy, ox, oy] of car.circleCenters()) {
    const q = track.query(cx, cy, car.idx, 14);
    const wPos = track.wallAt(q, 1), wNeg = track.wallAt(q, -1);
    let pen = 0, ns = 0;
    if (q.s + r > wPos) { pen = q.s + r - wPos; ns = -1; }
    else if (q.s - r < -wNeg) { pen = -wNeg - (q.s - r); ns = 1; }
    if (pen <= 0) continue;
    const [tnx, tny] = track.normalAt(q);
    const nx = tnx * ns, ny = tny * ns;
    const edge = track.edgeAt(q, -ns);   // tipo de borde golpeado (rebote, daño, fricción)
    car.x += nx * pen; car.y += ny * pen;
    const rx = ox - nx * r, ry = oy - ny * r;
    const [vpx, vpy] = car.pointVel(rx, ry);
    const vn = vpx * nx + vpy * ny;
    if (vn >= 0) continue;
    const rn = rx * ny - ry * nx;
    const j = (-(1 + edge.rest) * vn) / (1 / p.mass + (rn * rn) / p.inertia);
    car.applyImpulse(rx, ry, j * nx, j * ny);
    let tx = vpx - vn * nx, ty = vpy - vn * ny;
    const tl = Math.hypot(tx, ty);
    if (tl > 1e-6) {
      tx /= tl; ty /= tl;
      const rt = rx * ty - ry * tx;
      const jt = Math.max(-tl / (1 / p.mass + (rt * rt) / p.inertia), -edge.fric * j);
      car.applyImpulse(rx, ry, jt * tx, jt * ty);
    }
    if (onImpact) onImpact(car, j * edge.dmg, car.x + rx, car.y + ry, null);
  }
}

function collideCars(A, B, onImpact) {
  if (Math.abs(A.x - B.x) > 4 || Math.abs(A.y - B.y) > 4) return;
  const ra = A.p.circleRadius, rb = B.p.circleRadius;
  for (const ca of A.circleCenters()) {
    for (const cb of B.circleCenters()) {
      const dx = cb[0] - ca[0], dy = cb[1] - ca[1];
      const dist2 = dx * dx + dy * dy, minD = ra + rb;
      if (dist2 >= minD * minD) continue;
      const dist = Math.sqrt(dist2);
      const nx = dist > 1e-6 ? dx / dist : 1, ny = dist > 1e-6 ? dy / dist : 0;
      const pen = minD - dist;
      A.x -= nx * pen / 2; A.y -= ny * pen / 2;
      B.x += nx * pen / 2; B.y += ny * pen / 2;
      const px = ca[0] + nx * ra, py = ca[1] + ny * ra; // punto de contacto
      const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y;
      const [vax, vay] = A.pointVel(rax, ray);
      const [vbx, vby] = B.pointVel(rbx, rby);
      const rvx = vbx - vax, rvy = vby - vay;
      const vn = rvx * nx + rvy * ny;
      if (vn >= 0) continue;
      const rna = rax * ny - ray * nx, rnb = rbx * ny - rby * nx;
      const inv = 1 / A.p.mass + 1 / B.p.mass + (rna * rna) / A.p.inertia + (rnb * rnb) / B.p.inertia;
      const e = Math.min(A.p.restitution, B.p.restitution);
      const j = (-(1 + e) * vn) / inv;
      A.applyImpulse(rax, ray, -j * nx, -j * ny);
      B.applyImpulse(rbx, rby, j * nx, j * ny);
      let tx = rvx - vn * nx, ty = rvy - vn * ny;
      const tl = Math.hypot(tx, ty);
      if (tl > 1e-6) {
        tx /= tl; ty /= tl;
        const rta = rax * ty - ray * tx, rtb = rbx * ty - rby * tx;
        const invT = 1 / A.p.mass + 1 / B.p.mass + (rta * rta) / A.p.inertia + (rtb * rtb) / B.p.inertia;
        const jt = Math.max(-tl / invT, -0.2 * j);
        A.applyImpulse(rax, ray, -jt * tx, -jt * ty);
        B.applyImpulse(rbx, rby, jt * tx, jt * ty);
      }
      if (onImpact) { onImpact(A, j, px, py, B); onImpact(B, j, px, py, A); }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Car, CAR_PARAMS, SURFACES, collideCarWalls, collideCars, clamp, approach };
}
