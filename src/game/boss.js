// Chef-Anruf: Dieter ruft (mindestens einmal pro Runde) an. Es klingelt kurz, man geht automatisch
// ran, ein Smartphone wird eingeblendet, und nach dem Gespräch fährt der LKW 20 % schneller.
// Die Anrufzeiten hängen am Tages-Seed: alle Spieler bekommen die Anrufe zur selben Zeit.
import { mulberry32, pick } from '../util.js';
import { DIETER_URL, dieterImage } from '../ui/dieter.js';

export const CHEF_BOOST = 20;   // Sekunden mit +20 % Tempo
export const CHEF_FACTOR = 1.2;
const RING = 1.9;               // Klingeln bis zum automatischen Abheben
const LINE = 2.5;               // Sekunden je Gesprächszeile
const END = 1.1;                // "Anruf beendet" bis zum Ausblenden

const GREET = [
  'Servus, Dieter hier!',
  'Ja grüß dich, hier ist der Dieter!',
  'Dieter hier – hörst du mich?',
  'Hallo, Dieter am Apparat!',
];
const MSG = [
  'Die Kunden warten – gib Gas, ich zahl den Sprit!',
  'Wenn du das heute schaffst, gibt’s Leberkäs für alle!',
  'Der Bauleiter ruft schon zum dritten Mal an. Tempo!',
  'Ich seh dich auf dem Tracker. Da geht noch was!',
  'Um halb sieben ist Feierabend, also hau rein!',
  'Ohne Material steht die Baustelle. Mach hin!',
  'Heute zählt jede Minute – du schaffst das!',
];
const BYE = [
  'Also: Vollgas! Tschüss!',
  'Ich verlass mich auf dich. Ciao!',
  'Gib alles – ich mach’s gut!',
  'Los jetzt, Abfahrt!',
];

const PHONE_ICON = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>';

export class BossCall {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.el = document.getElementById('phone');
    this.el.innerHTML = `
      <div class="ph-screen">
        <div class="ph-notch"></div>
        <div class="ph-status"><span class="ph-time">07:00</span><span class="ph-sig"><i></i><i></i><i></i><i></i><b></b></span></div>
        <div class="ph-state">Eingehender Anruf</div>
        <div class="ph-avatar"><span class="ph-ring"></span><span class="ph-ring r2"></span><img alt="Dieter" src="${DIETER_URL}"></div>
        <div class="ph-name">Dieter</div>
        <div class="ph-role">Chef · Mobil</div>
        <div class="ph-bubble"><span class="ph-text"></span></div>
        <div class="ph-actions">
          <div class="ph-btn decline">${PHONE_ICON}</div>
          <div class="ph-btn accept">${PHONE_ICON}</div>
        </div>
      </div>`;
    this.stateEl = this.el.querySelector('.ph-state');
    this.textEl = this.el.querySelector('.ph-text');
    this.bubbleEl = this.el.querySelector('.ph-bubble');
    this.timeEl = this.el.querySelector('.ph-time');
    this.img = null;
    dieterImage().then((img) => { this.img = img; });
    this.calls = 0;
    this.fit();
    window.addEventListener('resize', () => this.fit());
    this.reset();
  }

  // Smartphone an kleine Fenster anpassen
  fit() { this.el.style.setProperty('--ph-scale', String(Math.min(1, window.innerHeight / 900))); }

  reset(seed = 615) {
    const rng = mulberry32(seed ^ 0x0d1e7e5);
    // erster Anruf garantiert, zweiter mit 60 % Wahrscheinlichkeit
    this.times = [25 + rng() * 45];
    if (rng() < 0.6) this.times.push(100 + rng() * 40);
    this.lines = [pick(GREET, rng), pick(MSG, rng), pick(BYE, rng)];
    this.lines2 = [pick(GREET, rng), pick(MSG, rng), pick(BYE, rng)];
    this.state = 'idle';
    this.calls = 0;
    this.t = 0;
    this.el.className = 'phone';
    this.hooks.onPhoneScreen?.(null);
  }

  get active() { return this.state !== 'idle'; }

  // elapsed: Rundenzeit in s; canCall: Runde läuft; clock: Uhrzeit-Text fürs Handy
  update(dt, elapsed, canCall, clock) {
    if (this.state === 'idle') {
      if (canCall && this.times.length && elapsed >= this.times[0]) {
        this.times.shift();
        this.start();
      }
      return;
    }
    if (!canCall) { this.finish(true); return; }
    if (clock && this.timeEl.textContent !== clock) this.timeEl.textContent = clock;
    this.t += dt;
    if (this.state === 'ring') {
      if (!this.rang2 && this.t > 1.0) { this.rang2 = true; this.hooks.onRing?.(); }
      if (this.t >= RING) this.answer();
    } else if (this.state === 'talk') {
      const i = Math.floor(this.t / LINE);
      if (i >= this.script.length) { this.hangup(); return; }
      if (i !== this.lineIdx) {
        this.lineIdx = i;
        this.hooks.onVoice?.(Math.max(4, Math.round(this.script[i].length / 5)));
        this.bubbleEl.classList.remove('pop'); void this.bubbleEl.offsetWidth; this.bubbleEl.classList.add('pop');
      }
      // Schreibmaschinen-Effekt
      const line = this.script[i];
      const n = Math.min(line.length, Math.floor((this.t - i * LINE) * 40));
      const txt = line.slice(0, n);
      if (this.textEl.textContent !== txt) this.textEl.textContent = txt;
      const sec = Math.floor(this.t);
      const st = `00:${String(sec).padStart(2, '0')}`;
      if (this.stateEl.textContent !== st) this.stateEl.textContent = st;
    } else if (this.state === 'end') {
      if (this.t >= END) this.finish(false);
    }
  }

  start() {
    this.state = 'ring';
    this.t = 0;
    this.rang2 = false;
    this.script = this.calls === 0 ? this.lines : this.lines2;
    this.calls++;
    this.lineIdx = -1;
    this.textEl.textContent = '';
    this.stateEl.textContent = 'Eingehender Anruf …';
    this.el.className = 'phone on ringing';
    this.hooks.onRing?.(true);
    this.hooks.onPhoneScreen?.(this.img, 'Eingehender Anruf');
  }

  answer() {
    this.state = 'talk';
    this.t = 0;
    this.el.className = 'phone on answered';
    this.hooks.onAnswer?.();
    this.hooks.onPhoneScreen?.(this.img, 'Verbunden');
    setTimeout(() => { if (this.state === 'talk') this.el.className = 'phone on talking'; }, 450);
  }

  hangup() {
    this.state = 'end';
    this.t = 0;
    this.el.className = 'phone on talking ended';
    this.stateEl.textContent = 'Anruf beendet';
    this.hooks.onHangup?.();
    this.hooks.onPhoneScreen?.(this.img, 'Anruf beendet');
  }

  finish(aborted) {
    if (aborted && this.state !== 'end') this.hooks.onHangup?.(true);
    this.state = 'idle';
    this.el.className = 'phone';
    this.hooks.onPhoneScreen?.(null);
  }
}
