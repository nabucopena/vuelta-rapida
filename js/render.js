'use strict';
// ============================================================================
//  DIBUJO POR CUADRO (Canvas 2D, vista cenital). El mundo está en metros; la
//  cámara convierte a píxeles con "zoom" (px por metro). El escenario fijo ya
//  viene pintado por Art (js/art.js); acá se dibuja lo que se mueve y el HUD.
// ============================================================================

const UI = {
  card: 'rgba(250,246,236,0.94)', cardEdge: 'rgba(60,45,25,0.25)', ink: '#2a2620', dim: '#776f62',
  accent: '#d9822b', good: '#3f8f4a', bad: '#c0392b',
};
const SURF_MINI = { asphalt: '#5d5e64', dirt: '#a8804f', mud: '#6b4d32', snow: '#f4f7fb', ice: '#a9d6ea', grass: '#6f9a45', sand: '#d4ba86', concrete: '#aaa8a1', deepsnow: '#ffffff', water: '#3c7ca1', curb: '#5d5e64' };


const Render = {
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
  },

  screen() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); },
  // cada cámara dibuja en su rectángulo de pantalla (cam.vp); sin vp ocupa toda la pantalla
  vp(cam) { return cam.vp || { x: 0, y: 0, w: this.W, h: this.H }; },
  world(cam) {
    const z = cam.zoom * this.dpr, v = this.vp(cam);
    this.ctx.setTransform(z, 0, 0, z, this.dpr * (v.x + v.w / 2 - cam.x * cam.zoom), this.dpr * (v.y + v.h / 2 - cam.y * cam.zoom));
  },
  toScreen(cam, x, y) {
    const v = this.vp(cam);
    return [v.x + v.w / 2 + (x - cam.x) * cam.zoom, v.y + v.h / 2 + (y - cam.y) * cam.zoom];
  },

  // ------------------------------------------------------------------ mundo
  // dibuja sólo el pedazo visible de una capa pre-pintada (mucho más rápido que la imagen entera)
  drawLayer(cv, ox, oy, ppm, cam) {
    const v = this.vp(cam);
    const vx0 = cam.x - v.w / 2 / cam.zoom, vy0 = cam.y - v.h / 2 / cam.zoom;
    const vx1 = cam.x + v.w / 2 / cam.zoom, vy1 = cam.y + v.h / 2 / cam.zoom;
    const x0 = Math.max(vx0, ox), y0 = Math.max(vy0, oy);
    const x1 = Math.min(vx1, ox + cv.width / ppm), y1 = Math.min(vy1, oy + cv.height / ppm);
    if (x1 <= x0 || y1 <= y0) return;
    const sx = Math.floor((x0 - ox) * ppm), sy = Math.floor((y0 - oy) * ppm);
    const sw = Math.min(cv.width - sx, Math.ceil((x1 - x0) * ppm) + 2), sh = Math.min(cv.height - sy, Math.ceil((y1 - y0) * ppm) + 2);
    this.ctx.drawImage(cv, sx, sy, sw, sh, ox + sx / ppm, oy + sy / ppm, sw / ppm, sh / ppm);
  },

  drawProp(p) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    if (p.type === 'hay') {
      Art.drawHayBale(ctx, 0, 0, p.r, mulberry32(7));
    } else if (p.type === 'cone') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(0.12, 0.16, 0.26, 0, 7); ctx.fill();
      ctx.fillStyle = '#ef6c00'; ctx.beginPath(); ctx.arc(0, 0, 0.25, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 0.15, 0, 7); ctx.fill();
      ctx.fillStyle = '#ef6c00'; ctx.beginPath(); ctx.arc(0, 0, 0.08, 0, 7); ctx.fill();
    } else if (p.type === 'barrel') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(0.2, 0.28, 0.43, 0, 7); ctx.fill();
      const gr = ctx.createRadialGradient(-0.12, -0.12, 0, 0, 0, 0.42);
      gr.addColorStop(0, '#5aa0e0'); gr.addColorStop(1, '#1d4f8c');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, 7); ctx.stroke();
    } else if (p.type === 'tire') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(0.15, 0.2, 0.45, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, 7); ctx.fill();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, 7); ctx.fill();
    }
    ctx.restore();
  },

  drawCar(car, upper) {
    const ctx = this.ctx, spr = Art.carSprites(car.player, car.num);
    const h = upper ? 2.4 : 1, p = car.p;
    ctx.save();
    ctx.translate(car.x + 0.32 * h, car.y + 0.45 * h); ctx.rotate(car.angle);
    ctx.globalAlpha = upper ? 0.45 : 0.75;
    ctx.drawImage(spr.shadow, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    ctx.restore();
    ctx.save();
    ctx.translate(car.x, car.y); ctx.rotate(car.angle);
    if (upper) ctx.scale(1.05, 1.05);
    ctx.fillStyle = '#151515';
    const a = p.cgToFront, b = p.cgToRear, t = 0.76;
    ctx.fillRect(-b - 0.33, -t - 0.16, 0.66, 0.32); ctx.fillRect(-b - 0.33, t - 0.16, 0.66, 0.32);
    for (const sy of [-t, t]) {
      ctx.save(); ctx.translate(a, sy); ctx.rotate(car.steer);
      ctx.fillRect(-0.33, -0.16, 0.66, 0.32); ctx.restore();
    }
    ctx.drawImage(spr.body, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    if (car.dirt > 0.03) { ctx.globalAlpha = Math.min(0.95, car.dirt); ctx.drawImage(spr.dirt, -spr.w / 2, -spr.h / 2, spr.w, spr.h); }
    if (car.damage > 2) { ctx.globalAlpha = Math.min(1, car.damage / 90); ctx.drawImage(spr.soot, -spr.w / 2, -spr.h / 2, spr.w, spr.h); }
    if (car.brake > 0.1) {
      ctx.globalAlpha = car.brake * 0.9;
      const glow = Art.softSprite('rgba(255,40,30,1)');
      for (const sy of [-0.58, 0.58]) ctx.drawImage(glow, -2.35, sy - 0.45, 0.9, 0.9);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },

  drawParticles(parts) {
    const ctx = this.ctx;
    for (const q of parts) {
      const k = q.life / q.max;
      if (q.type === 'ring') {
        ctx.globalAlpha = k * 0.5; ctx.strokeStyle = '#e6f4fb'; ctx.lineWidth = 0.12;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.6 - k), 0, 7); ctx.stroke();
      } else if (q.soft) {
        const s = q.size * (1 + (1 - k) * q.grow);
        ctx.globalAlpha = k * q.alpha;
        ctx.drawImage(Art.softSprite(q.color), q.x - s / 2, q.y - s / 2, s, s);
      } else {
        ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
    ctx.globalAlpha = 1;
  },

  drawScene(game, cam) {
    const ctx = this.ctx, tr = game.track, art = tr.art, v = this.vp(cam);
    this.screen();
    ctx.save();
    ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
    ctx.fillStyle = art.theme.bg; ctx.fillRect(v.x, v.y, v.w, v.h);
    this.world(cam);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    this.drawLayer(art.ground, art.ox, art.oy, art.ppm, cam);
    for (const p of game.props) this.drawProp(p);
    for (const car of game.cars) if (!car.layer) this.drawCar(car, false);
    if (art.bridge) {
      const B = art.bridge;
      this.drawLayer(B.canvas, B.ox, B.oy, art.ppm, cam);
    }
    for (const car of game.cars) if (car.layer) this.drawCar(car, true);
    this.drawParticles(game.particles);
    this.drawLayer(art.canopy, art.ox, art.oy, art.cppm, cam);
    this.screen();

    // etiquetas y flechas para autos fuera de la vista
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const car of game.cars) {
      const [x, y] = this.toScreen(cam, car.x, car.y);
      const m = 18, L = v.x + m, R = v.x + v.w - m, T = v.y + m, B = v.y + v.h - m;
      if (x < L || y < T || x > R || y > B) {
        const cx = Math.max(L, Math.min(R, x)), cy = Math.max(T, Math.min(B, y));
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(y - (v.y + v.h / 2), x - (v.x + v.w / 2)));
        ctx.fillStyle = car.player.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath();
        ctx.stroke(); ctx.fill(); ctx.restore();
        continue;
      }
      const off = 2.6 * cam.zoom + 12, tw = ctx.measureText(car.player.name).width, lw = tw + 24;
      ctx.fillStyle = 'rgba(250,246,236,0.92)';
      ctx.beginPath(); ctx.roundRect(x - lw / 2, y - off - 8, lw, 16, 8); ctx.fill();
      ctx.fillStyle = car.player.color; ctx.beginPath(); ctx.arc(x - lw / 2 + 9, y - off, 4, 0, 7); ctx.fill();
      ctx.fillStyle = UI.ink; ctx.fillText(car.player.name, x + 6, y - off);
      if (car.flash && car.flash.t > 0) {
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, car.flash.t)})`;
        ctx.strokeStyle = `rgba(0,0,0,${Math.min(0.6, car.flash.t)})`; ctx.lineWidth = 3;
        ctx.strokeText(car.flash.text, x, y - off - 20); ctx.fillText(car.flash.text, x, y - off - 20);
        ctx.font = 'bold 12px system-ui, sans-serif';
      }
    }
    ctx.restore();
  },

  drawDivider() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(40,28,15,0.85)'; ctx.fillRect(this.W / 2 - 3, 0, 6, this.H);
    ctx.fillStyle = 'rgba(250,246,236,0.5)'; ctx.fillRect(this.W / 2 - 1, 0, 2, this.H);
  },

  // ------------------------------------------------------------------ HUD
  panel(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(30,20,10,0.25)';
    ctx.beginPath(); ctx.roundRect(x + 3, y + 4, w, h, 10); ctx.fill();
    ctx.fillStyle = UI.card;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = UI.cardEdge; ctx.lineWidth = 1; ctx.stroke();
  },

  drawHUD(game) {
    const net = game.mode === 'net';
    const ctx = this.ctx, cars = net ? (Net.myCar ? [Net.myCar] : []) : game.cars, n = Math.max(1, cars.length);
    const split = game.cams.length > 1;
    const pw = Math.min(215, (this.W - 30 - 10 * (n - 1)) / n), ph = game.settings.damage ? 128 : 108;
    cars.forEach((car, k) => {
      // en pantalla dividida: J1 arriba a la izquierda, J2 arriba a la derecha
      const v = split ? this.vp(game.cams[k]) : null;
      const x = split ? (k === 0 ? v.x + 15 : v.x + v.w - pw - 15) : 15 + k * (pw + 10), y = 15;
      this.panel(x, y, pw, ph);
      ctx.fillStyle = car.player.color;
      ctx.beginPath(); ctx.roundRect(x, y, pw, 6, [10, 10, 0, 0]); ctx.fill();
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillStyle = UI.ink; ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(car.player.name, x + 12, y + 14);
      ctx.font = 'bold 28px system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`P${car.position}`, x + pw - 12, y + 11);
      ctx.textAlign = 'left'; ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = UI.dim;
      const lap = Math.max(1, Math.min(car.lap, game.settings.laps));
      ctx.fillText(`Vuelta ${lap}/${game.settings.laps}`, x + 12, y + 34);
      const cur = car.finished ? car.finishTime : (car.lap > 0 && game.state === 'race' ? game.raceTime - car.lapStart : 0);
      ctx.fillStyle = UI.ink;
      ctx.fillText(car.finished ? `Total ${fmtTime(car.finishTime)}` : `Actual ${fmtTime(cur)}`, x + 12, y + 52);
      ctx.fillStyle = UI.dim;
      ctx.fillText(`Mejor  ${fmtTime(car.best)}`, x + 12, y + 69);
      ctx.font = 'bold 15px system-ui, sans-serif'; ctx.fillStyle = UI.ink; ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(car.speed * 3.6)} km/h`, x + pw - 12, y + 52);
      ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = UI.dim;
      ctx.fillText(car.surfName || '', x + pw - 12, y + 70);
      ctx.textAlign = 'left';
      let yy = y + 90;
      if (game.settings.damage) {
        ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = UI.dim;
        ctx.fillText('Daño', x + 12, yy);
        const bw = pw - 62, d = car.damage / 100;
        ctx.fillStyle = 'rgba(60,45,25,0.15)'; ctx.fillRect(x + 48, yy + 2, bw, 9);
        ctx.fillStyle = d < 0.35 ? UI.good : d < 0.7 ? UI.accent : UI.bad;
        ctx.fillRect(x + 48, yy + 2, bw * d, 9);
        yy += 18;
      }
      ctx.font = 'bold 12px system-ui, sans-serif';
      let status = '', sc = UI.accent;
      if (car.finished) { status = `TERMINÓ  P${car.finishPos}`; sc = UI.good; }
      else if (car.repairing) status = 'REPARANDO…';
      else if (car.inPit) status = 'LIMITADOR 60';
      else if (car.offroad) { status = 'FUERA DE PISTA'; sc = UI.bad; }
      if (status) { ctx.fillStyle = sc; ctx.fillText(status, x + 12, yy); }
    });
    if (game.state === 'race' || game.state === 'results') {
      const w = 124, x = this.W / 2 - w / 2, y = 12;
      this.panel(x, y, w, 36);
      ctx.fillStyle = UI.ink; ctx.font = 'bold 18px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtTime(game.raceTime), this.W / 2, y + 18);
    }
    if (net) this.drawStandings(game);
    this.drawMinimap(game, split);
  },

  // tabla de posiciones (modo en red)
  drawStandings(game) {
    const ctx = this.ctx, list = [...game.cars].sort((a, b) => a.position - b.position);
    const w = 210, rh = 22, h = 34 + list.length * rh, x = this.W - w - 15, y = 15;
    this.panel(x, y, w, h);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = UI.dim;
    ctx.fillText('POSICIONES', x + 12, y + 16);
    list.forEach((c, i) => {
      const yy = y + 34 + i * rh;
      if (c === Net.myCar) { ctx.fillStyle = 'rgba(217,130,43,0.15)'; ctx.fillRect(x + 6, yy - rh / 2 + 1, w - 12, rh - 2); }
      ctx.fillStyle = UI.ink; ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`${i + 1}`, x + 12, yy);
      ctx.fillStyle = c.player.color; ctx.beginPath(); ctx.arc(x + 34, yy, 5, 0, 7); ctx.fill();
      ctx.fillStyle = UI.ink; ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(c.player.name, x + 46, yy);
      ctx.textAlign = 'right'; ctx.fillStyle = UI.dim; ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(c.finished ? 'llegó' : `V${Math.max(1, Math.min(c.lap, game.settings.laps))}`, x + w - 12, yy);
      ctx.textAlign = 'left';
    });
  },

  miniPaths(tr) {
    if (tr._mini) return tr._mini;
    const out = [];
    for (const run of Art.paths(tr).ground) out.push({ color: SURF_MINI[run.surf] || '#888', path: run.path });
    const br = Art.ranges(tr, i => tr.layer[i] === 1);
    if (tr.def.bridge) for (const [a, b] of br) out.push({ color: '#cfccc4', path: Art.line(tr, a, b, () => 0), bridge: true });
    return (tr._mini = out);
  },

  drawMinimap(game, centered) {
    const ctx = this.ctx, tr = game.track, bb = tr.bounds;
    const size = Math.min(centered ? 170 : 200, this.W * 0.18), pad = 12;
    const sc = (size - pad * 2) / Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
    const w = (bb.maxX - bb.minX) * sc + pad * 2, h = (bb.maxY - bb.minY) * sc + pad * 2;
    const x0 = centered ? this.W / 2 - w / 2 : this.W - w - 15, y0 = this.H - h - 15;
    this.panel(x0, y0, w, h);
    ctx.save();
    ctx.translate(x0 + pad - bb.minX * sc, y0 + pad - bb.minY * sc); ctx.scale(sc, sc);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a342b'; ctx.lineWidth = 7 / sc;
    for (const m of this.miniPaths(tr)) ctx.stroke(m.path);
    for (const m of this.miniPaths(tr)) {
      ctx.strokeStyle = m.color; ctx.lineWidth = (m.bridge ? 5.5 : 4.5) / sc; ctx.stroke(m.path);
    }
    const [sx, sy] = tr.pointAt(tr.startD, 0);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 / sc;
    ctx.fillRect(sx - 3 / sc, sy - 3 / sc, 6 / sc, 6 / sc); ctx.strokeRect(sx - 3 / sc, sy - 3 / sc, 6 / sc, 6 / sc);
    for (const car of game.cars) {
      ctx.fillStyle = car.player.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / sc;
      ctx.beginPath(); ctx.arc(car.x, car.y, 4.5 / sc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  },

  drawCountdown(game) {
    const ctx = this.ctx;
    let text, t;
    if (game.state === 'countdown') {
      const left = game.goTime - game.countT;
      text = String(Math.ceil(left)); t = left - Math.floor(left);
    } else { text = '¡YA!'; t = 1 - game.raceTime; }
    const s = 1 + (1 - t) * 0.25;
    ctx.save(); ctx.translate(this.W / 2, this.H * 0.38); ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, t * 2 + 0.2);
    ctx.font = 'bold 110px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(40,25,10,0.8)'; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = text === '¡YA!' ? '#7bd36b' : '#fff3d6'; ctx.fillText(text, 0, 0);
    ctx.restore();
  },

  centerText(lines, y) {
    const ctx = this.ctx;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [text, font, color] of lines) {
      ctx.font = font; ctx.fillStyle = color || UI.ink;
      ctx.fillText(text, this.W / 2, y);
      y += parseInt(font.match(/(\d+)px/)[1], 10) * 1.5;
    }
  },

  menuList(items, sel, y) {
    const ctx = this.ctx;
    items.forEach((it, i) => {
      const yy = y + i * 46, w = 380, x = this.W / 2 - w / 2;
      ctx.fillStyle = i === sel ? UI.accent : 'rgba(60,45,25,0.08)';
      ctx.beginPath(); ctx.roundRect(x, yy, w, 38, 8); ctx.fill();
      ctx.fillStyle = i === sel ? '#fff' : UI.ink;
      ctx.font = 'bold 17px system-ui, sans-serif'; ctx.textBaseline = 'middle';
      if (it.value != null) {
        ctx.textAlign = 'left'; ctx.fillText(it.label, x + 18, yy + 19);
        ctx.textAlign = 'right'; ctx.fillText(`◀  ${it.value}  ▶`, x + w - 18, yy + 19);
      } else {
        ctx.textAlign = 'center'; ctx.fillText(it.label, this.W / 2, yy + 19);
      }
    });
  },

  drawMenu(game) {
    const ctx = this.ctx;
    this.screen();
    const items = game.menuItems();
    const h = 150 + items.length * 46 + 150, w = 580, x = this.W / 2 - w / 2, y = Math.max(20, this.H / 2 - h / 2);
    this.panel(x, y, w, h);
    this.centerText([
      ['VUELTA RÁPIDA', 'bold 48px system-ui, sans-serif', UI.accent],
      ['rally de mesa para varios jugadores', '15px system-ui, sans-serif', UI.dim],
    ], y + 50);
    this.menuList(items, game.menuSel, y + 140);
    const cy = y + 140 + items.length * 46 + 18;
    const n = game.mode === 'net' ? 0 : game.settings.players, cw = 120;
    PLAYER_DEFS.slice(0, n).forEach((p, i) => {
      const px = this.W / 2 - (n * cw) / 2 + i * cw;
      ctx.fillStyle = p.color; ctx.fillRect(px + 12, cy, cw - 24, 4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = UI.ink; ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(p.name, px + cw / 2, cy + 10);
      ctx.fillStyle = UI.dim; ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(p.label, px + cw / 2, cy + 30);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = UI.dim; ctx.font = '12px system-ui, sans-serif';
    const tr = game.track;
    if (game.mode === 'net') {
      ctx.fillText('Cada jugador juega desde su compu. Una compu tiene que correr el servidor: npm start', this.W / 2, cy + 20);
      ctx.fillText('Enter para entrar a la sala', this.W / 2, cy + 40);
    }
    ctx.fillText(TRACK_INFO(tr), this.W / 2, cy + 60);
    ctx.fillText('↑↓ elegir   ←→ cambiar   Enter empezar   ·   en carrera: Esc pausa, M silencio', this.W / 2, cy + 82);
    if (tr.def.pit) ctx.fillText('Boxes: entrá a la calle de boxes (60 km/h) y frená en un recuadro amarillo para reparar.', this.W / 2, cy + 100);
  },

  drawPause(game) {
    this.screen();
    const w = 440, h = 230, x = this.W / 2 - w / 2, y = this.H / 2 - h / 2;
    this.panel(x, y, w, h);
    this.centerText([['PAUSA', 'bold 36px system-ui, sans-serif']], y + 40);
    this.menuList(game.pauseItems().map(l => ({ label: l })), game.pauseSel, y + 80);
  },

  drawResults(game) {
    this.screen();
    const ctx = this.ctx, rows = game.results;
    const w = 580, rh = 40, h = 110 + rows.length * rh + 60, x = this.W / 2 - w / 2, y = this.H / 2 - h / 2;
    this.panel(x, y, w, h);
    this.centerText([['RESULTADOS', 'bold 34px system-ui, sans-serif', UI.accent]], y + 38);
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = UI.dim; ctx.textBaseline = 'middle';
    const cols = [x + 30, x + 90, x + 310, x + 450];
    ctx.textAlign = 'left';
    ['Pos', 'Jugador', 'Tiempo', 'Mejor vuelta'].forEach((t, i) => ctx.fillText(t, cols[i], y + 80));
    rows.forEach((r, i) => {
      const yy = y + 110 + i * rh;
      ctx.fillStyle = i % 2 ? 'rgba(60,45,25,0.04)' : 'rgba(60,45,25,0.09)';
      ctx.fillRect(x + 15, yy - rh / 2 + 2, w - 30, rh - 4);
      ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillStyle = UI.ink;
      ctx.fillText(`${i + 1}`, cols[0], yy);
      ctx.fillStyle = r.car.player.color; ctx.fillRect(cols[1], yy - 8, 6, 16);
      ctx.fillStyle = UI.ink; ctx.fillText(r.car.player.name, cols[1] + 14, yy);
      ctx.font = '16px ui-monospace, Menlo, monospace';
      ctx.fillText(r.car.finished ? fmtTime(r.car.finishTime) : 'no terminó', cols[2], yy);
      ctx.fillText(fmtTime(r.car.best), cols[3], yy);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = UI.dim; ctx.font = '14px system-ui, sans-serif';
    const foot = game.mode !== 'net' ? 'Enter: volver al menú     R: revancha'
      : Net.isHost ? 'Enter: volver a la sala' : 'Esperando que el anfitrión vuelva a la sala…';
    ctx.fillText(foot, this.W / 2, y + h - 28);
  },

  drawDebug(game) {
    const ctx = this.ctx;
    ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    game.cars.forEach((c, i) => {
      const lines = [
        `${c.player.name} v=${(c.speed * 3.6).toFixed(0)} β=${(c.beta * 57.3).toFixed(1)}° suelto=${c.loose.toFixed(2)}`,
        `αF=${c.alphaF.toFixed(3)} αR=${c.alphaR.toFixed(3)} usoF=${c.usageF.toFixed(2)} usoR=${c.usageR.toFixed(2)}`,
        `latG=${c.latG.toFixed(2)} longG=${c.longG.toFixed(2)} esc=${c.escActive ? 'ON' : '-'} ${c.surfName} capa=${c.layer}`,
      ];
      const y = 170 + i * 58;
      this.panel(12, y - 4, 430, 54);
      ctx.fillStyle = UI.ink;
      lines.forEach((l, k) => ctx.fillText(l, 20, y + k * 15));
    });
  },
};

function TRACK_INFO(tr) {
  const names = { asphalt: 'asfalto', dirt: 'tierra', snow: 'nieve', mud: 'barro', ice: 'hielo', water: 'agua', sand: 'arena', grass: 'pasto' };
  const set = new Set();
  for (let i = 0; i < tr.N; i += 5) set.add(SURF_NAMES[tr.surf[i]]);
  for (const p of tr.patches) set.add(p.type);
  return `${Math.round(tr.length)} m · ` + [...set].map(s => names[s] || s).join(', ') + (tr.def.bridge ? ' · con puente' : '');
}
