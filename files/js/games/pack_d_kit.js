// Briques communes du pack « capteurs » : visée du téléphone, mouvement, réglages et départ synchronisés, pause, quitter.
import { h, modal } from '../core/util.js';
import { Duo } from '../core/kit.js';
import { css } from '../core/winfx.js';
import { winBadge } from '../core/winfx.js';

export const wrap = a => ((a % 360) + 540) % 360 - 180;
export const cl = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp2 = (a, b, k) => a + (b - a) * k;
const DEG = Math.PI / 180;

css('pdkit', '.pdbar{display:flex;gap:8px;padding:4px 10px}.pdbar .btn{min-height:44px;flex:1;padding:6px 10px;font-size:.95em}'
  + '.pdset{display:flex;flex-direction:column;gap:6px;width:100%;max-width:360px}.pdset .lab{font-weight:800;text-align:left}.pdset .seg{display:flex;gap:6px;flex-wrap:wrap}.pdset .seg .btn{flex:1;min-width:0;min-height:48px;padding:6px 8px;font-size:.95em}'
  + '.pdset .seg .btn.on{outline:3px solid #ffd24d;filter:brightness(1.2)}.pdcount{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:120px;font-weight:900;color:#ffd24d;text-shadow:0 4px 0 #000a;z-index:6;pointer-events:none}'
  + '.pdbig{font-size:1.6em;font-weight:800}.pdgauge{height:16px;border-radius:9px;background:#0007;border:2px solid #0009;overflow:hidden}.pdgauge i{display:block;height:100%;width:0;background:linear-gradient(#ffd24d,#ff9a1f);transition:width .1s}');

const imgs = {};
/** Portrait peint du joueur (pour le canvas). Renvoie l'image une fois chargée, sinon null. */
export function avImg(id) {
  if (!imgs[id]) { const i = new Image(); i.onload = () => { i.ok = true; }; i.src = 'img/av/' + id + '.webp'; imgs[id] = i; }
  return imgs[id].ok ? imgs[id] : null;
}

/** Direction visée par le haut du téléphone (cap et hauteur), tirée de deviceorientation. Sans capteur : seen = false. */
export class Orient {
  constructor() {
    this.seen = false; this.abs = false; this.yaw = 0; this.pitch = 0; this.roll = 0; this.hist = [];
    this.f = e => { if (this.abs || e.alpha == null || e.beta == null) return; this.set(e); };
    this.fa = e => { if (e.alpha == null || e.beta == null) return; this.abs = true; this.set(e); };
    addEventListener('deviceorientation', this.f, true); addEventListener('deviceorientationabsolute', this.fa, true);
  }
  set(e) {
    const a = e.alpha * DEG, b = e.beta * DEG;
    const east = -Math.sin(a) * Math.cos(b), north = Math.cos(a) * Math.cos(b), up = Math.sin(b);
    this.yaw = Math.atan2(east, north) / DEG; this.pitch = Math.asin(cl(up, -1, 1)) / DEG; this.roll = e.gamma || 0; this.seen = true;
    const t = performance.now(); this.hist.push({ t, yaw: this.yaw, pitch: this.pitch }); while (this.hist.length > 90 || (this.hist.length && t - this.hist[0].t > 1500)) this.hist.shift();
  }
  /** Direction il y a ms millisecondes. */
  at(ms) { const t = performance.now() - ms; let r = this.hist[0] || { yaw: this.yaw, pitch: this.pitch }; for (const p of this.hist) { if (p.t <= t) r = p; else break; } return r; }
  stop() { removeEventListener('deviceorientation', this.f, true); removeEventListener('deviceorientationabsolute', this.fa, true); }
}

/** Mouvement du téléphone : intensité sans la pesanteur, vitesse de rotation. */
export class Motion {
  constructor(cb) {
    this.seen = false; this.mag = 0; this.rot = 0; this.cb = cb;
    this.f = e => {
      const a = e.acceleration && e.acceleration.x != null ? e.acceleration : null, g = e.accelerationIncludingGravity;
      let m; if (a) m = Math.hypot(a.x, a.y, a.z); else if (g && g.x != null) m = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81); else return;
      this.seen = true; this.mag = m; const r = e.rotationRate; this.rot = r && r.alpha != null ? Math.hypot(r.alpha, r.beta, r.gamma) : 0;
      this.cb && this.cb(performance.now(), m, this.rot);
    };
    addEventListener('devicemotion', this.f, true);
  }
  stop() { removeEventListener('devicemotion', this.f, true); }
}

/** Base des jeux du pack : joueurs, pause, quitter, réglages choisis par l'hôte, visée, départ synchronisé. */
export class SensorDuo extends Duo {
  constructor(ctx) {
    super(ctx);
    this.paused = false; this.cfg = {}; this.cal = null; this.seenIds = new Set(); this.started = false;
    this.o = new Orient(); this.mo = new Motion(); this.sub(() => { this.o.stop(); this.mo.stop(); });
    try { this.s.start(); } catch {}
    this.bar = h('div', { class: 'pdbar' },
      this.pauseB = h('button', { class: 'btn sec', onclick: () => this.setPause(true) }, 'Pause'));
    this.pl.after(this.bar); this.pl.style.display = 'none';
    this.onNet('pz', m => this.setPause(!!m.on, true));
    this.onNet('ak', m => { const r = this.pend && this.pend[m.k + ':' + m.i]; if (r) { clearInterval(r); delete this.pend[m.k + ':' + m.i]; } });
    this.relN = 0; this.pend = {};
    this.sub(() => Object.values(this.pend).forEach(clearInterval));
  }
  /** Envoi sûr : répété jusqu'à l'accusé de réception (Rémi n'en a pas besoin). */
  rel(type, d = {}) {
    if (this.remi) { this.net.send(type, d); return; }
    const i = ++this.relN, key = type + ':' + i, msg = { ...d, _i: i }; this.net.send(type, msg); let n = 0;
    this.pend[key] = setInterval(() => { if (!this.alive || ++n > 14) { clearInterval(this.pend[key]); delete this.pend[key]; } else this.net.send(type, msg); }, 800);
  }
  /** Écoute d'un message envoyé avec rel : accuse réception et ignore les doublons. */
  onRel(type, fn) { this.onNet(type, m => { if (m._i == null) { fn(m); return; } this.net.send('ak', { k: type, i: m._i }); const id = type + m._i; if (this.seenIds.has(id)) return; this.seenIds.add(id); fn(m); }); }

  setPause(on, fromNet) {
    if (this.over || on === this.paused) return;
    this.paused = on; this.pauseB.textContent = on ? 'Reprendre' : 'Pause';
    if (!fromNet) this.net.send('pz', { on });
    if (this.pauseEl) { this.pauseEl.remove(); this.pauseEl = null; }
    if (on) {
      this.pauseEl = h('div', { class: 'bigmsg', style: 'z-index:8' }, h('h2', {}, 'Pause'), h('p', {}, fromNet ? this.oppA.name + ' a mis la partie en pause.' : 'La partie est arrêtée pour vous deux.'),
        h('button', { class: 'btn big', onclick: () => this.setPause(false) }, 'Reprendre'),
        h('button', { class: 'btn big sec', onclick: () => this.askQuit() }, 'Quitter la partie'));
      this.root.append(this.pauseEl);
    }
    this.onPause && this.onPause(on);
  }
  askQuit() { modal('Quitter la partie ?', [h('p', {}, this.remi ? 'On arrête de jouer avec Rémi.' : 'L\'autre joueur sera prévenu.')], [{ label: 'Rester' }, { label: 'Quitter', cls: 'warn', onclick: () => this.ctx.exit() }]); }

  setStat(me, opp) { this.stat = { me, opp }; if (this.hudEl && this.hudEl.children[1]) this.hudEl.children[1].textContent = 'Toi ' + me + '  –  ' + opp + ' ' + this.oppA.name; }
  /** Capteurs réellement présents ? (les événements arrivent un instant après l'ouverture) */
  get sensorsOk() { return this.o.seen || this.s.orientSeen; }
  get motionOk() { return this.mo.seen || this.s.motionSeen; }

  /**
   * Déroulé commun : réglages (choisis par l'hôte) → visée mutuelle (si calib) → compte à rebours → onStart(seed, cfg).
   * groups : [{ key, label, choices: [[valeur, texte], …], def }]
   */
  flow(title, how, groups, calib, onStart) {
    const cfg = {}; groups.forEach(g => { cfg[g.key] = g.def; });
    this.cfg = cfg; const useCal = () => typeof calib === 'function' ? !!calib(this.cfg) : !!calib; let me = false, opp = this.remi, cfgGot = this.isHost, st = false;
    const goCount = seed => { if (st) return; st = true; this.clearMessage(); this.countdown(() => { this.started = true; onStart(seed, this.cfg); }); };
    const tryStart = () => { if (this.isHost && me && opp && cfgGot && !st) { const seed = (Math.random() * 1e9) | 0; this.rel('st', { seed }); goCount(seed); } };
    this.onRel('cfg', m => { this.cfg = m.cfg; cfgGot = true; if (useCal()) this.calibStep(); else { me = true; this.rel('cal'); } });
    this.onRel('cal', () => { opp = true; tryStart(); });
    this.onRel('st', m => { if (!st) goCount(m.seed); });
    const step2 = () => {
      if (!useCal()) { me = true; this.rel('cal'); this.message('Prêt', 'J\'attends l\'autre joueur…', []); tryStart(); return; }
      this.calibStep(() => { me = true; this.rel('cal'); this.message('Prêt !', 'J\'attends que ' + this.oppA.name + ' soit prêt…', []); tryStart(); });
    };
    this.calibStep = cb => {
      const ok = () => this.sensorsOk;
      this.message('Visez-vous l\'un l\'autre', 'Tiens le téléphone devant toi, le haut pointé vers ' + (this.remi ? 'Rémi (devant toi)' : this.oppA.name) + '.\nPuis appuie sur « Je vise l\'autre ».' + (ok() ? '' : '\n(Pas de capteur de direction : tu viseras avec le doigt.)'), [
        { label: 'Je vise l\'autre', onclick: () => { this.cal = ok() ? { yaw: this.o.yaw, pitch: this.o.pitch } : null; this.s.sfx('ok'); (cb || step2b)(); } }]);
    };
    const step2b = () => { me = true; this.rel('cal'); this.message('Prêt !', 'J\'attends que ' + this.oppA.name + ' soit prêt…', []); tryStart(); };
    this.cfgPanel = () => {
      this.clearMessage();
      const box = h('div', { class: 'pdset' });
      groups.forEach(g => {
        const seg = h('div', { class: 'seg' }); const paint = () => [...seg.children].forEach((b, i) => b.classList.toggle('on', g.choices[i][0] === cfg[g.key]));
        g.choices.forEach(([v, t]) => seg.append(h('button', { class: 'btn sec', onclick: () => { cfg[g.key] = v; paint(); } }, t)));
        box.append(h('div', { class: 'lab' }, g.label), seg); paint();
      });
      this.message(title, how, [{ label: 'Suivant', onclick: () => { this.cfg = { ...cfg }; this.rel('cfg', { cfg: this.cfg }); this.clearMessage(); step2(); } }]);
      this.msg.querySelector('p').style.whiteSpace = 'pre-line'; this.msg.querySelector('p').after(box);
    };
    if (this.isHost) this.cfgPanel(); else { this.message(title, how + '\nAttends que l\'autre choisisse les réglages.', []); this.msg.querySelector('p').style.whiteSpace = 'pre-line'; }
  }
  countdown(done) {
    const el = h('div', { class: 'pdcount' }, '3'); this.root.append(el); let n = 3;
    const tick = () => { if (!this.alive) return; if (n <= 0) { el.remove(); done(); return; } el.textContent = n; this.s.beep(440 + (3 - n) * 110, 120, 'triangle'); n--; setTimeout(tick, 700); };
    tick();
  }
  finish(win, d) { super.finish(win, d); winBadge(this, win, null); }
}

/** Pose un 'brain' Rémi si le jeu n'en a pas dans remi.js (ne touche à aucun autre fichier). */
export function brainFor(net, fn) { if (net && net.remi && !net._pd) { net._pd = true; fn(net); } }
