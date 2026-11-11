// Prozedurale SHK-Produkte (ohne Fremdmarken) + Thumbnail-Erzeugung für das HUD
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const M = (color, rough = 0.45, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const WHITE = M('#f6f7f8', 0.35);
const DARK = M('#2b333b', 0.6);
const COPPER = M('#c8743a', 0.3, 0.7);
const CHROME = M('#c9d1d8', 0.2, 0.9);
const RB = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, r);

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const BUILDERS = {
  heatpump() {
    const g = new THREE.Group();
    g.add(mesh(RB(1.1, 0.8, 0.45), WHITE, 0, 0.4, 0));
    const fan = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), DARK, -0.18, 0.42, 0.23);
    fan.rotation.x = Math.PI / 2;
    g.add(fan);
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.58, 0.02, 0.02), M('#9aa3ab'), -0.18, 0.2 + i * 0.15, 0.26));
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.5, 0.02), M('#d9dde1'), 0.36, 0.42, 0.23));
    return g;
  },
  boiler() {
    const g = new THREE.Group();
    g.add(mesh(RB(0.6, 1.0, 0.45), WHITE, 0, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.14, 0.02), M('#1c2a38'), 0, 0.72, 0.23));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), M('#3fd06b', 0.3), -0.06, 0.72, 0.24));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), COPPER, -0.15 + i * 0.15, -0.08, 0.05));
    return g;
  },
  aircon() {
    const g = new THREE.Group();
    g.add(mesh(RB(1.2, 0.36, 0.3, 0.1), WHITE, 0, 0.18, 0));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(1.0, 0.015, 0.03), M('#c6ccd1'), 0, 0.06 + i * 0.02, 0.15));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), M('#48b5ff', 0.3), 0.45, 0.28, 0.155));
    return g;
  },
  pipes() {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 1.3, 12);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - (r % 2); c++) {
      const p = mesh(geo, COPPER, -0.2 + c * 0.13 + (r % 2) * 0.065, 0.07 + r * 0.115, 0);
      p.rotation.x = Math.PI / 2;
      g.add(p);
    }
    for (const z of [-0.4, 0.4]) {
      const strap = mesh(new THREE.TorusGeometry(0.27, 0.02, 6, 24), M('#2f6fb0'), 0, 0.18, z);
      strap.scale.set(1, 0.75, 1);
      g.add(strap);
    }
    return g;
  },
  bathtub() {
    const g = new THREE.Group();
    const L = 1.3, W = 0.7, H = 0.45, t = 0.07;
    g.add(mesh(RB(L, 0.08, W, 0.03), WHITE, 0, 0.04, 0));
    g.add(mesh(RB(L, H, t, 0.03), WHITE, 0, H / 2, W / 2 - t / 2));
    g.add(mesh(RB(L, H, t, 0.03), WHITE, 0, H / 2, -W / 2 + t / 2));
    g.add(mesh(RB(t, H, W, 0.03), WHITE, L / 2 - t / 2, H / 2, 0));
    g.add(mesh(RB(t, H, W, 0.03), WHITE, -L / 2 + t / 2, H / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(L - 0.14, 0.02, W - 0.14), M('#dcecf5', 0.2), 0, 0.09, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), CHROME, L / 2 - 0.12, H + 0.08, 0));
    return g;
  },
  toilet() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.38, 20), WHITE, 0, 0.19, 0.05));
    g.add(mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.06, 20), WHITE, 0, 0.41, 0.07));
    g.add(mesh(RB(0.48, 0.42, 0.18, 0.05), WHITE, 0, 0.62, -0.2));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.06), CHROME, 0, 0.84, -0.2));
    return g;
  },
  radiator() {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) g.add(mesh(RB(0.1, 0.65, 0.16, 0.04), WHITE, -0.44 + i * 0.11, 0.38, 0));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.05, 0.08), WHITE, 0, 0.7, 0));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.05, 0.08), WHITE, 0, 0.07, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), CHROME, 0.55, 0.62, 0));
    return g;
  },
  tank() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 24), WHITE, 0, 0.6, 0));
    g.add(mesh(new THREE.SphereGeometry(0.3, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, 0, 1.15, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 24), M('#b5002f'), 0, 0.9, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), DARK, (i - 1) * 0.15, 0.05, 0));
    return g;
  },
};

export const PRODUCTS = [
  // size = belegte Ladeplätze, fragile = nimmt bei Remplern Schaden
  { id: 'heatpump', name: 'Wärmepumpe', icon: '🌀', size: 2, emergency: 'Heizungsausfall' },
  { id: 'boiler', name: 'Brennwertkessel', icon: '🔥', size: 1, fragile: true, emergency: 'Heizungsausfall' },
  { id: 'aircon', name: 'Klimagerät', icon: '❄️', size: 1, emergency: 'Klimaanlage ausgefallen' },
  { id: 'pipes', name: 'Kupferrohre', icon: '🟠', size: 1, emergency: 'Rohrbruch' },
  { id: 'bathtub', name: 'Badewanne', icon: '🛁', size: 2, emergency: 'Wasserschaden' },
  { id: 'toilet', name: 'WC-Keramik', icon: '🚽', size: 1, fragile: true, emergency: 'WC verstopft & gesprungen' },
  { id: 'radiator', name: 'Heizkörper', icon: '♨️', size: 1, emergency: 'Heizkörper geplatzt' },
  { id: 'tank', name: 'Warmwasserspeicher', icon: '💧', size: 1, emergency: 'Kein Warmwasser' },
];

const cache = new Map();
export function makeProduct(id) {
  if (!cache.has(id)) cache.set(id, BUILDERS[id]());
  return cache.get(id).clone();
}

// Rendert jedes Produkt einmal in ein kleines Bild (DataURL) für HUD und Sprites
export function renderThumbnails(size = 160) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8899aa', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dd', 2.4);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const out = {};
  for (const p of PRODUCTS) {
    const obj = makeProduct(p.id);
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() * 0.5;
    const dist = r / Math.sin((30 * Math.PI) / 360) * 1.05;
    cam.position.set(c.x + dist * 0.55, c.y + dist * 0.45, c.z + dist * 0.7);
    cam.lookAt(c);
    renderer.render(scene, cam);
    out[p.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(obj);
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}
