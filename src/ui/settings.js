// Einstellungsmenü (oben rechts): Lautstärken, Ton, Vollbild, Grafik
// Bedienung komplett per Tastatur: O öffnen/schließen, ↑/↓ Auswahl, ←/→ ändern, Esc schließen
import { QUALITY } from '../config.js';

const $ = (id) => document.getElementById(id);

export class Settings {
  constructor(audio, { onOpenChange } = {}) {
    this.audio = audio;
    this.onOpenChange = onOpenChange;
    this.open = false;
    this.sel = 0;
    this.btn = $('settings-btn');
    this.panel = $('settings');
    this.list = $('settings-list');

    const vol = (key, label) => ({
      label, kind: 'range',
      get: () => audio.settings[key],
      change: (d) => audio.setVolume(key, Math.round((audio.settings[key] + d * 0.1) * 10) / 10),
      set: (v) => audio.setVolume(key, v),
    });
    this.items = [
      vol('music', 'Musik'),
      vol('sfx', 'Effekte'),
      vol('engine', 'Motor'),
      { label: 'Ton', kind: 'toggle', get: () => !audio.muted, change: () => audio.toggleMute(), on: 'An', off: 'Aus' },
      {
        label: 'Vollbild', kind: 'toggle', get: () => !!document.fullscreenElement,
        change: () => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
          else document.exitFullscreen?.();
          setTimeout(() => this.render(), 200);
        },
        on: 'An', off: 'Aus',
      },
      {
        label: 'Grafik', kind: 'toggle', get: () => QUALITY === 'high',
        change: () => {
          const u = new URL(location.href);
          if (QUALITY === 'high') u.searchParams.set('q', 'low'); else u.searchParams.delete('q');
          location.href = u.toString();
        },
        on: 'Hoch', off: 'Schnell',
      },
    ];

    this.btn.addEventListener('click', () => this.toggle());
    $('settings-close').addEventListener('click', () => this.setOpen(false));
    this.list.addEventListener('click', (e) => {
      const row = e.target.closest('[data-i]');
      if (!row) return;
      this.sel = Number(row.dataset.i);
      const it = this.items[this.sel];
      if (it.kind === 'toggle') it.change(1);
      else if (e.target.closest('.bar')) {
        const r = e.target.closest('.bar').getBoundingClientRect();
        it.set(Math.round(((e.clientX - r.left) / r.width) * 10) / 10);
      }
      this.render();
    });
    document.addEventListener('fullscreenchange', () => this.render());
    this.render();
  }

  toggle() { this.setOpen(!this.open); }
  setOpen(v) {
    this.open = v;
    this.panel.classList.toggle('hidden', !v);
    this.btn.classList.toggle('active', v);
    this.render();
    this.onOpenChange?.(v);
  }

  // true = Taste wurde vom Menü verbraucht
  handleKey(e) {
    if (e.target?.matches?.('input')) return false;
    if (e.code === 'KeyO') { this.audio.init(); this.toggle(); return true; }
    if (!this.open) return false;
    const it = this.items[this.sel];
    switch (e.code) {
      case 'Escape': this.setOpen(false); break;
      case 'ArrowUp': case 'KeyW': this.sel = (this.sel + this.items.length - 1) % this.items.length; break;
      case 'ArrowDown': case 'KeyS': case 'Tab': this.sel = (this.sel + 1) % this.items.length; e.preventDefault(); break;
      case 'ArrowLeft': case 'KeyA': it.change(-1); break;
      case 'ArrowRight': case 'KeyD': it.change(1); break;
      case 'Enter': case 'NumpadEnter': case 'Space': if (it.kind === 'toggle') it.change(1); break;
      default: return true; // alle anderen Tasten bei offenem Menü schlucken
    }
    this.audio.key?.();
    this.render();
    return true;
  }

  render() {
    this.list.innerHTML = this.items.map((it, i) => {
      const v = it.get();
      const ctrl = it.kind === 'range'
        ? `<span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span><b class="val">${Math.round(v * 100)}</b>`
        : `<span class="pill ${v ? 'on' : ''}">${v ? it.on : it.off}</span>`;
      return `<li data-i="${i}" class="${i === this.sel ? 'sel' : ''}"><span class="lbl">${it.label}</span>${ctrl}</li>`;
    }).join('');
  }
}
