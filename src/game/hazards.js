// Straßensperren, Leitkegel und Power-Ups
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { N, MAX_CLOCKS, TILE, ROAD_W } from '../config.js';
import { NODES, T } from '../world/map.js';
import { pick, mulberry32 } from '../util.js';
import { mergeByMaterial } from '../world/builder.js';

const shadow = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

// ---------- Straßensperre ----------
const RS = ROAD_W / TILE;
function buildBarrier(horizontal) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#d7263d', roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5 });
  const foot = new THREE.MeshStandardMaterial({ color: '#30353b', roughness: 0.8 });
  for (const off of [-0.9, 0.9]) {
    const bar = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.66 * RS, 0.28, 0.08), i % 2 ? white : red);
      seg.position.set((-1.65 + i * 0.66) * RS, 0.8, 0);
      bar.add(seg);
    }
    for (const x of [-1.7 * RS, 1.7 * RS]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), white);
      leg.position.set(x, 0.4, 0);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.6), foot);
      f.position.set(x, 0.05, 0);
      bar.add(leg, f);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffcc00', emissive: '#ffaa00', emissiveIntensity: 2 }));
    lamp.position.set(-1.7 * RS, 1.05, 0);
    lamp.userData.blink = true;
    bar.add(lamp);
    bar.position.z = off;
    g.add(bar);
  }
  // Schild
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.42, 3), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  const border = new THREE.Mesh(new THREE.CircleGeometry(0.52, 3), red);
  sign.position.set(0, 1.55, 0.05); border.position.set(0, 1.55, 0.04);
  sign.rotation.z = border.rotation.z = Math.PI / 2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), foot);
  post.position.set(0, 1.0, 0);
  g.add(sign, border, post);
  shadow(g);
  mergeByMaterial(g, (o) => o.userData.blink); // 25 -> 6 Draw-Calls, Blinklampen bleiben einzeln
  if (horizontal) g.rotation.y = Math.PI / 2;
  return g;
}

// ---------- Leitkegel ----------
const coneGeo = new THREE.ConeGeometry(0.28, 0.75, 14);
const coneMat = new THREE.MeshStandardMaterial({ color: '#ff6a13', roughness: 0.5 });
const stripeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
function buildCone() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(coneGeo, coneMat);
  c.position.y = 0.4;
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.12, 14), stripeMat);
  s.position.y = 0.5;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), coneMat);
  base.position.y = 0.03;
  g.add(c, s, base);
  return mergeByMaterial(shadow(g));
}

// ---------- Power-Ups ----------
const PU_TYPES = {
  coffee: { name: 'Kaffee-Boost', color: '#c47a3a' },
  navi: { name: 'Navi', color: '#2f8cff' },
  clock: { name: '+10 Sekunden', color: '#f5b800' },
};
function buildPowerup(type) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 1.3;
  g.add(inner);
  if (type === 'coffee') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.7, 20), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 20), new THREE.MeshStandardMaterial({ color: '#5a3216', roughness: 0.2 }));
    coffee.position.y = 0.33;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.2, 20), new THREE.MeshStandardMaterial({ color: '#b5002f' }));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 16), cup.material);
    handle.position.x = 0.44;
    inner.add(cup, coffee, band, handle);
  } else if (type === 'navi') {
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.8, 1.1, 0.14, 2, 0.08), new THREE.MeshStandardMaterial({ color: '#1f2933', roughness: 0.4 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.9), new THREE.MeshStandardMaterial({ color: '#2f8cff', emissive: '#2f8cff', emissiveIntensity: 1.2 }));
    screen.position.z = 0.08;
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.32); arrowShape.lineTo(0.22, 0); arrowShape.lineTo(0.08, 0); arrowShape.lineTo(0.08, -0.3);
    arrowShape.lineTo(-0.08, -0.3); arrowShape.lineTo(-0.08, 0); arrowShape.lineTo(-0.22, 0); arrowShape.lineTo(0, 0.32);
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    arrow.position.z = 0.09;
    inner.add(body, screen, arrow);
  } else {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 28), new THREE.MeshStandardMaterial({ color: '#f5b800', metalness: 0.6, roughness: 0.25 }));
    disc.rotation.x = Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.45, 28), new THREE.MeshStandardMaterial({ color: '#fffaf0' }));
    face.position.z = 0.09;
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), new THREE.MeshBasicMaterial({ color: '#222' }));
    h1.position.set(0, 0.13, 0.1);
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.02), h1.material);
    h2.position.set(0.1, 0, 0.1);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), disc.material);
    knob.position.y = 0.62;
    inner.add(disc, face, h1, h2, knob);
  }
  const col = new THREE.Color(PU_TYPES[type].color);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 32), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.5 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  g.add(ring, glow);
  g.userData.inner = inner;
  return shadow(g);
}

export class Hazards {
  constructor(map, scene, traffic, hooks) {
    this.map = map; this.scene = scene; this.traffic = traffic; this.hooks = hooks;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.barriers = [];
    this.cones = [];
    this.powerups = [];
  }

  // seed: gleiche Sperren-/Power-Up-Folge für alle Spieler
  reset(truck, seed = 615) {
    this.rng = mulberry32(seed ^ 0x5f3759df);
    for (const b of this.barriers) this.group.remove(b.mesh);
    for (const c of this.cones) this.group.remove(c.mesh);
    for (const p of this.powerups) this.group.remove(p.mesh);
    this.barriers = []; this.cones = []; this.powerups = [];
    this.map.blocked.clear();
    this.traffic.blockedEdges.clear();
    this.barrierTimer = 25;
    this.puTimer = 2;
    this.clocks = 0;
    this.placeCones();
    for (let i = 0; i < 2; i++) this.addBarrier(truck);
    for (let i = 0; i < 2; i++) this.spawnPowerup(truck);
  }

  // --- Sperren ---
  addBarrier(truck) {
    const occupied = this.traffic.occupiedEdges();
    for (let tries = 0; tries < 60; tries++) {
      const i = Math.floor(this.rng() * NODES), j = Math.floor(this.rng() * NODES);
      const horiz = this.rng() < 0.5;
      const i2 = i + (horiz ? 1 : 0), j2 = j + (horiz ? 0 : 1);
      if (!this.map.nodeValid(i2, j2)) continue;
      const key = this.map.edgeKey(i, j, i2, j2);
      if (occupied.has(key) || this.traffic.blockedEdges.has(key)) continue;
      const tiles = this.map.edgeTiles(i, j, i2, j2);
      const tile = this.rng() < 0.5 ? tiles[1] : tiles[3];
      const c = this.map.tileCenter(tile.x, tile.z);
      if (truck && Math.hypot(c.x - truck.pos.x, c.z - truck.pos.y) < 22) continue;
      // Konnektivität des Knotengraphs prüfen
      this.traffic.blockedEdges.add(key);
      if (!this.graphConnected()) { this.traffic.blockedEdges.delete(key); continue; }
      const idx = tile.z * N + tile.x;
      this.map.blocked.add(idx);
      const mesh = buildBarrier(horiz);
      mesh.position.set(c.x, 0, c.z);
      mesh.scale.setScalar(0.01);
      this.group.add(mesh);
      this.barriers.push({ key, idx, mesh, age: 0, x: c.x, z: c.z });
      // Power-Ups auf dem Tile entfernen
      for (const p of [...this.powerups]) if (Math.hypot(p.x - c.x, p.z - c.z) < 3) this.removePowerup(p);
      return true;
    }
    return false;
  }

  graphConnected() {
    const seen = new Set(['0,0']);
    const q = [[0, 0]];
    while (q.length) {
      const [i, j] = q.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (!this.map.nodeValid(a, b) || seen.has(`${a},${b}`)) continue;
        if (this.traffic.blockedEdges.has(this.map.edgeKey(i, j, a, b))) continue;
        seen.add(`${a},${b}`); q.push([a, b]);
      }
    }
    return seen.size === NODES * NODES;
  }

  removeBarrier(b) {
    b.removing = true;
  }

  // --- Leitkegel ---
  placeCones() {
    const spots = [];
    for (const c of this.map.customers.filter((s) => s.type === 'site')) {
      // an den vorderen Ecken des Vorplatzes (Ladezone liegt 0.4 vor der Spurmitte, Vorplatz-Mitte 4 m weiter)
      for (const s of [-1, 1]) {
        const along = c.nx !== 0 ? { x: 0, z: 1 } : { x: 1, z: 0 };
        for (let k = 0; k < 2; k++) {
          spots.push({
            x: c.x + c.nx * (4.6 + k * 0.9) + along.x * s * (4.6 + k * 0.6),
            z: c.z + c.nz * (4.6 + k * 0.9) + along.z * s * (4.6 + k * 0.6),
          });
        }
      }
    }
    for (const s of spots) {
      const mesh = buildCone();
      mesh.position.set(s.x, 0, s.z);
      this.group.add(mesh);
      this.cones.push({ mesh, home: s, vel: new THREE.Vector3(), spin: new THREE.Vector3(), state: 'idle', timer: 0 });
    }
  }

  // --- Power-Ups ---
  spawnPowerup(truck) {
    for (let tries = 0; tries < 50; tries++) {
      const tx = Math.floor(this.rng() * N), tz = Math.floor(this.rng() * N);
      if (this.map.get(tx, tz) !== T.ROAD || this.map.isSolid(tx, tz)) continue;
      if (tx % 6 === 0 && tz % 6 === 0) continue;
      const c = this.map.tileCenter(tx, tz);
      if (truck && Math.hypot(c.x - truck.pos.x, c.z - truck.pos.y) < 16) continue;
      if (this.powerups.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 12)) continue;
      let types = ['coffee', 'coffee', 'navi', 'navi', 'clock'];
      if (this.clocks >= MAX_CLOCKS) types = ['coffee', 'navi'];
      const type = pick(types, this.rng);
      if (type === 'clock') this.clocks++;
      const mesh = buildPowerup(type);
      mesh.position.set(c.x, 0, c.z);
      this.group.add(mesh);
      this.powerups.push({ type, mesh, x: c.x, z: c.z, age: 0 });
      return;
    }
  }
  removePowerup(p) {
    this.group.remove(p.mesh);
    this.powerups = this.powerups.filter((o) => o !== p);
  }

  update(dt, time, truck, playing) {
    // Sperren rotieren
    if (playing) {
      this.barrierTimer -= dt;
      if (this.barrierTimer <= 0) {
        this.barrierTimer = 30 + this.rng() * 15;
        const old = this.barriers.find((b) => !b.removing);
        if (old) this.removeBarrier(old);
        this.addBarrier(truck);
        this.hooks.onBarrier?.();
      }
      this.puTimer -= dt;
      if (this.puTimer <= 0) {
        this.puTimer = 9 + this.rng() * 5;
        if (this.powerups.length < 4) this.spawnPowerup(truck);
      }
    }
    for (const b of [...this.barriers]) {
      if (b.removing) {
        const s = b.mesh.scale.x - dt * 3;
        if (s <= 0.01) {
          this.group.remove(b.mesh);
          this.map.blocked.delete(b.idx);
          this.traffic.blockedEdges.delete(b.key);
          this.barriers = this.barriers.filter((o) => o !== b);
        } else b.mesh.scale.setScalar(s);
      } else if (b.mesh.scale.x < 1) {
        b.age += dt;
        const t = Math.min(1, b.age * 2.5);
        b.mesh.scale.setScalar(Math.max(0.01, 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t)) * t + 0.0001);
        if (t >= 1) b.mesh.scale.setScalar(1);
      }
      b.mesh.traverse((o) => { if (o.userData.blink) o.material.emissiveIntensity = Math.sin(time * 8) > 0 ? 4 : 0.3; });
    }

    // Kegel-Physik
    const circles = truck.circles();
    const tspeed = truck.vel.length();
    for (const c of this.cones) {
      const m = c.mesh;
      if (c.state === 'idle') {
        for (const k of circles) {
          if (Math.hypot(k.x - m.position.x, k.z - m.position.z) < k.r + 0.3 && tspeed > 2) {
            c.state = 'flying';
            const dir = new THREE.Vector2(m.position.x - truck.pos.x, m.position.z - truck.pos.y).normalize();
            c.vel.set(dir.x * tspeed * 0.7 + truck.vel.x * 0.4, 3 + tspeed * 0.3, dir.y * tspeed * 0.7 + truck.vel.y * 0.4);
            c.spin.set(Math.random() * 10 - 5, Math.random() * 6, Math.random() * 10 - 5);
            c.timer = 0;
            this.hooks.onCone?.(m.position);
            break;
          }
        }
      } else if (c.state === 'flying') {
        c.timer += dt;
        c.vel.y -= 22 * dt;
        m.position.addScaledVector(c.vel, dt);
        m.rotation.x += c.spin.x * dt; m.rotation.y += c.spin.y * dt; m.rotation.z += c.spin.z * dt;
        if (m.position.y <= 0) {
          m.position.y = 0;
          c.vel.y *= -0.3; c.vel.x *= 0.6; c.vel.z *= 0.6; c.spin.multiplyScalar(0.6);
          if (Math.abs(c.vel.y) < 1) { c.state = 'down'; c.vel.set(0, 0, 0); m.rotation.x = Math.PI / 2 * Math.sign(m.rotation.x || 1); m.rotation.z = 0; }
        }
      } else if (c.state === 'down') {
        c.timer += dt;
        if (c.timer > 12) {
          c.state = 'pop'; c.timer = 0;
          m.position.set(c.home.x, 0, c.home.z);
          m.rotation.set(0, 0, 0);
        }
      } else if (c.state === 'pop') {
        c.timer += dt;
        const t = Math.min(1, c.timer * 3);
        m.scale.setScalar(t);
        if (t >= 1) c.state = 'idle';
      }
    }

    // Power-Ups animieren + einsammeln
    for (const p of [...this.powerups]) {
      p.age += dt;
      const inner = p.mesh.userData.inner;
      inner.rotation.y += dt * 2.2;
      inner.position.y = 1.3 + Math.sin(time * 3 + p.x) * 0.2;
      p.mesh.scale.setScalar(Math.min(1, p.age * 3));
      if (playing && Math.hypot(truck.pos.x - p.x, truck.pos.y - p.z) < 2.0) {
        this.removePowerup(p);
        this.hooks.onPowerup?.(p.type, PU_TYPES[p.type], p);
      }
    }
  }
}
