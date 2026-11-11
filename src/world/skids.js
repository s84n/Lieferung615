// Bremsspuren: dunkle Streifen hinter den Hinterrädern (Ringpuffer aus Instanzen)
import * as THREE from 'three';

const MAX = 900;
const Y = 0.045; // über Asphalt, Markierungen und Einfahrtspflaster

export class SkidMarks {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(0.26, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#15171a', transparent: true, opacity: 0.42, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.last = null; // letzte Radpositionen
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  // pro Frame aufrufen; strength 0 = keine Spur
  update(truck) {
    if (!truck.skid) { this.last = null; return; }
    const wheels = truck.rearWheels();
    if (!this.last) { this.last = wheels; return; }
    let added = false;
    for (let i = 0; i < 2; i++) {
      const a = this.last[i], b = wheels[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.35) continue; // erst ab einer Mindestlänge setzen
      this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
      this.p.set((a.x + b.x) / 2, Y, (a.z + b.z) / 2);
      this.s.set(0.6 + truck.skid * 0.4, 1, len + 0.05);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(this.next, this.m);
      this.next = (this.next + 1) % MAX;
      this.mesh.count = Math.min(MAX, this.mesh.count + 1);
      this.last[i] = b;
      added = true;
    }
    if (added) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.mesh.count = 0;
    this.next = 0;
    this.last = null;
  }
}
