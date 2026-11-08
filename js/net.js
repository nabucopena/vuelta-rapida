'use strict';
// ============================================================================
//  MODO EN RED (cliente)
//  Se conecta al servidor (node server.js) que sirvió esta página. Muestra la
//  sala de espera, manda los controles de este jugador y dibuja la carrera con
//  el estado que llega del servidor, interpolando entre envíos para que se
//  vea suave.
// ============================================================================

const NET_DELAY = 0.05;   // s de retraso de interpolación (suaviza la llegada de datos)

const Net = {
  ws: null, myId: null, isHost: false, hostId: null, players: [], settings: null, urls: [],
  snaps: [], offset: null, myCar: null, lastSent: '', lastSentAt: 0, ui: null,

  // ------------------------------------------------------------ sala de espera
  open() {
    this.buildUI();
    this.ui.root.style.display = 'block';
    if (location.protocol === 'file:') {
      this.status('Para jugar en red hay que abrir el juego desde el servidor:<br>' +
        'en la compu anfitriona ejecutá <b>npm start</b> y abrí la dirección que muestra.', true);
      return;
    }
    if (!this.ws) this.connect();
  },

  close() {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    this.ui.root.style.display = 'none';
    Object.assign(Game, { state: 'menu', cars: [], cams: [] });
    this.myCar = null; this.snaps = [];
  },

  buildUI() {
    if (this.ui) return;
    const root = document.createElement('div');
    root.id = 'lobby';
    root.innerHTML = `
      <h1>Sala en red</h1>
      <label class="row">Tu nombre <input id="lb-name" maxlength="16" autocomplete="off"></label>
      <div id="lb-players"></div>
      <div class="row"><span>Pista</span><select id="lb-track"></select></div>
      <div class="row"><span>Vueltas</span><select id="lb-laps"></select></div>
      <div class="row"><span>Daño por golpes</span><select id="lb-damage"><option value="1">Sí</option><option value="0">No</option></select></div>
      <div id="lb-status"></div>
      <div class="btns"><button id="lb-start">Empezar carrera</button><button id="lb-leave" class="sec">Salir</button></div>
      <div id="lb-urls"></div>
      <div class="hint">Controles: flechas o W A S D · M silencio</div>`;
    document.body.appendChild(root);
    const $ = id => root.querySelector('#' + id);
    this.ui = { root, name: $('lb-name'), players: $('lb-players'), track: $('lb-track'), laps: $('lb-laps'),
      damage: $('lb-damage'), status: $('lb-status'), start: $('lb-start'), leave: $('lb-leave'), urls: $('lb-urls') };
    TRACK_DEFS.forEach((d, i) => this.ui.track.add(new Option(d.name, i)));
    for (let i = 1; i <= 20; i++) this.ui.laps.add(new Option(i, i));
    let saved = ''; try { saved = localStorage.getItem('vr-name') || ''; } catch (e) { /* sin almacenamiento */ }
    this.ui.name.value = saved;
    this.ui.name.addEventListener('change', () => {
      const n = this.ui.name.value.trim().slice(0, 16);
      try { localStorage.setItem('vr-name', n); } catch (e) { /* sin almacenamiento */ }
      this.send({ t: 'name', name: n });
    });
    const sendSettings = () => this.send({ t: 'settings', track: +this.ui.track.value, laps: +this.ui.laps.value, damage: this.ui.damage.value === '1' });
    for (const el of [this.ui.track, this.ui.laps, this.ui.damage]) el.addEventListener('change', sendSettings);
    this.ui.start.addEventListener('click', () => this.send({ t: 'start' }));
    this.ui.leave.addEventListener('click', () => this.close());
    // que las teclas de la sala no muevan el juego
    root.addEventListener('keydown', e => e.stopPropagation());
  },

  status(html, error) {
    this.ui.status.innerHTML = html;
    this.ui.status.className = error ? 'err' : '';
  },

  renderLobby() {
    const u = this.ui;
    u.players.innerHTML = this.players.map(p =>
      `<div class="pl"><i style="background:${p.color}"></i>${p.name}${p.id === this.hostId ? ' <em>anfitrión</em>' : ''}${p.id === this.myId ? ' <em>vos</em>' : ''}</div>`).join('');
    const s = this.settings;
    u.track.value = s.track; u.laps.value = s.laps; u.damage.value = s.damage ? '1' : '0';
    for (const el of [u.track, u.laps, u.damage]) el.disabled = !this.isHost;
    u.start.style.display = this.isHost ? '' : 'none';
    if (this.lobbyState === 'race') this.status('Hay una carrera en curso. Vas a verla y entrás en la próxima.');
    else this.status(this.isHost ? 'Sos el anfitrión: elegí la pista y largá cuando estén todos.' : 'Esperando a que el anfitrión largue…');
    // publicado en internet: se invita con la dirección del sitio; en red local, con las IP de la compu anfitriona
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
    const urls = local ? this.urls : [location.origin];
    u.urls.innerHTML = urls.length ? 'Para sumar jugadores, abrí en otra compu:<br>' + urls.map(x => `<b>${x}</b>`).join('<br>') : '';
  },

  // ------------------------------------------------------------ conexión
  connect() {
    this.status('Conectando…');
    // en un sitio con https la conexión tiene que ser segura (wss)
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      const n = this.ui.name.value.trim();
      if (n) this.send({ t: 'name', name: n });
    };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMessage(m); };
    ws.onclose = () => {
      this.ws = null;
      if (Game.mode === 'net' && Game.state !== 'menu') {
        Object.assign(Game, { state: 'lobby', cars: [], cams: [] }); this.myCar = null;
        this.ui.root.style.display = 'block';
        this.status('Se perdió la conexión con el servidor. <a href="#" id="lb-retry">Reintentar</a>', true);
        const r = this.ui.root.querySelector('#lb-retry');
        if (r) r.onclick = e => { e.preventDefault(); this.connect(); };
      }
    };
  },

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },

  onMessage(m) {
    if (m.t === 'welcome') this.myId = m.id;
    else if (m.t === 'full') this.status('La sala está llena (8 jugadores).', true);
    else if (m.t === 'lobby') {
      this.players = m.players; this.hostId = m.hostId; this.isHost = m.hostId === this.myId;
      this.settings = m.settings; this.lobbyState = m.state; this.urls = m.urls || [];
      if (m.state === 'lobby' && Game.state !== 'lobby' && Game.state !== 'menu') {
        Object.assign(Game, { state: 'lobby', cars: [], cams: [] }); this.myCar = null;
        this.ui.root.style.display = 'block';
      }
      if (Game.state === 'lobby') Game.loadTrack(m.settings.track);   // de fondo, la pista elegida
      this.renderLobby();
    } else if (m.t === 'start') this.startRace(m);
    else if (m.t === 's') this.onSnap(m);
  },

  startRace(m) {
    Game.loadTrack(m.track);
    const tr = Game.track;
    Art.resetMarks(tr);
    Game.settings.laps = m.laps; Game.settings.damage = m.damage;
    Game.cars = m.players.map((p, k) => {
      const [x, y, h] = tr.gridSlot(k);
      const car = new Car(x, y, h);
      car.id = p.id; car.num = p.num; car.player = { name: p.name, color: p.color, accent: p.accent };
      Object.assign(car, { lap: 0, best: null, finished: false, finishTime: null, finishPos: 0, position: k + 1,
        layer: 0, idx: 0, surfF: SURFACES.asphalt, surfR: SURFACES.asphalt, surfName: '' });
      Game.prepCar(car);
      return car;
    });
    this.myCar = Game.cars.find(c => c.id === this.myId) || null;
    Game.props = tr.makeProps();
    Game.cams = [Game.makeCam(this.myCar || Game.cars[0])];
    Game.particles = []; Game.results = [];
    Game.state = 'countdown'; Game.raceTime = 0; Game.countT = 0; Game.goTime = 3;
    this.snaps = []; this.offset = null;
    this.ui.root.style.display = 'none';
  },

  onSnap(m) {
    if (!Game.cars.length) return;
    const now = performance.now() / 1000, est = m.tm - now;
    // estimación del reloj del servidor (suavizada; si un paquete llega antes de lo esperado, se adopta)
    this.offset = this.offset == null || est > this.offset ? est : this.offset + (est - this.offset) * 0.02;
    const cars = new Map(m.c.map(a => { const o = unpackCar(a); return [o.id, o]; }));
    this.snaps.push({ t: m.tm, cars });
    if (this.snaps.length > 40) this.snaps.shift();
    // datos que no se interpolan: se toman del último envío
    for (const car of Game.cars) {
      const o = cars.get(car.id);
      if (!o) continue;
      for (const k of ['damage', 'alphaF', 'alphaR', 'alphaPeak', 'beta', 'loose', 'usageF', 'd', 'best', 'finishTime',
        'lapStart', 'lap', 'finishPos', 'position', 'layer', 'idx', 'finished', 'inPit', 'repairing', 'offroad',
        'surfF', 'surfR', 'surfName']) car[k] = o[k];
    }
    for (let i = 0; i < Game.props.length && i * 3 + 2 < m.p.length; i++) {
      const p = Game.props[i]; p.x = m.p[i * 3]; p.y = m.p[i * 3 + 1]; p.angle = m.p[i * 3 + 2];
    }
    if (m.st === 'results' && Game.state !== 'results') {
      Game.results = [...Game.cars].sort((a, b) => a.position - b.position).map(car => ({ car }));
    }
    Game.state = m.st; Game.raceTime = m.rt; Game.countT = m.ct; Game.goTime = m.gt;
    Game.handleEvents(m.e || []);
    // si no tengo auto (llegué tarde), la cámara sigue al que va primero
    if (!this.myCar && Game.cams[0]) Game.cams[0].car = [...Game.cars].sort((a, b) => a.position - b.position)[0];
  },

  // ------------------------------------------------------------ por cuadro
  update() {
    // controles: se mandan cuando cambian (y cada 100 ms por las dudas)
    if (this.myCar) {
      const inp = Input.forAny(), key = `${inp.throttle}${inp.brake}${inp.steer}`, now = performance.now();
      if (key !== this.lastSent || now - this.lastSentAt > 100) {
        this.send({ t: 'i', th: inp.throttle, br: inp.brake, st: inp.steer });
        this.lastSent = key; this.lastSentAt = now;
      }
    }
    // interpolación entre los dos envíos que rodean el "ahora" del servidor menos un pequeño retraso
    if (this.snaps.length < 1 || this.offset == null) return;
    const rt = performance.now() / 1000 + this.offset - NET_DELAY;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = this.snaps.length - 1; i > 0; i--) {
      if (this.snaps[i - 1].t <= rt) { a = this.snaps[i - 1]; b = this.snaps[i]; break; }
    }
    const f = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
    for (const car of Game.cars) {
      const A = a.cars.get(car.id), B = b.cars.get(car.id);
      if (!A || !B) continue;
      for (const k of SNAP_LERP) car[k] = A[k] + (B[k] - A[k]) * f;
      let da = B.angle - A.angle;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      car.angle = A.angle + da * f;
    }
  },
};
