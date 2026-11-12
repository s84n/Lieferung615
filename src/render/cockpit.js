// Fahrerhaus-Innenansicht (POV): einfaches, aber schickes Cockpit mit Lenkrad, Instrumenten,
// Spiegeln, Handyhalterung (Dieter ruft an!) und einem schwingenden Duftbaum.
// Lokale Koordinaten wie der LKW: vorne = +z, links = +x (Fahrer sitzt links).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { IDLE_RPM } from '../entities/truck.js';

const DRIVER_X = 0.42;
const EYE = new THREE.Vector3(DRIVER_X, 1.7, 0.84);

const RB = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, r);

export function createCockpit(scene) {
  const root = new THREE.Group();      // Position + Gierwinkel des LKW
  const body = new THREE.Group();      // wankt/nickt mit dem Aufbau
  root.add(body);
  root.visible = false;
  scene.add(root);

  // leichte Eigenhelligkeit: im Fahrerhaus kommt kaum direktes Licht an, ohne wäre alles fast schwarz
  const m = (color, rough = 0.7, metal = 0, glow = 0.22) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: new THREE.Color(color).multiplyScalar(glow) });
  const dash = m('#3a4048', 0.85, 0, 0.35);
  const dashTop = m('#262a30', 0.9, 0, 0.35);
  const trim = m('#5a6068', 0.75, 0, 0.3);
  const liner = new THREE.MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.95, emissive: '#4a4740' });
  const chrome = m('#cfd6dc', 0.25, 0.9);
  const paint = m('#b1002e', 0.4, 0.2); // Karosseriefarbe (A-Säulen), per setSkin
  const accent = m('#f5b800', 0.35, 0.3);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = body) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    parent.add(o);
    return o;
  };

  // Armaturenbrett
  add(RB(1.66, 0.36, 0.44, 0.06), dash, 0, 1.15, 1.66);
  add(RB(1.66, 0.05, 0.4, 0.02), dashTop, 0, 1.345, 1.69, 0.12);
  add(new THREE.BoxGeometry(1.5, 0.012, 0.01), accent, 0, 1.2, 1.437); // Zierleiste
  // Instrumententräger vor dem Fahrer
  add(RB(0.56, 0.16, 0.22, 0.04), dashTop, DRIVER_X, 1.42, 1.6);
  // Lüftungsdüsen
  for (const x of [-0.62, -0.18, 0.08]) add(RB(0.16, 0.06, 0.02, 0.01), trim, x, 1.25, 1.44);

  // Instrumente (Canvas: Tacho, Drehzahl, Gang)
  const gc = document.createElement('canvas');
  gc.width = 512; gc.height = 192;
  const gctx = gc.getContext('2d');
  const gaugeTex = new THREE.CanvasTexture(gc);
  gaugeTex.colorSpace = THREE.SRGBColorSpace;
  gaugeTex.anisotropy = 4;
  const gauge = add(new THREE.PlaneGeometry(0.46, 0.1725), new THREE.MeshBasicMaterial({ map: gaugeTex }), DRIVER_X, 1.455, 1.478);
  gauge.lookAt(EYE);

  // Lenkrad
  const wheelMount = new THREE.Group();
  wheelMount.position.set(DRIVER_X, 1.3, 1.33);
  wheelMount.rotation.x = 0.66;
  body.add(wheelMount);
  const wheel = new THREE.Group();
  wheelMount.add(wheel);
  const grip = m('#16191c', 0.65);
  add(new THREE.TorusGeometry(0.19, 0.024, 10, 40), grip, 0, 0, 0, 0, 0, 0, wheel);
  add(new THREE.CylinderGeometry(0.06, 0.065, 0.05, 24), dash, 0, 0, 0.005, Math.PI / 2, 0, 0, wheel);
  add(new THREE.CircleGeometry(0.04, 24), paint, 0, 0, -0.022, 0, Math.PI, 0, wheel); // Logo-Fleck zum Fahrer
  // drei Speichen: links, rechts, unten
  const spoke = new THREE.BoxGeometry(0.15, 0.032, 0.016);
  add(spoke, dash, 0.1, 0, 0, 0, 0, 0, wheel);
  add(spoke, dash, -0.1, 0, 0, 0, 0, 0, wheel);
  add(spoke, dash, 0, -0.1, 0, 0, 0, Math.PI / 2, wheel);
  add(new THREE.CylinderGeometry(0.032, 0.04, 0.34, 12), dashTop, 0, 0, 0.19, Math.PI / 2, 0, 0, wheelMount); // Lenksäule

  // A-Säulen, Dachrahmen, Himmel, Sonnenblenden
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.09, 0.9, 0.11), trim, s * 0.81, 1.56, 1.8, -0.13, 0, s * -0.05);
  add(new THREE.BoxGeometry(1.72, 0.07, 0.12), trim, 0, 1.955, 1.78);
  add(new THREE.BoxGeometry(1.5, 0.016, 0.012), paint, 0, 1.285, 1.437); // rote Zierleiste
  add(new THREE.BoxGeometry(1.72, 0.04, 1.1), liner, 0, 1.985, 1.22);
  for (const s of [-1, 1]) add(RB(0.56, 0.025, 0.22, 0.01), m('#a29d93', 0.95), s * DRIVER_X, 1.92, 1.62, 0.22);

  // Türverkleidung + Fensterbrüstung, Rückwand
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.7, 1.15), trim, s * 0.85, 0.95, 1.3);
    add(new THREE.BoxGeometry(0.09, 0.05, 1.15), dashTop, s * 0.84, 1.31, 1.3);
    add(new THREE.BoxGeometry(0.05, 0.14, 0.05), chrome, s * 0.83, 1.2, 1.1); // Türgriff
  }
  add(new THREE.BoxGeometry(1.72, 1.45, 0.05), trim, 0, 1.25, 0.73);

  // Außenspiegel (sichtbar am Bildrand)
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.24, 0.025, 0.025), dashTop, s * 0.97, 1.46, 1.76);
    add(RB(0.08, 0.26, 0.12, 0.025), dashTop, s * 1.1, 1.5, 1.75);
    add(new THREE.PlaneGeometry(0.062, 0.23), m('#a9c0d2', 0.05, 0.9), s * 1.1, 1.5, 1.687, 0, Math.PI, 0);
  }
  // Innenspiegel + Duftbaum
  add(new THREE.BoxGeometry(0.02, 0.08, 0.02), dashTop, 0, 1.94, 1.73);
  add(RB(0.28, 0.08, 0.03, 0.015), dashTop, 0, 1.88, 1.72);
  const pivot = new THREE.Group();
  pivot.position.set(0.06, 1.85, 1.7);
  body.add(pivot);
  add(new THREE.BoxGeometry(0.003, 0.09, 0.003), m('#eeeeee'), 0, -0.045, 0, 0, 0, 0, pivot);
  const tree = new THREE.Shape();
  tree.moveTo(0, 0); tree.lineTo(0.03, -0.035); tree.lineTo(0.015, -0.035); tree.lineTo(0.04, -0.07); tree.lineTo(0.02, -0.07);
  tree.lineTo(0.045, -0.105); tree.lineTo(0.008, -0.105); tree.lineTo(0.008, -0.125); tree.lineTo(-0.008, -0.125); tree.lineTo(-0.008, -0.105);
  tree.lineTo(-0.045, -0.105); tree.lineTo(-0.02, -0.07); tree.lineTo(-0.04, -0.07); tree.lineTo(-0.015, -0.035); tree.lineTo(-0.03, -0.035); tree.lineTo(0, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#2f9e44', roughness: 0.8, side: THREE.DoubleSide });
  add(new THREE.ShapeGeometry(tree), treeMat, 0, -0.09, 0, 0, Math.PI, 0, pivot);

  // Mittelkonsole + Schalthebel
  add(RB(0.32, 0.3, 0.55, 0.04), dash, 0, 0.8, 1.38);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), chrome, 0.1, 1.04, 1.32, -0.25);
  add(new THREE.SphereGeometry(0.035, 16, 12), m('#16191c', 0.5), 0.1, 1.15, 1.29);

  // Handy in der Halterung (Bildschirm leuchtet, wenn Dieter anruft)
  add(RB(0.09, 0.03, 0.04, 0.01), dashTop, -0.04, 1.37, 1.52);
  const phone = add(RB(0.075, 0.14, 0.012, 0.01), m('#121417', 0.4, 0, 0), -0.04, 1.45, 1.5);
  phone.lookAt(EYE.x - 0.1, EYE.y, EYE.z);
  const pc = document.createElement('canvas');
  pc.width = 128; pc.height = 240;
  const phoneTex = new THREE.CanvasTexture(pc);
  phoneTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ color: '#05070a' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.126), screenMat);
  screen.position.z = 0.0065;
  phone.add(screen);

  body.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  // Kamera
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 230);
  camera.position.copy(EYE);
  camera.rotation.set(-0.17, Math.PI, 0, 'YXZ');
  body.add(camera);

  let gaugeKey = '';
  let swing = 0, swingV = 0;
  let lastYawRate = 0;

  function drawGauges(kmh, rpm, gear) {
    const g = gctx;
    g.clearRect(0, 0, 512, 192);
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, 512, 192);
    const dial = (cx, val, max, label, ticks, red) => {
      const cy = 100, r = 78;
      g.lineWidth = 3; g.strokeStyle = '#2a2f36';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      for (let i = 0; i <= ticks; i++) {
        const a = a0 + (a1 - a0) * (i / ticks);
        const hot = red != null && i / ticks >= red;
        g.strokeStyle = hot ? '#ff3b3b' : '#d8dde3';
        g.lineWidth = i % 2 ? 2 : 4;
        const r1 = i % 2 ? r - 10 : r - 16;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); g.stroke();
      }
      const a = a0 + (a1 - a0) * Math.min(1, val / max);
      g.strokeStyle = '#ff6a13'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
      g.fillStyle = '#d8dde3'; g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
      g.font = '600 16px "Exo 2", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#8b939c';
      g.fillText(label, cx, cy + 46);
    };
    dial(96, kmh, 80, 'km/h', 16, null);
    dial(416, rpm, 2600, '× 1000', 13, 0.85);
    // Mitte: Geschwindigkeit digital + Gang
    g.textAlign = 'center';
    g.fillStyle = '#ffffff'; g.font = '800 54px "Exo 2", sans-serif';
    g.fillText(String(kmh), 256, 92);
    g.fillStyle = '#8b939c'; g.font = '600 15px "Exo 2", sans-serif';
    g.fillText('KM/H', 256, 114);
    g.fillStyle = '#f5b800'; g.font = '900 34px "Exo 2", sans-serif';
    g.fillText(String(gear), 256, 160);
    gaugeTex.needsUpdate = true;
  }

  return {
    root, camera,
    setVisible(v) { root.visible = v; },
    setSkin(skin) { paint.color.set(skin.body); accent.color.set(skin.accent); },
    resize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); },
    // Handy-Bildschirm: null = aus, sonst Bild (Avatar) + Text
    setPhone(img, text) {
      if (!img) { screenMat.map = null; screenMat.color.set('#05070a'); screenMat.needsUpdate = true; return; }
      const g = pc.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 240);
      grd.addColorStop(0, '#1f2a37'); grd.addColorStop(1, '#0d1218');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 240);
      g.save(); g.beginPath(); g.arc(64, 92, 44, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 20, 48, 88, 88); g.restore();
      g.fillStyle = '#fff'; g.font = '700 20px "Exo 2", sans-serif'; g.textAlign = 'center';
      g.fillText('Dieter', 64, 166);
      g.fillStyle = '#2fe08a'; g.font = '600 13px "Exo 2", sans-serif';
      g.fillText(text, 64, 186);
      phoneTex.needsUpdate = true;
      screenMat.map = phoneTex; screenMat.color.set('#ffffff'); screenMat.needsUpdate = true;
    },
    update(truck, dt, shake = 0) {
      root.position.set(truck.pos.x, 0, truck.pos.y);
      root.rotation.y = truck.heading;
      body.rotation.x = truck.pitch;
      body.rotation.z = truck.roll;
      // Lenkrad: Lenkeinschlag sichtbar übersetzt (links = gegen den Uhrzeigersinn)
      wheel.rotation.z = -truck.steer * 3.2;
      // Duftbaum: gedämpftes Pendel, angeregt von Querbeschleunigung und Bremsen
      const lat = truck.yawRate * truck.speed;
      const jerk = (truck.yawRate - lastYawRate) / Math.max(dt, 1e-3);
      lastYawRate = truck.yawRate;
      swingV += (-swing * 40 - swingV * 2.2 + lat * 0.9 + jerk * 0.02) * dt;
      swing = THREE.MathUtils.clamp(swing + swingV * dt, -0.9, 0.9);
      pivot.rotation.z = swing;
      pivot.rotation.x = truck.pitch * 4;
      // Kamera: leichtes Wackeln bei Crash/Rempler
      camera.position.set(EYE.x + (Math.random() - 0.5) * shake * 0.05, EYE.y + (Math.random() - 0.5) * shake * 0.04, EYE.z);
      // Instrumente nur bei Änderung neu zeichnen
      const kmh = Math.round(Math.abs(truck.vel.length()) * 4.2);
      const rpm = Math.round(Math.max(truck.rpm, IDLE_RPM) / 25) * 25;
      const gear = truck.speed < -0.3 ? 'R' : Math.abs(truck.speed) < 0.3 && truck.rpm < IDLE_RPM + 60 ? 'N' : truck.gear;
      const key = `${kmh}|${rpm}|${gear}`;
      if (key !== gaugeKey) { gaugeKey = key; drawGauges(kmh, rpm, gear); }
    },
  };
}
