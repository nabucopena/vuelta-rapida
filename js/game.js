'use strict';
// ============================================================================
//  JUEGO: menú, modo local (pantalla dividida) y modo en red (cada compu ve su
//  auto). La carrera en sí la calcula RaceSim (js/sim.js): en modo local corre
//  acá mismo; en modo red corre en el servidor y acá sólo se dibuja.
// ============================================================================

const CAM_ZOOM = 8;            // px por metro (zoom fijo de cada vista)
const CAM_LOOKAHEAD = 0.6;     // s: la cámara se adelanta según la velocidad
const MAX_LOCAL_PLAYERS = 2;   // pantalla dividida: 1 o 2 jugadores
const DUSTY = { tierra: 1, arena: 1, pasto: 0.5 };
const DIRTY = { tierra: 1, barro: 4, arena: 0.6, pasto: 0.5 };

const Game = {
  mode: 'local',               // local | net
  state: 'menu',               // menu | lobby | countdown | race | results | preview
  paused: false,
  debug: false,
  settings: { players: 2, laps: 3, damage: true, track: 0 },
  menuSel: 0, pauseSel: 0,
  sim: null,
  cars: [], props: [], particles: [], results: [],
  cam: { x: 0, y: 0, zoom: 6 },   // cámara del menú / vista previa
  cams: [],                       // una cámara por vista durante la carrera
  raceTime: 0, countT: 0, goTime: 3,
  menuT: 0,

  init() {
    Render.init(document.getElementById('game'));
    Input.init();
    const prm = new URLSearchParams(location.search);
    if (prm.has('preview')) { this.settings.track = +prm.get('preview') || 0; this.state = 'preview'; }
    this.loadTrack(this.settings.track);
    let last = performance.now(), acc = 0;
    const frame = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      this.handleKeys();
      const racing = this.state === 'countdown' || this.state === 'race' || this.state === 'results';
      if (this.mode === 'local' && this.sim && !this.paused && racing) {
        acc += dt;
        let n = 0;
        while (acc >= SIM_DT && n++ < 48) { this.sim.step(SIM_DT, car => Input.forPlayer(car.player)); acc -= SIM_DT; }
        if (n >= 48) acc = 0;
        this.syncFromSim();
        this.frameUpdate(dt);
      } else if (this.mode === 'net' && racing) {
        Net.update(dt);
        this.frameUpdate(dt);
      } else if (!this.paused) {
        this.updateParticles(dt);
      }
      this.updateCamera(dt);
      this.draw();
      const soundCars = this.mode === 'net' ? (Net.myCar ? [Net.myCar] : []) : this.cars;
      Sound.updateEngines(soundCars, !this.paused && (this.state === 'countdown' || this.state === 'race'));
      Input.endFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  loadTrack(i) {
    if (this.track && this.track.def === TRACK_DEFS[i]) return;
    this.track = new Track(TRACK_DEFS[i]);
    Art.build(this.track);
    this.props = this.track.makeProps();
    this.particles = [];
    const c = this.track.pointAt(0, 0);
    this.cam.x = c[0]; this.cam.y = c[1];
  },

  // ---------------------------------------------------------------- menús
  menuItems() {
    const s = this.settings, net = this.mode === 'net';
    const items = [{ label: 'Modo', value: net ? 'En red' : 'Local (pantalla dividida)' }];
    if (!net) {
      items.push({ label: 'Pista', value: TRACK_DEFS[s.track].name });
      items.push({ label: 'Jugadores', value: s.players });
      items.push({ label: 'Vueltas', value: s.laps });
      items.push({ label: 'Daño por golpes', value: s.damage ? 'Sí' : 'No' });
    }
    items.push({ label: net ? 'ENTRAR A LA SALA' : 'EMPEZAR' });
    return items;
  },
  pauseItems() { return ['Continuar', 'Reiniciar carrera', 'Salir al menú']; },

  handleKeys() {
    if (Input.pressed.size) Sound.init();
    if (this.state === 'lobby') return;                 // la sala usa sus propios controles
    if (Input.wasPressed('KeyM')) Sound.toggleMute();
    if (Input.wasPressed('F3')) this.debug = !this.debug;
    const up = Input.wasPressed('ArrowUp', 'KeyW'), down = Input.wasPressed('ArrowDown', 'KeyS');
    const left = Input.wasPressed('ArrowLeft', 'KeyA'), right = Input.wasPressed('ArrowRight', 'KeyD');
    const ok = Input.wasPressed('Enter', 'Space', 'NumpadEnter');

    if (this.state === 'menu') {
      const items = this.menuItems(), n = items.length;
      if (up) this.menuSel = (this.menuSel + n - 1) % n;
      if (down) this.menuSel = (this.menuSel + 1) % n;
      const d = (right ? 1 : 0) - (left ? 1 : 0), s = this.settings, label = items[this.menuSel].label;
      if (d) {
        if (label === 'Modo') { this.mode = this.mode === 'net' ? 'local' : 'net'; this.menuSel = 0; }
        if (label === 'Pista') { s.track = (s.track + d + TRACK_DEFS.length) % TRACK_DEFS.length; this.loadTrack(s.track); }
        if (label === 'Jugadores') s.players = Math.max(1, Math.min(MAX_LOCAL_PLAYERS, s.players + d));
        if (label === 'Vueltas') s.laps = Math.max(1, Math.min(20, s.laps + d));
        if (label === 'Daño por golpes') s.damage = !s.damage;
      }
      if (ok) {
        if (this.mode === 'net') { this.state = 'lobby'; Net.open(); }
        else this.startRace();
      }
      return;
    }
    if (this.state === 'preview') return;
    if (this.mode === 'net') {
      if (this.state === 'results' && Net.isHost && Input.wasPressed('Enter', 'NumpadEnter')) Net.send({ t: 'lobby' });
      return;
    }
    if (this.state === 'results') {
      if (Input.wasPressed('Enter', 'NumpadEnter')) this.toMenu();
      if (Input.wasPressed('KeyR')) this.startRace();
      return;
    }
    if (this.paused) {
      const n = this.pauseItems().length;
      if (up) this.pauseSel = (this.pauseSel + n - 1) % n;
      if (down) this.pauseSel = (this.pauseSel + 1) % n;
      if (Input.wasPressed('Escape', 'KeyP')) this.paused = false;
      else if (ok) {
        this.paused = false;
        if (this.pauseSel === 1) this.startRace();
        if (this.pauseSel === 2) this.toMenu();
      }
      return;
    }
    if (Input.wasPressed('Escape', 'KeyP')) { this.paused = true; this.pauseSel = 0; }
  },

  toMenu() {
    this.state = 'menu'; this.sim = null; this.cars = []; this.particles = []; this.cams = [];
    Art.resetMarks(this.track); this.props = this.track.makeProps();
  },

  // ---------------------------------------------------------------- carrera local
  startRace() {
    const tr = this.track;
    Art.resetMarks(tr);
    const players = PLAYER_DEFS.slice(0, this.settings.players).map((d, k) => Object.assign({ id: k, num: k + 1 }, d));
    this.sim = new RaceSim(this.settings.track, this.settings, players, tr);
    this.cars = this.sim.cars; this.props = this.sim.props;
    for (const c of this.cars) this.prepCar(c);
    this.particles = []; this.results = []; this.paused = false;
    this.cams = this.cars.map(c => this.makeCam(c));
    this.syncFromSim();
  },

  syncFromSim() {
    const s = this.sim;
    if (s.state === 'results' && this.state !== 'results') this.results = s.order.map(car => ({ car }));
    this.state = s.state; this.raceTime = s.raceTime; this.countT = s.countT; this.goTime = s.goTime;
    this.handleEvents(s.takeEvents());
  },

  prepCar(car) {
    car.marks = [null, null, null, null]; car.flash = null; car.dirt = 0; car.inWater = false; car.lastHitSound = 0;
  },
  makeCam(car) { return { x: car.x, y: car.y, zoom: CAM_ZOOM, lx: 0, ly: 0, car, vp: null }; },

  // eventos de la simulación: pitidos, vueltas, choques
  handleEvents(evs) {
    for (const e of evs) {
      if (e.type === 'beep') Sound.beep(e.f, e.d);
      else if (e.type === 'lap') {
        const car = this.cars.find(c => c.id === e.id);
        if (car) car.flash = { text: e.text, t: 2.5 };
      } else if (e.type === 'hit') {
        const straw = e.kind === 'hay', soft = e.kind === 'bush' || e.kind === 'cone';
        const n = soft ? 0 : Math.min(14, Math.floor(e.j / 350));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 8;
          this.emit({ x: e.x, y: e.y, vx: e.vx * 0.5 + Math.cos(a) * v, vy: e.vy * 0.5 + Math.sin(a) * v,
            life: straw ? 0.8 : 0.35, max: straw ? 0.8 : 0.35, size: straw ? 0.22 : 0.16, color: straw ? '#e8c96a' : '#ffd54f' });
        }
        const car = this.cars.find(c => c.id === e.id);
        const near = this.mode === 'local' || (Net.myCar && Math.hypot(Net.myCar.x - e.x, Net.myCar.y - e.y) < 60);
        const now = performance.now();
        if (car && near && e.j > 700 && now - car.lastHitSound > 120) { car.lastHitSound = now; Sound.impact(Math.min(1, e.j / 5000)); }
      }
    }
  },

  // ---------------------------------------------------------------- efectos por cuadro
  emit(p) { if (this.particles.length < 450) this.particles.push(p); },

  updateParticles(dt) {
    for (const q of this.particles) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 1 - 3 * dt; q.vy *= 1 - 3 * dt; q.life -= dt;
    }
    this.particles = this.particles.filter(q => q.life > 0);
  },

  frameUpdate(dt) {
    const tr = this.track, theme = tr.art.theme;
    if (this.state !== 'results') {
      for (const car of this.cars) this.carEffects(car, dt, tr, theme);
    }
    this.updateParticles(dt);
  },

  carEffects(car, dt, tr, theme) {
    if (car.flash) car.flash.t -= dt;
    const wp = car.wheelPositions(), v = car.speed, R = Math.random;
    // huellas pintadas en el suelo
    for (let w = 0; w < 4; w++) {
      const surf = w < 2 ? car.surfF : car.surfR;
      const slip = Math.abs(w < 2 ? car.alphaF : car.alphaR);
      const skidding = slip > car.alphaPeak * 1.4 || (car.brake > 0.9 && car.usageF > 0.97 && v > 8);
      let style = MARK_STYLE[surf.name];
      if (!style && skidding && (surf.name === 'asfalto' || surf.name === 'cemento' || surf.name === 'piano')) style = SKID_STYLE;
      if (surf.name === 'hielo' && !skidding) style = null;
      const mark = v > 1.5 && style && !car.layer;
      const last = car.marks[w];
      if (mark && last && Math.hypot(last[0] - wp[w][0], last[1] - wp[w][1]) < 4) Art.paint(tr, last[0], last[1], wp[w][0], wp[w][1], style);
      car.marks[w] = mark ? wp[w] : null;
    }
    // partículas según el terreno de la cola
    const sn = car.surfR.name, rear = wp[2 + (R() < 0.5 ? 0 : 1)];
    const slipK = Math.min(2, Math.abs(car.beta) * 4);
    if (DUSTY[sn] && v > 6 && R() < DUSTY[sn] * (v / 35 + slipK * 0.3)) {
      this.emit({ x: rear[0], y: rear[1], vx: -car.vx * 0.15 + (R() - 0.5) * 2, vy: -car.vy * 0.15 + (R() - 0.5) * 2,
        life: 1.6, max: 1.6, size: 1.6, grow: 3.5, alpha: 0.5, soft: true, color: theme.dust });
    }
    if ((sn === 'nieve' || sn === 'nieve profunda') && v > 5 && R() < v / 50 + slipK * 0.2) {
      this.emit({ x: rear[0], y: rear[1], vx: -car.vx * 0.25 + (R() - 0.5) * 3, vy: -car.vy * 0.25 + (R() - 0.5) * 3,
        life: 0.9, max: 0.9, size: 0.9, grow: 2.5, alpha: 0.75, soft: true, color: '#ffffff' });
    }
    if (sn === 'barro' && v > 4 && R() < 0.8) {
      for (let k = 0; k < 2; k++) this.emit({ x: rear[0], y: rear[1], vx: -car.vx * 0.4 + (R() - 0.5) * 6, vy: -car.vy * 0.4 + (R() - 0.5) * 6,
        life: 0.5, max: 0.5, size: 0.16, color: R() < 0.5 ? '#3d2a16' : '#5e4228' });
    }
    const inWater = car.surfR.name === 'agua' || car.surfF.name === 'agua';
    if (inWater && v > 3) {
      for (let k = 0; k < 3; k++) {
        const a = car.angle + (R() < 0.5 ? 1 : -1) * (1.2 + R() * 0.6), sp = v * (0.3 + R() * 0.3);
        this.emit({ x: car.x, y: car.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, size: 0.14, color: '#dff1fa' });
      }
      if (R() < 0.3) this.emit({ x: car.x, y: car.y, vx: 0, vy: 0, life: 1, max: 1, size: 2.2, type: 'ring' });
      if (R() < 0.5) this.emit({ x: rear[0], y: rear[1], vx: -car.vx * 0.2, vy: -car.vy * 0.2, life: 0.6, max: 0.6, size: 1.2, grow: 2, alpha: 0.5, soft: true, color: '#e9f5fb' });
    }
    const mine = this.mode === 'local' || car === Net.myCar;
    if (inWater && !car.inWater && v > 4 && mine) Sound.splash(Math.min(1, v / 25));
    car.inWater = inWater;
    // humo de neumáticos en asfalto
    if ((sn === 'asfalto' || sn === 'cemento') && v > 5 && Math.abs(car.alphaR) > car.alphaPeak * 1.5 && R() < 0.5) {
      this.emit({ x: rear[0], y: rear[1], vx: -car.vx * 0.1, vy: -car.vy * 0.1, life: 1, max: 1, size: 1, grow: 3, alpha: 0.3, soft: true, color: '#e2e2e2' });
    }
    // auto sucio (y el agua lo limpia)
    if (DIRTY[sn] && v > 3) car.dirt = Math.min(1, car.dirt + dt * v * 0.0012 * DIRTY[sn]);
    if (inWater) car.dirt = Math.max(0, car.dirt - dt * 0.7);
    // humo por daño
    if (car.damage > 45 && R() < (car.damage - 40) / 80) {
      this.emit({ x: car.x + Math.cos(car.angle) * 1.4, y: car.y + Math.sin(car.angle) * 1.4,
        vx: (R() - 0.5) * 1.5, vy: (R() - 0.5) * 1.5, life: 1.4, max: 1.4, size: 0.8, grow: 3, alpha: 0.5, soft: true,
        color: car.damage > 75 ? '#2b2b2b' : '#8d8d8d' });
    }
  },

  // ---------------------------------------------------------------- cámara y dibujo
  updateCamera(dt) {
    const cam = this.cam, tb = this.track.bounds, availH = Render.H - 140;
    if (this.cams.length) {
      // cada cámara sigue a su auto con zoom fijo, adelantándose según la velocidad
      const n = this.cams.length, w = Render.W / n;
      this.cams.forEach((c, k) => {
        c.vp = { x: k * w, y: 0, w, h: Render.H };
        const car = c.car;
        if (!car) return;
        const maxX = 0.38 * w / c.zoom, maxY = 0.36 * Render.H / c.zoom;
        const tx = Math.max(-maxX, Math.min(maxX, car.vx * CAM_LOOKAHEAD));
        const ty = Math.max(-maxY, Math.min(maxY, car.vy * CAM_LOOKAHEAD));
        const k2 = Math.min(1, dt * 2.5);
        c.lx += (tx - c.lx) * k2; c.ly += (ty - c.ly) * k2;
        c.x = car.x + c.lx; c.y = car.y + c.ly;
      });
      return;
    }
    if (this.state === 'preview') {
      cam.zoom = Math.min(Render.W / (tb.maxX - tb.minX + 40), availH / (tb.maxY - tb.minY + 40));
      cam.x = (tb.minX + tb.maxX) / 2; cam.y = (tb.minY + tb.maxY) / 2;
      return;
    }
    // menú / sala: paseo lento por la pista
    this.menuT += dt;
    const [x, y] = this.track.pointAt(this.menuT * 14, 0);
    cam.x += (x - cam.x) * Math.min(1, dt * 1.5);
    cam.y += (y - cam.y) * Math.min(1, dt * 1.5);
    cam.zoom += (6 - cam.zoom) * Math.min(1, dt * 2);
  },

  draw() {
    if (this.cams.length) for (const c of this.cams) Render.drawScene(this, c);
    else Render.drawScene(this, this.cam);
    Render.screen();
    if (this.cams.length > 1) Render.drawDivider();
    if (this.state === 'preview') { this.drawPreviewMarks(); return; }
    if (this.state === 'menu') { Render.drawMenu(this); return; }
    if (this.state === 'lobby') return;
    Render.drawHUD(this);
    if (this.state === 'countdown' || (this.state === 'race' && this.raceTime < 1)) Render.drawCountdown(this);
    if (this.debug) Render.drawDebug(this);
    if (this.state === 'results') Render.drawResults(this);
    if (this.paused) Render.drawPause(this);
  },
};

// vista previa para diseñar pistas (index.html?preview=N): marca la fracción de vuelta
Game.drawPreviewMarks = function () {
  const ctx = Render.ctx, tr = this.track;
  ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let f = 0; f < 1; f += 0.05) {
    const [x, y] = tr.pointAt(f * tr.length, 0), [sx, sy] = Render.toScreen(this.cam, x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx - 17, sy - 9, 34, 18);
    ctx.fillStyle = '#fff'; ctx.fillText(f.toFixed(2).slice(1), sx, sy);
  }
};

window.addEventListener('load', () => Game.init());
