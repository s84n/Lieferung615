// HUD: Punkte, Timer, Aufträge, Ladefläche, Power-Ups, Minimap, Zielpfeil, Einblendungen
import * as THREE from 'three';
import { N, CAPACITY } from '../config.js';
import { T, WORLD, EDGES, SIZES } from '../world/map.js';

const $ = (id) => document.getElementById(id);
const SHORT = (name) => name.replace('G&R ', '');

export class HUD {
  constructor(map, thumbs) {
    this.map = map;
    this.thumbs = thumbs;
    this.el = $('hud');
    this.scoreEl = $('score');
    this.comboEl = $('combo');
    this.timerEl = $('timer');
    this.timerPanel = $('timer-panel');
    this.ordersEl = $('orders');
    this.cargoEl = $('cargo');
    this.puEl = $('powerups');
    this.speedEl = $('speed');
    this.gearEl = $('gear');
    this.rpmEl = $('rpm-bar');
    this.arrow = $('nav-arrow');
    this.toastEl = $('toast');
    this.fx = $('fx-layer');
    this.floats = [];
    this.orderEls = new Map();
    this.lastScore = -1;
    this.lastTime = '';
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.buildMinimapBase();
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  setScore(s) {
    if (s === this.lastScore) return;
    this.lastScore = s;
    this.scoreEl.textContent = s.toLocaleString('de-DE');
    this.scoreEl.classList.remove('score-bump');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('score-bump');
  }
  setCombo(mult) {
    if (mult > 1) { this.comboEl.textContent = `×${mult.toLocaleString('de-DE')}`; this.comboEl.classList.add('on'); }
    else this.comboEl.classList.remove('on');
  }
  setTime(t) {
    const s = Math.max(0, Math.ceil(t));
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (txt !== this.lastTime) { this.timerEl.textContent = txt; this.lastTime = txt; }
    this.timerPanel.classList.toggle('urgent', t <= 10 && t > 0);
  }
  timePlus() {
    this.timerPanel.classList.remove('plus');
    void this.timerPanel.offsetWidth;
    this.timerPanel.classList.add('plus');
  }
  setSpeed(v, gear, rpm = 700) {
    this.speedEl.textContent = Math.round(Math.abs(v) * 4.2);
    this.rpmEl.style.clipPath = `inset(0 ${(100 - Math.min(100, (rpm / 2600) * 100)).toFixed(1)}% 0 0 round 4px)`;
    if (gear !== undefined && this.gearEl.textContent !== String(gear)) {
      this.gearEl.textContent = gear;
      this.gearEl.classList.remove('shift'); void this.gearEl.offsetWidth; this.gearEl.classList.add('shift');
    }
  }

  setOrders(orders) {
    this.ordersEl.classList.toggle('many', orders.length > 4);
    const seen = new Set();
    for (const o of orders) {
      seen.add(o.id);
      let el = this.orderEls.get(o.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'order';
        const tags = `${o.product.size > 1 ? '<span class="tag bulky">2 Plätze</span>' : ''}${o.product.fragile ? '<span class="tag fragile">zerbrechlich</span>' : ''}`;
        el.innerHTML = `<img src="${this.thumbs[o.product.id]}" alt=""><div class="txt"><div class="prod">${o.product.name}${tags}</div><div class="route"></div></div><div class="state"></div><div class="urgent-time"></div>`;
        this.ordersEl.appendChild(el);
        this.orderEls.set(o.id, el);
      }
      const loaded = o.state === 'loaded';
      el.classList.toggle('loaded', loaded);
      el.classList.toggle('urgent', !!o.urgent);
      el.querySelector('.route').innerHTML = loaded
        ? `an <b>${o.customer.name}</b>`
        : `${SHORT(o.warehouse.name)} → <b>${o.customer.name}</b>`;
      el.querySelector('.state').textContent = o.urgent ? '🚨' : loaded ? '🚚' : '📦';
    }
    for (const [id, el] of this.orderEls) {
      if (!seen.has(id)) {
        el.style.opacity = '0';
        el.style.transform = 'translateX(60px)';
        setTimeout(() => el.remove(), 300);
        this.orderEls.delete(id);
      }
    }
  }
  // Restzeit der Notfälle
  updateOrderTimers(orders, now) {
    for (const o of orders) {
      if (!o.urgent) continue;
      const el = this.orderEls.get(o.id);
      if (!el) continue;
      const left = Math.max(0, Math.ceil(o.deadline - now));
      const t = el.querySelector('.urgent-time');
      const txt = `${left}s`;
      if (t.textContent !== txt) { t.textContent = txt; el.classList.toggle('hurry', left <= 15); }
    }
  }
  clearOrders() {
    this.ordersEl.innerHTML = '';
    this.orderEls.clear();
  }

  setCargo(cargo) {
    const key = cargo.map((o) => `${o.id}:${Math.round(o.condition * 20)}:${o.urgent ? 1 : 0}`).join(',');
    if (key === this.cargoKey) return;
    this.cargoKey = key;
    this.cargoEl.innerHTML = '';
    let used = 0;
    for (const o of cargo) {
      const d = document.createElement('div');
      d.className = `slot filled${o.product.size > 1 ? ' wide' : ''}${o.urgent ? ' urgent' : ''}`;
      const cond = o.product.fragile
        ? `<div class="cond" title="Zustand"><i style="width:${Math.round(o.condition * 100)}%;background:${o.condition > 0.66 ? 'var(--green)' : o.condition > 0.33 ? 'var(--gold)' : 'var(--red)'}"></i></div>`
        : '';
      d.innerHTML = `<img src="${this.thumbs[o.product.id]}" alt="">${cond}<div class="dest">${o.customer.name}</div>`;
      this.cargoEl.appendChild(d);
      used += o.product.size;
    }
    for (let i = used; i < CAPACITY; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      this.cargoEl.appendChild(d);
    }
  }

  setPowerups(list) {
    const key = list.map((p) => p.id).join(',');
    if (key !== this.puKey) {
      this.puKey = key;
      this.puEl.innerHTML = list.map((p) => `<div class="pu" data-id="${p.id}"><span class="ico">${p.icon}</span>${p.name}<div class="bar"></div></div>`).join('');
    }
    for (const p of list) {
      const bar = this.puEl.querySelector(`[data-id="${p.id}"] .bar`);
      if (bar) bar.style.width = `${(p.left / p.total) * 100}%`;
    }
  }

  toast(text, cls = '', dur = 1600) {
    const t = this.toastEl;
    t.textContent = text;
    t.className = 'on ' + cls;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.className = cls; }, dur);
  }

  float(worldPos, html, cls = 'plus') {
    const d = document.createElement('div');
    d.className = 'float ' + cls;
    d.innerHTML = html;
    this.fx.appendChild(d);
    const f = { el: d, pos: worldPos.clone(), life: 1.4 };
    this.floats.push(f);
  }

  updateFloats(dt, camera) {
    const v = new THREE.Vector3();
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) { f.el.remove(); this.floats.splice(i, 1); continue; }
      v.copy(f.pos).project(camera);
      f.el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
      f.el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
  }
  clearFloats() { for (const f of this.floats) f.el.remove(); this.floats = []; }

  // Zielmarker für alle offenen Ziele: über dem Ziel oder am Bildschirmrand mit Richtungspfeil
  updateMarkers(zones, camera, truck, main) {
    this.marks ??= new Map();
    const live = new Set();
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    const now = performance.now();
    // freier Bereich; Marker am Rand weichen den HUD-Panels aus
    const L = 64, R = w - 64, T = 110, B = h - 96;
    const pad = 46;
    const rects = ['.hud-bl', '.hud-br', '.hud-tr', '.orders', '.score-panel', '.hud-timer']
      .map((sel) => this.el.querySelector(sel)?.getBoundingClientRect()).filter((r) => r && r.width);
    for (const z of zones) {
      if (!z.mesh.visible) continue;
      live.add(z);
      let m = this.marks.get(z);
      const pickup = z.spot.kind === 'warehouse';
      if (!m) {
        const el = document.createElement('div');
        el.className = `tmark ${pickup ? 'gold' : 'green'}`;
        el.innerHTML = `<div class="tm-arrow"></div><div class="tm-body"><div class="tm-icons"></div><div class="tm-text"><b>${pickup ? 'Abholen' : 'Liefern'}</b><span class="tm-name"></span><span class="tm-dist"></span></div></div>`;
        this.el.appendChild(el);
        m = { el, icons: el.querySelector('.tm-icons'), name: el.querySelector('.tm-name'), dist: el.querySelector('.tm-dist'), arrow: el.querySelector('.tm-arrow'), ids: null };
        this.marks.set(z, m);
      }
      if (m.ids !== z.activeIds) {
        m.ids = z.activeIds;
        m.icons.innerHTML = (z.activeIds || '').split(',').filter(Boolean).slice(0, 3).map((id) => `<img src="${this.thumbs[id]}" alt="">`).join('');
        m.name.textContent = SHORT(z.spot.name);
      }
      const d = Math.hypot(z.spot.x - truck.pos.x, z.spot.z - truck.pos.y) * 1.2;
      m.dist.textContent = d < 15 ? 'hier' : `${Math.round(d / 10) * 10} m`;
      v.set(z.spot.x, 7.5, z.spot.z).project(camera);
      let sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const inside = sx > L && sx < R && sy > T && sy < B;
      let ang = 0;
      if (inside) {
        sy += Math.sin(now / 220 + z.spot.x) * 5;
      } else {
        const cx = w / 2, cy = h / 2;
        const dx = sx - cx, dy = sy - cy;
        const s = Math.min((R - cx) / Math.abs(dx || 1e-5), (B - cy) / Math.abs(dy || 1e-5));
        sx = cx + dx * s; sy = cy + dy * s;
        ang = Math.atan2(dy, dx) * 180 / Math.PI - 90;
      }
      // HUD-Panels ausweichen: nächste Position, die frei von allen Panels ist
      const hit = (x, y) => rects.find((r) => x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad);
      const r0 = hit(sx, sy);
      if (r0) {
        const cand = [];
        for (const r of rects) {
          cand.push({ x: sx, y: r.top - pad }, { x: sx, y: r.bottom + pad }, { x: r.left - pad, y: sy }, { x: r.right + pad, y: sy });
        }
        let best = null, bd = Infinity;
        for (const o of cand) {
          o.x = Math.min(R, Math.max(L, o.x)); o.y = Math.min(B, Math.max(T - 40, o.y));
          if (hit(o.x, o.y)) continue;
          const d = Math.hypot(o.x - sx, o.y - sy);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) { sx = best.x; sy = best.y; }
      }
      m.el.classList.toggle('edge', !inside);
      m.el.classList.toggle('main', z === main);
      m.el.classList.toggle('urgent', !!z.urgent);
      m.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      // am Rand: Pfeil um den Marker herum nach außen schieben
      const off = 22 + Math.abs(Math.sin((ang * Math.PI) / 180)) * 30;
      m.arrow.style.transform = inside ? '' : `rotate(${ang.toFixed(1)}deg) translateY(${off.toFixed(0)}px)`;
    }
    for (const [z, m] of this.marks) if (!live.has(z)) { m.el.remove(); this.marks.delete(z); }
  }
  clearMarkers() { if (this.marks) { for (const m of this.marks.values()) m.el.remove(); this.marks.clear(); } }

  // Pfeil am Bildschirmrand zum nächsten Ziel
  updateArrow(target, camera, color) {
    if (!target) { this.arrow.classList.remove('on'); return; }
    const v = new THREE.Vector3(target.x, 1, target.z).project(camera);
    const w = window.innerWidth, h = window.innerHeight;
    let sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
    const margin = 70;
    const inside = sx > margin && sx < w - margin && sy > margin + 60 && sy < h - margin;
    if (inside) {
      // über dem Ziel hüpfen
      const bob = Math.sin(performance.now() / 180) * 8;
      this.arrow.style.transform = `translate(${sx - 23}px, ${sy - 120 + bob}px) rotate(180deg)`;
    } else {
      const cx = w / 2, cy = h / 2;
      const dx = sx - cx, dy = sy - cy;
      const s = Math.min((w / 2 - margin) / Math.abs(dx || 1e-5), (h / 2 - margin) / Math.abs(dy || 1e-5));
      sx = cx + dx * s; sy = cy + dy * s;
      const ang = Math.atan2(dy, dx) + Math.PI / 2;
      this.arrow.style.transform = `translate(${sx - 23}px, ${sy - 23}px) rotate(${ang}rad)`;
    }
    this.arrow.classList.add('on');
    this.arrow.classList.toggle('green', color === 'green');
  }

  // ---------------- Minimap ----------------
  buildMinimapBase() {
    const ppu = 6; // Pixel pro Welteinheit
    const size = WORLD;
    const o = WORLD / 2; // Weltkoordinate -> Canvas
    const X = (i) => (EDGES[i] + o) * ppu;
    const S = (i0, n) => SIZES.slice(i0, i0 + n).reduce((a, b) => a + b, 0) * ppu;
    const c = document.createElement('canvas');
    c.width = c.height = size * ppu;
    const g = c.getContext('2d');
    g.fillStyle = '#e8e2d6';
    g.fillRect(0, 0, c.width, c.height);
    const tp = 4 * ppu;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const t = this.map.get(x, z);
      if (t === T.ROAD || t === T.DRIVE) {
        g.fillStyle = t === T.ROAD ? '#5b636c' : '#7b838c';
        g.fillRect(X(x) - 0.5, X(z) - 0.5, SIZES[x] * ppu + 1, SIZES[z] * ppu + 1);
      }
    }
    for (const b of this.map.blocks) {
      const bx = X(b.x0), bz = X(b.z0), bs = S(b.x0, b.size);
      if (b.role === 'park') { g.fillStyle = '#9ccc6f'; g.fillRect(bx + 4, bz + 4, bs - 8, bs - 8); }
      if (b.role === 'warehouse') {
        g.fillStyle = '#b5002f';
        g.fillRect(bx + 6, bz + 6, bs - 12, bs - 12);
        g.fillStyle = '#fff';
        g.font = `900 ${tp * 0.9}px "Exo 2", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('G&R', bx + bs / 2, bz + bs / 2);
      }
    }
    this.miniBase = c;
    this.ppu = ppu;
  }

  drawMinimap(truck, zones, waitingDest, cars, powerups, blockedIdx, navPath, time) {
    const g = this.mctx;
    const W = this.mini.width;
    const scale = W / 80; // ~80 Welteinheiten Durchmesser
    const half = WORLD / 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#6f9a4f';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.rotate(Math.PI / 4);
    g.scale(scale, scale);
    g.translate(-truck.pos.x, -truck.pos.y);
    g.drawImage(this.miniBase, -half, -half, half * 2, half * 2);
    // Sperren
    g.fillStyle = '#ff3b3b';
    for (const idx of blockedIdx) {
      const c = this.map.tileCenter(idx % N, Math.floor(idx / N));
      const h = this.map.tileHalf(idx % N, Math.floor(idx / N));
      g.fillRect(c.x - h.x * 0.8, c.z - h.z * 0.8, h.x * 1.6, h.z * 1.6);
    }
    // Navi-Pfad
    if (navPath && navPath.length > 1) {
      g.strokeStyle = '#2f8cff'; g.lineWidth = 1.4; g.lineJoin = 'round';
      g.beginPath();
      navPath.forEach((p, i) => { const c = this.map.tileCenter(p.x, p.z); i ? g.lineTo(c.x, c.z) : g.moveTo(c.x, c.z); });
      g.stroke();
    }
    // Wartende Ziele (gedimmt)
    g.strokeStyle = 'rgba(47,224,138,0.7)'; g.lineWidth = 0.8;
    for (const s of waitingDest) { g.beginPath(); g.arc(s.x, s.z, 1.8, 0, Math.PI * 2); g.stroke(); }
    // Autos
    g.fillStyle = '#ffffff';
    for (const c of cars) g.fillRect(c.pos.x - 0.6, c.pos.z - 0.6, 1.2, 1.2);
    // Power-Ups
    const puCol = { coffee: '#c47a3a', navi: '#2f8cff', clock: '#f5b800' };
    for (const p of powerups) { g.fillStyle = puCol[p.type]; g.beginPath(); g.arc(p.x, p.z, 1.3, 0, Math.PI * 2); g.fill(); }
    // Aktive Zonen
    const pulse = 2.4 + Math.sin(time * 5) * 0.6;
    for (const z of zones) {
      g.fillStyle = z.spot.kind === 'warehouse' ? '#f5b800' : '#2fe08a';
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.7;
      g.beginPath(); g.arc(z.spot.x, z.spot.z, pulse, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // LKW
    const f = { x: Math.sin(truck.heading), z: Math.cos(truck.heading) };
    const r = { x: -f.z, z: f.x };
    const p = { x: truck.pos.x, z: truck.pos.y };
    g.fillStyle = '#b5002f'; g.strokeStyle = '#fff'; g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(p.x + f.x * 3, p.z + f.z * 3);
    g.lineTo(p.x - f.x * 2 + r.x * 2, p.z - f.z * 2 + r.z * 2);
    g.lineTo(p.x - f.x * 1, p.z - f.z * 1);
    g.lineTo(p.x - f.x * 2 - r.x * 2, p.z - f.z * 2 - r.z * 2);
    g.closePath(); g.fill(); g.stroke();
  }
}
