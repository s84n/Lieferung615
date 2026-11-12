// Eingebackene Umgebungsverdeckung (ersetzt GTAO, das jedes Bild die Szene ein zweites Mal rendern musste).
// Die Stadt ist statisch: einmal beim Laden wird von oben eine Höhenkarte gerendert und daraus per GPU
// eine AO-Textur berechnet (Horizont-Verfahren). Die Stadt-Materialien lesen sie per Shader-Patch:
//  - Oberseiten: AO direkt aus der Textur (Hauskanten, Bäume, Zäune, Ecken)
//  - Wände: Kontaktschatten zum Boden + Verdeckung durch gegenüberliegende Gebäude
import * as THREE from 'three';

const RES = 2048;          // Texel pro Kante
const EXTENT = 96;         // Welt-Halbbreite der AO-Textur (Stadt + Rand)
const HMAX = 25.5;         // Höhenbereich (8 Bit, 0,1er Schritte)

const uniforms = {
  aoTex: { value: null },
  // uv.x = (x + E) / 2E, uv.y = (E - z) / 2E (Bild-oben der Höhenkamera = -z)
  aoRect: { value: new THREE.Vector4(-EXTENT, EXTENT, 1 / (2 * EXTENT), -1 / (2 * EXTENT)) },
};

const HEIGHT_MAT = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    varying float vY;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vY = w.y;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    varying float vY;
    void main() { gl_FragColor = vec4(max(vY, 0.0), 0.0, 0.0, 1.0); }`,
});

const AO_MAT = new THREE.ShaderMaterial({
  uniforms: { tHeight: { value: null }, texel: { value: 2 * EXTENT / RES } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tHeight; uniform float texel;
    varying vec2 vUv;
    void main() {
      float h0 = texture2D(tHeight, vUv).r;
      float occ = 0.0;
      const int DIRS = 10;
      for (int d = 0; d < DIRS; d++) {
        float a = (float(d) + 0.5) * 6.2831853 / float(DIRS);
        vec2 dir = vec2(cos(a), sin(a));
        float s = 0.0;
        float r = 0.12;
        for (int k = 0; k < 7; k++) {
          float h = texture2D(tHeight, vUv + dir * (r / texel) / ${RES.toFixed(1)}).r;
          // Abfall mit der Entfernung, damit weit entfernte Häuser den Boden nicht abdunkeln
          s = max(s, (h - h0) / r * (1.0 - r / 3.2));
          r *= 1.55;
        }
        occ += s / sqrt(1.0 + s * s);
      }
      occ /= float(DIRS);
      float ao = clamp(1.0 - occ * 1.15, 0.0, 1.0);
      gl_FragColor = vec4(ao, min(h0, ${HMAX.toFixed(1)}) / ${HMAX.toFixed(1)}, 0.0, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});

// objects: statische Objekte (Stadt, geparkte LKW). hide: Objekte, die beim Backen ausgeblendet werden (Kranausleger)
export function bakeAO(renderer, objects, hide = []) {
  const heightRT = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, format: THREE.RGBAFormat });
  const aoRT = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.UnsignedByteType, depthBuffer: false });
  aoRT.texture.generateMipmaps = false;
  aoRT.texture.minFilter = THREE.LinearFilter;
  aoRT.texture.magFilter = THREE.LinearFilter;

  const scene = new THREE.Scene();
  scene.overrideMaterial = HEIGHT_MAT;
  const parents = objects.map((o) => o.parent);
  for (const o of objects) scene.add(o);
  const vis = hide.map((o) => o.visible);
  for (const o of hide) o.visible = false;

  const cam = new THREE.OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 1, 200);
  cam.position.set(0, 100, 0);
  cam.up.set(0, 0, -1);           // Bild-rechts = +x, Bild-oben = -z
  cam.lookAt(0, 0, 0);

  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(heightRT);
  renderer.clear();
  renderer.render(scene, cam);

  AO_MAT.uniforms.tHeight.value = heightRT.texture;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), AO_MAT);
  quad.frustumCulled = false;
  const qs = new THREE.Scene();
  qs.add(quad);
  renderer.setRenderTarget(aoRT);
  renderer.render(qs, cam);

  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.autoUpdate = prevShadow;
  objects.forEach((o, i) => { if (parents[i]) parents[i].add(o); else scene.remove(o); });
  hide.forEach((o, i) => { o.visible = vis[i]; });
  heightRT.dispose();
  quad.geometry.dispose();

  uniforms.aoTex.value = aoRT.texture;
  return aoRT.texture;
}

// Shader-Patch für MeshStandardMaterial: AO aus der Textur auf indirektes und (abgeschwächt) direktes Licht
export function applyBakedAO(material) {
  if (material.userData.bakedAO) return;
  material.userData.bakedAO = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.aoTex = uniforms.aoTex;
    shader.uniforms.aoRect = uniforms.aoRect;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAoPos;\nvarying vec3 vAoNrm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vAoPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vAoNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D aoTex; uniform vec4 aoRect;
        varying vec3 vAoPos; varying vec3 vAoNrm;
        float aoHeight(vec2 xz) { return texture2D(aoTex, (xz - aoRect.xy) * aoRect.zw).g * ${HMAX.toFixed(1)}; }
        float bakedAO() {
          vec2 uv = (vAoPos.xz - aoRect.xy) * aoRect.zw;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
          vec3 n = normalize(vAoNrm);
          float y = vAoPos.y;
          if (n.y > 0.6) {
            vec4 t = texture2D(aoTex, uv);
            float top = t.g * ${HMAX.toFixed(1)};
            return y < top - 0.35 && top < ${(HMAX - 0.2).toFixed(1)} ? 0.72 : t.r; // unter Baumkronen/Vordächern
          }
          if (n.y < -0.6) return 0.75;
          vec2 d = normalize(n.xz + vec2(1e-4));
          float floorH = aoHeight(vAoPos.xz + d * 0.3);
          float contact = smoothstep(0.0, 0.9, y - floorH);
          float s = 0.0;
          s = max(s, (aoHeight(vAoPos.xz + d * 0.6) - y) / 0.6);
          s = max(s, (aoHeight(vAoPos.xz + d * 1.4) - y) / 1.4 * 0.8);
          s = max(s, (aoHeight(vAoPos.xz + d * 2.8) - y) / 2.8 * 0.5);
          float hz = s / sqrt(1.0 + s * s);
          return mix(0.62, 1.0, contact) * (1.0 - 0.35 * hz);
        }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float bAO = bakedAO();
        reflectedLight.indirectDiffuse *= bAO;
        reflectedLight.indirectSpecular *= bAO;
        reflectedLight.directDiffuse *= mix(1.0, bAO, 0.6);
        reflectedLight.directSpecular *= mix(1.0, bAO, 0.6);`);
  };
  material.customProgramCacheKey = () => 'bakedAO';
  material.needsUpdate = true;
}

// skip: Teilbäume ohne AO (z. B. drehende Kranausleger, die nicht in der Höhenkarte stehen)
export function applyBakedAOTo(root, skip = []) {
  const skipSet = new Set();
  for (const s of skip) s.traverse((o) => skipSet.add(o));
  root.traverse((o) => {
    if (!o.isMesh || skipSet.has(o)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.isMeshStandardMaterial) applyBakedAO(m);
    }
  });
}
