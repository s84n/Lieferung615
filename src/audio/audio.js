// Prozedurale Sounds + Synth-Musik über die Web Audio API (keine externen Dateien)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = [
  { root: 36, tones: [60, 64, 67, 72] },   // C
  { root: 43, tones: [59, 62, 67, 71] },   // G
  { root: 45, tones: [57, 60, 64, 69] },   // Am
  { root: 41, tones: [57, 60, 65, 69] },   // F
];
const MELODY = [
  [[0, 72, 2], [2, 76, 2], [4, 79, 4], [10, 76, 2], [12, 77, 2], [14, 76, 2]],
  [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 6], [14, 77, 2]],
  [[0, 76, 2], [2, 72, 2], [4, 69, 4], [8, 72, 2], [10, 76, 2], [12, 81, 4]],
  [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 6], [14, 74, 2]],
];
const BASS_STEPS = [0, 3, 6, 8, 10, 11, 14];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];

const TRACK_URL = 'Lieferung615.mp3';
const SETTINGS_KEY = 'lieferung615.settings.v1';
const DEFAULTS = { music: 0.6, sfx: 0.85, engine: 0.8, muted: false };

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.mode = 'off';
    this.step = 0;
    this.bar = 0;
    this.settings = { ...DEFAULTS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* ohne Speicher */ }
    this.muted = !!this.settings.muted;
    // Soundtrack schon vorab laden (Dekodieren erst, wenn der AudioContext existiert)
    this.trackData = fetch(TRACK_URL).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    this.track = null;      // dekodierter AudioBuffer
    this.trackSrc = null;
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...this.settings, muted: this.muted })); } catch { /* egal */ }
  }
  // Lautstärken (0..1) setzen und anwenden
  setVolume(kind, v) {
    this.settings[kind] = Math.max(0, Math.min(1, v));
    this.applyVolumes();
    this.saveSettings();
  }
  musicLevel() { return this.settings.music * 0.5 * (this.duck ?? 1); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.musicLevel(), t, 0.15);
    this.sfx.gain.setTargetAtTime(this.settings.sfx * 0.85, t, 0.05);
    this.engBus.gain.setTargetAtTime(this.settings.engine * 1.2, t, 0.05);
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = this.musicLevel(); this.music.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.settings.sfx * 0.85; this.sfx.connect(this.master);
    this.engBus = ctx.createGain(); this.engBus.gain.value = this.settings.engine * 1.2; this.engBus.connect(this.sfx);

    // Rauschpuffer
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildEngine();

    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);

    // Soundtrack dekodieren und als nahtlose Schleife starten
    this.trackData.then((buf) => (buf ? ctx.decodeAudioData(buf) : null)).then((audioBuf) => {
      if (!audioBuf) return;
      this.track = audioBuf;
      if (this.mode !== 'off') this.startTrack();
    }).catch(() => { this.track = null; });
  }

  startTrack() {
    if (!this.track || this.trackSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.track;
    src.loop = true;
    const g = this.ctx.createGain(); // sanftes Einblenden
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    src.connect(g).connect(this.music);
    src.start();
    this.trackSrc = src;
  }

  // ---- Diesel-Motor: Sechszylinder-Zündpulse, Nageln, Turbo, 5-Gang-Getriebe ----
  buildEngine() {
    const ctx = this.ctx;
    // Zündpuls-Welle: viele Obertöne, abfallend -> "Bollern" statt Summen
    const H = 24, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) im[n] = (n % 3 === 0 ? 1.3 : 1) / Math.pow(n, 0.85);
    const pulse = ctx.createPeriodicWave(re, im);

    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engAM = ctx.createGain(); this.engAM.gain.value = 1;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 400; this.engFilter.Q.value = 0.9;
    const shaper = ctx.createWaveShaper(); // leichte Sättigung = Grip im Klang
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    shaper.curve = curve;

    this.engMain = ctx.createOscillator(); this.engMain.setPeriodicWave(pulse);
    this.engSub = ctx.createOscillator(); this.engSub.type = 'sawtooth'; // halbe Zündfrequenz: Zylinder-Ungleichförmigkeit
    const subG = ctx.createGain(); subG.gain.value = 0.45;
    this.engMain.connect(this.engFilter);
    this.engSub.connect(subG).connect(this.engFilter);
    this.engFilter.connect(shaper).connect(this.engAM).connect(this.engGain).connect(this.engBus);

    // Amplituden-Wabern im Takt der Kurbelwelle
    this.engLfo = ctx.createOscillator(); this.engLfo.type = 'sine';
    this.engLfoDepth = ctx.createGain(); this.engLfoDepth.gain.value = 0.25;
    this.engLfo.connect(this.engLfoDepth).connect(this.engAM.gain);

    // Nageln/Verbrennungsgeräusch: gefiltertes Rauschen
    this.engNoise = ctx.createBufferSource(); this.engNoise.buffer = this.noise; this.engNoise.loop = true;
    this.engNoiseF = ctx.createBiquadFilter(); this.engNoiseF.type = 'bandpass'; this.engNoiseF.Q.value = 1.1;
    this.engNoiseG = ctx.createGain(); this.engNoiseG.gain.value = 0;
    this.engNoise.connect(this.engNoiseF).connect(this.engNoiseG).connect(this.engAM);

    // Turbo-Pfeifen
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine';
    this.turboG = ctx.createGain(); this.turboG.gain.value = 0;
    this.turbo.connect(this.turboG).connect(this.engBus);

    // Reifenquietschen: schmalbandiges Rauschen, leicht wabernd
    this.squeal = ctx.createBufferSource(); this.squeal.buffer = this.noise; this.squeal.loop = true;
    this.squealF = ctx.createBiquadFilter(); this.squealF.type = 'bandpass'; this.squealF.frequency.value = 1700; this.squealF.Q.value = 9;
    this.squealG = ctx.createGain(); this.squealG.gain.value = 0;
    this.squeal.connect(this.squealF).connect(this.squealG).connect(this.sfx);

    for (const o of [this.engMain, this.engSub, this.engLfo, this.engNoise, this.turbo, this.squeal]) o.start();
    this.eng = { spool: 0, last: ctx.currentTime, wasMoving: false, beepT: 0 };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    this.saveSettings();
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // 'title' | 'game' | 'quiet' (Countdown/Ende: Soundtrack leiser) | 'off'
  setMusic(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.step = 0; this.bar = 0;
    this.duck = mode === 'quiet' ? 0.45 : 1;
    if (!this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.08;
    if (mode !== 'off') this.startTrack();
    this.applyVolumes();
  }

  // ---- Grundbausteine ----
  tone(freq, t, dur, { type = 'square', vol = 0.2, dest = this.sfx, slide = null, attack = 0.005, filter = null } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filter;
      o.connect(f); node = f;
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noiseHit(t, dur, { vol = 0.3, freq = 1000, type = 'lowpass', dest = this.sfx } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }
  get now() { return this.ctx.currentTime; }
  ok() { return !!this.ctx; }

  // ---- Effekte ----
  // Motor aus dem Fahrzustand des LKW: { rpm, load, gear, speed, shiftEvents }; liefert die Gang-Anzeige
  updateEngine(tr, active) {
    const s = Math.abs(tr.speed);
    const reverse = tr.speed < -0.3;
    const label = !active ? 'N' : reverse ? 'R' : (s < 0.3 && tr.load < 0.05) ? 'N' : tr.gear;
    if (!this.ctx || !this.eng) { tr.shiftEvents.length = 0; return label; }
    const E = this.eng;
    const t = this.now;
    const dt = Math.min(0.1, Math.max(0, t - E.last));
    E.last = t;
    const IDLE = 700, MAXR = 2400;

    // Schaltgeräusche
    for (const ev of tr.shiftEvents) {
      if (!active) continue;
      if (ev === 'up') { this.gearClunk(0.9); this.airPuff(0.06, 3200, 0.28); }
      else this.gearClunk(0.5);
    }
    tr.shiftEvents.length = 0;

    const rpm = tr.rpm;
    const load = tr.load;
    E.spool += (load * (rpm - IDLE) / (MAXR - IDLE) - E.spool) * (1 - Math.exp(-dt * (load > E.spool ? 1.5 : 4)));
    E.bovT = Math.max(0, (E.bovT || 0) - dt);
    if (E.spool > 0.4 && load < 0.5 && (E.lastLoad || 0) >= 0.5 && E.bovT <= 0) { E.bovT = 0.6; this.airPuff(0.03, 4500, 0.25); } // Turbo abblasen
    E.lastLoad = load;

    const fire = (rpm / 60) * 3; // 6 Zylinder, 4-Takt: 35 Hz Leerlauf … 120 Hz
    const k = 0.02;
    this.engMain.frequency.setTargetAtTime(fire, t, k);
    this.engSub.frequency.setTargetAtTime(fire / 2, t, k);
    this.engLfo.frequency.setTargetAtTime(fire / 2, t, k);
    const r = Math.max(0, (rpm - IDLE) / (MAXR - IDLE));
    this.engFilter.frequency.setTargetAtTime(200 + rpm * 0.32 + load * 1000, t, 0.04);
    this.engNoiseF.frequency.setTargetAtTime(450 + rpm * 0.65, t, 0.04);
    this.engLfoDepth.gain.setTargetAtTime(0.34 - r * 0.16, t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.07 + load * 0.07 + r * 0.04 : 0, t, 0.05);
    this.engNoiseG.gain.setTargetAtTime(active ? 0.04 + load * 0.13 : 0, t, 0.04);
    this.turbo.frequency.setTargetAtTime(1600 + E.spool * 2600, t, 0.1);
    this.turboG.gain.setTargetAtTime(active ? E.spool * 0.012 : 0, t, 0.1);

    // Handbremse: Ratschen beim Ziehen, Quietschen beim Rutschen
    if (active && tr.handbrake && !E.hb) this.ratchet();
    E.hb = active && tr.handbrake;
    const sq = active ? (tr.skid || 0) : 0;
    this.squealG.gain.setTargetAtTime(sq * 0.07, t, sq > 0 ? 0.04 : 0.09);
    this.squealF.frequency.setTargetAtTime(1500 + s * 30 + Math.sin(t * 23) * 120, t, 0.03);

    // Druckluftbremse beim Anhalten
    if (s > 2) E.wasMoving = true;
    if (active && E.wasMoving && s < 0.25 && load < 0.05) { E.wasMoving = false; this.airPuff(0.09, 2200, 0.55); }
    // Rückfahrwarner
    if (active && reverse) {
      E.beepT -= dt;
      if (E.beepT <= 0) { E.beepT = 0.9; this.tone(1050, t, 0.42, { type: 'square', vol: 0.045, filter: 3000, attack: 0.01 }); }
    } else E.beepT = 0;
    return label;
  }
  // Handbremshebel: kurze Klick-Folge
  ratchet() {
    if (!this.ok()) return;
    const t = this.now;
    for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.035, 0.018, { vol: 0.09, freq: 3200, type: 'bandpass' });
    this.airPuff(0.035, 3000, 0.18);
  }
  // mechanisches Einrasten des Gangs
  gearClunk(vol = 1) {
    if (!this.ok()) return;
    const t = this.now;
    this.tone(95, t, 0.12, { type: 'sine', vol: 0.22 * vol, slide: 55 });
    this.noiseHit(t, 0.05, { vol: 0.12 * vol, freq: 1400, type: 'bandpass' });
  }
  // Druckluft-"Pssht"
  airPuff(vol = 0.07, freq = 2800, dur = 0.32) {
    if (!this.ok()) return;
    this.noiseHit(this.now, dur, { vol, freq, type: 'highpass' });
  }
  horn() {
    if (!this.ok()) return;
    const t = this.now;
    this.tone(370, t, 0.4, { vol: 0.12, attack: 0.02, filter: 2000 });
    this.tone(466, t, 0.4, { vol: 0.12, attack: 0.02, filter: 2000 });
  }
  pickup(n = 1) {
    if (!this.ok()) return;
    const t = this.now;
    [72, 76, 79].forEach((m, i) => this.tone(mtof(m), t + i * 0.07, 0.16, { type: 'triangle', vol: 0.25 }));
    if (n > 1) this.tone(mtof(84), t + 0.22, 0.2, { type: 'triangle', vol: 0.2 });
  }
  deliver(combo = 0) {
    if (!this.ok()) return;
    const t = this.now;
    const base = 72 + Math.min(combo, 5) * 2;
    [0, 4, 7, 12].forEach((m, i) => this.tone(mtof(base + m), t + i * 0.08, 0.22, { type: 'square', vol: 0.13, filter: 3500 }));
    this.tone(mtof(base + 24), t + 0.32, 0.5, { type: 'sine', vol: 0.2 });
    this.tone(mtof(base + 19), t + 0.36, 0.45, { type: 'sine', vol: 0.12 });
  }
  crash() {
    if (!this.ok()) return;
    const t = this.now;
    this.noiseHit(t, 0.35, { vol: 0.5, freq: 900 });
    this.tone(110, t, 0.3, { type: 'sine', vol: 0.5, slide: 40 });
    this.tone(1400, t + 0.05, 0.12, { type: 'square', vol: 0.05, slide: 600 });
  }
  bump(strength = 5) {
    if (!this.ok()) return;
    const t = this.now;
    const v = Math.min(0.4, strength * 0.04);
    this.noiseHit(t, 0.15, { vol: v, freq: 500 });
    this.tone(80, t, 0.15, { type: 'sine', vol: v, slide: 45 });
  }
  cone() {
    if (!this.ok()) return;
    const t = this.now;
    this.tone(520, t, 0.12, { type: 'triangle', vol: 0.25, slide: 260 });
    this.noiseHit(t, 0.06, { vol: 0.15, freq: 3000, type: 'highpass' });
  }
  // Notfall: kurze Martinshorn-Folge
  siren() {
    if (!this.ok()) return;
    const t = this.now;
    for (let i = 0; i < 4; i++) {
      this.tone(i % 2 ? 587 : 784, t + i * 0.32, 0.3, { type: 'triangle', vol: 0.11, attack: 0.02, filter: 2500 });
    }
  }
  // Keramik knackt
  crack() {
    if (!this.ok()) return;
    const t = this.now;
    this.noiseHit(t, 0.09, { vol: 0.28, freq: 3500, type: 'highpass' });
    this.tone(2400, t, 0.06, { type: 'square', vol: 0.05, slide: 900 });
    this.noiseHit(t + 0.05, 0.12, { vol: 0.15, freq: 5000, type: 'highpass' });
  }
  powerup() {
    if (!this.ok()) return;
    const t = this.now;
    this.tone(400, t, 0.35, { type: 'triangle', vol: 0.25, slide: 1600 });
    [79, 84, 88].forEach((m, i) => this.tone(mtof(m), t + 0.15 + i * 0.06, 0.15, { type: 'sine', vol: 0.15 }));
  }
  full() {
    if (!this.ok()) return;
    const t = this.now;
    this.tone(220, t, 0.14, { type: 'square', vol: 0.12, filter: 1200 });
    this.tone(185, t + 0.15, 0.2, { type: 'square', vol: 0.12, filter: 1200 });
  }
  beep(high = false) {
    if (!this.ok()) return;
    this.tone(high ? 1046 : 523, this.now, high ? 0.5 : 0.18, { type: 'square', vol: 0.15, filter: 4000 });
  }
  tick() {
    if (!this.ok()) return;
    this.tone(1800, this.now, 0.05, { type: 'square', vol: 0.06 });
  }
  alert() {
    if (!this.ok()) return;
    const t = this.now;
    this.tone(880, t, 0.12, { type: 'triangle', vol: 0.15 });
    this.tone(660, t + 0.14, 0.18, { type: 'triangle', vol: 0.15 });
  }
  key() {
    if (!this.ok()) return;
    this.tone(900 + Math.random() * 200, this.now, 0.04, { type: 'square', vol: 0.05 });
  }
  fanfare() {
    if (!this.ok()) return;
    const t = this.now;
    [[67, 0], [72, 0.15], [76, 0.3], [79, 0.45], [84, 0.7]].forEach(([m, d]) => {
      this.tone(mtof(m), t + d, d === 0.7 ? 0.9 : 0.2, { type: 'square', vol: 0.12, filter: 3000 });
      this.tone(mtof(m - 12), t + d, d === 0.7 ? 0.9 : 0.2, { type: 'triangle', vol: 0.15 });
    });
  }

  // ---- Musik-Sequencer ----
  schedule() {
    if (!this.ctx || this.mode === 'off' || this.mode === 'quiet' || this.track) return; // Synth nur als Ersatz
    const bpm = this.mode === 'game' ? (this.fast ? 128 : 116) : 96;
    const stepDur = 60 / bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  playStep(step, t, sd) {
    const chord = CHORDS[this.bar % 4];
    const dest = this.music;
    if (this.mode === 'title') {
      if (step === 0) {
        for (const m of chord.tones.slice(0, 3)) this.tone(mtof(m), t, sd * 16, { type: 'triangle', vol: 0.06, attack: 0.4, dest });
        this.tone(mtof(chord.root), t, sd * 14, { type: 'sine', vol: 0.18, attack: 0.05, dest });
      }
      if (step % 2 === 0) this.tone(mtof(chord.tones[ARP[step]] + 12), t, sd * 2.5, { type: 'sine', vol: 0.05, dest });
      return;
    }
    // Spielmusik
    if (BASS_STEPS.includes(step)) {
      const oct = step === 6 || step === 14 ? 12 : 0;
      this.tone(mtof(chord.root + oct), t, sd * 1.8, { type: 'square', vol: 0.13, filter: 600, dest });
    }
    this.tone(mtof(chord.tones[ARP[step]]), t, sd * 0.9, { type: 'square', vol: 0.035, filter: 2400, dest });
    if (step % 4 === 0) {
      // Kick
      this.tone(150, t, 0.18, { type: 'sine', vol: 0.5, slide: 45, dest });
    }
    if (step === 4 || step === 12) this.noiseHit(t, 0.14, { vol: 0.18, freq: 1800, type: 'highpass', dest });
    if (step % 2 === 0) this.noiseHit(t, 0.04, { vol: this.fast ? 0.09 : 0.06, freq: 7000, type: 'highpass', dest });
    if (Math.floor(this.bar / 4) % 2 === 1) {
      for (const [s, m, l] of MELODY[this.bar % 4]) {
        if (s === step) this.tone(mtof(m), t, sd * l * 0.95, { type: 'triangle', vol: 0.12, dest });
      }
    }
  }
}
