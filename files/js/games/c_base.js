// Socle commun des jeux du « pack C » (réflexe et réflexion) :
// réglages avant la partie, horloge de jeu qui s'arrête en pause, pause / quitter / rejouer, arbitre équitable.
import { Duo } from '../core/kit.js';
import { h, modal, store } from '../core/util.js';
import { css, winBadge } from '../core/winfx.js';
import { ico } from '../core/ui.js';

css('pcbase', `
.pc-main{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:2px 10px 6px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.pc-strip{display:flex;gap:10px;padding:6px 10px;background:var(--card,#101a38)}
.pc-strip .btn{flex:1 1 0;min-width:0;min-height:52px;padding:4px 8px;font-size:.95em;overflow-wrap:normal;word-break:keep-all;hyphens:none}
.pc-wood{background:linear-gradient(#6b4a26,#4a321a);border:3px solid #2a1c0e;border-radius:16px;box-shadow:inset 0 2px 0 #ffffff26,0 4px 10px #0008;padding:10px}
.pc-parch{background:linear-gradient(#f6e6bc,#e4cb8f);color:#3a2812;border:3px solid #8a6a32;border-radius:14px;box-shadow:inset 0 0 18px #8a6a3255,0 4px 10px #0008}
.pc-title{font-weight:800;font-size:1.05em;text-align:center;letter-spacing:.3px}
.pc-pips{display:flex;gap:6px;justify-content:center;align-items:center;min-height:22px}
.pc-pip{width:20px;height:20px;border-radius:50%;background:#16203f;border:2px solid #c9a227;box-shadow:inset 0 2px 3px #0009}
.pc-pip.on{background:radial-gradient(circle at 35% 30%,#fff3b0,#e0a912 70%);box-shadow:0 0 8px #ffd24d99}
.pc-pip.opp.on{background:radial-gradient(circle at 35% 30%,#ffd0d8,#e64a68 70%);box-shadow:0 0 8px #ff547099}
.pc-opts{display:flex;flex-direction:column;gap:10px;width:100%;max-width:340px}
.pc-opt .lab{font-weight:700;margin-bottom:4px;font-size:.95em}
.pc-opt .chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.pc-chip{flex:1 1 auto;min-height:48px;padding:6px 12px;border-radius:14px;border:3px solid #3a4a7a;background:#16224a;color:#dbe6ff;font-weight:700;font-size:.95em;touch-action:manipulation}
.pc-chip.on{border-color:#ffd24d;background:#2b3c78;color:#fff;box-shadow:0 0 10px #ffd24d66}
.pc-chip[disabled]{opacity:.85}
.pc-over{position:absolute;inset:0;background:#050a1ce8;z-index:7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;overflow-y:auto}
.pc-over h2{font-size:1.8em}
.pc-over .btn{min-width:230px}
.pc-flash{text-align:center;font-weight:800;font-size:1.5em;min-height:1.5em}
@keyframes pcpop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
@keyframes pcshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.pc-pop{animation:pcpop .3s ease-out}.pc-shake{animation:pcshake .28s}
`);

export const sec = x => Math.round(x * 100) / 100;
export const pick = (r, a) => a[Math.floor(r() * a.length)];

/** Point d'accueil des jeux du pack : réglages, horloge, pause, quitter. */
export class PackGame extends Duo {
  constructor(ctx, meta) {
    super(ctx);
    this.meta = meta; this.clock = 0; this.q = []; this.qid = 0; this.pz = { me: false, opp: false }; this.lastT = performance.now(); this.linkLost = false;
    this.main = h('div', { class: 'pc-main' });
    this.btnPause = h('button', { class: 'btn sec', onclick: () => this.togglePause() }, h('span', { class: 'bi' }, ico('j_gear', 34), h('span', {}, 'Pause')));
    this.btnQuit = h('button', { class: 'btn sec', onclick: () => this.askQuit() }, h('span', { class: 'bi' }, ico('ic_close', 34), h('span', {}, 'Quitter')));
    this.strip = h('div', { class: 'pc-strip' }, this.btnPause, this.btnQuit);
    this.root.append(this.main, this.strip);
    this.onNet('pz', m => { this.pz.opp = !!m.on; this.syncPause(); });
    this.onNet('lost', () => { this.linkLost = true; this.syncPause(); });
    this.onNet('ready', () => { this.linkLost = false; this.syncPause(); });
    this.loop(dt => this.frame(dt));
  }
  get frozen() { return this.pz.me || this.pz.opp || this.linkLost; }
  frame(dt) {
    this.lastT = performance.now(); if (this.frozen || this.over) return;
    this.clock += dt;
    if (this.q.length) { const due = this.q.filter(e => e.t <= this.clock).sort((a, b) => a.t - b.t); if (due.length) { this.q = this.q.filter(e => e.t > this.clock); due.forEach(e => { try { e.fn(); } catch (x) { console.error(x); } }); } }
    if (this.update) this.update(dt);
  }
  /** Programme une action dans « sec » secondes de JEU (le temps s'arrête en pause). */
  at(s, fn) { const id = ++this.qid; this.q.push({ t: this.clock + s, fn, id }); return id; }
  cancel(id) { this.q = this.q.filter(e => e.id !== id); }
  clearQ() { this.q = []; }
  /** Heure de jeu précise (secondes), qui ne compte pas les pauses. */
  nowT() { return this.clock + (this.frozen ? 0 : Math.min(.05, (performance.now() - this.lastT) / 1000)); }
  lat() { return Math.min(400, this.net.remi ? 0 : (this.net.latency || 0)) / 1000; }
  botSay(t, d) { setTimeout(() => { if (this.alive) this.net.emit(t, d); }, 0); }

  /* ----- Pause / quitter ----- */
  togglePause() { if (this.over) return; this.pz.me = !this.pz.me; this.net.send('pz', { on: this.pz.me }); this.syncPause(); }
  syncPause() {
    if (this.ov) { this.ov.remove(); this.ov = null; }
    const bt = this.btnPause.querySelector('.bi > span:last-child'); if (bt) bt.textContent = this.pz.me ? 'Reprendre' : 'Pause';
    if (this.over) return;
    if (this.pz.me) {
      this.ov = h('div', { class: 'pc-over' }, h('h2', {}, 'Pause'), h('p', {}, this.net.remi ? 'Le jeu est arrêté.' : 'Le jeu est arrêté chez vous deux.'),
        h('button', { class: 'btn big', onclick: () => this.togglePause() }, h('span', { class: 'bi' }, ico('j_play', 36), h('span', {}, 'Reprendre'))),
        h('button', { class: 'btn sec', onclick: () => { this.pz.me = false; this.net.send('pz', { on: false }); this.syncPause(); this.askReplay(); } }, h('span', { class: 'bi' }, ico('ic_refresh', 36), h('span', {}, 'Rejouer'))),
        h('button', { class: 'btn sec', onclick: () => this.askQuit() }, h('span', { class: 'bi' }, ico('j_home', 36), h('span', {}, 'Retour au menu'))));
    } else if (this.linkLost) this.ov = h('div', { class: 'pc-over' }, h('h2', {}, 'Connexion perdue'), h('p', {}, 'Je retente la liaison avec ' + this.oppA.name + '. La partie reprendra toute seule.'), h('button', { class: 'btn sec', onclick: () => this.ctx.exit() }, h('span', { class: 'bi' }, ico('j_home', 36), h('span', {}, 'Retour au menu'))));
    else if (this.pz.opp) this.ov = h('div', { class: 'pc-over' }, h('h2', {}, 'Pause'), h('p', {}, this.oppA.name + ' a mis le jeu en pause. Ça reprend dès qu\'il revient.'), h('button', { class: 'btn sec', onclick: () => this.ctx.exit() }, h('span', { class: 'bi' }, ico('j_home', 36), h('span', {}, 'Retour au menu'))));
    if (this.ov) this.root.append(this.ov);
  }
  askQuit() {
    if (modalStackHas('pcquit')) return;
    const m = modal('Quitter la partie ?', [h('p', {}, this.net.remi ? 'On arrête de jouer avec Rémi.' : 'L\'autre joueur sera prévenu.')], [{ label: 'Rester' }, { label: 'Quitter', cls: 'warn', onclick: () => { this.ctx.exit(); } }]); m.pcquit = true; pcModals.push(m);
  }

  /* ----- Réglages communs avant la partie ----- */
  /** opts : [{k, label, vals:[[valeur, texte],…], def}]. L'hôte choisit, l'autre voit les choix en direct. onGo(seed, cfg) est appelé des deux côtés. */
  setup(title, how, opts, onGo) {
    const saved = store.get('pc.' + this.meta.id, {}) || {};
    this.cfg = {}; opts.forEach(o => { const v = saved[o.k]; this.cfg[o.k] = o.vals.some(x => x[0] === v) ? v : o.def; });
    const chips = [];
    const draw = () => chips.forEach(c => c.b.classList.toggle('on', this.cfg[c.k] === c.v));
    const box = h('div', { class: 'pc-opts' }, ...opts.map(o => h('div', { class: 'pc-opt' }, h('div', { class: 'lab' }, o.label), h('div', { class: 'chips' }, ...o.vals.map(([v, t]) => {
      const b = h('button', { class: 'pc-chip', 'data-k': o.k, 'data-v': String(v), disabled: !this.isHost, onclick: () => { if (!this.isHost) return; this.cfg[o.k] = v; draw(); store.set('pc.' + this.meta.id, this.cfg); this.net.send('cfg', { o: this.cfg }); } }, t);
      chips.push({ k: o.k, v, b }); return b; })))));
    this.onNet('cfg', m => { if (this.gone || this.isHost) return; Object.assign(this.cfg, m.o); draw(); });
    this.onNet('go', m => { this.net.send('goack'); if (this.gone) return; this.gone = true; if (m.o) this.cfg = m.o; this.clearMessage(); this.startAll(onGo, m.seed); });
    this.onNet('goack', () => { this.acked = true; });
    this.message(title, how + (this.isHost ? '' : '\nAttends que l\'autre lance.'), []);
    const p = this.msg.querySelector('p'); if (p) p.style.whiteSpace = 'pre-line';
    this.msg.style.overflowY = 'auto'; this.msg.style.background = '#050a1cf5'; this.msg.style.justifyContent = 'safe center';
    this.msg.append(box);
    draw();
    if (this.isHost) this.msg.append(h('button', { class: 'btn big', onclick: () => {
      if (this.gone) return; this.gone = true; const seed = (Math.random() * 1e9) | 0;
      this.net.send('cfg', { o: this.cfg }); this.net.send('go', { seed, o: this.cfg }); this.clearMessage(); this.startAll(onGo, seed);
      if (!this.remi) { let n = 0; const iv = setInterval(() => { if (this.acked || ++n > 10 || !this.alive) clearInterval(iv); else this.net.send('go', { seed, o: this.cfg }); }, 1500); this.sub(() => clearInterval(iv)); }
    } }, 'Commencer'));
  }
  startAll(onGo, seed) { this.say(this.meta.name); onGo(seed, this.cfg); }

  /** Fin de partie : message, badge, voix. */
  end(win, detail) { this.clearQ(); if (this.ov) { this.ov.remove(); this.ov = null; } this.finish(win, detail); winBadge(this, win, null); if (this.msg) { const p = this.msg.querySelector('p'); if (p) p.style.whiteSpace = 'pre-line'; } }
  finish(win, d) { super.finish(win, d); }
  draw2(me, opp, total) {
    const row = (n, cls) => h('div', { class: 'pc-pips' }, ...Array.from({ length: total }, (_, i) => h('span', { class: 'pc-pip ' + cls + (i < n ? ' on' : '') })));
    return h('div', { class: 'pc-parch', style: 'padding:6px 10px;display:flex;justify-content:space-around;gap:10px' }, row(me, ''), row(opp, 'opp'));
  }
}
const pcModals = [];
function modalStackHas(k) { for (let i = pcModals.length - 1; i >= 0; i--) { const m = pcModals[i]; if (!m.el || !m.el.isConnected) { pcModals.splice(i, 1); continue; } if (m[k]) return true; } return false; }

/** Arbitre équitable : l'hôte reçoit les rapports des deux joueurs (temps de réaction mesuré CHEZ chacun, depuis l'affichage) et désigne le gagnant.
 *  decide(rapports, final) → { done, w } ; w = 'h' (hôte), 'g' (invité) ou null (personne). */
export class Arbiter {
  constructor(g, { grace = .45, decide, onResolve, graceOn = r => r.ok }) { this.g = g; this.grace = grace; this.graceOn = graceOn; this.decide = decide; this.onResolve = onResolve; this.reps = {}; this.n = -1; this.done = true; }
  open(n, timeout) { this.n = n; this.reps = {}; this.done = false; this.t1 = null; this.t2 = this.g.at(timeout, () => this.force()); }
  report(n, who, rep) {
    if (this.done || n !== this.n || this.reps[who]) return; this.reps[who] = rep;
    const r = this.decide(this.reps, false); if (r.done) return this.finish(r.w);
    if (this.graceOn(rep) && this.t1 == null) this.t1 = this.g.at(this.grace, () => this.force());
  }
  force() { if (this.done) return; const r = this.decide(this.reps, true); this.finish(r.w); }
  finish(w) { if (this.done) return; this.done = true; this.g.cancel(this.t1); this.g.cancel(this.t2); this.onResolve(this.n, w, this.reps); }
}
