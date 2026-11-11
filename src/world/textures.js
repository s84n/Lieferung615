// Canvas-Texturen: Logo-Flächen, Schilder, Straßenmarkierungen
import * as THREE from 'three';

let logoImg = null;
let elementsImg = null;
export function setLogo(img) { logoImg = img; }
export function setElementsLogo(img) { elementsImg = img; }
export function getLogo() { return logoImg; }

export const LOGO_RED = '#b1002e';

function toTex(canvas, anisotropy = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// LKW-Designs: Lack, Akzent, Dach und Logo
export const SKINS = [
  { id: 'classic', name: 'Klassik', desc: 'Karminrot mit Goldstreifen', body: LOGO_RED, accent: '#f5b800', roof: '#f5f6f7', logo: 'gr', rear: 'G&R', metal: 0.1, rough: 0.35 },
  { id: 'elements', name: 'elements', desc: 'Anthrazit mit Silberakzenten', body: '#1a1a1a', accent: '#c9ced3', roof: '#2b2d30', logo: 'elements', rear: 'elements', metal: 0.35, rough: 0.32 },
];
const logoFor = (key) => (key === 'elements' ? elementsImg : logoImg);

// Fläche mit zentriertem Logo und Zierlinie (Standard: Rot/Gold)
export function logoPanelTexture(w = 1024, h = 512, { stripe = true, sub = '', bg = LOGO_RED, logo = 'gr', accent = '#f5b800', logoScale = 0.92 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const img = logoFor(logo);
  if (img) {
    g.imageSmoothingQuality = 'high';
    const lw = w * logoScale;
    const lh = lw * (img.height / img.width);
    const y = sub ? h * 0.38 - lh / 2 : h * 0.46 - lh / 2;
    g.drawImage(img, (w - lw) / 2, y, lw, lh);
  }
  if (sub) {
    g.fillStyle = '#ffffff';
    g.font = `700 ${Math.round(h * 0.12)}px "Exo 2", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(sub, w / 2, h * 0.74);
  }
  if (stripe) {
    g.fillStyle = accent;
    g.fillRect(0, h * 0.88, w, h * 0.05);
  }
  return toTex(c);
}

// Rückseite des LKW
export function truckRearTexture({ bg = LOGO_RED, text = 'G&R', accent = '#f5b800' } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 512);
  // Rolltor-Lamellen
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 6;
  for (let y = 40; y < 480; y += 34) { g.beginPath(); g.moveTo(30, y); g.lineTo(482, y); g.stroke(); }
  g.fillStyle = '#ffffff';
  g.font = `${text.length > 4 ? '600 92px' : '900 120px'} "Exo 2", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 200);
  g.font = '700 46px "Exo 2", sans-serif';
  g.fillText('Lieferung615', 256, 300);
  // Warnstreifen
  for (let i = -2; i < 12; i++) {
    g.fillStyle = i % 2 ? accent : '#222';
    g.beginPath();
    g.moveTo(i * 50, 512); g.lineTo(i * 50 + 50, 512); g.lineTo(i * 50 + 90, 440); g.lineTo(i * 50 + 40, 440);
    g.fill();
  }
  return toTex(c);
}

// Namensschild für Kunden
export function signTexture(text, { bg = '#ffffff', fg = '#1d2733', accent = '#b5002f', icon = '' } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = accent;
  g.fillRect(0, 0, 1024, 22);
  g.fillRect(0, 234, 1024, 22);
  g.fillStyle = fg;
  let size = 110;
  g.font = `800 ${size}px "Exo 2", sans-serif`;
  while (g.measureText(icon + text).width > 940 && size > 40) {
    size -= 4;
    g.font = `800 ${size}px "Exo 2", sans-serif`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText((icon ? icon + ' ' : '') + text, 512, 134);
  return toTex(c);
}

// Hellgelbe Glow-Textur für Lichtsäulen
export function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Weicher runder Schatten-Blob
export function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function circleIconTexture(drawFn, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  drawFn(g, size);
  return toTex(c);
}
