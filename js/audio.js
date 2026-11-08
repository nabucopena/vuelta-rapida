'use strict';
// ============================================================================
//  SONIDO (sintetizado con WebAudio, sin archivos)
//  Motor: revoluciones según la velocidad y una caja de 6 marchas (se escuchan
//  los cambios). Se arma con varios armónicos + distorsión suave + un filtro
//  que se abre al acelerar. Además: chirrido de cubiertas en asfalto, ripio
//  en tierra, viento a alta velocidad, golpes, salpicaduras y pitidos.
// ============================================================================

const GEAR_TOP = [13, 22, 31, 41, 52, 70];   // m/s en que cada marcha llega al corte
const RPM_IDLE = 950, RPM_MAX = 7600, RPM_UP = 7100, RPM_DOWN = 3900;

const Sound = {
  ctx: null, master: null, noise: null, engines: [], muted: false, volume: 0.9,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    // compresor final: permite volumen alto sin saturar cuando suenan muchas cosas juntas
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.master = c.createGain(); this.master.gain.value = this.volume;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // curva de distorsión suave (le da "garra" al motor)
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    this.curve = curve;
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  },

  noiseSource() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    s.start(0, Math.random() * 1.9);
    return s;
  },

  makeEngine() {
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    // motor: fundamental + armónicos -> distorsión -> filtro
    const mix = c.createGain(); mix.gain.value = 0.5;
    const oscs = [['sawtooth', 1, 0.6], ['sawtooth', 2, 0.45], ['square', 0.5, 0.18], ['triangle', 3, 0.22], ['sawtooth', 1.005, 0.3]].map(([type, mul, g]) => {
      const o = c.createOscillator(); o.type = type;
      const gg = c.createGain(); gg.gain.value = g;
      o.connect(gg); gg.connect(mix); o.start();
      return { o, mul };
    });
    const shaper = c.createWaveShaper(); shaper.curve = this.curve; shaper.oversample = '2x';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 320; body.gain.value = 4; body.Q.value = 0.8;
    const eng = c.createGain(); eng.gain.value = 0;
    mix.connect(shaper); shaper.connect(lp); lp.connect(body); body.connect(eng); eng.connect(out);
    // escape: un poco de ruido modulado por el motor (aspereza)
    const exN = this.noiseSource(), exF = c.createBiquadFilter(); exF.type = 'bandpass'; exF.Q.value = 1.5;
    const exG = c.createGain(); exG.gain.value = 0;
    exN.connect(exF); exF.connect(exG); exG.connect(out);
    // chirrido de cubiertas
    const sqN = this.noiseSource(), sqF = c.createBiquadFilter(); sqF.type = 'bandpass'; sqF.frequency.value = 2400; sqF.Q.value = 9;
    const sqG = c.createGain(); sqG.gain.value = 0;
    sqN.connect(sqF); sqF.connect(sqG); sqG.connect(out);
    // ripio / tierra
    const grN = this.noiseSource(), grF = c.createBiquadFilter(); grF.type = 'bandpass'; grF.frequency.value = 900; grF.Q.value = 0.6;
    const grG = c.createGain(); grG.gain.value = 0;
    grN.connect(grF); grF.connect(grG); grG.connect(out);
    // viento
    const wnN = this.noiseSource(), wnF = c.createBiquadFilter(); wnF.type = 'highpass'; wnF.frequency.value = 1200;
    const wnG = c.createGain(); wnG.gain.value = 0;
    wnN.connect(wnF); wnF.connect(wnG); wnG.connect(out);
    return { out, pan, oscs, lp, eng, exF, exG, sqF, sqG, grF, grG, wnG, gear: 0, rpm: RPM_IDLE, shiftT: 0 };
  },

  // caja de cambios simulada a partir de la velocidad
  engineRpm(e, car, dt) {
    const v = Math.abs(car.vLong || car.speed || 0);
    let g = e.gear;
    const rpmAt = (gear) => RPM_MAX * v / GEAR_TOP[gear];
    if (g < GEAR_TOP.length - 1 && rpmAt(g) > RPM_UP) { g++; e.shiftT = 0.12; }
    else if (g > 0 && rpmAt(g) < RPM_DOWN && rpmAt(g - 1) < RPM_UP - 300) { g--; e.shiftT = 0.08; }
    e.gear = g;
    let target = Math.max(RPM_IDLE, rpmAt(g));
    if (v < 4) target = Math.max(target, RPM_IDLE + car.throttle * 3500);      // embrague patinando al arrancar
    if (e.shiftT > 0) { e.shiftT -= dt; target *= 0.92; }                       // caída breve al cambiar
    e.rpm += (target - e.rpm) * Math.min(1, dt * 14);
    return e.rpm;
  },

  updateEngines(cars, active) {
    if (!this.ctx) return;
    while (this.engines.length < cars.length) this.engines.push(this.makeEngine());
    const t = this.ctx.currentTime, now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now;
    const vol = 1 / Math.sqrt(Math.max(1, cars.length));
    this.engines.forEach((e, i) => {
      const car = cars[i];
      if (!car || !active) { e.out.gain.setTargetAtTime(0, t, 0.08); return; }
      e.out.gain.setTargetAtTime(vol, t, 0.05);
      if (e.pan) e.pan.pan.setTargetAtTime(cars.length === 2 ? (i === 0 ? -0.55 : 0.55) : 0, t, 0.1);
      const rpm = this.engineRpm(e, car, dt), f = (rpm / 60) * 2;      // 4 cilindros: 2 explosiones por vuelta
      const thr = car.throttle || 0, load = 0.35 + thr * 0.65, rf = (rpm - RPM_IDLE) / (RPM_MAX - RPM_IDLE);
      for (const { o, mul } of e.oscs) o.frequency.setTargetAtTime(f * mul * (1 + (Math.random() - 0.5) * 0.004), t, 0.03);
      e.lp.frequency.setTargetAtTime(500 + thr * 2600 + rf * 1800, t, 0.04);
      e.eng.gain.setTargetAtTime(0.16 * load + 0.04, t, 0.04);
      e.exF.frequency.setTargetAtTime(f * 4, t, 0.04);
      e.exG.gain.setTargetAtTime(0.05 * thr * (0.4 + rf), t, 0.05);
      // cubiertas: sólo en superficie firme y si deslizan de verdad
      const slip = Math.max(Math.abs(car.alphaF || 0), Math.abs(car.alphaR || 0));
      const firm = (car.loose || 0) < 0.3, spd = car.speed || 0;
      const sq = spd > 5 && firm ? Math.min(0.22, Math.max(0, slip - (car.alphaPeak || 0.1) * 1.15) * 1.6) : 0;
      e.sqG.gain.setTargetAtTime(sq, t, 0.03);
      e.sqF.frequency.setTargetAtTime(2100 + spd * 12, t, 0.05);
      // ripio: más fuerte si derrapa
      const gr = (car.loose || 0) * Math.min(1, spd / 20) * (0.08 + Math.min(0.12, Math.abs(car.beta || 0) * 0.35));
      e.grG.gain.setTargetAtTime(gr, t, 0.05);
      e.grF.frequency.setTargetAtTime(600 + spd * 15, t, 0.05);
      // viento
      e.wnG.gain.setTargetAtTime(Math.min(0.09, (spd / 66) ** 2 * 0.09), t, 0.1);
    });
  },

  impact(strength) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    // golpe grave
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110 + strength * 40, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const og = c.createGain(); og.gain.setValueAtTime(0.25 + strength * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.32);
    // chapa / crujido
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + strength * 1500; f.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.15 + strength * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.4);
  },

  splash(strength) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.1 + strength * 0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.75);
  },

  beep(freq, dur) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
};
