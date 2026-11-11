// Verkehr (Autos auf dem Straßengraph) und Fußgänger
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE, ROAD_W } from '../config.js';
import { NODES, DIRS } from '../world/map.js';
import { pick } from '../util.js';

const CAR_COLORS = ['#3d7dd8', '#f2f2f2', '#2b2f36', '#e8b931', '#57a65b', '#9b59b6', '#e2682b', '#7fb8d6', '#c0c6cc'];
const LANE = ROAD_W * 0.25;
const HALF = ROAD_W / 2;

const carGeo = {
  body: new RoundedBoxGeometry(1.25, 0.55, 2.3, 2, 0.18),
  cabin: new RoundedBoxGeometry(1.05, 0.45, 1.2, 2, 0.15),
  wheel: (() => { const g = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12); g.rotateZ(Math.PI / 2); return g; })(),
  light: new THREE.BoxGeometry(0.22, 0.1, 0.04),
};
const glassMat = new THREE.MeshStandardMaterial({ color: '#203548', roughness: 0.15, metalness: 0.5 });
const tireMat = new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.9 });
const headMat = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4cc', emissiveIntensity: 1.5 });
const tailMat = new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff1010', emissiveIntensity: 1.0 });

function buildCar(color, type) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15 });
  const body = new THREE.Mesh(carGeo.body, paint);
  body.position.y = 0.5;
  const cabin = new THREE.Mesh(carGeo.cabin, glassMat);
  cabin.position.set(0, 0.95, type === 'van' ? 0.1 : -0.15);
  if (type === 'van') cabin.scale.set(1, 1.3, 1.6);
  const roof = new THREE.Mesh(carGeo.cabin, paint);
  roof.scale.set(0.96, 0.25, type === 'van' ? 1.55 : 0.9);
  roof.position.set(0, type === 'van' ? 1.27 : 1.17, cabin.position.z);
  g.add(body, cabin, roof);
  for (const [x, z] of [[-0.58, 0.75], [0.58, 0.75], [-0.58, -0.75], [0.58, -0.75]]) {
    const w = new THREE.Mesh(carGeo.wheel, tireMat);
    w.position.set(x, 0.24, z);
    g.add(w);
  }
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(carGeo.light, headMat); h.position.set(s * 0.4, 0.55, 1.16); g.add(h);
    const t = new THREE.Mesh(carGeo.light, tailMat); t.position.set(s * 0.42, 0.55, -1.16); g.add(t);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function bezier(p0, p1, p2, t, out) {
  const u = 1 - t;
  out.x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  out.z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
  return out;
}

export class Traffic {
  constructor(map, scene, rng = Math.random) {
    this.map = map;
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
    this.peds = [];
    this.blockedEdges = new Set();
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  clear() {
    for (const c of this.cars) this.group.remove(c.mesh);
    this.cars = [];
  }

  // --- Autos -----------------------------------------------------------------
  spawnCars(count, avoid) {
    let tries = 0;
    while (this.cars.length < count && tries++ < 200) {
      const i = Math.floor(this.rng() * NODES), j = Math.floor(this.rng() * NODES);
      const opts = DIRS.filter((d) => this.edgeOpen(i, j, i + d.x, j + d.z));
      if (!opts.length) continue;
      const d = pick(opts, this.rng);
      const car = this.makeCar();
      this.startSegment(car, i, j, d);
      car.t = this.rng() * 0.8;
      this.place(car);
      if (avoid && Math.hypot(car.pos.x - avoid.x, car.pos.z - avoid.y) < 12) { this.group.remove(car.mesh); continue; }
      if (this.cars.some((o) => Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z) < 4)) { this.group.remove(car.mesh); continue; }
      this.cars.push(car);
    }
  }

  makeCar() {
    const type = this.rng() < 0.2 ? 'van' : 'car';
    const mesh = buildCar(pick(CAR_COLORS, this.rng), type);
    this.group.add(mesh);
    return { mesh, pos: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, speed: 0, maxSpeed: 5.5 + this.rng() * 2, wait: 0, hop: 0, hopV: 0, stunned: 0 };
  }

  edgeOpen(i, j, i2, j2) {
    return this.map.nodeValid(i2, j2) && !this.blockedEdges.has(this.map.edgeKey(i, j, i2, j2));
  }

  startSegment(car, i, j, d) {
    const a = this.map.nodePos(i, j);
    const b = this.map.nodePos(i + d.x, j + d.z);
    const right = { x: -d.z, z: d.x };
    car.node = { i, j };
    car.next = { i: i + d.x, j: j + d.z };
    car.dir = d;
    car.phase = 'seg';
    car.p0 = { x: a.x + d.x * HALF + right.x * LANE, z: a.z + d.z * HALF + right.z * LANE };
    car.p2 = { x: b.x - d.x * HALF + right.x * LANE, z: b.z - d.z * HALF + right.z * LANE };
    car.len = Math.hypot(car.p2.x - car.p0.x, car.p2.z - car.p0.z);
    car.t = 0;
  }

  startTurn(car) {
    const { i, j } = car.next;
    const back = { x: -car.dir.x, z: -car.dir.z };
    let opts = DIRS.filter((d) => !(d.x === back.x && d.z === back.z) && this.edgeOpen(i, j, i + d.x, j + d.z));
    if (!opts.length) opts = [back];
    // geradeaus bevorzugen
    const straight = opts.find((d) => d.x === car.dir.x && d.z === car.dir.z);
    const d2 = straight && this.rng() < 0.45 ? straight : pick(opts, this.rng);
    const n = this.map.nodePos(i, j);
    const r2 = { x: -d2.z, z: d2.x };
    const start = car.p2;
    const end = { x: n.x + d2.x * HALF + r2.x * LANE, z: n.z + d2.z * HALF + r2.z * LANE };
    let ctrl;
    if (d2.x === -car.dir.x && d2.z === -car.dir.z) {
      ctrl = { x: n.x + car.dir.x * HALF, z: n.z + car.dir.z * HALF };
    } else {
      const k = (end.x - start.x) * car.dir.x + (end.z - start.z) * car.dir.z;
      ctrl = { x: start.x + car.dir.x * k, z: start.z + car.dir.z * k };
      if (d2.x === car.dir.x && d2.z === car.dir.z) ctrl = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
    }
    car.phase = 'turn';
    car.turn = { p0: start, p1: ctrl, p2: end, d2, node: { i, j } };
    car.len = Math.hypot(end.x - start.x, end.z - start.z) * 1.15 + 0.5;
    car.t = 0;
  }

  place(car) {
    const p = car.pos;
    if (car.phase === 'seg') {
      p.x = car.p0.x + (car.p2.x - car.p0.x) * car.t;
      p.z = car.p0.z + (car.p2.z - car.p0.z) * car.t;
      car.heading = Math.atan2(car.dir.x, car.dir.z);
    } else {
      const tt = car.turn;
      const prev = { x: p.x, z: p.z };
      bezier(tt.p0, tt.p1, tt.p2, car.t, p);
      const dx = p.x - prev.x, dz = p.z - prev.z;
      if (dx * dx + dz * dz > 1e-6) car.heading = Math.atan2(dx, dz);
    }
    car.mesh.position.set(p.x, car.hop, p.z);
    car.mesh.rotation.y = car.heading;
  }

  // Segment, auf dem ein Auto gerade ist bzw. als nächstes sein wird
  occupiedEdges() {
    const s = new Set();
    for (const c of this.cars) {
      if (c.phase === 'seg') s.add(this.map.edgeKey(c.node.i, c.node.j, c.next.i, c.next.j));
      else {
        const n = c.turn.node, d = c.turn.d2;
        s.add(this.map.edgeKey(n.i, n.j, n.i + d.x, n.j + d.z));
      }
    }
    return s;
  }

  update(dt, truck) {
    const fwdOf = (h) => ({ x: Math.sin(h), z: Math.cos(h) });
    for (const car of this.cars) {
      // Abstand halten
      const f = fwdOf(car.heading ?? 0);
      let blocked = false;
      const check = (ox, oz, rad) => {
        const dx = ox - car.pos.x, dz = oz - car.pos.z;
        const ahead = dx * f.x + dz * f.z;
        const lat = Math.abs(dx * f.z - dz * f.x);
        return ahead > 0 && ahead < 3.6 + rad && lat < 1.3 + rad * 0.3;
      };
      if (car.wait < 4) {
        for (const o of this.cars) {
          if (o === car) continue;
          if (check(o.pos.x, o.pos.z, 0)) { blocked = true; break; }
        }
      }
      if (truck && check(truck.pos.x, truck.pos.y, 0.8)) blocked = true;
      car.wait = blocked ? car.wait + dt : 0;
      if (car.wait > 5) car.wait = 0;
      const target = blocked || car.stunned > 0 ? 0 : car.maxSpeed * (car.phase === 'turn' ? 0.6 : 1);
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), (blocked ? 25 : 6) * dt);
      car.stunned = Math.max(0, car.stunned - dt);
      car.t += (car.speed * dt) / Math.max(car.len, 0.1);
      if (car.t >= 1) {
        if (car.phase === 'seg') this.startTurn(car);
        else this.startSegment(car, car.turn.node.i, car.turn.node.j, car.turn.d2);
      }
      // Hüpfer nach Crash
      if (car.hop > 0 || car.hopV > 0) {
        car.hopV -= 25 * dt;
        car.hop = Math.max(0, car.hop + car.hopV * dt);
        if (car.hop === 0) car.hopV = 0;
      }
      this.place(car);
    }
  }

  // --- Fußgänger -------------------------------------------------------------
  spawnPeds(count) {
    const skin = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    const cloth = ['#3d7dd8', '#e2682b', '#57a65b', '#b5002f', '#f5b800', '#6d4c9f', '#2b2f36', '#ffffff'];
    const bodyGeo = new THREE.CapsuleGeometry(0.18, 0.4, 4, 8);
    const headGeo = new THREE.SphereGeometry(0.15, 12, 8);
    for (let k = 0; k < count; k++) {
      const b = pick(this.map.blocks, this.rng);
      const c0 = this.map.tileCenter(b.x0, b.z0);
      const w = b.size * TILE;
      const x0 = c0.x - TILE / 2 + 0.75, z0 = c0.z - TILE / 2 + 0.75, s = w - 1.5;
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: pick(cloth, this.rng), roughness: 0.7 }));
      body.position.y = 0.45;
      const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: pick(skin, this.rng), roughness: 0.6 }));
      head.position.y = 0.9;
      g.add(body, head);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(g);
      this.peds.push({ mesh: g, x0, z0, s, u: this.rng() * 4 * s, speed: (0.8 + this.rng() * 0.6) * (this.rng() < 0.5 ? 1 : -1), phase: this.rng() * 10 });
    }
  }

  updatePeds(dt, time) {
    for (const p of this.peds) {
      const per = 4 * p.s;
      p.u = (p.u + p.speed * dt + per) % per;
      let x, z, h;
      const u = p.u;
      if (u < p.s) { x = p.x0 + u; z = p.z0; h = Math.PI / 2; }
      else if (u < 2 * p.s) { x = p.x0 + p.s; z = p.z0 + (u - p.s); h = 0; }
      else if (u < 3 * p.s) { x = p.x0 + p.s - (u - 2 * p.s); z = p.z0 + p.s; h = -Math.PI / 2; }
      else { x = p.x0; z = p.z0 + p.s - (u - 3 * p.s); h = Math.PI; }
      if (p.speed < 0) h += Math.PI;
      p.mesh.position.set(x, 0.25 + Math.abs(Math.sin(time * 8 + p.phase)) * 0.06, z);
      p.mesh.rotation.y = h;
    }
  }
}
