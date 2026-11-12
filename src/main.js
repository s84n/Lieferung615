// Lieferung615 – Bootstrap, Game-Loop und State-Machine
import '@fontsource/exo-2/latin-400.css';
import '@fontsource/exo-2/latin-600.css';
import '@fontsource/exo-2/latin-700.css';
import '@fontsource/exo-2/latin-800.css';
import '@fontsource/exo-2/latin-900.css';
import '@fontsource/exo-2/latin-800-italic.css';
import '@fontsource/exo-2/latin-900-italic.css';
import './styles.css';
import * as THREE from 'three';
import { ROUND_TIME, TILE, DEBUG, QUALITY, FPS_CAP } from './config.js';
import { loadImage, damp, mulberry32 } from './util.js';
import { createRenderer, IsoCamera, createLights } from './render/renderer.js';
import { createPost } from './render/post.js';
import { CityMap } from './world/map.js';
import { buildCity } from './world/city.js';
import { Local, mergeByMaterial } from './world/builder.js';
import { bakeAO, applyBakedAOTo } from './render/ao.js';
import { setLogo, setElementsLogo, blobTexture, SKINS } from './world/textures.js';
import { SkidMarks } from './world/skids.js';
import { createGarage } from './render/garage.js';
import { renderThumbnails, PRODUCTS } from './world/products.js';
import { Truck, buildTruckModel } from './entities/truck.js';
import { Traffic } from './entities/traffic.js';
import { Orders } from './game/orders.js';
import { Hazards } from './game/hazards.js';
import { loadScores, saveScore, rankFor } from './game/score.js';
import { Input } from './input.js';
import { GameAudio } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import { showScreen, renderBoard, showResults, showResultBoard, getName } from './ui/screens.js';
import { Settings } from './ui/settings.js';

const MULTS = [1, 1.2, 1.5, 2, 2.5, 3];
const COMBO_WINDOW = 15;
const TIME_SCALE = DEBUG ? Number(new URLSearchParams(location.search).get('ts') || 1) : 1;
const DOCK_BONUS = 40;
// Tages-Tour: alle Spieler eines Tages fahren dieselbe Auftrags- und Sperrenfolge (per ?seed= überschreibbar)
const SEED = (() => {
  const q = Number(new URLSearchParams(location.search).get('seed'));
  if (q) return q;
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
})();
// Ränge nach Punkten
const RANKS = [
  [0, 'Praktikant', '🧹'], [400, 'Azubi', '🔧'], [1200, 'Geselle', '🛠️'],
  [2200, 'Vorarbeiter', '📋'], [3500, 'Meister', '🏅'], [5000, 'Obermeister', '👑'],
];
const rankTitle = (score) => RANKS.filter((r) => score >= r[0]).pop();

async function boot() {
  // Logo + Schrift laden, bevor Canvas-Texturen entstehen
  const [logo, elementsLogo] = await Promise.all([loadImage('logo.png'), loadImage('elements.png').catch(() => null)]);
  setLogo(logo);
  if (elementsLogo) setElementsLogo(elementsLogo);
  try { await Promise.race([document.fonts.load('800 40px "Exo 2"'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* egal */ }

  const canvas = document.getElementById('game');
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const iso = new IsoCamera();
  const lights = createLights(scene, renderer);
  const post = createPost(renderer, scene, iso.cam);

  const map = new CityMap(615);
  const city = buildCity(map);
  scene.add(city.root);

  const thumbs = renderThumbnails();
  const input = new Input();
  const audio = new GameAudio();
  const hud = new HUD(map, thumbs);
  const settings = new Settings(audio, {
    onOpenChange(open) { G.paused = open && (G.state === 'play' || G.state === 'countdown'); input.keys.clear(); },
  });
  // Erste Interaktion schaltet Audio frei (Browser-Vorgabe) -> Soundtrack läuft schon im Titel
  window.addEventListener('pointerdown', () => audio.init(), { once: true });

  // LKW + Schatten-Blob (Design aus der letzten Wahl)
  const SKIN_KEY = 'lieferung615.skin';
  let skinIdx = 0;
  try { skinIdx = Math.max(0, SKINS.findIndex((s) => s.id === localStorage.getItem(SKIN_KEY))); } catch { /* egal */ }
  const truck = new Truck(map);
  scene.add(truck.mesh);
  if (skinIdx) truck.setSkin(SKINS[skinIdx]);
  const skids = new SkidMarks(scene);
  const garage = createGarage(renderer, SKINS, buildTruckModel);

  // Geparkte LKW an den Lagern (Deko, statisch -> je Material zu einem Mesh zusammengefasst)
  const parked = [];
  for (const w of map.warehouses) {
    const b = w.block;
    const c0 = map.tileCenter(b.x0, b.z0);
    const bcx = c0.x + (b.size - 1) * TILE / 2, bcz = c0.z + (b.size - 1) * TILE / 2;
    const ry = Math.atan2(w.nx, w.nz);
    const L = new Local(null, bcx, bcz, ry);
    for (const lx of [-5]) {
      const m = buildTruckModel();
      const [x, z] = L.tx(lx, 6.2);
      m.position.set(x, 0.25, z);
      m.rotation.y = ry;
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      mergeByMaterial(m);
      scene.add(m);
      parked.push(m);
    }
  }
  // Umgebungsverdeckung einmalig einbacken (ersetzt GTAO im Postprocessing)
  const jibs = city.dynamic.cranes.map((c) => c.jib);
  bakeAO(renderer, [city.root, ...parked], jibs);
  applyBakedAOTo(city.root, jibs);

  const traffic = new Traffic(map, scene);
  traffic.spawnPeds(34);
  traffic.spawnCars(14);

  // ---------- Spielzustand ----------
  const G = {
    state: 'title', time: 0, timeLeft: ROUND_TIME, score: 0, combo: 0, lastDeliver: -99,
    maxMult: 1, deliveries: 0, crashes: 0, navi: 0, boostTotal: 8, naviTotal: 12,
    countdown: 0, endTimer: 0, idle: 0, lastTick: 99, crashCd: 0, fullCd: 0,
    navTarget: null, navPath: null, navTimer: 0, savedId: null,
    urgentDone: 0, docks: 0, damaged: 0,
  };

  const orders = new Orders(map, scene, thumbs, {
    onLoad(n, spot, docked) {
      audio.pickup(n);
      let txt = `${n}× geladen`;
      if (docked && G.state === 'play') {
        G.score += DOCK_BONUS; G.docks++;
        txt += `<small>Profi-Andocken +${DOCK_BONUS}</small>`;
        hud.toast('🅿️ Profi-Andocken! Rückwärts an die Rampe', 'gold', 1300);
      }
      hud.float(new THREE.Vector3(spot.x, 3, spot.z), txt, 'plus');
      refreshHUD();
      G.navTimer = 0;
    },
    onDeliver(order, bonus, spot, docked) {
      if (G.time - G.lastDeliver < COMBO_WINDOW) G.combo = Math.min(G.combo + 1, MULTS.length - 1);
      else G.combo = 0;
      G.lastDeliver = G.time;
      const mult = MULTS[G.combo];
      G.maxMult = Math.max(G.maxMult, mult);
      const urgentMul = order.urgent ? 2 : 1;
      const cond = order.product.fragile ? Math.max(0.2, order.condition) : 1;
      let pts = Math.round((100 + bonus) * mult * urgentMul * cond);
      const notes = [];
      if (order.urgent) { notes.push('Notfall ×2'); G.urgentDone++; }
      if (bonus > 0) notes.push(`Tempo +${bonus}`);
      if (mult > 1) notes.push(`×${mult.toLocaleString('de-DE')}`);
      if (order.product.fragile && cond < 1) { notes.push(`Schaden −${Math.round((1 - cond) * 100)} %`); G.damaged++; }
      else if (order.product.fragile) notes.push('unversehrt 👌');
      if (docked) { pts += DOCK_BONUS; G.docks++; notes.push(`Andocken +${DOCK_BONUS}`); }
      G.score += pts;
      G.deliveries++;
      audio.deliver(G.combo);
      hud.float(new THREE.Vector3(spot.x, 3, spot.z), `+${pts}<small>${notes.join(' · ') || 'geliefert'}</small>`, 'plus');
      if (order.urgent) hud.toast('🚨 Notfall gerettet! Doppelte Punkte', 'gold', 1500);
      else if (docked) hud.toast('🅿️ Profi-Andocken!', 'gold', 1100);
      else if (mult >= 2) hud.toast(`🔥 Combo ×${mult.toLocaleString('de-DE')}!`, 'gold', 1200);
      refreshHUD();
      G.navTimer = 0;
    },
    onFull() {
      if (G.fullCd > 0) return;
      G.fullCd = 2.5;
      audio.full();
      hud.toast('Kein Platz mehr! Sperrige Ware braucht 2 Plätze.', 'red');
    },
    onNew() { refreshHUD(); },
    onUrgent(o) {
      if (G.state !== 'play') return;
      audio.siren();
      hud.toast(`🚨 Notfall: ${o.product.emergency} – ${o.customer.name}!`, 'red', 2600);
      refreshHUD();
      G.navTimer = 0;
    },
    onUrgentFail(o, loaded) {
      if (G.state !== 'play') return;
      audio.full();
      hud.toast(loaded ? `⌛ Notfall zu spät – ${o.customer.name} zahlt normal` : `⌛ Notfall verpasst – ${o.customer.name} hat jemand anderen gerufen`, 'red', 2200);
      refreshHUD();
    },
  });

  const hazards = new Hazards(map, scene, traffic, {
    onCone(pos) {
      if (G.state !== 'play') return;
      G.score = Math.max(0, G.score - 10);
      audio.cone();
      hud.float(new THREE.Vector3(pos.x, 2, pos.z), '−10 Leitkegel!', 'minus');
    },
    onPowerup(type, info, p) {
      audio.powerup();
      if (type === 'coffee') { truck.boost = G.boostTotal; hud.toast('☕ Kaffee-Boost!', 'gold'); }
      if (type === 'navi') { G.navi = G.naviTotal; G.navTimer = 0; hud.toast('🧭 Navi aktiv – folge der blauen Linie', 'gold'); }
      if (type === 'clock') { G.timeLeft += 10; hud.timePlus(); hud.toast('⏱️ +10 Sekunden!', 'gold'); }
      hud.float(new THREE.Vector3(p.x, 3, p.z), info.name, 'plus');
    },
    onBarrier() {
      if (G.state === 'play') { audio.alert(); hud.toast('🚧 Neue Straßensperre!', '', 1400); }
    },
  });

  // Navi-Linie (leuchtende Punkte)
  const navDots = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: '#2f8cff', emissive: '#2f8cff', emissiveIntensity: 1.2 }),
    120,
  );
  navDots.count = 0;
  navDots.frustumCulled = false;
  scene.add(navDots);

  // Weicher Schatten unter dem LKW (zusätzlich zur Shadow-Map, für "Spielzeug"-Gefühl)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  scene.add(blob);

  function refreshHUD() {
    hud.setOrders(orders.active || []);
    hud.setCargo(orders.cargo || []);
  }

  // ---------- Truck an Startposition ----------
  function parkTruck() {
    const w = map.warehouses[0];
    truck.reset(w.x, w.z, Math.atan2(w.nx, w.nz));
  }
  parkTruck();
  orders.reset();
  hazards.reset(truck);

  // ---------- Zustände ----------
  function toTitle() {
    G.state = 'title';
    G.idle = 0;
    hud.show(false);
    hud.clearFloats();
    hud.clearMarkers();
    renderBoard(document.getElementById('title-board'), loadScores());
    document.getElementById('tour-id').textContent = `Tages-Tour #${String(SEED).slice(-4)} – alle fahren heute dieselbe Tour`;
    showScreen('title');
    audio.setMusic('title');
    audio.fast = false;
    parkTruck();
    skids.clear();
    orders.reset();
    hazards.reset(truck);
    refreshHUD();
    navDots.count = 0;
  }

  // Fahrzeugwahl
  function updateGarageUI() {
    const s = SKINS[garage.index];
    document.getElementById('garage-name').textContent = s.name;
    document.getElementById('garage-desc').textContent = s.desc;
    document.getElementById('garage-num').textContent = `Design ${garage.index + 1} / ${SKINS.length}`;
    document.getElementById('garage-dots').innerHTML = SKINS.map((k, i) => `<i class="${i === garage.index ? 'on' : ''}" style="--c:${k.body}"></i>`).join('');
  }
  function toGarage() {
    G.state = 'garage';
    showScreen('garage');
    garage.show(skinIdx);
    updateGarageUI();
  }
  function chooseSkin(dir) {
    garage.select(garage.index + dir, dir);
    audio.key();
    updateGarageUI();
  }
  function confirmSkin() {
    skinIdx = garage.index;
    try { localStorage.setItem(SKIN_KEY, SKINS[skinIdx].id); } catch { /* egal */ }
    if (truck.ud.skin !== SKINS[skinIdx].id) truck.setSkin(SKINS[skinIdx]);
    toTutorial();
  }

  function toTutorial() {
    G.state = 'tutorial';
    showScreen('tutorial');
  }

  function startRound() {
    G.state = 'countdown';
    G.countdown = 3.2;
    G.lastCd = 4;
    G.timeLeft = ROUND_TIME;
    G.score = 0; G.combo = 0; G.lastDeliver = -99; G.maxMult = 1; G.deliveries = 0; G.crashes = 0;
    G.navi = 0; G.navPath = null; G.lastTick = 99;
    showScreen(null);
    parkTruck();
    traffic.clear();
    skids.clear();
    traffic.rng = mulberry32(SEED ^ 0x2545f491);
    traffic.spawnCars(12, truck.pos);
    orders.reset(SEED);
    hazards.reset(truck, SEED);
    G.urgentDone = 0; G.docks = 0; G.damaged = 0;
    hud.clearOrders();
    hud.cargoKey = null;
    refreshHUD();
    hud.setScore(0);
    hud.setCombo(1);
    hud.setTime(ROUND_TIME);
    hud.show(true);
    audio.setMusic('quiet');
  }

  function endRound() {
    G.state = 'ending';
    G.endTimer = 2.2;
    hud.toast('🏁 Feierabend!', 'gold', 2000);
    audio.fanfare();
    audio.setMusic('quiet');
  }

  function toResults() {
    G.state = 'results';
    hud.show(false);
    hud.clearMarkers();
    G.savedId = null;
    const stats = { score: G.score, deliveries: G.deliveries, maxMult: G.maxMult, crashes: G.crashes, urgent: G.urgentDone, docks: G.docks, title: rankTitle(G.score) };
    showResults(stats, rankFor(G.score));
    audio.setMusic('title');
  }

  function saveResult() {
    const { list, id } = saveScore({ name: getName(), score: G.score, deliveries: G.deliveries, title: rankTitle(G.score)[1], seed: SEED, date: new Date().toISOString() });
    G.savedId = id;
    G.resultIdle = 0;
    showResultBoard(list, id);
    audio.pickup(2);
  }

  // ---------- Tasten ----------
  input.onKey((e) => {
    const inField = e.target?.matches?.('input');
    if (!inField) audio.init();
    if (settings.handleKey(e)) return;
    if (!inField && e.code === 'KeyM') { const m = audio.toggleMute(); settings.render(); hud.toast(m ? '🔇 Ton aus' : '🔊 Ton an', '', 900); }
    if (!inField && e.code === 'KeyF') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    }
    if (inField && G.state === 'results' && e.code !== 'Enter') audio.key();
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (G.state === 'title') { audio.init(); audio.beep(); toGarage(); }
      else if (G.state === 'garage') { audio.beep(); confirmSkin(); }
      else if (G.state === 'tutorial') { audio.beep(); startRound(); }
      else if (G.state === 'results') {
        if (!G.savedId) saveResult();
        else toTitle();
      }
    }
    if (G.state === 'garage') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') chooseSkin(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') chooseSkin(1);
    }
    if (e.code === 'KeyH' && G.state === 'play') audio.horn();
    if (e.code === 'Escape' && (G.state === 'play' || G.state === 'countdown' || G.state === 'tutorial' || G.state === 'garage')) toTitle();
  });

  window.addEventListener('resize', () => {
    renderer.setPixelRatio(dyn.pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    iso.resize();
    post.resize();
    garage.resize();
  });

  // ---------- Hilfsfunktionen im Spiel ----------
  function updateNav(dt) {
    G.navTimer -= dt;
    if (G.navTimer > 0) return;
    G.navTimer = 0.25;
    const targets = orders.targets();
    const tt = map.worldToTile(truck.pos.x, truck.pos.y);
    const res = map.bfs(tt.x, tt.z);
    let best = null, bestD = Infinity;
    for (const z of targets) {
      let d = res.dist[z.spot.tz * map.n + z.spot.tx];
      if (d < 0) d = 1000 + Math.hypot(z.spot.x - truck.pos.x, z.spot.z - truck.pos.y);
      if (d < bestD) { bestD = d; best = z; }
    }
    G.navTarget = best;
    G.navPath = best && G.navi > 0 ? map.pathTo(res, best.spot.tx, best.spot.tz) : null;
    // Punkte setzen
    const m = new THREE.Matrix4();
    let n = 0;
    if (G.navPath && G.navPath.length > 1) {
      const pts = G.navPath.map((p) => map.tileCenter(p.x, p.z));
      pts[pts.length - 1] = { x: best.spot.x, z: best.spot.z };
      for (let i = 0; i < pts.length - 1 && n < 120; i++) {
        const a = pts[i], b = pts[i + 1];
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 1.6));
        for (let k = 0; k < steps && n < 120; k++) {
          const t = k / steps;
          m.makeTranslation(a.x + (b.x - a.x) * t, 0.06, a.z + (b.z - a.z) * t);
          navDots.setMatrixAt(n++, m);
        }
      }
    }
    navDots.count = n;
    navDots.instanceMatrix.needsUpdate = true;
  }

  // zerbrechliche Ware leidet unter Remplern
  function cargoDamage(strength) {
    if (G.state !== 'play' || !orders.cargo?.length) return;
    const hit = orders.damage(strength);
    if (!hit.length) return;
    audio.crack();
    const worst = Math.min(...hit.map((o) => o.condition));
    hud.float(new THREE.Vector3(truck.pos.x, 3.2, truck.pos.y), `💥 ${hit[0].product.name}<small>Zustand ${Math.round(worst * 100)} %</small>`, 'minus');
    hud.cargoKey = null;
    refreshHUD();
  }

  function carCollisions() {
    const circles = truck.circles();
    for (const car of traffic.cars) {
      if (car.ghost > 0) continue; // Geist-Autos (Stau-Auflösung) sind durchfahrbar
      for (const c of circles) {
        const dx = c.x - car.pos.x, dz = c.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        const R = c.r + 0.95;
        if (d < R && d > 1e-4) {
          const nx = dx / d, nz = dz / d;
          const push = R - d;
          truck.pos.x += nx * push; truck.pos.y += nz * push;
          const vn = truck.vel.x * nx + truck.vel.y * nz;
          if (vn < 0) { truck.vel.x -= vn * 1.4 * nx; truck.vel.y -= vn * 1.4 * nz; }
          const impact = Math.abs(vn) + Math.abs(truck.speed) * 0.3;
          if (impact > 3.5 && G.crashCd <= 0 && G.state === 'play') {
            G.crashCd = 1.2;
            G.crashes++;
            G.score = Math.max(0, G.score - 25);
            G.combo = 0;
            truck.speed *= 0.3;
            truck.stun = 0.5;
            car.hopV = 6; car.stunned = 1.5;
            iso.shake = 1;
            audio.crash();
            cargoDamage(impact + 2);
            post.grade.uniforms.flash.value = 0.35;
            hud.float(new THREE.Vector3(car.pos.x, 2.5, car.pos.z), '−25 Rempler!', 'minus');
          }
          break;
        }
      }
    }
  }

  // ---------- Loop ----------
  // Bildraten-Begrenzung: mehr als 60 Bilder/s bringen bei diesem Spiel nichts, kosten aber
  // auf 120/144-Hz-Monitoren das 2–2,4-Fache an GPU-Leistung (?fps=0 schaltet die Grenze ab)
  const FRAME_MS = FPS_CAP > 0 ? 1000 / FPS_CAP : 0;
  let lastFrameTs = -1;

  // Dynamische Auflösung: fällt die Bildrate, wird intern etwas kleiner gerendert (der Tilt-Shift
  // kaschiert das). Hilft eine Absenkung nicht (z. B. CPU-Limit, 50-Hz-Monitor), wird sie zurückgenommen.
  const MAX_PR = Math.min(window.devicePixelRatio || 1, QUALITY === 'low' ? 1 : 1.5);
  const MIN_PR = Math.max(0.5, MAX_PR * 0.55);
  const dyn = { pr: MAX_PR, acc: 0, n: 0, fast: 0, pending: null, block: 0, ceil: MAX_PR, ceilT: 0 };
  function setPixelRatio(pr) {
    dyn.pr = Math.round(pr * 100) / 100;
    renderer.setPixelRatio(dyn.pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.resize();
  }
  function adaptResolution(realDt) {
    if (realDt <= 0 || realDt > 0.25 || G.paused || G.state === 'garage') return; // Hänger/Tab-Wechsel ignorieren
    dyn.acc += realDt; dyn.n++;
    if (dyn.acc < 1) return;
    const fps = dyn.n / dyn.acc;
    dyn.acc = 0; dyn.n = 0;
    dyn.block = Math.max(0, dyn.block - 1);
    if (dyn.ceilT > 0 && --dyn.ceilT === 0) dyn.ceil = MAX_PR;
    const target = FPS_CAP > 0 ? FPS_CAP : 60;
    if (dyn.pending) {
      // hat die letzte Absenkung etwas gebracht?
      const p = dyn.pending;
      dyn.pending = null;
      if (fps < p.fps * 1.06) { setPixelRatio(p.from); dyn.block = 30; return; }
    }
    if (fps < target * 0.86 && dyn.pr > MIN_PR && dyn.block === 0) {
      const from = dyn.pr;
      setPixelRatio(Math.max(MIN_PR, dyn.pr * 0.85));
      dyn.pending = { from, fps };
      dyn.ceil = from; dyn.ceilT = 20; // 20 s lang nicht wieder auf die zu teure Stufe
      dyn.fast = 0;
    } else if (fps > target * 0.96 && dyn.pr < dyn.ceil) {
      if (++dyn.fast >= 3) { setPixelRatio(Math.min(dyn.ceil, dyn.pr * 1.1)); dyn.fast = 0; }
    } else dyn.fast = 0;
  }

  const ORIGIN = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const FAR_AWAY = { pos: new THREE.Vector2(9999, 9999), speed: 99 };
  let miniAcc = 1;
  const timer = new THREE.Timer();
  timer.connect?.(document);
  const events = [];
  const clockEl = document.getElementById('clock');
  let fpsAcc = 0, fpsN = 0;
  const debugEl = DEBUG ? Object.assign(document.createElement('div'), { style: 'position:fixed;right:8px;bottom:120px;z-index:99;background:#000a;color:#fff;padding:4px 8px;font:12px monospace' }) : null;
  if (debugEl) document.body.appendChild(debugEl);

  function frame(ts) {
    requestAnimationFrame(frame);
    if (FRAME_MS && lastFrameTs >= 0) {
      const el = ts - lastFrameTs;
      if (el < FRAME_MS - 2) return;
      lastFrameTs = el > FRAME_MS * 3 ? ts : ts - (el % FRAME_MS);
    } else lastFrameTs = ts;
    timer.update(ts);
    const rawDt = timer.getDelta();
    adaptResolution(rawDt);
    const dt = G.paused ? 0 : Math.max(0, Math.min(rawDt, 1 / 20)) * TIME_SCALE;
    renderer.info.reset();
    G.time += dt;
    const t = G.time;
    const playing = G.state === 'play';

    // Steuerung
    let inp = null;
    if (playing) inp = input.state;
    events.length = 0;
    truck.update(dt, inp, events);
    for (const ev of events) if (ev.type === 'bump') { audio.bump(ev.strength); iso.shake = Math.min(1, ev.strength * 0.08); cargoDamage(ev.strength); }
    carCollisions();
    G.crashCd = Math.max(0, G.crashCd - dt);
    G.fullCd = Math.max(0, G.fullCd - dt);
    G.gear = audio.updateEngine(truck, !G.paused && (G.state === 'play' || G.state === 'countdown' || G.state === 'ending'));

    traffic.update(dt, truck);
    traffic.updatePeds(dt, t);
    hazards.update(dt, t, truck, playing);
    if (playing) orders.update(dt, t, truck);
    else orders.update(0, t, FAR_AWAY);

    for (const c of city.dynamic.cranes) c.jib.rotation.y = Math.sin(t * c.speed + c.phase) * 1.4;
    for (const f of city.dynamic.fountains) f.scale.y = 1 + Math.sin(t * 6) * 0.15;
    post.grade.uniforms.flash.value = damp(post.grade.uniforms.flash.value, 0, 6, dt);

    if (playing) skids.update(truck);
    blob.position.x = truck.pos.x; blob.position.z = truck.pos.y;
    blob.rotation.z = truck.heading;

    // Kamera
    if (G.state === 'title' || G.state === 'tutorial' || G.state === 'results' || G.state === 'garage') {
      iso.orbit += dt * 0.06;
      iso.follow(ORIGIN, dt, 0.8);
      iso.setHeight(G.state === 'title' ? 76 : 60, dt, 1.5);
      post.setTilt(3.0, 0.16);
      lights.setShadowSize(70);
      G.idle += dt;
    } else {
      // Orbit zurück auf 0 drehen
      let o = iso.orbit % (Math.PI * 2);
      if (o > Math.PI) o -= Math.PI * 2;
      if (o < -Math.PI) o += Math.PI * 2;
      iso.orbit = damp(o, 0, 3, dt);
      const look = lookTarget.set(truck.pos.x + truck.vel.x * 0.45, 0, truck.pos.y + truck.vel.y * 0.45);
      iso.follow(look, dt, G.state === 'countdown' ? 2.5 : 4);
      iso.setHeight(30 + Math.abs(truck.speed) * 0.45, dt, G.state === 'countdown' ? 2 : 1.5);
      post.setTilt(2.4, 0.22);
      lights.setShadowSize(36);
    }
    // Tageslauf: Runde = Sonnenaufgang bis Feierabend, Titel = goldener Morgen, Ergebnis = Abendrot
    let dayP;
    if (G.state === 'play' || G.state === 'countdown') dayP = 1 - G.timeLeft / ROUND_TIME;
    else if (G.state === 'ending' || G.state === 'results') dayP = Math.min(1, (G.dayP ?? 1) + dt * 0.05);
    else dayP = 0.16 + Math.sin(t * 0.035) * 0.12;
    G.dayP = Math.max(0, Math.min(1, dayP));
    lights.setTimeOfDay(G.dayP);
    post.grade.uniforms.tint.value.copy(lights.tint);
    if (G.state === 'play' || G.state === 'countdown' || G.state === 'ending') {
      const mins = Math.round((6.5 + G.dayP * 12) * 60 / 5) * 5;
      const txt = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} Uhr`;
      if (clockEl.textContent !== txt) clockEl.textContent = txt;
    }
    iso.update(dt);
    lights.follow(iso.target);

    // Zustandslogik
    if (G.state === 'countdown') {
      G.countdown -= dt;
      const n = Math.ceil(G.countdown - 0.2);
      if (n !== G.lastCd && n >= 0) {
        G.lastCd = n;
        const cd = document.getElementById('countdown');
        cd.innerHTML = `<span class="n">${n > 0 ? n : 'LOS!'}</span>`;
        audio.beep(n === 0);
      }
      if (G.countdown <= 0) {
        G.state = 'play';
        audio.setMusic('game');
        setTimeout(() => { document.getElementById('countdown').innerHTML = ''; }, 700);
      }
    } else if (playing) {
      G.timeLeft -= dt;
      G.navi = Math.max(0, G.navi - dt);
      if (G.timeLeft <= 30) audio.fast = true;
      const sec = Math.ceil(G.timeLeft);
      if (sec <= 10 && sec !== G.lastTick && sec > 0) { G.lastTick = sec; audio.tick(); }
      if (G.time - G.lastDeliver > COMBO_WINDOW && G.combo > 0) G.combo = 0;
      updateNav(dt);
      if (G.timeLeft <= 0) { G.timeLeft = 0; endRound(); }
    } else if (G.state === 'ending') {
      G.endTimer -= dt;
      truck.speed *= 0.97;
      if (G.endTimer <= 0) toResults();
    } else if (G.state === 'results' && G.savedId) {
      G.resultIdle = (G.resultIdle || 0) + dt;
      if (G.resultIdle > 45) toTitle();
    }

    // HUD
    if (G.state === 'play' || G.state === 'countdown' || G.state === 'ending') {
      hud.updateOrderTimers(orders.active || [], orders.now);
      hud.setScore(G.score);
      hud.setCombo(MULTS[G.combo]);
      hud.setTime(G.timeLeft);
      hud.setSpeed(truck.vel.length(), G.gear ?? 'N', truck.rpm);
      const pus = [];
      if (truck.boost > 0) pus.push({ id: 'coffee', icon: '☕', name: 'Turbo', left: truck.boost, total: G.boostTotal });
      if (G.navi > 0) pus.push({ id: 'navi', icon: '🧭', name: 'Navi', left: G.navi, total: G.naviTotal });
      hud.setPowerups(pus);
      if (G.navi <= 0 && navDots.count) { navDots.count = 0; G.navPath = null; }
      navDots.material.emissiveIntensity = 1.0 + Math.sin(t * 6) * 0.35;
      const tgt = playing ? G.navTarget : null;
      hud.updateMarkers(playing || G.state === 'countdown' ? orders.targets() : [], iso.cam, truck, tgt);
      const waiting = (orders.active || []).filter((o) => o.state === 'waiting').map((o) => o.customer);
      // Minimap mit 30 Hz zeichnen reicht völlig
      miniAcc += rawDt;
      if (miniAcc >= 1 / 30) { miniAcc = 0; hud.drawMinimap(truck, orders.targets(), waiting, traffic.cars, hazards.powerups, map.blocked, G.navPath, t); }
    }
    hud.updateFloats(dt, iso.cam);

    if (G.state === 'garage') {
      garage.update(dt, t);
      renderer.render(garage.scene, garage.cam);
    } else post.render(dt, t);
    input.endFrame();

    if (debugEl) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 0.5) {
        debugEl.textContent = `${Math.round(fpsN / fpsAcc)} fps · ${dyn.pr.toFixed(2)}x · calls ${renderer.info.render.calls} · tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k · ${G.state}`;
        fpsAcc = 0; fpsN = 0;
      }
    }
  }

  toTitle();
  requestAnimationFrame(frame);
  const loading = document.getElementById('loading');
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);

  if (DEBUG) window.__game = { dyn, setPixelRatio, G, truck, orders, hazards, traffic, map, iso, startRound, toTitle, renderer, PRODUCTS, hud, skids };
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.querySelector('p').textContent = 'Fehler beim Laden: ' + err.message;
});
