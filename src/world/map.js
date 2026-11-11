// Logische Stadtkarte: Tile-Grid, Straßengraph, Lager- und Kunden-Spots
import { TILE, N, ROAD_EVERY, ROAD_W } from '../config.js';
import { mulberry32 } from '../util.js';

export const T = { ROAD: 0, DRIVE: 1, SOLID: 2, OUT: 3 };
export const DIRS = [
  { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
];

const WAREHOUSE_NAMES = ['G&R Lager Nord', 'G&R Lager Ost', 'G&R Lager Süd'];
const CUSTOMERS = [
  { name: 'Neubau Lindenweg', type: 'site' },
  { name: 'Bäckerei Schmid', type: 'shop' },
  { name: 'Hotel Krone', type: 'shop' },
  { name: 'Sanitär Huber', type: 'company' },
  { name: 'Kita Sonnenschein', type: 'site' },
  { name: 'Heizung Maier', type: 'company' },
  { name: 'Rathaus', type: 'shop' },
  { name: 'Hallenbad', type: 'site' },
  { name: 'Altbau Sanierung', type: 'site' },
  { name: 'Praxis Dr. Klein', type: 'shop' },
  { name: 'Klima Kraft GmbH', type: 'company' },
  { name: 'Wohnpark Am Bach', type: 'site' },
];

export const isRoadLine = (i) => i % ROAD_EVERY === 0;
export const NODES = (N - 1) / ROAD_EVERY + 1; // 5 Knoten pro Achse

// Nicht-uniformes Raster: Straßenachsen sind ROAD_W breit, Block-Tiles TILE
export const SIZES = Array.from({ length: N }, (_, i) => (isRoadLine(i) ? ROAD_W : TILE));
export const WORLD = SIZES.reduce((a, b) => a + b, 0);
export const EDGES = []; // linke Kante je Index in Weltkoordinaten (zentriert)
{ let acc = -WORLD / 2; for (let i = 0; i < N; i++) { EDGES.push(acc); acc += SIZES[i]; } }
// Tile-Mitte je Index; außerhalb der Stadt geht es im TILE-Raster an der Außenkante weiter
const axisCenter = (i) => {
  if (i < 0) return EDGES[0] + (i + 0.5) * TILE;
  if (i >= N) return WORLD / 2 + (i - N + 0.5) * TILE;
  return EDGES[i] + SIZES[i] / 2;
};
const axisIndex = (w) => {
  if (w < EDGES[0]) return Math.floor((w - EDGES[0]) / TILE);
  for (let i = 0; i < N; i++) if (w < EDGES[i] + SIZES[i]) return i;
  return N + Math.floor((w - WORLD / 2) / TILE);
};

export class CityMap {
  constructor(seed = 615) {
    this.rng = mulberry32(seed);
    this.n = N;
    this.tiles = new Uint8Array(N * N).fill(T.SOLID);
    this.blocked = new Set(); // dynamisch gesperrte Tiles (Straßensperren)
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++)
        if (isRoadLine(x) || isRoadLine(z)) this.tiles[z * N + x] = T.ROAD;

    // Blöcke
    this.blocks = [];
    const nb = NODES - 1;
    for (let bz = 0; bz < nb; bz++)
      for (let bx = 0; bx < nb; bx++)
        this.blocks.push({ bx, bz, x0: bx * ROAD_EVERY + 1, z0: bz * ROAD_EVERY + 1, size: ROAD_EVERY - 1, role: 'normal' });

    const getBlock = (bx, bz) => this.blocks.find((b) => b.bx === bx && b.bz === bz);
    const whBlocks = [getBlock(0, 0), getBlock(3, 1), getBlock(1, 3)];
    const parkBlock = getBlock(2, 2);
    parkBlock.role = 'park';

    this.warehouses = [];
    this.customers = [];
    whBlocks.forEach((b, i) => {
      b.role = 'warehouse';
      // Einfahrt zur Stadtmitte hin
      const side = i === 0 ? 'e' : i === 1 ? 'w' : 'n';
      this.warehouses.push(this._makeSpot(b, side, { id: i, name: WAREHOUSE_NAMES[i], kind: 'warehouse' }, false));
    });

    let ci = 0;
    const sides = ['n', 's', 'e', 'w'];
    for (const b of this.blocks) {
      if (b.role !== 'normal') continue;
      const c = CUSTOMERS[ci];
      b.role = 'customer';
      const side = sides[Math.floor(this.rng() * 4)];
      const spot = this._makeSpot(b, side, { id: ci, name: c.name, type: c.type, kind: 'customer' }, true);
      this.customers.push(spot);
      ci++;
    }
  }

  // Einfahrt in der Mitte einer Blockkante: Tor-Tile an der Straße + Anlieferspur ein Tile tiefer.
  // wide = Kunden-Vorplatz (Tor-Reihe 3 Tiles breit). Die Ladezone liegt in der Spur, also abseits der Straße.
  _makeSpot(b, side, data, wide) {
    const m = Math.floor(b.size / 2);
    let tx, tz, nx = 0, nz = 0;
    if (side === 'n') { tx = b.x0 + m; tz = b.z0; nz = -1; }
    if (side === 's') { tx = b.x0 + m; tz = b.z0 + b.size - 1; nz = 1; }
    if (side === 'w') { tx = b.x0; tz = b.z0 + m; nx = -1; }
    if (side === 'e') { tx = b.x0 + b.size - 1; tz = b.z0 + m; nx = 1; }
    const ix = tx - nx, iz = tz - nz; // Anlieferspur
    const ax = nx !== 0 ? 0 : 1, az = nx !== 0 ? 1 : 0;
    this.tiles[tz * N + tx] = T.DRIVE;
    this.tiles[iz * N + ix] = T.DRIVE;
    if (wide) for (const s of [-1, 1]) this.tiles[(tz + az * s) * N + tx + ax * s] = T.DRIVE;
    const c = this.tileCenter(ix, iz);
    const off = wide ? 0.4 : 0.6;
    b.spot = { ...data, tx: ix, tz: iz, gx: tx, gz: tz, nx, nz, side, block: b, wide,
      x: c.x + nx * off, z: c.z + nz * off };
    return b.spot;
  }

  tileCenter(x, z) {
    return { x: axisCenter(x), z: axisCenter(z) };
  }
  // halbe Ausdehnung eines Tiles
  tileHalf(x, z) {
    return { x: (x >= 0 && x < N ? SIZES[x] : TILE) / 2, z: (z >= 0 && z < N ? SIZES[z] : TILE) / 2 };
  }
  worldToTile(wx, wz) {
    return { x: axisIndex(wx), z: axisIndex(wz) };
  }
  get(x, z) {
    if (x < 0 || z < 0 || x >= N || z >= N) return T.OUT;
    return this.tiles[z * N + x];
  }
  isSolid(x, z) {
    const t = this.get(x, z);
    return t === T.SOLID || t === T.OUT || this.blocked.has(z * N + x);
  }
  isDrivable(x, z) { return !this.isSolid(x, z); }

  // Knoten (Kreuzung) -> Weltkoordinate
  nodePos(i, j) { return this.tileCenter(i * ROAD_EVERY, j * ROAD_EVERY); }
  nodeValid(i, j) { return i >= 0 && j >= 0 && i < NODES && j < NODES; }
  edgeKey(i, j, i2, j2) {
    return i < i2 || (i === i2 && j < j2) ? `${i},${j}|${i2},${j2}` : `${i2},${j2}|${i},${j}`;
  }
  // mittleres Sperr-Tile einer Kante (Offset 2, damit Einfahrten an Offset 3 frei bleiben)
  edgeTiles(i, j, i2, j2) {
    const tiles = [];
    const ax = i * ROAD_EVERY, az = j * ROAD_EVERY;
    const dx = Math.sign(i2 - i), dz = Math.sign(j2 - j);
    for (let k = 1; k < ROAD_EVERY; k++) tiles.push({ x: ax + dx * k, z: az + dz * k });
    return tiles;
  }

  // BFS über befahrbare Tiles; liefert Distanz- und Vorgänger-Arrays
  bfs(sx, sz) {
    const dist = new Int32Array(N * N).fill(-1);
    const prev = new Int32Array(N * N).fill(-1);
    if (!this.isDrivable(sx, sz)) return { dist, prev };
    const q = [sz * N + sx];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      const cx = cur % N, cz = (cur / N) | 0;
      for (const d of DIRS) {
        const nx = cx + d.x, nz = cz + d.z;
        if (!this.isDrivable(nx, nz)) continue;
        const ni = nz * N + nx;
        if (dist[ni] >= 0) continue;
        dist[ni] = dist[cur] + 1;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    return { dist, prev };
  }
  pathTo(bfsRes, tx, tz) {
    const path = [];
    let cur = tz * N + tx;
    if (bfsRes.dist[cur] < 0) return path;
    while (cur >= 0) { path.push({ x: cur % N, z: (cur / N) | 0 }); cur = bfsRes.prev[cur]; }
    return path.reverse();
  }
}
