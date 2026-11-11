// Tastatursteuerung
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // Flanken für diesen Frame
    this.listeners = [];
    this.lastActivity = performance.now();
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k) && !e.target.matches?.('input')) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.lastActivity = performance.now();
      for (const l of this.listeners) l(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  onKey(fn) { this.listeners.push(fn); }
  get state() {
    const k = this.keys;
    return {
      up: k.has('KeyW') || k.has('ArrowUp'),
      down: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      brake: k.has('Space'),
    };
  }
  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }
  endFrame() { this.pressed.clear(); }
}
