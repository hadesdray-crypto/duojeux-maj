// Jeu des couleurs : une forme apparaît, tape le bouton de la bonne couleur avant l'autre. Pièges : mot trompeur, forme noire « pas touche ».
import { PackGame, Arbiter } from './c_base.js';
import { h } from '../core/util.js';
import { level, lerp } from '../core/level.js';
import { css } from '../core/winfx.js';

const COLS = [{ n: 'Rouge', c: '#e63946', d: '#a4202c' }, { n: 'Bleu', c: '#3b82f6', d: '#1f56b8' }, { n: 'Vert', c: '#2fbf71', d: '#1b8a4f' }, { n: 'Jaune', c: '#ffd24d', d: '#c9a227' }];
const SHAPES = ['circle(50% at 50% 50%)', 'inset(6% round 22%)', 'polygon(50% 2%,98% 38%,80% 96%,20% 96%,2% 38%)', 'polygon(25% 3%,75% 3%,98% 50%,75% 97%,25% 97%,2% 50%)', 'polygon(50% 0,100% 50%,50% 100%,0 50%)', 'polygon(50% 2%,61% 36%,98% 36%,68% 57%,79% 92%,50% 71%,21% 92%,32% 57%,2% 36%,39% 36%)'];
const SPEED = { calme: { w: [1.2, 2.6], win: 4 }, normal: { w: [.9, 2.2], win: 3 }, eclair: { w: [.6, 1.6], win: 2 } };
const NOGO_WIN = 1.7;
css('cl', `.cl-stage{position:relative;height:196px;display:flex;align-items:center;justify-content:center;border-radius:18px;background:radial-gradient(circle at 50% 40%,#1c2c5c,#0b1230);border:3px solid #c9a227;box-shadow:inset 0 0 24px #000a,0 4px 10px #0008;overflow:hidden}
.cl-shape{width:150px;height:150px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:34px;letter-spacing:1px;filter:drop-shadow(0 6px 6px #0009)}
.cl-wait{width:130px;height:130px;border-radius:50%;border:5px dashed #5a6aa0;opacity:.7;animation:clspin 4s linear infinite}
@keyframes clspin{to{transform:rotate(360deg)}}
.cl-round{position:absolute;top:8px;left:12px;font-weight:700;font-size:.85em;opacity:.8}
.cl-ask{position:absolute;bottom:8px;left:0;right:0;text-align:center;font-weight:700;font-size:.9em;color:#ffe9a8;text-shadow:0 1px 3px #000}
.cl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cl-btn{min-height:84px;border-radius:18px;border:4px solid #0007;font-size:1.25em;font-weight:900;color:#10162e;touch-action:manipulation;box-shadow:inset 0 4px 0 #ffffff55,inset 0 -6px 0 #0003,0 5px 0 #0006;transition:transform .06s,filter .15s}
.cl-btn:active{transform:translateY(4px);box-shadow:inset 0 4px 0 #ffffff55,0 1px 0 #0006}
.cl-btn[disabled]{filter:saturate(.45) brightness(.7)}`);

class Couleurs extends PackGame {
  constructor(ctx) {
    super(ctx, { id: 'couleurs', name: 'Jeu des couleurs' });
    this.pts = { h: 0, g: 0 }; this.n = 0; this.round = null; this.me = this.isHost ? 'h' : 'g'; this.opp = this.isHost ? 'g' : 'h';
    this.board = h('div'); this.stage = h('div', { class: 'cl-stage' }); this.flash = h('div', { class: 'pc-flash' }, ' ');
    this.btns = COLS.map((c, i) => h('button', { class: 'cl-btn', 'aria-label': c.n, style: 'background:linear-gradient(' + c.c + ',' + c.d + ')', disabled: true, onpointerdown: e => { e.preventDefault(); this.tap(i); } }, c.n));
    this.main.append(this.board, this.stage, this.flash, h('div', { class: 'cl-grid' }, ...this.btns));
    this.paintBoard(); this.paintStage(null);
    this.arb = new Arbiter(this, { graceOn: r => !(this.round && this.round.k === 'nogo') && r.ok, decide: (r, f) => this.decide(r, f), onResolve: (n, w, reps) => this.resolve(n, w, reps) });
    this.onNet('rd', m => this.startRound(m));
    this.onNet('rep', m => { if (this.isHost) this.arb.report(m.n, this.opp, m); });
    this.onNet('res', m => { if (!this.isHost) this.applyRes(m); });
    if (this.remi) this.net.recv = { rd: m => this.botRound(m) };
    this.setup('Jeu des couleurs', 'Une forme apparaît : tape vite le bouton de la même couleur, avant l\'autre.\nPièges : un mot écrit dans une autre couleur (tape la couleur de l\'encre) et la forme noire : PAS TOUCHE !\nTaper trop tôt ou se tromper te sort de la manche.', [
      { k: 'pts', label: 'Points pour gagner', vals: [[3, '3'], [5, '5'], [7, '7']], def: 5 },
      { k: 'vit', label: 'Vitesse', vals: [['calme', 'Calme'], ['normal', 'Normal'], ['eclair', 'Éclair']], def: 'normal' },
      { k: 'pieges', label: 'Pièges', vals: [[1, 'Avec pièges'], [0, 'Sans pièges']], def: 1 }], (seed, cfg) => { this.total = cfg.pts; this.paintBoard(); if (this.isHost) this.at(.8, () => this.nextRound()); });
  }
  paintBoard() { this.board.replaceChildren(this.draw2(this.pts[this.me], this.pts[this.opp], this.total || (this.cfg && this.cfg.pts) || 5)); this.setStat(this.pts[this.me] + ' pt', this.pts[this.opp] + ' pt'); }
  gen() {
    const cfg = this.cfg, sp = SPEED[cfg.vit] || SPEED.normal, r = Math.random();
    const k = !cfg.pieges ? 'color' : r < .55 ? 'color' : r < .8 ? 'stroop' : 'nogo';
    const i = Math.floor(Math.random() * 4); let w = Math.floor(Math.random() * 3); if (w >= i) w++;
    return { k, i, w, s: Math.floor(Math.random() * SHAPES.length), d: Math.round((sp.w[0] + Math.random() * (sp.w[1] - sp.w[0])) * 100) / 100 };
  }
  nextRound() {
    if (this.over) return; const m = { n: ++this.n, ...this.gen() };
    this.net.send('rd', m); this.startRound(m);
    const sp = SPEED[this.cfg.vit] || SPEED.normal; this.arb.open(m.n, m.d + this.lat() + (m.k === 'nogo' ? NOGO_WIN + .35 : sp.win + .9));
  }
  startRound(m) {
    if (this.over) return; this.n = m.n; this.round = { ...m, shown: false, locked: false, t0: 0 };
    this.flash.textContent = 'Prépare-toi…'; this.flash.style.color = '#ffe9a8'; this.btns.forEach(b => b.disabled = false); this.paintStage(null);
    this.at(m.d + (this.isHost ? this.lat() : 0), () => this.show());
  }
  show() {
    const r = this.round; if (!r || this.over) return; r.shown = true; r.t0 = this.nowT(); this.paintStage(r); this.flash.textContent = ' ';
    if (r.k === 'nogo') this.at(NOGO_WIN, () => { if (this.round === r && !r.locked) { r.locked = true; this.btns.forEach(b => b.disabled = true); this.flash.textContent = 'Bien joué : tu n\'as pas touché !'; this.flash.style.color = '#27e0b3'; } });
  }
  paintStage(r) {
    const st = this.stage; st.replaceChildren(h('div', { class: 'cl-round' }, this.n ? 'Manche ' + this.n : ''));
    if (!r) { st.append(h('div', { class: 'cl-wait' })); return; }
    if (r.k === 'color') st.append(h('div', { class: 'cl-shape pc-pop', style: 'background:linear-gradient(' + COLS[r.i].c + ',' + COLS[r.i].d + ');clip-path:' + SHAPES[r.s] }), h('div', { class: 'cl-ask' }, 'Tape la couleur de la forme'));
    else if (r.k === 'stroop') st.append(h('div', { class: 'cl-shape pc-pop', style: 'color:' + COLS[r.i].c + ';font-size:46px;text-shadow:0 0 0 #000,0 3px 0 #000,2px 0 0 #000,-2px 0 0 #000,0 -2px 0 #000' }, COLS[r.w].n.toUpperCase()), h('div', { class: 'cl-ask' }, 'Tape la couleur de l\'ENCRE, pas le mot'));
    else st.append(h('div', { class: 'cl-shape pc-pop', style: 'background:radial-gradient(circle at 35% 30%,#3a3f55,#0a0c14);clip-path:' + SHAPES[0] + ';color:#ffd24d;font-size:80px' }, '×'), h('div', { class: 'cl-ask', style: 'color:#ff8a98' }, 'PAS TOUCHE !'));
  }
  tap(i) {
    const r = this.round; if (!r || r.locked || this.over || this.frozen) return; r.locked = true; this.btns.forEach(b => b.disabled = true);
    let rep;
    if (!r.shown) { rep = { n: r.n, ok: false, early: 1 }; this.flash.textContent = 'Trop tôt !'; this.flash.style.color = '#ff5470'; }
    else if (r.k === 'nogo') { rep = { n: r.n, ok: false, nogo: 1 }; this.flash.textContent = 'Pas touche ! Raté.'; this.flash.style.color = '#ff5470'; }
    else { const ok = i === r.i; rep = { n: r.n, ok, rt: Math.round((this.nowT() - r.t0) * 1000) / 1000 }; this.flash.textContent = ok ? 'Bonne couleur ! On attend l\'autre…' : 'Raté, ce n\'est pas la bonne !'; this.flash.style.color = ok ? '#27e0b3' : '#ff5470'; if (!ok) { this.stage.classList.remove('pc-shake'); void this.stage.offsetWidth; this.stage.classList.add('pc-shake'); } }
    this.s.sfx(rep.ok ? 'tick' : 'hit'); if (!rep.ok) this.s.vibrate(90);
    if (this.isHost) this.arb.report(r.n, 'h', rep); else this.net.send('rep', rep);
  }
  decide(r, final) {
    const k = this.round ? this.round.k : 'color', H = r.h, G = r.g;
    if (k === 'nogo') {
      if (!(H && G) && !final) return { done: false };
      const hf = H && !H.ok, gf = G && !G.ok; if (hf && !gf) return { done: true, w: 'g' }; if (gf && !hf) return { done: true, w: 'h' }; return { done: true, w: null };
    }
    const best = () => { const a = [H, G].map((x, j) => x && x.ok ? { who: j ? 'g' : 'h', rt: x.rt } : null).filter(Boolean); if (!a.length) return null; a.sort((x, y) => x.rt - y.rt || (x.who === 'h' ? -1 : 1)); return a[0].who; };
    if (H && G) return { done: true, w: best() };
    if (final) return { done: true, w: best() };
    return { done: false };
  }
  resolve(n, w, reps) { const m = { n, w, rt: { h: reps.h && reps.h.rt, g: reps.g && reps.g.rt } }; this.net.send('res', m); this.applyRes(m); }
  applyRes(m) {
    if (this.over || m.n !== this.n) return; const r = this.round; if (r) r.locked = true; this.btns.forEach(b => b.disabled = true); this.stage.classList.remove('pc-shake');
    const mine = m.w === this.me, theirs = m.w === this.opp;
    if (m.w) this.pts[m.w]++;
    const fmt = x => x != null ? (Math.round(x * 1000) / 1000).toFixed(2).replace('.', ',') + ' s' : '—';
    if (mine) { this.flash.textContent = 'Point pour toi !' + (m.rt[this.me] != null ? ' (' + fmt(m.rt[this.me]) + ')' : ''); this.flash.style.color = '#27e0b3'; this.s.sfx('win'); this.s.vibrate(40); }
    else if (theirs) { this.flash.textContent = 'Point pour ' + this.oppA.name + (m.rt[this.opp] != null ? ' (' + fmt(m.rt[this.opp]) + ')' : ''); this.flash.style.color = '#ff8a98'; this.s.sfx('block'); }
    else { this.flash.textContent = 'Personne ne marque.'; this.flash.style.color = '#ffe9a8'; }
    this.flash.classList.remove('pc-pop'); void this.flash.offsetWidth; this.flash.classList.add('pc-pop');
    this.paintBoard();
    const tot = this.cfg.pts;
    if (this.pts.h >= tot || this.pts.g >= tot) { const win = this.pts[this.me] >= tot; this.at(1.3, () => this.end(win, 'Toi : ' + this.pts[this.me] + ' point(s)\n' + this.oppA.name + ' : ' + this.pts[this.opp] + ' point(s)')); }
    else if (this.isHost) this.at(1.7, () => this.nextRound());
  }
  /* ----- Rémi ----- */
  botRound(m) {
    const err = Math.random() < lerp(.28, .03), rt = Math.max(.2, lerp(1.25, .42) + (Math.random() - .5) * lerp(.7, .25) + (this.cfg.vit === 'eclair' ? -.05 : this.cfg.vit === 'calme' ? .2 : 0));
    if (m.k === 'nogo') { if (Math.random() < lerp(.4, .02)) this.at(m.d + rt, () => this.botSay('rep', { n: m.n, ok: false, nogo: 1 })); return; }
    if (Math.random() < lerp(.14, 0)) { this.at(Math.max(.1, m.d * Math.random()), () => this.botSay('rep', { n: m.n, ok: false, early: 1 })); return; }
    this.at(m.d + rt, () => this.botSay('rep', { n: m.n, ok: !err, rt }));
  }
}
export default {
  id: 'couleurs', name: 'Jeu des couleurs', short: 'Tape la bonne couleur avant l\'autre. Attention aux pièges !',
  how: ['Une forme colorée apparaît : tape le bouton de la même couleur.', 'Si un mot s\'écrit dans une autre couleur, tape la couleur de l\'encre.', 'Forme noire : pas touche ! Celui qui touche perd le point.', 'Le premier à gagner assez de points gagne la partie.'],
  create: ctx => new Couleurs(ctx),
};
