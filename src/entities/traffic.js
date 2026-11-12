// Verkehr (Autos auf dem Straßengraph) und Fußgänger
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE, ROAD_W } from '../config.js';
import { NODES, DIRS } from '../world/map.js';
import { pick } from '../util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobTexture } from '../world/textures.js';

const CAR_COLORS = ['#3d7dd8', '#f2f2f2', '#2b2f36', '#e8b931', '#57a65b', '#9b59b6', '#e2682b', '#7fb8d6', '#c0c6cc'];
const LANE = ROAD_W * 0.25;
const HALF = ROAD_W / 2;

// Autos werden per InstancedMesh gezeichnet: wenige Draw-Calls für den ganzen Verkehr
// (vorher ~13 Meshes je Auto, dazu der Schattendurchgang).
const MAX_CARS = 32;
const carGeo = (() => {
  const body = new RoundedBoxGeometry(1.25, 0.55, 2.3, 2, 0.18).translate(0, 0.5, 0);
  const cabin = new RoundedBoxGeometry(1.05, 0.45, 1.2, 2, 0.15);
  const part = (g, sx, sy, sz, x, y, z) => g.clone().scale(sx, sy, sz).translate(x, y, z);
  const wheel = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12).rotateZ(Math.PI / 2);
  const wheels = mergeGeometries([[-0.58, 0.75], [0.58, 0.75], [-0.58, -0.75], [0.58, -0.75]].map(([x, z]) => wheel.clone().translate(x, 0.24, z)));
  // Scheinwerfer/Rücklichter: unbeleuchtetes Material mit HDR-Vertexfarben (> 1 -> Bloom wie vorher)
  const light = new THREE.BoxGeometry(0.22, 0.1, 0.04).toNonIndexed();
  const lit = (x, z, c) => {
    const g = light.clone().translate(x, 0.55, z);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => c[i % 3]), 3));
    return g;
  };
  const HEAD = [2.0, 1.85, 1.4], TAIL = [1.3, 0.04, 0.04];
  const lights = mergeGeometries([lit(-0.4, 1.16, HEAD), lit(0.4, 1.16, HEAD), lit(-0.42, -1.16, TAIL), lit(0.42, -1.16, TAIL)]);
  return {
    car: {
      paint: mergeGeometries([body, part(cabin, 0.96, 0.25, 0.9, 0, 1.17, -0.15)]),
      glass: part(cabin, 1, 1, 1, 0, 0.95, -0.15),
    },
    van: {
      paint: mergeGeometries([body, part(cabin, 0.96, 0.25, 1.55, 0, 1.27, 0.1)]),
      glass: part(cabin, 1, 1.3, 1.6, 0, 0.95, 0.1),
    },
    wheels, lights,
    blob: new THREE.PlaneGeometry(1.9, 3.1).rotateX(-Math.PI / 2),
  };
})();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
const paintMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.15 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#203548', roughness: 0.15, metalness: 0.5 });
const tireMat = new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.9 });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });

function ghostOf(m) {
  const g = m.clone();
  g.transparent = true; g.opacity = 0.35; g.depthWrite = false;
  return g;
}

// Ein Satz InstancedMeshes (solide oder Geist-Variante)
function makeCarSet(group, ghost) {
  const mk = (geo, mat, color) => {
    const im = new THREE.InstancedMesh(geo, ghost ? ghostOf(mat) : mat, MAX_CARS);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = !ghost;
    im.receiveShadow = true;
    if (color) im.setColorAt(0, new THREE.Color());
    group.add(im);
    return im;
  };
  return {
    car: { paint: mk(carGeo.car.paint, paintMat, true), glass: mk(carGeo.car.glass, glassMat) },
    van: { paint: mk(carGeo.van.paint, paintMat, true), glass: mk(carGeo.van.glass, glassMat) },
    wheels: mk(carGeo.wheels, tireMat),
    lights: mk(carGeo.lights, lightMat),
  };
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
    this.sets = { solid: makeCarSet(this.group, false), ghost: makeCarSet(this.group, true) };
    // weiche Kontaktschatten unter den Autos
    this.blobs = new THREE.InstancedMesh(carGeo.blob, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.8 }), MAX_CARS);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = -1;
    this.group.add(this.blobs);
  }

  clear() {
    this.cars = [];
    this.syncMeshes();
  }

  // Instanz-Matrizen aller Autos schreiben (einmal pro Frame)
  syncMeshes() {
    const all = [this.sets.solid, this.sets.ghost];
    const cnt = new Map();
    const next = (im) => { const n = cnt.get(im) || 0; cnt.set(im, n + 1); return n; };
    for (const car of this.cars) {
      _q.setFromAxisAngle(_up, car.heading ?? 0);
      _p.set(car.pos.x, car.hop, car.pos.z);
      _m.compose(_p, _q, _one);
      const set = car.ghost > 0 ? this.sets.ghost : this.sets.solid;
      const kind = set[car.type];
      let i = next(kind.paint); kind.paint.setMatrixAt(i, _m); kind.paint.setColorAt(i, car.color);
      i = next(kind.glass); kind.glass.setMatrixAt(i, _m);
      i = next(set.wheels); set.wheels.setMatrixAt(i, _m);
      i = next(set.lights); set.lights.setMatrixAt(i, _m);
      if (car.ghost <= 0) {
        _p.y = 0.025;
        _m.compose(_p, _q, _one);
        this.blobs.setMatrixAt(next(this.blobs), _m);
      }
    }
    for (const set of all) {
      for (const im of [set.car.paint, set.car.glass, set.van.paint, set.van.glass, set.wheels, set.lights]) this.finish(im, cnt.get(im) || 0);
    }
    this.finish(this.blobs, cnt.get(this.blobs) || 0);
  }

  finish(im, n) {
    im.count = n;
    im.visible = n > 0;
    if (n) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
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
      if (avoid && Math.hypot(car.pos.x - avoid.x, car.pos.z - avoid.y) < 12) continue;
      if (this.cars.some((o) => Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z) < 4)) continue;
      this.cars.push(car);
    }
    this.syncMeshes();
  }

  makeCar() {
    const type = this.rng() < 0.2 ? 'van' : 'car';
    const color = new THREE.Color(pick(CAR_COLORS, this.rng));
    return { type, color, pos: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, speed: 0, maxSpeed: 5.5 + this.rng() * 2, wait: 0, ghost: 0, blocker: null, truckBlock: false, id: this.nextId = (this.nextId || 0) + 1, hop: 0, hopV: 0, stunned: 0 };
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
    const cars = this.cars;
    // Pass 1: nächstes Auto direkt voraus bestimmen (Abstand halten)
    for (const car of cars) {
      const h = car.heading ?? 0;
      const fx = Math.sin(h), fz = Math.cos(h);
      const check = (ox, oz, rad) => {
        const dx = ox - car.pos.x, dz = oz - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const lat = Math.abs(dx * fz - dz * fx);
        return ahead > 0 && ahead < 3.6 + rad && lat < 1.3 + rad * 0.3 ? ahead : -1;
      };
      car.blocker = null;
      if (car.ghost <= 0) {
        let best = Infinity;
        for (const o of cars) {
          if (o === car) continue;
          const a = check(o.pos.x, o.pos.z, 0);
          if (a >= 0 && a < best) { best = a; car.blocker = o; }
        }
      }
      car.truckBlock = !!truck && car.ghost <= 0 && check(truck.pos.x, truck.pos.y, 0.8) >= 0;
    }
    // Pass 2: gegenseitiges Warten (z. B. an Kreuzungen) auflösen – einer bekommt Vorfahrt
    for (const car of cars) {
      const b = car.blocker;
      if (b && b.blocker === car && car.id < b.id) car.blocker = null;
    }
    for (const car of cars) {
      // Stau-Notlösung: wer zu lange hinter anderen Autos steht, fährt kurz als "Geist"
      // durch sie hindurch (löst auch Kreis-Blockaden aus 3+ Autos auf)
      // Gilt auch für den LKW: steht er im Weg, wird das Auto durchlässig statt die Straße zu verstopfen.
      car.wait = car.blocker || car.truckBlock ? car.wait + dt : 0;
      if (car.wait > (car.truckBlock ? 3 : 2.5)) {
        car.ghost = 3; car.wait = 0; car.blocker = null; car.truckBlock = false;
      }
      if (car.ghost > 0) {
        car.ghost = Math.max(0, car.ghost - dt);
        // erst wieder fest werden, wenn nichts mehr überlappt
        if (car.ghost === 0 && this.overlapping(car, truck)) car.ghost = 0.2;
      }
      const stop = !!car.blocker || car.truckBlock;
      const target = stop || car.stunned > 0 ? 0 : car.maxSpeed * (car.phase === 'turn' ? 0.6 : 1);
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), (stop ? 25 : 6) * dt);
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
    this.syncMeshes();
  }

  overlapping(car, truck) {
    if (truck && Math.hypot(truck.pos.x - car.pos.x, truck.pos.y - car.pos.z) < 3.4) return true;
    return this.cars.some((o) => o !== car && Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z) < 2.4);
  }

  // Geist-Optik (halbtransparent, ohne Schatten) übernimmt syncMeshes() über den Geist-Satz

  // --- Fußgänger -------------------------------------------------------------
  spawnPeds(count) {
    const skin = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    const cloth = ['#3d7dd8', '#e2682b', '#57a65b', '#b5002f', '#f5b800', '#6d4c9f', '#2b2f36', '#ffffff'];
    // Fußgänger als 2 InstancedMeshes (Körper + Kopf); rotationssymmetrisch -> nur Position nötig
    const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 8).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), count);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 12, 8).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), count);
    for (const im of [body, head]) { im.castShadow = true; im.frustumCulled = false; this.group.add(im); }
    this.pedMeshes = { body, head };
    const col = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const b = pick(this.map.blocks, this.rng);
      const c0 = this.map.tileCenter(b.x0, b.z0);
      const w = b.size * TILE;
      const x0 = c0.x - TILE / 2 + 0.75, z0 = c0.z - TILE / 2 + 0.75, s = w - 1.5;
      body.setColorAt(k, col.set(pick(cloth, this.rng)));
      head.setColorAt(k, col.set(pick(skin, this.rng)));
      this.peds.push({ x0, z0, s, u: this.rng() * 4 * s, speed: (0.8 + this.rng() * 0.6) * (this.rng() < 0.5 ? 1 : -1), phase: this.rng() * 10 });
    }
  }

  updatePeds(dt, time) {
    for (let k = 0; k < this.peds.length; k++) {
      const p = this.peds[k];
      const per = 4 * p.s;
      p.u = (p.u + p.speed * dt + per) % per;
      let x, z;
      const u = p.u;
      if (u < p.s) { x = p.x0 + u; z = p.z0; }
      else if (u < 2 * p.s) { x = p.x0 + p.s; z = p.z0 + (u - p.s); }
      else if (u < 3 * p.s) { x = p.x0 + p.s - (u - 2 * p.s); z = p.z0 + p.s; }
      else { x = p.x0; z = p.z0 + p.s - (u - 3 * p.s); }
      _m.makeTranslation(x, 0.25 + Math.abs(Math.sin(time * 8 + p.phase)) * 0.06, z);
      this.pedMeshes.body.setMatrixAt(k, _m);
      this.pedMeshes.head.setMatrixAt(k, _m);
    }
    if (this.pedMeshes) {
      this.pedMeshes.body.instanceMatrix.needsUpdate = true;
      this.pedMeshes.head.instanceMatrix.needsUpdate = true;
    }
  }
}
