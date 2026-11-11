// Auftragssystem: Lager -> Ladefläche -> Kunde, inkl. Zonen-Visualisierung
import * as THREE from 'three';
import { ACTIVE_ORDERS, CAPACITY } from '../config.js';
import { PRODUCTS, makeProduct } from '../world/products.js';
import { beamTexture } from '../world/textures.js';
import { pick, clamp, mulberry32 } from '../util.js';

const ZONE_R = 1.9;          // sichtbarer Ring (passt in die 4-m-Spur)
const ZONE_DETECT = 2.6;     // Erkennungsradius
const STOP_TIME = 0.45;
const URGENT_TIME = 55;            // Sekunden für einen Notfallauftrag (Abholen + Liefern)
const DOCK_DOT = 0.75;             // Heck zum Gebäude: Fahrzeugfront zeigt zur Straße
const beamTex = beamTexture();

function makeZoneMesh(color) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.95 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ZONE_R - 0.15, 0.12, 8, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false });
  const fill = new THREE.Mesh(new THREE.CircleGeometry(ZONE_R - 0.2, 40), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.04;
  const prog = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.55, ZONE_R - 0.3, 48, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
  prog.rotation.x = -Math.PI / 2;
  prog.position.y = 0.1;
  const beamMat = new THREE.MeshBasicMaterial({ color, map: beamTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(ZONE_R - 0.3, ZONE_R - 0.15, 7, 32, 1, true), beamMat);
  beam.position.y = 3.5;
  // hohe, schmale Lichtsäule: auch über Dächer hinweg sichtbar
  const shaftMat = new THREE.MeshBasicMaterial({ color, map: beamTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 34, 16, 1, true), shaftMat);
  shaft.position.y = 17;
  const iconHolder = new THREE.Group();
  iconHolder.position.y = 4.2;
  g.add(fill, ring, prog, beam, shaft, iconHolder);
  g.userData = { ring, fill, prog, beam, shaft, iconHolder, ringMat };
  g.visible = false;
  return g;
}

export class Orders {
  constructor(map, scene, thumbs, hooks) {
    this.map = map;
    this.scene = scene;
    this.thumbs = thumbs;
    this.hooks = hooks; // {onLoad, onDeliver, onFull, onFly}
    this.zones = [];
    this.flying = [];
    const spriteTex = {};
    for (const p of PRODUCTS) {
      const t = new THREE.TextureLoader().load(thumbs[p.id]);
      t.colorSpace = THREE.SRGBColorSpace;
      spriteTex[p.id] = t;
    }
    this.spriteTex = spriteTex;
    for (const w of map.warehouses) this.zones.push(this.createZone(w, '#f5b800'));
    for (const c of map.customers) this.zones.push(this.createZone(c, '#2fe08a'));
  }

  createZone(spot, color) {
    const mesh = makeZoneMesh(color);
    mesh.position.set(spot.x, 0, spot.z);
    this.scene.add(mesh);
    const z = { spot, mesh, timer: 0, color };
    spot.zone = z;
    return z;
  }

  // seed: gleiche Auftragsfolge für alle Spieler (faire Bestenliste)
  reset(seed = 615) {
    this.rng = mulberry32(seed);
    this.now = 0;
    this.active = [];
    this.cargo = [];
    this.delivered = 0;
    this.nextId = 1;
    this.urgentTimer = 32;
    for (const f of this.flying) this.scene.remove(f.obj);
    this.flying = [];
    for (let i = 0; i < ACTIVE_ORDERS; i++) this.spawn();
    this.refreshZones();
  }

  spawn(urgent = false) {
    const usedCustomers = new Set(this.active.map((o) => o.customer.id));
    const free = this.map.customers.filter((c) => !usedCustomers.has(c.id));
    if (!free.length) return null;
    const customer = pick(free, this.rng);
    const warehouse = pick(this.map.warehouses, this.rng);
    const product = pick(PRODUCTS, this.rng);
    const dist = Math.abs(warehouse.x - customer.x) + Math.abs(warehouse.z - customer.z);
    const o = { id: this.nextId++, product, warehouse, customer, state: 'waiting', loadedAt: 0, dist, isNew: true, born: performance.now(), condition: 1, urgent };
    if (urgent) o.deadline = this.now + URGENT_TIME;
    this.active.push(o);
    return o;
  }

  slotsUsed() { return this.cargo.reduce((n, o) => n + o.product.size, 0); }

  // Rempler: zerbrechliche Ware an Bord nimmt Schaden; liefert die beschädigten Aufträge
  damage(strength) {
    const hit = [];
    for (const o of this.cargo) {
      if (!o.product.fragile || o.condition <= 0) continue;
      const loss = clamp(0.08 + strength * 0.03, 0.1, 0.45);
      o.condition = Math.max(0, o.condition - loss);
      hit.push(o);
    }
    return hit;
  }

  // steht der LKW rückwärts an der Zone (Front zeigt zur Straße)?
  isDocked(zone, truck) {
    const f = truck.forward;
    return f.x * zone.spot.nx + f.y * zone.spot.nz > DOCK_DOT;
  }

  // Sprite über der Zone setzen (Produkte als Bild)
  setIcons(zone, productIds) {
    const h = zone.mesh.userData.iconHolder;
    while (h.children.length) h.remove(h.children[0]);
    productIds.slice(0, 3).forEach((id, i, arr) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.spriteTex[id], depthWrite: false, depthTest: false }));
      s.renderOrder = 10;
      s.scale.set(2.4, 2.4, 1);
      s.position.x = (i - (arr.length - 1) / 2) * 2.0;
      s.position.y = i % 2 ? 0.4 : 0;
      h.add(s);
    });
  }

  refreshZones() {
    for (const z of this.zones) {
      let ids = [];
      let list;
      if (z.spot.kind === 'warehouse') list = this.active.filter((o) => o.state === 'waiting' && o.warehouse === z.spot);
      else list = this.cargo.filter((o) => o.customer === z.spot);
      ids = list.map((o) => o.product.id);
      z.urgent = list.some((o) => o.urgent);
      z.mesh.visible = ids.length > 0;
      z.activeIds = ids.join(',');
      this.setIcons(z, ids);
    }
  }

  // Ziele für Navigation: offene Zonen
  targets() {
    return this.zones.filter((z) => z.mesh.visible);
  }

  update(dt, time, truck) {
    const speed = Math.abs(truck.speed);
    this.now = time;
    if (dt > 0 && this.active) this.updateUrgent(dt, time);
    for (const z of this.zones) {
      if (!z.mesh.visible) { z.timer = 0; continue; }
      const ud = z.mesh.userData;
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ud.ringMat.emissiveIntensity = 0.6 + pulse * 0.6;
      ud.iconHolder.position.y = 4.4 + Math.sin(time * 2.5) * 0.25;
      ud.beam.material.opacity = 0.22 + pulse * 0.16;
      ud.shaft.material.opacity = 0.16 + pulse * 0.1;
      const d = Math.hypot(truck.pos.x - z.spot.x, truck.pos.y - z.spot.z);
      if (d < ZONE_DETECT && speed < 4.5) {
        z.timer += dt;
        if (z.timer >= STOP_TIME) {
          z.timer = -1.2; // kurze Sperre nach Aktion
          if (z.spot.kind === 'warehouse') this.load(z, truck, time);
          else this.deliver(z, truck, time);
        }
      } else if (z.timer > 0) z.timer = Math.max(0, z.timer - dt * 2);
      else if (z.timer < 0) z.timer = Math.min(0, z.timer + dt);
      const p = Math.round(clamp(z.timer / STOP_TIME, 0, 1) * 40) / 40;
      if (p === z.lastP) continue;
      z.lastP = p;
      ud.prog.geometry.dispose();
      ud.prog.geometry = new THREE.RingGeometry(ZONE_R - 0.55, ZONE_R - 0.3, 48, 1, 0, Math.max(0.001, p * Math.PI * 2));
    }
    // fliegende Produkte
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / f.dur;
      f.obj.visible = f.t >= 0;
      const t = clamp(f.t, 0, 1);
      const from = typeof f.from === 'function' ? f.from() : f.from;
      const to = typeof f.to === 'function' ? f.to() : f.to;
      f.obj.position.set(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * 3,
        from.z + (to.z - from.z) * t,
      );
      f.obj.rotation.y += dt * 6;
      const s = f.shrink ? 1 - t * 0.6 : 0.4 + t * 0.6;
      f.obj.scale.setScalar(s * 1.3);
      if (t >= 1) { this.scene.remove(f.obj); this.flying.splice(i, 1); }
    }
  }

  // Notfälle einstreuen und abgelaufene entfernen
  updateUrgent(dt, time) {
    this.urgentTimer -= dt;
    if (this.urgentTimer <= 0 && !this.active.some((o) => o.urgent)) {
      this.urgentTimer = 38 + this.rng() * 18;
      const o = this.spawn(true);
      if (o) { this.refreshZones(); this.hooks.onUrgent?.(o); }
    }
    let changed = false;
    for (const o of [...this.active]) {
      if (!o.urgent || time < o.deadline) continue;
      changed = true;
      if (o.state === 'waiting') {
        this.active = this.active.filter((x) => x !== o);
        this.hooks.onUrgentFail?.(o, false);
      } else {
        o.urgent = false; // schon geladen: wird zum normalen Auftrag
        this.hooks.onUrgentFail?.(o, true);
      }
    }
    if (changed) {
      while (this.active.filter((o) => !o.urgent).length < ACTIVE_ORDERS && this.spawn()) { /* auffüllen */ }
      this.refreshZones();
      this.hooks.onNew?.();
    }
  }

  fly(productId, from, to, delay, shrink) {
    const obj = makeProduct(productId);
    obj.visible = false;
    this.scene.add(obj);
    this.flying.push({ obj, from, to, t: -delay / 0.7, dur: 0.7, shrink });
  }

  load(zone, truck, time) {
    // Notfälle zuerst, dann die übrigen; sperrige Teile brauchen 2 Plätze
    const waiting = this.active.filter((o) => o.state === 'waiting' && o.warehouse === zone.spot)
      .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
    let n = 0, full = false;
    const truckPos = () => ({ x: truck.pos.x, y: 1.5, z: truck.pos.y });
    for (const o of waiting) {
      if (this.slotsUsed() + o.product.size > CAPACITY) { full = true; continue; }
      o.state = 'loaded';
      o.loadedAt = time;
      o.isNew = false;
      this.cargo.push(o);
      this.fly(o.product.id, { x: zone.spot.x - zone.spot.nx * 4.2, y: 1.2, z: zone.spot.z - zone.spot.nz * 4.2 }, truckPos, n * 0.18, true);
      n++;
    }
    if (full) this.hooks.onFull?.();
    if (n) this.hooks.onLoad?.(n, zone.spot, this.isDocked(zone, truck));
    this.refreshZones();
  }

  deliver(zone, truck, time) {
    const drop = this.cargo.filter((o) => o.customer === zone.spot);
    if (!drop.length) return;
    this.cargo = this.cargo.filter((o) => o.customer !== zone.spot);
    let n = 0;
    const docked = this.isDocked(zone, truck);
    for (const o of drop) {
      o.state = 'done';
      const elapsed = time - o.loadedAt;
      const expected = 5 + o.dist / 9;
      const bonus = Math.round(clamp(1 - (elapsed - expected) / (expected * 1.4), 0, 1) * 100);
      this.fly(o.product.id, { x: truck.pos.x, y: 1.5, z: truck.pos.y }, { x: zone.spot.x - zone.spot.nx * 3.4, y: 0.5, z: zone.spot.z - zone.spot.nz * 3.4 }, n * 0.18, false);
      this.hooks.onDeliver?.(o, bonus, zone.spot, docked && n === 0);
      this.delivered++;
      n++;
    }
    this.active = this.active.filter((o) => o.state !== 'done');
    setTimeout(() => {
      if (!this.active) return;
      while (this.active.filter((o) => !o.urgent).length < ACTIVE_ORDERS && this.spawn()) { /* auffüllen */ }
      this.refreshZones();
      this.hooks.onNew?.();
    }, 700);
    this.refreshZones();
  }
}
