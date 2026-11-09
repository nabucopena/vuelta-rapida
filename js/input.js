'use strict';
// ============================================================================
//  CONTROLES
//  Cada jugador tiene sus teclas (KeyboardEvent.code). Se pueden cambiar desde
//  el menú "Controles"; los cambios se guardan en el navegador.
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

const KEY_ACTIONS = [['up', 'Acelerar'], ['down', 'Frenar / reversa'], ['left', 'Izquierda'], ['right', 'Derecha']];
const DEFAULT_KEYS = PLAYER_DEFS.map(d => Object.assign({}, d.keys));
const KEYS_STORE = 'vr-keys';

// nombre legible de una tecla
function keyName(code) {
  if (!code) return '—';
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (arrows[code]) return arrows[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6).replace('Add', '+').replace('Subtract', '-').replace('Multiply', '*').replace('Divide', '/').replace('Decimal', '.').replace('Enter', 'Enter');
  const names = { Space: 'Espacio', ShiftLeft: 'Shift izq.', ShiftRight: 'Shift der.', ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.',
    AltLeft: 'Alt izq.', AltRight: 'Alt der.', MetaLeft: 'Cmd izq.', MetaRight: 'Cmd der.', Enter: 'Enter', Tab: 'Tab', Backspace: 'Borrar',
    Semicolon: 'Ñ', Comma: ',', Period: '.', Slash: '-', Quote: '´', BracketLeft: '`', BracketRight: '+', Backslash: 'Ç', Minus: "'", Equal: '¡' };
  return names[code] || code;
}
// las 4 teclas de un jugador, para mostrar
function keysLabel(def) {
  const k = def.keys;
  return `${keyName(k.up)} ${keyName(k.left)} ${keyName(k.down)} ${keyName(k.right)}`;
}

const Input = {
  down: new Set(),
  pressed: new Set(),

  // teclas personalizadas guardadas en el navegador
  loadKeys() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEYS_STORE) || 'null');
      if (Array.isArray(saved)) saved.forEach((k, i) => { if (PLAYER_DEFS[i] && k) Object.assign(PLAYER_DEFS[i].keys, k); });
    } catch (e) { /* sin almacenamiento: quedan las teclas de fábrica */ }
  },
  saveKeys() {
    try { localStorage.setItem(KEYS_STORE, JSON.stringify(PLAYER_DEFS.map(d => d.keys))); } catch (e) { /* sin almacenamiento */ }
  },
  resetKeys() {
    PLAYER_DEFS.forEach((d, i) => Object.assign(d.keys, DEFAULT_KEYS[i]));
    this.saveKeys();
  },
  // asigna una tecla; si ya la usaba otra acción (de cualquier jugador), se intercambian
  setKey(player, action, code) {
    const prev = PLAYER_DEFS[player].keys[action];
    for (const d of PLAYER_DEFS) for (const [a] of KEY_ACTIONS) if (d.keys[a] === code) d.keys[a] = prev;
    PLAYER_DEFS[player].keys[action] = code;
    this.saveKeys();
  },

  init() {
    this.loadKeys();
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', e => {
      // que las teclas del juego no muevan la página
      const used = PLAYER_DEFS.some(d => Object.values(d.keys).includes(e.code));
      if (block.has(e.code) || e.code.startsWith('Numpad') || used || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  },

  isDown(code) { return this.down.has(code); },
  wasPressed(...codes) { return codes.some(c => this.pressed.has(c)); },
  endFrame() { this.pressed.clear(); },

  // modo en red: un solo jugador por compu, sirven las teclas de J1 o de J2
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
