// Postprocessing: Bloom, Tilt-Shift, Tonemapping, Farbstimmung + Körnung
// Performance: nur 2 Vollbild-Durchgänge nach Bloom (Tonemapping+Tilt-H, Tilt-V+Farbstimmung),
// MSAA nur auf dem Szenen-Puffer, Bloom in halber Auflösung, AO ist in die Stadt eingebacken (ao.js).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { QUALITY } from '../config.js';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Tilt-Shift-Gewichte (13 Taps) – identisch zur bisherigen Schleife
const TILT_COMMON = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 resolution; uniform vec2 dir;
  uniform float focus, band, amount;
  varying vec2 vUv;
  float tiltAmount() {
    float d = abs(vUv.y - focus);
    return smoothstep(band * 0.5, band * 0.5 + 0.38, d) * amount;
  }`;

// Durchgang 1: ACES-Tonemapping + sRGB je Tap (= frühere OutputPass), dann horizontal weichzeichnen
const TiltToneShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    dir: { value: new THREE.Vector2(1, 0) },
    focus: { value: 0.5 }, band: { value: 0.22 }, amount: { value: 2.4 },
    toneMappingExposure: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    ${TILT_COMMON}
    uniform float toneMappingExposure;
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 display(vec3 color) {
      const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= toneMappingExposure / 0.6;
      color = ACESOutputMat * RRTAndODTFit(ACESInputMat * color);
      color = clamp(color, 0.0, 1.0);
      return mix(pow(color, vec3(0.41666)) * 1.055 - vec3(0.055), color * 12.92, vec3(lessThanEqual(color, vec3(0.0031308))));
    }
    void main() {
      float b = tiltAmount();
      if (b < 0.05) { gl_FragColor = vec4(display(texture2D(tDiffuse, vUv).rgb), 1.0); return; }
      vec3 sum = vec3(0.0); float ws = 0.0;
      for (int i = -6; i <= 6; i++) {
        float fi = float(i);
        float w = exp(-fi * fi / 18.0);
        sum += display(texture2D(tDiffuse, vUv + dir * fi * b / resolution).rgb) * w;
        ws += w;
      }
      gl_FragColor = vec4(sum / ws, 1.0);
    }`,
};

// Durchgang 2: vertikal weichzeichnen + Farbstimmung, Vignette, Blitz, Körnung
const TiltGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    dir: { value: new THREE.Vector2(0, 1) },
    focus: { value: 0.5 }, band: { value: 0.22 }, amount: { value: 2.4 },
    time: { value: 0 },
    saturation: { value: 1.04 },
    vignette: { value: 0.4 },
    grain: { value: 0.035 },
    flash: { value: 0 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    flashColor: { value: new THREE.Color(1, 0.2, 0.2) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    ${TILT_COMMON}
    uniform float time, saturation, vignette, grain, flash;
    uniform vec3 flashColor; uniform vec3 tint;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float b = tiltAmount();
      vec3 c;
      if (b < 0.05) c = texture2D(tDiffuse, vUv).rgb;
      else {
        vec3 sum = vec3(0.0); float ws = 0.0;
        for (int i = -6; i <= 6; i++) {
          float fi = float(i);
          float w = exp(-fi * fi / 18.0);
          sum += texture2D(tDiffuse, vUv + dir * fi * b / resolution).rgb * w;
          ws += w;
        }
        c = sum / ws;
      }
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
  // Die Szene landet in renderTarget2 (MSAA). renderTarget1 bekommt nur Vollbild-Effekte -> kein MSAA nötig.
  composer.renderTarget1.samples = 0;
  composer.addPass(new RenderPass(scene, camera));

  // Bloom in halber Auflösung (weichgezeichnet sieht man den Unterschied nicht)
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 4, size.y / 4), 0.16, 0.5, 1.05);
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
  composer.addPass(bloom);

  const tiltH = new ShaderPass(TiltToneShader);
  const grade = new ShaderPass(TiltGradeShader);
  composer.addPass(tiltH);
  composer.addPass(grade);
  const tiltV = grade; // Tilt-V steckt jetzt im Farbstimmungs-Durchgang

  function resize() {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    for (const p of [tiltH, grade]) p.uniforms.resolution.value.set(s.x, s.y);
  }
  resize();

  return {
    composer, bloom, tiltH, tiltV, grade, resize,
    setTilt(amount, band = 0.22) {
      for (const p of [tiltH, grade]) { p.uniforms.amount.value = amount; p.uniforms.band.value = band; }
    },
    render(dt, time) {
      grade.uniforms.time.value = time;
      tiltH.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      composer.render(dt);
    },
  };
}
