// Postprocessing: AO, Bloom, Tilt-Shift, Farbstimmung + Körnung
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { QUALITY } from '../config.js';

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    dir: { value: new THREE.Vector2(1, 0) },
    focus: { value: 0.5 },
    band: { value: 0.22 },
    amount: { value: 2.4 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform vec2 dir;
    uniform float focus, band, amount;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - focus);
      float b = smoothstep(band * 0.5, band * 0.5 + 0.38, d) * amount;
      if (b < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 sum = vec4(0.0); float ws = 0.0;
      for (int i = -6; i <= 6; i++) {
        float fi = float(i);
        float w = exp(-fi * fi / 18.0);
        sum += texture2D(tDiffuse, vUv + dir * fi * b / resolution) * w;
        ws += w;
      }
      gl_FragColor = sum / ws;
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    saturation: { value: 1.04 },
    vignette: { value: 0.4 },
    grain: { value: 0.035 },
    flash: { value: 0 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    flashColor: { value: new THREE.Color(1, 0.2, 0.2) },
  },
  vertexShader: TiltShiftShader.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float time, saturation, vignette, grain, flash;
    uniform vec3 flashColor; uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c *= tint; // Tageszeit-Farbstimmung
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
      c = c / (1.0 + max(c - 0.85, 0.0) * 0.8); // Spitzlichter weich abfangen
      float v = smoothstep(0.95, 0.3, length((vUv - 0.5) * vec2(1.1, 1.0)));
      c *= mix(1.0 - vignette, 1.0, v);
      c = mix(c, flashColor, flash * (1.0 - v * 0.7));
      c += (hash(vUv * resolution + fract(time) * 100.0) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: QUALITY === 'low' ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  let gtao = null;
  if (QUALITY !== 'low') {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.16, 0.5, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const tiltH = new ShaderPass(TiltShiftShader);
  const tiltV = new ShaderPass(TiltShiftShader);
  tiltV.uniforms.dir.value.set(0, 1);
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  function resize() {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer.setSize(window.innerWidth, window.innerHeight);
    for (const p of [tiltH, tiltV, grade]) p.uniforms.resolution.value.set(s.x, s.y);
  }
  resize();

  return {
    composer, bloom, gtao, tiltH, tiltV, grade, resize,
    setTilt(amount, band = 0.22) {
      for (const p of [tiltH, tiltV]) { p.uniforms.amount.value = amount; p.uniforms.band.value = band; }
    },
    render(dt, time) {
      grade.uniforms.time.value = time;
      composer.render(dt);
    },
  };
}
