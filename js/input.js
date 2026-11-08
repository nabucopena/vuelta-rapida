'use strict';
// ============================================================================
//  CONTROLES
//  Cada jugador tiene sus teclas. Para agregar jugadores o cambiar teclas,
//  editar PLAYER_DEFS. (Los códigos son KeyboardEvent.code.)
// ============================================================================

const PLAYER_DEFS = [
  { name: 'J1', color: '#e53935', accent: '#ffffff', label: 'W A S D',
    keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } },
  { name: 'J2', color: '#1e88e5', accent: '#ffeb3b', label: 'Flechas',
    keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } },
  { name: 'J3', color: '#43a047', accent: '#ffffff', label: 'I J K L',
    keys: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' } },
  { name: 'J4', color: '#fdd835', accent: '#212121', label: 'Num 8 4 5 6',
    keys: { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6' } },
];

const Input = {
  down: new Set(),
  pressed: new Set(),

  init() {
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', e => {
      if (block.has(e.code) || e.code.startsWith('Numpad')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  },

  isDown(code) { return this.down.has(code); },
  wasPressed(...codes) { return codes.some(c => this.pressed.has(c)); },
  endFrame() { this.pressed.clear(); },

  // modo en red: un solo jugador por compu, sirven flechas o W A S D
  forAny() {
    const a = this.forPlayer(PLAYER_DEFS[0]), b = this.forPlayer(PLAYER_DEFS[1]);
    return { throttle: Math.max(a.throttle, b.throttle), brake: Math.max(a.brake, b.brake),
      steer: Math.max(-1, Math.min(1, a.steer + b.steer)) };
  },

  forPlayer(def) {
    const k = def.keys;
    return {
      throttle: this.isDown(k.up) ? 1 : 0,
      brake: this.isDown(k.down) ? 1 : 0,
      steer: (this.isDown(k.right) ? 1 : 0) - (this.isDown(k.left) ? 1 : 0),
    };
  },
};
