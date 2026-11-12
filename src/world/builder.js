// Sammelt viele kleine Geometrien mit Vertex-Farben und merged sie zu einem Mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

export function roundedBoxGeo(w, h, d, r = 0.12, seg = 1) {
  const k = `rb${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${r}|${seg}`;
  return cached(k, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
}
export function boxGeo(w, h, d) {
  return cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
}
export function cylGeo(rt, rb, h, seg = 12) {
  return cached(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}
export function sphereGeo(r, detail = 1) {
  return cached(`s${r}|${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
}
export function coneGeo(r, h, seg = 12) {
  return cached(`co${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
}
// Dreiecks-Satteldach, First entlang X
export function roofGeo(w, h, d) {
  return cached(`roof${w}|${h}|${d}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

export class StaticBuilder {
  constructor() { this.parts = []; }

  add(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.clearGroups();
    this.parts.push(g);
    return this;
  }

  // Bequeme Helfer; Position = Mittelpunkt unten (y = Boden)
  box(w, h, d, color, x, y, z, ry = 0) { return this.add(boxGeo(w, h, d), color, x, y + h / 2, z, ry); }
  rbox(w, h, d, color, x, y, z, ry = 0, r = 0.12) { return this.add(roundedBoxGeo(w, h, d, r), color, x, y + h / 2, z, ry); }
  cyl(r, h, color, x, y, z, seg = 12, rt = null) { return this.add(cylGeo(rt ?? r, r, h, seg), color, x, y + h / 2, z); }
  sphere(r, color, x, y, z, detail = 1, sy = 1) { return this.add(sphereGeo(r, detail), color, x, y, z, 0, 0, 0, 1, sy, 1); }
  cone(r, h, color, x, y, z, seg = 12) { return this.add(coneGeo(r, h, seg), color, x, y + h / 2, z); }
  roof(w, h, d, color, x, y, z, ry = 0) { return this.add(roofGeo(w, h, d), color, x, y, z, ry); }

  build(material) {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// Lokale Transformation für Teile eines Gebäudes, das um ry gedreht an (ox, oz) steht
export class Local {
  constructor(builder, ox, oz, ry) {
    this.b = builder; this.ox = ox; this.oz = oz; this.ry = ry;
    this.c = Math.cos(ry); this.s = Math.sin(ry);
  }
  tx(lx, lz) { return [this.ox + lx * this.c + lz * this.s, this.oz - lx * this.s + lz * this.c]; }
  box(w, h, d, col, lx, y, lz, ry = 0) { const [x, z] = this.tx(lx, lz); this.b.box(w, h, d, col, x, y, z, this.ry + ry); return this; }
  rbox(w, h, d, col, lx, y, lz, ry = 0, r = 0.12) { const [x, z] = this.tx(lx, lz); this.b.rbox(w, h, d, col, x, y, z, this.ry + ry, r); return this; }
  cyl(r, h, col, lx, y, lz, seg = 12, rt = null) { const [x, z] = this.tx(lx, lz); this.b.cyl(r, h, col, x, y, z, seg, rt); return this; }
  sphere(r, col, lx, y, lz, detail = 1, sy = 1) { const [x, z] = this.tx(lx, lz); this.b.sphere(r, col, x, y, z, detail, sy); return this; }
  cone(r, h, col, lx, y, lz, seg = 12) { const [x, z] = this.tx(lx, lz); this.b.cone(r, h, col, x, y, z, seg); return this; }
  roof(w, h, d, col, lx, y, lz, ry = 0) { const [x, z] = this.tx(lx, lz); this.b.roof(w, h, d, col, x, y, z, this.ry + ry); return this; }
  add(geo, col, lx, y, lz, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const [x, z] = this.tx(lx, lz); this.b.add(geo, col, x, y, z, this.ry + ry, rx, rz, sx, sy, sz); return this;
  }
}

// Fasst alle Meshes unter `root` mit gleichem Material zu je einem Mesh zusammen (weniger Draw-Calls).
// keep(mesh) -> true: Mesh (samt Kindern) bleibt eigenständig (z. B. blinkende Lampen, Räder).
// Meshes mit Material-Arrays bleiben ebenfalls unverändert.
const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
export function mergeByMaterial(root, keep = () => false) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  const visit = (o) => {
    for (const c of [...o.children]) {
      if (keep(c)) continue;
      if (c.isMesh && !c.isInstancedMesh && !Array.isArray(c.material) && c.children.length === 0) {
        const key = `${c.material.uuid}|${c.castShadow}|${c.receiveShadow}`;
        if (!buckets.has(key)) buckets.set(key, { mat: c.material, cast: c.castShadow, recv: c.receiveShadow, list: [] });
        buckets.get(key).list.push(c);
      } else visit(c);
    }
  };
  visit(root);
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = b.list.map((m) => {
      _rel.multiplyMatrices(_inv, m.matrixWorld);
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(_rel);
      return g;
    });
    // nur Attribute behalten, die alle Teile haben
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]));
    for (const g of geos) {
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
      g.morphAttributes = {};
      g.clearGroups();
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    for (const m of b.list) m.parent.remove(m);
    root.add(mesh);
  }
  return root;
}
