// Renderer, orthografische Iso-Kamera und Licht
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { QUALITY } from '../config.js';
import { damp } from '../util.js';

export const ISO_DIR = new THREE.Vector3(1, 1.05, 1).normalize();

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY === 'low' ? 1 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  return renderer;
}

const _isoD = new THREE.Vector3(), _isoL = new THREE.Vector3(), _yAxis = new THREE.Vector3(0, 1, 0);

export class IsoCamera {
  constructor() {
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
    this.target = new THREE.Vector3();
    this.height = 30;         // sichtbare Höhe in Welteinheiten
    this.orbit = 0;           // Zusatzwinkel (Titel-Kamerafahrt)
    this.distance = 120;
    this.shake = 0;
    this.resize();
  }
  resize() {
    const a = window.innerWidth / window.innerHeight;
    const h = this.height / 2;
    this.cam.left = -h * a; this.cam.right = h * a; this.cam.top = h; this.cam.bottom = -h;
    this.cam.updateProjectionMatrix();
  }
  follow(pos, dt, lambda = 4) {
    this.target.x = damp(this.target.x, pos.x, lambda, dt);
    this.target.z = damp(this.target.z, pos.z, lambda, dt);
  }
  setHeight(h, dt, lambda = 2) {
    const nh = dt ? damp(this.height, h, lambda, dt) : h;
    if (Math.abs(nh - this.height) > 1e-3) { this.height = nh; this.resize(); }
  }
  update(dt) {
    const d = _isoD.copy(ISO_DIR).applyAxisAngle(_yAxis, this.orbit).multiplyScalar(this.distance);
    this.cam.position.copy(this.target).add(d);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      const s = this.shake * 0.5;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.z += (Math.random() - 0.5) * s;
    }
    this.cam.lookAt(_isoL.copy(this.cam.position).sub(d));
  }
}

// Tageslauf-Stützpunkte (p: 0 = Sonnenaufgang 6:30, 1 = Sonnenuntergang 18:30)
const DAY = [
  { p: 0.0, elev: 16, sun: '#ff9a55', sunI: 1.5, sky: '#f0bfa0', ground: '#5d4c40', hemiI: 0.5, bg: '#e9a987', env: 0.18, tint: [1.07, 0.96, 0.9] },
  { p: 0.18, elev: 34, sun: '#ffd9ae', sunI: 1.95, sky: '#d9e4ee', ground: '#6f6450', hemiI: 0.62, bg: '#b9d6e6', env: 0.24, tint: [1.03, 0.99, 0.95] },
  { p: 0.5, elev: 58, sun: '#fff1dc', sunI: 2.15, sky: '#d3e8fb', ground: '#7d7255', hemiI: 0.72, bg: '#9cc9e2', env: 0.28, tint: [1.0, 1.0, 0.99] },
  { p: 0.8, elev: 34, sun: '#ffcf94', sunI: 1.95, sky: '#e6dccf', ground: '#6f5f48', hemiI: 0.6, bg: '#c3cfd8', env: 0.24, tint: [1.05, 0.98, 0.92] },
  { p: 1.0, elev: 15, sun: '#ff7a3a', sunI: 1.55, sky: '#dc9c8c', ground: '#4f3f3a', hemiI: 0.48, bg: '#e0947a', env: 0.16, tint: [1.12, 0.93, 0.84] },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
const lerpCol = (target, a, b, t) => target.copy(_ca.set(a)).lerp(_cb.set(b), t);

export function createLights(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  scene.background = new THREE.Color('#9cc9e2');

  const hemi = new THREE.HemisphereLight('#d3e8fb', '#7d7255', 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.15);
  sun.castShadow = true;
  const S = 34;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
  const ms = QUALITY === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(ms, ms);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // Sonnenrichtung (wird vom Tageslauf gesetzt) + Licht-Basis wie die Schattenkamera (lookAt mit up = +Y)
  const offset = new THREE.Vector3(-28, 55, 18);
  const lz = new THREE.Vector3(), lx = new THREE.Vector3(), ly = new THREE.Vector3();
  const updateBasis = () => {
    lz.copy(offset).normalize();
    lx.set(0, 1, 0).cross(lz).normalize();
    ly.copy(lz).cross(lx);
  };
  updateBasis();
  let shadowHalf = S;
  const snapped = new THREE.Vector3();
  const tint = new THREE.Vector3(1, 1, 1);
  return {
    sun, hemi, tint,
    // p in [0,1]: Sonnenstand, Lichtfarben und Himmel interpolieren
    setTimeOfDay(p) {
      p = Math.min(1, Math.max(0, p));
      let i = 0;
      while (i < DAY.length - 2 && p > DAY[i + 1].p) i++;
      const a = DAY[i], b = DAY[i + 1];
      const t = (p - a.p) / (b.p - a.p);
      const k = t * t * (3 - 2 * t);
      const mix = (x, y) => x + (y - x) * k;
      lerpCol(sun.color, a.sun, b.sun, k);
      sun.intensity = mix(a.sunI, b.sunI);
      lerpCol(hemi.color, a.sky, b.sky, k);
      lerpCol(hemi.groundColor, a.ground, b.ground, k);
      hemi.intensity = mix(a.hemiI, b.hemiI);
      lerpCol(scene.background, a.bg, b.bg, k);
      scene.environmentIntensity = mix(a.env, b.env);
      tint.set(mix(a.tint[0], b.tint[0]), mix(a.tint[1], b.tint[1]), mix(a.tint[2], b.tint[2]));
      // Sonne wandert von Ost (morgens) über Süd nach West (abends)
      const elev = THREE.MathUtils.degToRad(mix(a.elev, b.elev));
      const az = THREE.MathUtils.degToRad(210 - p * 130); // mittags ≈ bisherige Lichtrichtung
      offset.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).multiplyScalar(70);
      updateBasis();
    },
    setShadowSize(s) {
      shadowHalf = s;
      sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
      sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.normalBias = Math.max(0.03, (2 * s / sun.shadow.mapSize.x) * 1.5);
    },
    follow(target) {
      // im Lichtraum auf das Texel-Raster der Shadow-Map einrasten -> keine flimmernden Schattenkanten
      const texel = (2 * shadowHalf) / sun.shadow.mapSize.x;
      const t = snapped.set(target.x, 0, target.z);
      const u = Math.round(t.dot(lx) / texel) * texel;
      const v = Math.round(t.dot(ly) / texel) * texel;
      const w = t.dot(lz);
      snapped.copy(lx).multiplyScalar(u).addScaledVector(ly, v).addScaledVector(lz, w);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).add(offset);
    },
  };
}
