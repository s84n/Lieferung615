// G&R-LKW: Modell + Arcade-Fahrphysik
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { logoPanelTexture, truckRearTexture, SKINS } from '../world/textures.js';
import { clamp, damp } from '../util.js';
import { mergeByMaterial } from '../world/builder.js';

const RB = (w, h, d, r = 0.1, s = 3) => new RoundedBoxGeometry(w, h, d, s, r);
const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
// Teil an Position hängen (Achtung: parent.add() gibt den Parent zurück, nicht das Teil)
const put = (parent, m, x, y, z) => { m.position.set(x, y, z); parent.add(m); return m; };

// Koffer-Texturen je Design nur einmal erzeugen
const skinTex = new Map();
function texturesFor(skin) {
  if (!skinTex.has(skin.id)) {
    skinTex.set(skin.id, {
      side: logoPanelTexture(1024, 760, { stripe: true, sub: 'Lieferung615', bg: skin.body, logo: skin.logo, accent: skin.accent, logoScale: skin.logo === 'elements' ? 0.84 : 0.92 }),
      rear: truckRearTexture({ bg: skin.body, text: skin.rear, accent: skin.accent }),
    });
  }
  return skinTex.get(skin.id);
}

export function buildTruckModel(skin = SKINS[0]) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // wankt
  root.add(body);
  const red = new THREE.MeshStandardMaterial({ color: skin.body, roughness: skin.rough, metalness: skin.metal });
  const white = new THREE.MeshStandardMaterial({ color: skin.roof, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1f3346', roughness: 0.1, metalness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#cfd6dc', roughness: 0.25, metalness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.35, metalness: skin.id === 'classic' ? 0.2 : 0.7 });

  // Fahrgestell
  put(body, shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 3.7), dark)), 0, 0.5, -0.05);

  // Fahrerhaus (vorne = +z)
  const cab = shadowed(new THREE.Mesh(RB(1.7, 1.45, 1.15, 0.18), red));
  cab.position.set(0, 1.25, 1.3);
  body.add(cab);
  const wind = shadowed(new THREE.Mesh(RB(1.5, 0.6, 0.1, 0.04, 2), glass));
  wind.position.set(0, 1.55, 1.85);
  wind.rotation.x = -0.12;
  body.add(wind);
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.6), glass);
    sw.position.set(s * 0.86, 1.55, 1.35);
    body.add(sw);
    const mirror = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.14), dark));
    mirror.position.set(s * 1.0, 1.55, 1.7);
    body.add(mirror);
  }
  // Grill, Stoßstange
  const grill = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.05), dark);
  grill.position.set(0, 0.85, 1.88);
  body.add(grill);
  put(body, shadowed(new THREE.Mesh(RB(1.75, 0.22, 0.25, 0.08, 2), chrome)), 0, 0.6, 1.85);
  // Gold-Streifen
  put(body, new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 1.0), gold), 0, 0.92, 1.3);

  // Scheinwerfer + Rücklichter (emissiv -> Bloom)
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff8e0', emissive: '#fff2c0', emissiveIntensity: 1.5 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1010', emissiveIntensity: 0.8 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(RB(0.32, 0.16, 0.06, 0.04, 2), headMat);
    h.position.set(s * 0.6, 0.85, 1.89);
    body.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.05), tailMat);
    t.position.set(s * 0.7, 0.75, -1.93);
    body.add(t);
  }

  // Kofferaufbau mit Logo
  const { side: sideTex, rear: rearTex } = texturesFor(skin);
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.4 });
  const rearMat = new THREE.MeshStandardMaterial({ map: rearTex, roughness: 0.45 });
  const boxGeo = new THREE.BoxGeometry(1.8, 1.9, 2.6);
  const cargoBox = shadowed(new THREE.Mesh(boxGeo, [sideMat, sideMat, white, white, red, rearMat]));
  cargoBox.position.set(0, 1.6, -0.62);
  body.add(cargoBox);
  // Kantenleisten
  for (const [x, y] of [[-0.91, 2.55], [0.91, 2.55], [-0.91, 0.65], [0.91, 0.65]]) {
    put(body, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.64), chrome), x, y, -0.62);
  }

  // Räder
  const wheels = [];
  // Räder bündig unter dem Aufbau: Außenkante (0.70 + 0.14) schließt mit dem Fahrerhaus (0.85) ab
  const tire = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 18);
  tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12);
  rim.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.9 });
  const WX = 0.7;
  // Kotflügel über den Rädern (am wankenden Aufbau)
  for (const z of [1.25, -1.3]) for (const s of [-1, 1]) {
    const f = shadowed(new THREE.Mesh(RB(0.36, 0.1, 0.95, 0.04, 2), dark));
    f.position.set(s * WX, 0.83, z);
    body.add(f);
  }
  for (const [x, z, front] of [[-WX, 1.25, true], [WX, 1.25, true], [-WX, -1.3, false], [WX, -1.3, false]]) {
    const w = new THREE.Group();
    w.add(shadowed(new THREE.Mesh(tire, tireMat)));
    w.add(new THREE.Mesh(rim, chrome));
    w.position.set(x, 0.38, z);
    w.userData.front = front;
    root.add(w);
    wheels.push(w);
  }

  // Aufbau-Teile je Material zusammenfassen: ~30 -> ~10 Draw-Calls (Räder bleiben einzeln, sie drehen sich)
  mergeByMaterial(body);
  root.userData = { body, wheels, tailMat, headMat, skin: skin.id };
  return root;
}

const FRONT = 1.15, REAR = -1.15, RADIUS = 0.92;

// Getriebe: Höchstgeschwindigkeit und Zugkraft je Gang
export const IDLE_RPM = 700, MAX_RPM = 2400;
const GEAR_TOP = [0, 4, 7, 10.5, 14, 18.5];
const GEAR_ACC = [0, 7.5, 6.4, 5.4, 4.6, 3.8];
const UPSHIFT_RPM = 2150, DOWNSHIFT_RPM = 1050, SHIFT_TIME = 0.28;

export class Truck {
  constructor(map) {
    this.map = map;
    this.mesh = buildTruckModel();
    this.ud = this.mesh.userData;
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.pos = new THREE.Vector2(x, z);
    this.vel = new THREE.Vector2();
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.roll = 0; this.pitch = 0;
    this.boost = 0;
    this.stun = 0;
    this.lastImpact = 0;
    this.wheelSpin = 0;
    this.skid = 0;
    this.handbrake = false;
    this.gear = 1;
    this.rpm = IDLE_RPM;
    this.load = 0;
    this.shiftT = 0;
    this.shiftEvents = []; // 'up' | 'down' für Sound/HUD
    this.sync(0);
  }

  // Modell gegen ein anderes Design tauschen (Position/Zustand bleiben)
  setSkin(skin) {
    const parent = this.mesh.parent;
    const old = this.mesh;
    this.mesh = buildTruckModel(skin);
    this.ud = this.mesh.userData;
    this.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (parent) { parent.remove(old); parent.add(this.mesh); }
    this.sync(0);
  }

  get forward() { return new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading)); }

  update(dt, input, events) {
    const fwd = this.forward;
    const boostMul = this.boost > 0 ? 1.35 : 1;
    const vMax = 15 * boostMul;
    const control = this.stun > 0 ? 0.25 : 1;
    let throttle = input ? (input.up ? 1 : 0) - (input.down ? 1 : 0) : 0;
    let steerIn = input ? (input.left ? 1 : 0) - (input.right ? 1 : 0) : 0;
    const handbrake = input?.brake;
    throttle *= control;

    // Getriebe
    const s = Math.abs(this.speed);
    const rpmFor = (g) => IDLE_RPM + Math.min(this.speed < 0 ? 0.9 : 1.08, s / ((this.speed < 0 ? 6 : GEAR_TOP[g]) * boostMul)) * (MAX_RPM - IDLE_RPM);
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (this.speed < -0.3) this.gear = 1;
    else if (this.shiftT <= 0) {
      if (this.gear < 5 && throttle > 0 && rpmFor(this.gear) > UPSHIFT_RPM) {
        this.gear++; this.shiftT = SHIFT_TIME; this.shiftUp = true; this.shiftEvents.push('up');
      } else if (this.gear > 1 && rpmFor(this.gear) < DOWNSHIFT_RPM) {
        this.gear--; this.shiftT = 0.15; this.shiftUp = false; this.shiftEvents.push('down');
      }
    }
    const shifting = this.shiftT > 0 && this.shiftUp;
    let rpmTarget = rpmFor(this.gear);
    if (this.gear === 1 && throttle > 0) rpmTarget = Math.max(rpmTarget, 1250); // Kupplung schleift beim Anfahren
    if (s < 0.3 && throttle <= 0) rpmTarget = IDLE_RPM;
    if (shifting) rpmTarget = Math.max(IDLE_RPM, rpmTarget - 150); // Gas weg, Drehzahl fällt auf den neuen Gang
    this.rpm += (rpmTarget - this.rpm) * (1 - Math.exp(-dt * (shifting ? 9 : 12)));
    this.load += ((throttle > 0 && !shifting ? 1 : 0) - this.load) * (1 - Math.exp(-dt * 10));

    // Längsdynamik
    if (throttle > 0) {
      if (this.speed < 0) this.speed += 30 * dt;
      else if (!shifting) {
        // Drehmoment fällt zur Abregeldrehzahl hin ab
        const torque = 1 - Math.max(0, (this.rpm - 1900) / (MAX_RPM - 1900)) * 0.75;
        this.speed += GEAR_ACC[this.gear] * boostMul * torque * (1 - this.speed / vMax * 0.35) * dt;
      } else this.speed -= this.speed * 0.15 * dt; // Zugkraftunterbrechung
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= 30 * dt;
      else this.speed -= 9 * dt;
    } else {
      this.speed -= this.speed * 1.1 * dt + Math.sign(this.speed) * 1.5 * dt;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    this.speed = clamp(this.speed, -6, vMax);

    // Lenkung
    const maxSteer = 0.62 / (1 + Math.abs(this.speed) / 16);
    this.steer = damp(this.steer, steerIn * maxSteer, 10, dt);
    const wheelbase = 2.4;
    const yaw = (this.speed * Math.tan(this.steer)) / wheelbase * (handbrake ? 1.35 : 1);
    this.yawRate = yaw;
    this.heading += yaw * dt;

    // Querhaftung / Drift
    const target = new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading)).multiplyScalar(this.speed);
    const grip = handbrake ? 2.2 : 9;
    this.vel.lerp(target, 1 - Math.exp(-grip * dt));
    this.drift = this.vel.clone().sub(target).length();

    this.pos.addScaledVector(this.vel, dt);
    this.collideWorld(events);

    // Handbremse / Rutschen (für Sound und Bremsspuren)
    this.handbrake = !!handbrake;
    const slip = this.drift || 0;
    this.skid = (handbrake && Math.abs(this.speed) > 1.5) || slip > 2.4 || (throttle < 0 && this.speed > 9)
      ? Math.min(1, 0.35 + Math.abs(this.speed) / 15 + slip * 0.12) : 0;

    this.boost = Math.max(0, this.boost - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.lastImpact = Math.max(0, this.lastImpact - dt);

    // Visuelles
    const accel = throttle * (this.speed >= 0 ? 1 : -1);
    this.roll = damp(this.roll, clamp(-yaw * this.speed * 0.012, -0.12, 0.12), 6, dt);
    const shiftNod = shifting ? 0.045 : 0; // beim Schalten nickt der Aufbau nach vorne
    this.pitch = damp(this.pitch, clamp((shifting ? 0 : -accel * 0.035) + shiftNod + (throttle < 0 && this.speed > 1 ? 0.05 : 0), -0.06, 0.07), shifting ? 9 : 5, dt);
    this.ud.tailMat.emissiveIntensity = throttle < 0 && this.speed > 0.5 ? 3.5 : 0.8;
    this.wheelSpin += (this.vel.dot(fwd) / 0.38) * dt;
    this.sync(dt);
  }

  sync(dt) {
    this.mesh.position.set(this.pos.x, 0, this.pos.y);
    this.mesh.rotation.y = this.heading;
    this.ud.body.rotation.z = this.roll;
    this.ud.body.rotation.x = this.pitch;
    for (const w of this.ud.wheels) {
      w.rotation.x = this.wheelSpin;
      w.rotation.y = w.userData.front ? this.steer : 0;
      w.rotation.order = 'YXZ';
    }
  }

  // Weltpositionen der Hinterräder (für Bremsspuren)
  rearWheels() {
    const f = this.forward, r = { x: f.y, y: -f.x };
    const bx = this.pos.x - f.x * 1.3, bz = this.pos.y - f.y * 1.3;
    return [{ x: bx + r.x * 0.7, z: bz + r.y * 0.7 }, { x: bx - r.x * 0.7, z: bz - r.y * 0.7 }];
  }

  circles() {
    const f = this.forward;
    return [
      { x: this.pos.x + f.x * FRONT, z: this.pos.y + f.y * FRONT, r: RADIUS },
      { x: this.pos.x + f.x * REAR, z: this.pos.y + f.y * REAR, r: RADIUS },
    ];
  }

  // Kreis-gegen-Tile-AABB Kollision
  collideWorld(events) {
    const map = this.map;
    let hit = false;
    let nAcc = new THREE.Vector2();
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.circles()) {
        const t = map.worldToTile(c.x, c.z);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const tx = t.x + dx, tz = t.z + dz;
          if (!map.isSolid(tx, tz)) continue;
          const tc = map.tileCenter(tx, tz);
          const h = map.tileHalf(tx, tz);
          const px = clamp(c.x, tc.x - h.x, tc.x + h.x);
          const pz = clamp(c.z, tc.z - h.z, tc.z + h.z);
          let nx = c.x - px, nz = c.z - pz;
          let d = Math.hypot(nx, nz);
          if (d >= c.r) continue;
          if (d < 1e-4) { nx = c.x - tc.x; nz = c.z - tc.z; d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d; d = 0; }
          else { nx /= d; nz /= d; }
          const push = c.r - d;
          this.pos.x += nx * push; this.pos.y += nz * push;
          c.x += nx * push; c.z += nz * push;
          nAcc.x += nx; nAcc.y += nz;
          hit = true;
        }
      }
    }
    if (hit) {
      nAcc.normalize();
      const vn = this.vel.dot(nAcc);
      if (vn < 0) {
        this.vel.addScaledVector(nAcc, -vn * 1.3);
        const impact = -vn;
        if (impact > 4 && this.lastImpact <= 0) {
          events?.push({ type: 'bump', strength: impact });
          this.lastImpact = 0.4;
        }
        // Geschwindigkeit entlang Fahrtrichtung reduzieren
        const f = this.forward;
        const facing = Math.abs(f.dot(nAcc));
        this.speed *= 1 - facing * 0.75;
      }
    }
  }
}
