// Baut die sichtbare Miniaturstadt prozedural aus der CityMap
import * as THREE from 'three';
import { TILE, ROAD_W } from '../config.js';
import { T, NODES, WORLD } from './map.js';
import { StaticBuilder, Local, boxGeo, cylGeo, roundedBoxGeo } from './builder.js';
import { logoPanelTexture, signTexture } from './textures.js';
import { mulberry32, pick } from '../util.js';

const SLAB = 0.25; // Gehweg-Höhe
const P = {
  walls: ['#f4e3c1', '#f7d6c4', '#e8eef2', '#f1c9a5', '#d9e7d0', '#fff4dc', '#f3d9e0', '#e9dcc9', '#cfe3ef'],
  roofs: ['#c0533e', '#a8432f', '#7a4b3a', '#5d6670', '#b8664a', '#8b3b2f', '#6d7a84'],
  shops: ['#ffd27a', '#9ad1d4', '#f7a072', '#c3b1e1', '#a8d5a2', '#f4978e'],
  apts: ['#e9e4dc', '#d5dde5', '#f2e2cf', '#cfd8d0', '#e4d4c8'],
  greens: ['#5f9e4a', '#6fae52', '#4f8c3f', '#7bb661', '#88bf5a'],
  glass: '#7fa8c9', door: '#6b4a35', trunk: '#7a5537', lawn: '#8cc45f', sidewalk: '#d6d1c7',
  curb: '#bdb7ab', asphalt: '#5a6069', line: '#f2f2ee',
};

export function buildCity(map) {
  const rng = mulberry32(2024);
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
  const dynamic = { cranes: [], fountains: [] };

  // Boden
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: '#86bd5b', roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.03;
  grass.receiveShadow = true;
  root.add(grass);
  const size = WORLD;
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(size + 1, size + 1), new THREE.MeshStandardMaterial({ color: P.asphalt, roughness: 0.95 }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  root.add(asphalt);

  // Straßen-Markierungen
  const roads = new StaticBuilder();
  const half = ROAD_W / 2;
  for (let j = 0; j < NODES; j++) {
    for (let i = 0; i < NODES; i++) {
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        if (!map.nodeValid(i + di, j + dj)) continue;
        const a = map.nodePos(i, j), b = map.nodePos(i + di, j + dj);
        // Mittelstreifen (gestrichelt) zwischen den Zebrastreifen
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const from = half + 2.2, to = len - half - 2.2;
        const dash = 1.1, gap = 1.0;
        const n = Math.floor((to - from + gap) / (dash + gap));
        const off = from + (to - from - (n * (dash + gap) - gap)) / 2 + dash / 2;
        for (let k = 0; k < n; k++) {
          const t = (off + k * (dash + gap)) / len;
          const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          roads.box(di ? dash : 0.14, 0.02, di ? 0.14 : dash, P.line, x, 0, z);
        }
        // Zebrastreifen an beiden Enden, über die ganze Straßenbreite
        const stripes = Math.floor((ROAD_W - 0.6) / 0.55);
        for (const end of [0, 1]) {
          const base = end ? b : a;
          const dir = end ? -1 : 1;
          const cx = base.x + di * dir * (half + 0.8);
          const cz = base.z + dj * dir * (half + 0.8);
          for (let s = 0; s < stripes; s++) {
            const o = (s - (stripes - 1) / 2) * 0.55;
            if (di) roads.box(1.1, 0.02, 0.28, P.line, cx, 0, cz + o);
            else roads.box(0.28, 0.02, 1.1, P.line, cx + o, 0, cz);
          }
        }
      }
    }
  }
  // Begrenzung der Stadt (Hecke außen)
  const hs = size / 2 + 0.6;
  const hedge = new StaticBuilder();
  for (const s of [-1, 1]) {
    hedge.rbox(size + 2.4, 0.9, 1.0, '#4f8c3f', 0, 0, s * hs, 0, 0.3);
    hedge.rbox(1.0, 0.9, size + 2.4, '#4f8c3f', s * hs, 0, 0, 0, 0.3);
  }
  root.add(hedge.build(mat));
  // Fahrbahnmarkierungen sind 2 cm flach: kein Schattenwurf nötig (spart Schatten-Durchgang)
  const marks = roads.build(mat);
  marks.castShadow = false;
  root.add(marks);

  // Blöcke
  for (const b of map.blocks) {
    const sb = new StaticBuilder();
    buildBlock(sb, map, b, rng, root, dynamic);
    const m = sb.build(mat);
    if (m) root.add(m);
  }

  // Umland
  const out = new StaticBuilder();
  buildOutskirts(out, rng, size);
  root.add(out.build(mat));

  return { root, dynamic, material: mat };
}

// ---------------------------------------------------------------------------

function buildBlock(sb, map, b, rng, root, dynamic) {
  const tiles = [];
  for (let dz = 0; dz < b.size; dz++)
    for (let dx = 0; dx < b.size; dx++) {
      const tx = b.x0 + dx, tz = b.z0 + dz;
      const c = map.tileCenter(tx, tz);
      const edge = dx === 0 || dz === 0 || dx === b.size - 1 || dz === b.size - 1;
      tiles.push({ tx, tz, dx, dz, x: c.x, z: c.z, edge, drive: map.get(tx, tz) === T.DRIVE });
    }
  // Gehweg-Platten
  for (const t of tiles) {
    if (t.drive) {
      // Einfahrt: abgesenkter Bordstein links/rechts
      continue;
    }
    sb.box(TILE, SLAB, TILE, P.sidewalk, t.x, 0, t.z);
  }
  const c0 = map.tileCenter(b.x0, b.z0);
  const bcx = c0.x + (b.size - 1) * TILE / 2;
  const bcz = c0.z + (b.size - 1) * TILE / 2;
  const bw = b.size * TILE;
  // Bordsteinkante (an Einfahrten unterbrochen)
  for (const t of tiles) {
    if (t.drive) continue;
    if (t.dz === 0) sb.box(TILE, 0.08, 0.3, P.curb, t.x, SLAB - 0.04, t.z - TILE / 2 + 0.15);
    if (t.dz === b.size - 1) sb.box(TILE, 0.08, 0.3, P.curb, t.x, SLAB - 0.04, t.z + TILE / 2 - 0.15);
    if (t.dx === 0) sb.box(0.3, 0.08, TILE, P.curb, t.x - TILE / 2 + 0.15, SLAB - 0.04, t.z);
    if (t.dx === b.size - 1) sb.box(0.3, 0.08, TILE, P.curb, t.x + TILE / 2 - 0.15, SLAB - 0.04, t.z);
  }
  void bw;

  // Laternen an den Ecken
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    lamp(sb, bcx + sx * (bw / 2 - 0.3), bcz + sz * (bw / 2 - 0.3));
  }

  if (b.role === 'warehouse') return buildWarehouse(sb, map, b, bcx, bcz, rng, root);
  if (b.role === 'park') return buildPark(sb, b, bcx, bcz, rng, root, dynamic);

  // Kundenbereich: Einfahrt + Nachbar-Tiles
  const spot = b.spot;
  const reserved = new Set();
  if (spot) {
    const along = spot.nx !== 0 ? { x: 0, z: 1 } : { x: 1, z: 0 };
    for (const r of [1, 0, -1]) for (const s of [-1, 0, 1])
      reserved.add(`${spot.tx + spot.nx * r + along.x * s},${spot.tz + spot.nz * r + along.z * s}`);
    buildCustomer(sb, map, spot, rng, root, dynamic);
  }

  const center = Math.hypot(bcx, bcz) < 30;
  for (const t of tiles) {
    if (reserved.has(`${t.tx},${t.tz}`)) continue;
    if (t.edge) {
      // Ausrichtung zur Straße
      let nx = 0, nz = 0;
      if (t.dz === 0) nz = -1; else if (t.dz === b.size - 1) nz = 1;
      if (t.dx === 0) nx = -1; else if (t.dx === b.size - 1) nx = 1;
      if (nx && nz) { if (rng() < 0.5) nx = 0; else nz = 0; }
      const ry = Math.atan2(nx, nz);
      const L = new Local(sb, t.x, t.z, ry);
      const r = rng();
      if (center) {
        if (r < 0.35) shop(L, rng); else if (r < 0.75) apartment(L, rng); else if (r < 0.9) house(L, rng); else garden(L, rng);
      } else {
        if (r < 0.62) house(L, rng); else if (r < 0.74) shop(L, rng); else if (r < 0.84) apartment(L, rng); else garden(L, rng);
      }
    } else {
      backyard(new Local(sb, t.x, t.z, Math.floor(rng() * 4) * Math.PI / 2), rng, t.dx === 2 && t.dz === 2);
    }
  }
}

function lamp(sb, x, z) {
  sb.cyl(0.07, 2.6, '#4a525c', x, SLAB, z, 6);
  sb.box(0.5, 0.12, 0.22, '#4a525c', x, SLAB + 2.55, z);
  sb.box(0.36, 0.06, 0.16, '#fff3c4', x, SLAB + 2.5, z);
}

function tree(L, lx, lz, rng, s = 1) {
  const col = pick(P.greens, rng);
  L.cyl(0.12 * s, 0.9 * s, P.trunk, lx, SLAB, lz, 6);
  if (rng() < 0.5) {
    L.sphere(0.75 * s, col, lx, SLAB + 1.35 * s, lz, 1);
    L.sphere(0.5 * s, col, lx + 0.25 * s, SLAB + 1.9 * s, lz - 0.1 * s, 1);
  } else {
    L.cone(0.7 * s, 1.5 * s, col, lx, SLAB + 0.7 * s, lz, 7);
    L.cone(0.5 * s, 1.1 * s, col, lx, SLAB + 1.5 * s, lz, 7);
  }
}

function lawn(L, col = P.lawn) { L.box(3.7, 0.04, 3.7, col, 0, SLAB, 0); }

function windowRow(L, w, y, lz, count, col = P.glass, ww = 0.42, wh = 0.5, ox = 0, skip = null) {
  for (let i = 0; i < count; i++) {
    const lx = ox - w / 2 + (i + 0.5) * (w / count);
    if (skip && skip(lx)) continue;
    L.box(ww + 0.1, wh + 0.1, 0.06, '#ffffff', lx, y - 0.05, lz);
    L.box(ww, wh, 0.08, col, lx, y, lz);
  }
}

function heatPump(L, lx, lz, ry = 0) {
  L.rbox(0.7, 0.55, 0.3, '#f4f6f7', lx, SLAB, lz, ry, 0.05);
  L.cyl(0.18, 0.04, '#39434d', lx, SLAB + 0.27, lz + 0.16, 10);
}

function house(L, rng) {
  lawn(L);
  const wall = pick(P.walls, rng), roofc = pick(P.roofs, rng);
  const w = 2.6 + rng() * 0.5, d = 2.2 + rng() * 0.3, h = 1.6 + rng() * 0.5;
  const bz = -0.35;
  L.rbox(w, h, d, wall, 0, SLAB, bz, 0, 0.08);
  L.roof(w + 0.3, 1.0 + rng() * 0.3, d + 0.4, roofc, 0, SLAB + h, bz);
  // Tür + Fenster
  L.box(0.5, 0.9, 0.08, P.door, 0, SLAB, bz + d / 2 + 0.01);
  windowRow(L, w, SLAB + h * 0.55, bz + d / 2 + 0.02, 2, P.glass, 0.45, 0.45);
  L.box(0.08, 0.45, 0.45, P.glass, w / 2 + 0.02, SLAB + h * 0.55, bz);
  // Kamin
  if (rng() < 0.6) L.box(0.3, 0.8, 0.3, '#9a5b48', w * 0.25, SLAB + h + 0.3, bz - 0.3);
  // Solar auf dem Dach
  if (rng() < 0.35) L.add(boxGeo(w * 0.6, 0.06, 0.7), '#22344f', 0, SLAB + h + 0.42, bz + 0.45, 0, 0.62);
  // Wärmepumpe neben dem Haus
  if (rng() < 0.4) heatPump(L, w / 2 + 0.05, 0.9, 0);
  // Hecke vorne
  if (rng() < 0.6) {
    L.rbox(1.1, 0.4, 0.22, '#5a9a45', -1.25, SLAB, 1.0, 0, 0.1);
    L.rbox(1.1, 0.4, 0.22, '#5a9a45', 1.25, SLAB, 1.0, 0, 0.1);
  }
  if (rng() < 0.4) tree(L, -1.4, -1.4, rng, 0.8);
}

function shop(L, rng) {
  L.box(3.8, 0.02, 3.8, '#c9c2b5', 0, SLAB, 0);
  const col = pick(P.shops, rng);
  const h = 2.4 + rng() * 0.6;
  L.rbox(3.3, h, 2.8, '#f2ede4', 0, SLAB, -0.4, 0, 0.06);
  L.box(3.4, 0.25, 2.9, col, 0, SLAB + h - 0.05, -0.4);
  // Schaufenster
  L.box(2.4, 1.0, 0.08, P.glass, -0.3, SLAB + 0.35, 1.01);
  L.box(0.5, 1.2, 0.08, P.door, 1.2, SLAB, 1.01);
  // Markise
  L.add(boxGeo(3.1, 0.07, 0.8), col, 0, SLAB + 1.65, 1.3, 0, 0.35);
  windowRow(L, 3.0, SLAB + 2.1, 1.02, 3);
  // Klimagerät auf dem Dach
  L.rbox(0.8, 0.45, 0.6, '#e6e9ec', 0.8, SLAB + h + 0.2, -1.0, 0, 0.05);
  L.box(0.6, 0.06, 0.05, '#7b858f', 0.8, SLAB + h + 0.45, -0.69);
}

function apartment(L, rng) {
  L.box(3.8, 0.02, 3.8, '#c9c2b5', 0, SLAB, 0);
  const col = pick(P.apts, rng);
  const floors = 2 + Math.floor(rng() * 3);
  const h = floors * 1.15 + 0.4;
  L.rbox(3.2, h, 3.0, col, 0, SLAB, -0.3, 0, 0.06);
  L.box(3.3, 0.18, 3.1, '#8c8f94', 0, SLAB + h, -0.3);
  for (let f = 0; f < floors; f++) {
    const y = SLAB + 0.75 + f * 1.15;
    windowRow(L, 3.0, y, 1.21, 3);
    // Seitenfenster
    for (const s of [-0.8, 0.4]) L.box(0.08, 0.5, 0.42, P.glass, 1.61, y, s);
    if (f > 0 && rng() < 0.5) L.box(1.0, 0.08, 0.5, '#ffffff', 0, y - 0.35, 1.45);
  }
  L.box(0.6, 0.9, 0.08, P.door, 0, SLAB, 1.21);
  // Dach: Solar oder Lüftung
  if (rng() < 0.5) {
    for (let i = 0; i < 3; i++) L.add(boxGeo(0.8, 0.05, 0.6), '#22344f', -1 + i * 1.0, SLAB + h + 0.35, -0.6, 0, 0.5);
  } else {
    L.rbox(0.9, 0.5, 0.7, '#e6e9ec', -0.8, SLAB + h + 0.1, -0.8, 0, 0.05);
    L.cyl(0.15, 0.6, '#9aa3ab', 0.9, SLAB + h + 0.1, -0.4, 8);
  }
}

function garden(L, rng) {
  lawn(L);
  tree(L, -0.9, -0.6, rng, 1.1);
  tree(L, 1.0, 0.3, rng, 0.8);
  if (rng() < 0.5) L.rbox(1.6, 0.35, 0.3, '#5a9a45', -0.2, SLAB, 0.8, 0, 0.12);
  // Bank
  L.box(1.0, 0.08, 0.35, '#8b5e3c', 0.9, SLAB + 0.3, 0.75);
}

function backyard(L, rng, middle) {
  lawn(L, middle ? '#93c962' : P.lawn);
  const r = rng();
  if (middle && r < 0.3) {
    // Pool
    L.rbox(2.4, 0.1, 1.5, '#eeeeee', 0, SLAB, 0, 0, 0.05);
    L.box(2.1, 0.11, 1.2, '#4fb6d8', 0, SLAB + 0.01, 0);
    tree(L, 1.4, 1.4, rng, 0.8);
  } else if (r < 0.55) {
    tree(L, -0.8, -0.8, rng, 1);
    tree(L, 0.9, 0.7, rng, 1.2);
    if (rng() < 0.5) tree(L, -0.9, 1.0, rng, 0.7);
  } else if (r < 0.75) {
    // Gartenhaus
    L.rbox(1.2, 0.9, 1.0, '#a9764f', 0.5, SLAB, -0.5, 0, 0.05);
    L.roof(1.4, 0.5, 1.2, '#6d4a33', 0.5, SLAB + 0.9, -0.5);
    tree(L, -1.0, 1.0, rng, 0.9);
  } else {
    // Gemüsebeet
    for (let i = 0; i < 3; i++) L.box(2.4, 0.12, 0.4, '#6b4a2f', 0, SLAB, -0.8 + i * 0.8);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) L.sphere(0.13, '#5fae4a', -1 + k * 0.5, SLAB + 0.2, -0.8 + i * 0.8, 0);
    tree(L, 1.3, 1.3, rng, 0.7);
  }
}

// --- Sonder-Gebäude ---------------------------------------------------------

function signBoard(root, text, x, z, ry, y = 2.0, w = 3.0, opts = {}) {
  const tex = signTexture(text, opts);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), m);
  front.position.z = 0.04;
  const back = front.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.04;
  const frame = new THREE.Mesh(roundedBoxGeo(w + 0.12, w / 4 + 0.12, 0.07, 0.03), new THREE.MeshStandardMaterial({ color: '#39434d', roughness: 0.5 }));
  g.add(frame, front, back);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(cylGeo(0.05, 0.05, y, 6), frame.material);
    post.position.set(s * (w / 2 - 0.2), -y / 2, 0);
    g.add(post);
  }
  g.position.set(x, y + SLAB, z);
  g.rotation.y = ry;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.add(g);
  return g;
}

function buildCustomer(sb, map, spot, rng, root, dynamic) {
  const c = map.tileCenter(spot.tx, spot.tz);
  const ry = Math.atan2(spot.nx, spot.nz);
  const L = new Local(sb, c.x, c.z, ry); // lokales System: +z zeigt zur Straße, Anlieferspur bei (0,0), Vorplatz bei z = TILE
  // Vorplatz (3 Tiles breit) + Anlieferspur mit Bordsteinen
  L.box(TILE * 3, 0.03, TILE, '#737a83', 0, 0, TILE);
  L.box(TILE, 0.03, TILE, '#6b7079', 0, 0, 0);
  for (const s of [-1, 1]) {
    L.box(0.25, SLAB, TILE, P.curb, s * 1.95, 0, 0);
    L.box(0.25, SLAB, TILE, P.curb, s * (TILE * 1.5 - 0.12), 0, TILE);
    L.box(TILE - 0.1, SLAB, 0.25, P.curb, s * TILE, 0, TILE / 2 + 0.1);
  }
  // Markierung: Haltelinie + Pfeil auf dem Vorplatz
  L.box(3.0, 0.035, 0.18, '#f5b800', 0, 0, -1.7);
  for (let i = 0; i < 5; i++) L.box(0.5, 0.035, 0.35, i % 2 ? '#2b2f36' : '#f5b800', -1.0 + i * 0.5, 0, -1.95);
  L.box(0.25, 0.035, 1.4, '#e8e8e2', 0, 0, TILE + 0.6);
  L.add(boxGeo(0.25, 0.035, 0.7), '#e8e8e2', -0.22, 0, TILE - 0.2, 0, 0.7);
  L.add(boxGeo(0.25, 0.035, 0.7), '#e8e8e2', 0.22, 0, TILE - 0.2, 0, -0.7);
  // Rammpuffer am Gebäude/Anlieferplatz
  const bumpers = (z) => { for (const s of [-1, 1]) L.box(0.35, 0.5, 0.2, '#2b2f36', s * 0.9, SLAB + 0.15, z); };

  if (spot.type === 'site') {
    // Baustelle: Rohbau mit Gerüst, Bauzaun, Kran
    L.box(TILE * 3 - 0.4, 0.04, TILE * 2 - 0.4, '#b59a72', 0, SLAB, -TILE / 2);
    const wx = -TILE, wz = -TILE;
    L.box(4.6, 0.3, 3.4, '#a6a6a6', wx, SLAB, wz);
    L.box(4.4, 1.8, 0.3, '#c96f4a', wx, SLAB + 0.3, wz - 1.5);
    L.box(0.3, 1.8, 3.2, '#c96f4a', wx - 2.1, SLAB + 0.3, wz);
    L.box(2.2, 1.0, 0.3, '#c96f4a', wx + 1.0, SLAB + 0.3, wz + 1.5);
    // Gerüst
    for (let i = 0; i < 5; i++) L.cyl(0.04, 2.6, '#d9d9d9', wx - 2.2 + i * 1.1, SLAB, wz + 1.95, 5);
    for (const y of [1.0, 2.0]) L.box(4.6, 0.06, 0.5, '#c8a26b', wx, SLAB + y, wz + 1.95);
    // Paletten + Sand + Mischer
    L.box(1.0, 0.15, 0.8, '#c8a26b', TILE, SLAB, -TILE + 0.2);
    L.box(0.8, 0.6, 0.6, '#d1d1d1', TILE, SLAB + 0.15, -TILE + 0.2);
    L.cone(0.9, 0.7, '#e3c27f', TILE + 0.3, SLAB, -0.3 - TILE * 0.2, 10);
    L.cyl(0.35, 0.7, '#f28c28', -TILE + 0.8, SLAB, 0.6, 10, 0.25);
    // Anlieferplatz mit Paletten am Ende der Spur
    L.box(3.4, 0.03, 1.6, '#c9b089', 0, SLAB, -3.0);
    for (const x of [-1.0, 0.2]) { L.box(1.0, 0.15, 0.8, '#c8a26b', x, SLAB, -3.1); L.box(0.9, 0.5, 0.7, '#cfd5da', x, SLAB + 0.15, -3.1); }
    // Bauzaun vorne
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      L.box(1.1, 0.8, 0.05, '#dfe6ea', s * (2.6 + i * 1.15), SLAB, 1.7);
      L.box(0.2, 0.08, 0.3, '#f28c28', s * (2.6 + i * 1.15), SLAB, 1.7);
    }
    // Kran (dreht sich)
    const crane = makeCrane(rng);
    const [kx, kz] = L.tx(TILE, -TILE * 1.2);
    crane.position.set(kx, SLAB, kz);
    root.add(crane);
    dynamic.cranes.push({ jib: crane.userData.jib, speed: 0.15 + rng() * 0.2, phase: rng() * 6 });
    signBoard(root, spot.name, ...L.tx(-3.75, 1.85), ry, 1.4, 2.6, { accent: '#f28c28', icon: '🏗' });
  } else if (spot.type === 'company') {
    // Handwerksbetrieb: Halle mit Rolltor + Transporter
    L.box(TILE * 3 - 0.4, 0.03, TILE * 2 - 0.4, '#c9c2b5', 0, SLAB, -TILE / 2);
    L.rbox(8.6, 3.0, 4.2, '#e7eaee', -0.6, SLAB, -TILE - 0.6, 0, 0.08);
    L.box(8.7, 0.35, 4.3, '#2f6fb0', -0.6, SLAB + 2.72, -TILE - 0.6);
    // Anliefertor mittig zur Spur
    L.box(2.2, 2.2, 0.08, '#9aa3ab', 0, SLAB, -TILE + 1.52);
    for (let i = 0; i < 7; i++) L.box(2.1, 0.04, 0.09, '#808992', 0, SLAB + 0.3 + i * 0.28, -TILE + 1.53);
    L.box(2.5, 0.12, 0.1, '#f5b800', 0, SLAB + 2.2, -TILE + 1.55);
    bumpers(-TILE + 1.62);
    L.box(0.6, 1.1, 0.08, P.door, -3.1, SLAB, -TILE + 1.52);
    windowRow(L, 2.0, SLAB + 1.9, -TILE + 1.53, 2, P.glass, 0.6, 0.5, 2.6);
    // Transporter
    L.rbox(1.0, 1.0, 2.0, '#ffffff', TILE + 0.3, SLAB, -0.6, 0, 0.15);
    L.box(0.92, 0.45, 0.1, '#2b3a4a', TILE + 0.3, SLAB + 0.45, 0.42);
    // Rohrlager
    for (let i = 0; i < 4; i++) L.add(cylGeo(0.09, 0.09, 2.4, 8), '#c87533', -TILE - 0.2 + (i % 2) * 0.2, SLAB + 0.12 + Math.floor(i / 2) * 0.18, 0.2, 0, Math.PI / 2);
    signBoard(root, spot.name, ...L.tx(-3.75, 1.85), ry, 1.6, 2.6, { accent: '#2f6fb0', icon: '🔧' });
  } else {
    // Gewerbe/öffentliches Gebäude
    L.box(TILE * 3 - 0.4, 0.03, TILE * 2 - 0.4, '#d8d1c3', 0, SLAB, -TILE / 2);
    const col = pick(P.shops, rng);
    const h = 3.4 + rng() * 1.2;
    L.rbox(9.4, h, 4.4, '#f6f1e8', 0, SLAB, -TILE - 0.5, 0, 0.08);
    L.box(9.5, 0.3, 4.5, col, 0, SLAB + h - 0.1, -TILE - 0.5);
    windowRow(L, 8.6, SLAB + 1.0, -TILE + 1.73, 6, P.glass, 0.8, 0.8, 0, (x) => Math.abs(x) < 1.6 || Math.abs(x + 3.0) < 0.9);
    windowRow(L, 8.6, SLAB + 2.4, -TILE + 1.73, 6, P.glass, 0.8, 0.6);
    // Eingang links mit Vordach, Anlieferung mittig
    L.box(1.2, 1.5, 0.08, P.door, -3.0, SLAB, -TILE + 1.74);
    L.add(boxGeo(2.0, 0.07, 0.9), col, -3.0, SLAB + 1.7, -TILE + 2.15, 0, 0.3);
    L.box(2.2, 1.9, 0.08, '#9aa3ab', 0, SLAB, -TILE + 1.74);
    for (let i = 0; i < 6; i++) L.box(2.1, 0.04, 0.09, '#808992', 0, SLAB + 0.3 + i * 0.27, -TILE + 1.75);
    L.box(2.5, 0.12, 0.1, '#f5b800', 0, SLAB + 1.9, -TILE + 1.77);
    bumpers(-TILE + 1.84);
    L.rbox(1.0, 0.5, 0.8, '#e6e9ec', 2.8, SLAB + h + 0.2, -TILE - 1.0, 0, 0.05);
    L.rbox(1.0, 0.5, 0.8, '#e6e9ec', -2.8, SLAB + h + 0.2, -TILE - 1.0, 0, 0.05);
    for (const s of [-1, 1]) tree(L, s * 3.5, 0.6, rng, 0.9);
    signBoard(root, spot.name, ...L.tx(-3.75, 1.85), ry, 1.5, 2.6, { accent: '#' + new THREE.Color(col).getHexString() });
  }
}

function makeCrane(rng) {
  const g = new THREE.Group();
  const sb = new StaticBuilder();
  const yellow = '#f5b800';
  const h = 9 + rng() * 2;
  sb.box(1.2, 0.4, 1.2, '#7f8790', 0, 0, 0);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) sb.box(0.08, h, 0.08, yellow, x, 0.4, z);
  for (let y = 1; y < h; y += 1) {
    sb.box(0.68, 0.06, 0.06, yellow, 0, y, -0.3);
    sb.box(0.68, 0.06, 0.06, yellow, 0, y, 0.3);
    sb.box(0.06, 0.06, 0.68, yellow, -0.3, y, 0);
    sb.box(0.06, 0.06, 0.68, yellow, 0.3, y, 0);
  }
  g.add(sb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  const jib = new THREE.Group();
  jib.position.y = h + 0.4;
  const jb = new StaticBuilder();
  jb.box(9, 0.5, 0.5, yellow, 2.5, 0, 0);
  jb.box(1.2, 0.9, 1.0, '#e8e8e8', 0, -0.2, 0.7);
  jb.box(1.4, 1.0, 1.0, '#7f8790', -2.2, -0.3, 0);
  jb.box(0.04, 3.5, 0.04, '#333', 5.5, -3.5, 0);
  jb.box(0.8, 0.6, 0.8, '#4a7bc8', 5.5, -4.1, 0);
  jib.add(jb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  g.add(jib);
  g.userData.jib = jib;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function logoPlane(root, tex, w, h, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  root.add(m);
  return m;
}

function buildWarehouse(sb, map, b, bcx, bcz, rng, root) {
  const spot = b.spot;
  const ry = Math.atan2(spot.nx, spot.nz);
  const L = new Local(sb, bcx, bcz, ry); // +z zur Einfahrt
  // Hof (mit Aussparung für die abgesenkte Zufahrt in der Mitte)
  L.box(7.7, 0.03, 19.4, '#9a9c9f', -5.85, SLAB, 0);
  L.box(7.7, 0.03, 19.4, '#9a9c9f', 5.85, SLAB, 0);
  L.box(4.0, 0.03, 11.7, '#9a9c9f', 0, SLAB, -3.85);
  // Zufahrt: Tor-Tile + Spur bis zur Rampe, Bordsteine, Markierung
  L.box(TILE, 0.03, TILE * 2, '#6b7079', 0, 0, 6);
  for (const s of [-1, 1]) L.box(0.25, SLAB, TILE * 2, P.curb, s * 1.95, 0, 6);
  for (let i = 0; i < 4; i++) L.box(0.18, 0.035, 0.9, '#f5b800', 0, 0, 3.0 + i * 1.8);
  for (let i = 0; i < 5; i++) L.box(0.5, 0.035, 0.35, i % 2 ? '#2b2f36' : '#f5b800', -1.0 + i * 0.5, 0, 2.25);
  // Halle (Rampe endet genau an der Spur)
  const hw = 16, hd = 10, hh = 6.0, hz = -4.4;
  L.rbox(hw, hh, hd, '#eef0f2', 0, SLAB, hz, 0, 0.12);
  L.box(hw + 0.08, 0.7, hd + 0.08, '#b5002f', 0, SLAB + hh - 0.95, hz);
  L.box(hw + 0.08, 0.15, hd + 0.08, '#f5b800', 0, SLAB + hh - 1.1, hz);
  L.box(hw + 0.4, 0.35, hd + 0.4, '#8f969d', 0, SLAB + hh, hz);
  for (let i = -2; i <= 2; i++) L.box(1.6, 0.25, 3.5, '#bcd7ea', i * 3, SLAB + hh + 0.3, hz);
  // Rolltore + Rampe (Rammpuffer an der Anlieferspur)
  L.box(hw - 1, 0.7, 1.4, '#a2a7ad', 0, SLAB, hz + hd / 2 + 0.7);
  for (const s of [-1, 1]) L.box(0.35, 0.5, 0.2, '#2b2f36', s * 0.9, SLAB + 0.2, hz + hd / 2 + 1.45);
  for (const x of [-5, 0, 5]) {
    L.box(2.6, 2.6, 0.08, '#6d757e', x, SLAB + 0.7, hz + hd / 2 + 0.01);
    for (let i = 0; i < 7; i++) L.box(2.5, 0.04, 0.09, '#59616a', x, SLAB + 0.9 + i * 0.32, hz + hd / 2 + 0.02);
    L.box(2.8, 0.15, 0.4, '#f5b800', x, SLAB + 3.35, hz + hd / 2 + 0.15);
  }
  // Paletten mit Ware
  const goods = ['#f4f6f7', '#c87533', '#e8e2d0', '#d9dee3'];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const lx = side * (6.5 + (i % 3 === 1 ? 1.2 : 0));
    const lz = 4 + (i % 3) * 1.6;
    L.box(1.1, 0.14, 1.1, '#c8a26b', lx, SLAB, lz);
    L.rbox(0.95, 0.7 + rng() * 0.5, 0.95, pick(goods, rng), lx, SLAB + 0.14, lz, 0, 0.06);
  }
  // Zaun um den Hof (mit Lücke an der Einfahrt)
  for (let i = -9; i <= 9; i += 1.5) {
    if (Math.abs(i) > 2.4) L.box(1.4, 0.9, 0.05, '#c8cdd2', i, SLAB, 9.6);
    L.box(1.4, 0.9, 0.05, '#c8cdd2', i, SLAB, -9.6);
    L.box(0.05, 0.9, 1.4, '#c8cdd2', -9.6, SLAB, i);
    L.box(0.05, 0.9, 1.4, '#c8cdd2', 9.6, SLAB, i);
  }
  // Logo-Flächen auf allen Seiten
  const tex = logoPanelTexture(1024, 300, { stripe: false });
  const ar = 300 / 1024;
  const faces = [
    [0, hz + hd / 2 + 0.03, 0, 5.2, SLAB + 4.45],
    [0, hz - hd / 2 - 0.03, Math.PI, 9.5, SLAB + 2.9],
    [hw / 2 + 0.03, hz, Math.PI / 2, 8.0, SLAB + 2.9],
    [-hw / 2 - 0.03, hz, -Math.PI / 2, 8.0, SLAB + 2.9],
  ];
  for (const [lx, lz, r, w, y] of faces) {
    const [x, z] = L.tx(lx, lz);
    logoPlane(root, tex, w, w * ar, x, y, z, ry + r);
  }
  // Pylon an der Einfahrt
  const ptex = logoPanelTexture(512, 1024, { stripe: true, sub: spot.name.replace('G&R ', '') });
  const [px, pz] = L.tx(3.2, 8.6);
  const pylon = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.5 });
  const side = new THREE.MeshStandardMaterial({ color: '#b1002e', roughness: 0.5 });
  const py = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, 0.3), [side, side, side, side, pm, pm]);
  py.position.y = SLAB + 1.4 + 0.4;
  py.castShadow = true;
  const foot = new THREE.Mesh(boxGeo(1.6, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: '#59616a' }));
  foot.position.y = SLAB + 0.2;
  pylon.add(py, foot);
  pylon.position.set(px, 0, pz);
  pylon.rotation.y = ry + 0.35;
  root.add(pylon);
}

function buildPark(sb, b, bcx, bcz, rng, root, dynamic) {
  const L = new Local(sb, bcx, bcz, 0);
  L.box(19.4, 0.03, 19.4, '#93c962', 0, SLAB, 0);
  // Wege
  L.box(19.4, 0.04, 2.0, '#e2d6bd', 0, SLAB, 0);
  L.box(2.0, 0.04, 19.4, '#e2d6bd', 0, SLAB, 0);
  L.cyl(4.0, 0.05, '#e2d6bd', 0, SLAB, 0, 24);
  // Brunnen
  L.cyl(2.2, 0.5, '#c9c2b5', 0, SLAB, 0, 24);
  L.cyl(1.95, 0.52, '#5fb9dc', 0, SLAB, 0, 24);
  L.cyl(0.35, 1.3, '#c9c2b5', 0, SLAB, 0, 10);
  L.cyl(0.9, 0.2, '#c9c2b5', 0, SLAB + 1.3, 0, 16);
  const water = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9fe0f5', transparent: true, opacity: 0.8, roughness: 0.1 }));
  water.position.set(bcx, SLAB + 1.5, bcz);
  root.add(water);
  dynamic.fountains.push(water);
  // Bäume und Bänke
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [-7.5, -2.8], [7.5, 2.8], [-2.8, 7.5], [2.8, -7.5], [-4, -8], [8, -4]]) tree(L, x, z, rng, 1.2 + rng() * 0.4);
  for (const [x, z, r] of [[3.4, 1.5, 0], [-3.4, -1.5, Math.PI], [1.5, -3.4, Math.PI / 2], [-1.5, 3.4, -Math.PI / 2]]) {
    const B = new Local(sb, bcx + x, bcz + z, r);
    B.box(1.4, 0.08, 0.45, '#8b5e3c', 0, SLAB + 0.35, 0);
    B.box(1.4, 0.4, 0.06, '#8b5e3c', 0, SLAB + 0.45, -0.22);
    B.box(0.08, 0.35, 0.4, '#3d434a', -0.6, SLAB, 0);
    B.box(0.08, 0.35, 0.4, '#3d434a', 0.6, SLAB, 0);
  }
  // Plakatwand mit Logo
  const tex = logoPanelTexture(1024, 420, { stripe: true, sub: 'Ihr Partner für Haustechnik' });
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5 * 420 / 1024), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  board.position.set(0, 3.2, 0.06);
  const back = new THREE.Mesh(new THREE.BoxGeometry(6.8, 6.8 * 420 / 1024 + 0.1, 0.1), new THREE.MeshStandardMaterial({ color: '#39434d' }));
  back.position.set(0, 3.2, 0);
  back.castShadow = true;
  g.add(board, back);
  for (const s of [-2, 2]) {
    const p = new THREE.Mesh(cylGeo(0.1, 0.1, 2.0, 8), back.material);
    p.position.set(s, 1.0, -0.05);
    p.castShadow = true;
    g.add(p);
  }
  g.position.set(bcx + 6.5, SLAB, bcz + 6.5);
  g.rotation.y = Math.PI / 4;
  root.add(g);
}

function buildOutskirts(sb, rng, size) {
  const half = size / 2;
  const L = new Local(sb, 0, 0, 0);
  // Felder
  const fields = ['#c9b458', '#a8c46a', '#b58b5a', '#d8c77a', '#9bbf5e'];
  for (let i = 0; i < 26; i++) {
    const ang = rng() * Math.PI * 2;
    const r = half + 18 + rng() * 45;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const w = 10 + rng() * 14, d = 8 + rng() * 12;
    const col = pick(fields, rng);
    const F = new Local(sb, x, z, Math.floor(rng() * 2) * Math.PI / 2);
    // jedes Feld eine eigene Höhe, damit überlappende Felder nicht flackern (Z-Fighting)
    const fy = i * 0.012;
    F.box(w, 0.06 + fy, d, col, 0, -0.03, 0);
    for (let k = 0; k < Math.floor(d / 1.2); k++) F.box(w - 0.6, 0.05, 0.22, new THREE.Color(col).multiplyScalar(0.85).getStyle(), 0, 0.03 + fy - 0.01, -d / 2 + 0.6 + k * 1.2);
  }
  // Baumgürtel
  for (let i = 0; i < 420; i++) {
    const x = (rng() * 2 - 1) * (half + 70);
    const z = (rng() * 2 - 1) * (half + 70);
    if (Math.abs(x) < half + 3 && Math.abs(z) < half + 3) continue;
    const near = Math.max(Math.abs(x), Math.abs(z)) < half + 14;
    if (!near && rng() < 0.5) continue;
    tree(new Local(sb, x, z, 0), 0, 0, rng, 1 + rng() * 0.8);
  }
  // Ein paar Bauernhöfe
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + rng();
    const r = half + 12 + rng() * 16;
    const H = new Local(sb, Math.cos(ang) * r, Math.sin(ang) * r, rng() * Math.PI);
    H.rbox(4, 2.4, 3, pick(P.walls, rng), 0, 0, 0, 0, 0.08);
    H.roof(4.4, 1.6, 3.6, pick(P.roofs, rng), 0, 2.4, 0);
    H.rbox(3, 2.8, 5, '#a3483a', 5, 0, 1, 0, 0.08);
    H.roof(3.3, 1.4, 5.4, '#6d4a33', 5, 2.8, 1, Math.PI / 2);
  }
  void L;
}
