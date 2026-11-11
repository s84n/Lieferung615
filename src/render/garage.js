// Garage / Fahrzeugwahl: eigener Showroom mit Drehscheibe, der gewählte LKW dreht sich groß im Licht
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { damp } from '../util.js';

function gradientTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(330, 230, 20, 300, 260, 420);
  grd.addColorStop(0, '#4a4f58');
  grd.addColorStop(0.55, '#24272d');
  grd.addColorStop(1, '#0e0f12');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorFadeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createGarage(renderer, skins, buildModel) {
  const scene = new THREE.Scene();
  scene.background = gradientTexture();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const cam = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.5, 100);

  // Licht: Hauptspot, Gegenlicht, weiches Fülllicht
  scene.add(new THREE.HemisphereLight('#dfe8f2', '#3a3530', 0.55));
  const key = new THREE.SpotLight('#fff3e2', 120, 30, 0.5, 0.6, 1.6);
  key.position.set(5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#9fc4ff', 1.3);
  rim.position.set(-6, 4, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffd7b0', 0.5);
  fill.position.set(-5, 2, 5);
  scene.add(fill);

  // Boden + Drehscheibe
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
    new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.85, metalness: 0.0, alphaMap: floorFadeTexture(), transparent: true }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const turntable = new THREE.Group();
  scene.add(turntable);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.4, 0.16, 64), new THREE.MeshStandardMaterial({ color: '#2c2f35', roughness: 0.5, metalness: 0.25 }));
  disc.position.y = 0.08;
  disc.receiveShadow = true;
  turntable.add(disc);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#f5b800', emissive: '#f5b800', emissiveIntensity: 0.7 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.32, 0.035, 8, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.16;
  turntable.add(ring);

  // ein Modell pro Design
  const models = skins.map((skin) => {
    const m = buildModel(skin);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    m.position.y = 0.16;
    m.visible = false;
    scene.add(m);
    return m;
  });

  let index = 0;
  let slide = 0;      // -1..1: Ein-/Ausfahranimation
  let prev = -1;
  let spin = -0.7;

  function resize() {
    cam.aspect = window.innerWidth / window.innerHeight;
    // Platz für den Text links lassen: LKW rechts von der Mitte
    cam.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.12, 0, window.innerWidth, window.innerHeight);
    cam.updateProjectionMatrix();
  }
  resize();

  return {
    scene, cam, resize,
    get index() { return index; },
    select(i, dir = 1) {
      if (i === index && models[i].visible) return;
      prev = index;
      index = (i + skins.length) % skins.length;
      slide = dir;
      ringMat.color.set(skins[index].id === 'classic' ? '#f5b800' : '#d7dde3');
      ringMat.emissive.copy(ringMat.color);
    },
    show(i) { index = i; prev = -1; slide = 0; models.forEach((m, k) => { m.visible = k === i; }); },
    update(dt, t) {
      spin += dt * 0.35;
      slide = damp(slide, 0, 5, dt);
      models.forEach((m, k) => {
        const isCur = k === index;
        const isPrev = k === prev && Math.abs(slide) > 0.02;
        m.visible = isCur || isPrev;
        if (isCur) {
          m.position.x = slide * 9;
          m.rotation.y = spin;
        } else if (isPrev) {
          m.position.x = (slide - Math.sign(slide)) * 9;
          m.rotation.y = spin;
        }
      });
      turntable.rotation.y = spin;
      ringMat.emissiveIntensity = 0.55 + Math.sin(t * 2) * 0.15;
      // langsame Kamerafahrt
      const a = 0.55 + Math.sin(t * 0.25) * 0.08;
      cam.position.set(Math.sin(a) * 13, 4.0 + Math.sin(t * 0.3) * 0.2, Math.cos(a) * 13);
      cam.lookAt(0, 1.15, 0);
    },
  };
}
