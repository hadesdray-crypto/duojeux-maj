// Calcul mental en duel : le même calcul pour les deux, le plus rapide à donner la bonne réponse marque. Niveaux selon l'âge.
import { PackGame, Arbiter } from './c_base.js';
import { h } from '../core/util.js';
import { lerp } from '../core/level.js';
import { css } from '../core/winfx.js';

css('ca', `.ca-board{position:relative;min-height:92px;border-radius:18px;background:linear-gradient(#f6e6bc,#e4cb8f);color:#3a2812;border:4px solid #8a6a32;box-shadow:inset 0 0 22px #8a6a3277,0 4px 10px #0008;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px}
.ca-q{font-size:2em;font-weight:900;letter-spacing:1px}
.ca-n{position:absolute;top:6px;left:12px;font-weight:700;font-size:.8em;opacity:.7}
.ca-in{min-height:48px;border-radius:14px;background:#0b1230;border:3px solid #c9a227;display:flex;align-items:center;justify-content:center;font-size:2em;font-weight:900;color:#fff3b0;letter-spacing:2px}
.ca-in.ok{border-color:#27e0b3}.ca-in.ko{border-color:#ff5470}
.ca-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ca-k{min-height:50px;border-radius:16px;border:3px solid #0007;background:linear-gradient(#6b4a26,#4a321a);color:#fff3d6;font-size:1.5em;font-weight:900;touch-action:manipulation;box-shadow:inset 0 3px 0 #ffffff33,0 4px 0 #0006}
.ca-k:active{transform:translateY(3px)}
.ca-k.go{background:linear-gradient(#2fbf71,#16764a)}.ca-k.del{background:linear-gradient(#b3423f,#7c1f1f);font-size:1em}
.ca-k[disabled]{filter:saturate(.4) brightness(.7)}`);

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
/** Fabrique un calcul selon le niveau (petit / moyen / grand / expert) et le type (mix, addsub, mult). */
export function makeQ(niv, op) {
  const kinds = op === 'addsub' ? ['+', '-'] : op === 'mult' ? ['x'] : niv === 'expert' ? ['+', '-', 'x', 'x', ':'] : niv === 'petit' ? ['+', '-', 'x'] : ['+', '-', 'x'];
  const k = kinds[ri(0, kinds.length - 1)]; let a, b;
  if (k === '+') { const m = { petit: 10, moyen: 60, grand: 400, expert: 900 }[niv]; a = ri(2, m); b = ri(2, m); return { t: a + ' + ' + b, a: a + b }; }
  if (k === '-') { const m = { petit: 18, moyen: 90, grand: 600, expert: 999 }[niv]; a = ri(5, m); b = ri(2, a); return { t: a + ' − ' + b, a: a - b }; }
  if (k === 'x') {
    if (niv === 'petit') { a = [2, 5, 10, 3][ri(0, 3)]; b = ri(1, 10); }
    else if (niv === 'moyen') { a = ri(2, 9); b = ri(2, 10); }
    else if (niv === 'grand') { a = ri(3, 12); b = ri(6, 12); }
    else { a = ri(12, 25); b = ri(3, 9); }
    return { t: a + ' × ' + b, a: a * b };
  }
  b = ri(2, niv === 'expert' ? 12 : 9); const q = ri(2, niv === 'expert' ? 15 : 10); return { t: b * q + ' ÷ ' + b, a: q };
}

class Calcul extends PackGame {
  constructor(ctx) {
    super(ctx, { id: 'calcul', name: 'Calcul mental' });
    this.me = this.isHost ? 'h' : 'g'; this.opp = this.isHost ? 'g' : 'h'; this.pts = { h: 0, g: 0 }; this.n = 0; this.cur = null; this.inp = '';
    this.board = h('div'); this.qEl = h('div', { class: 'ca-q' }, '…'); this.nn = h('div', { class: 'ca-n' }, ''); this.card = h("div", { class: "ca-board" }, this.nn, this.qEl);
    this.disp = h('div', { class: 'ca-in' }, ' '); this.flash = h('div', { class: 'pc-flash', style: 'font-size:1.1em' }, ' ');
    const key = (t, cls, fn) => h('button', { class: 'ca-k ' + cls, onpointerdown: e => { e.preventDefault(); fn(); } }, t);
    this.keys = [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => key(String(d), '', () => this.digit(d))), key('Effacer', 'del', () => { this.inp = this.inp.slice(0, -1); this.paintIn(); }), key('0', '', () => this.digit(0)), key('OK', 'go', () => this.submit())];
    this.main.append(this.board, this.card, this.disp, this.flash, h('div', { class: 'ca-pad' }, ...this.keys));
    this.arb = new Arbiter(this, { decide: (r, f) => this.decide(r, f), onResolve: (n, w, reps) => this.resolve(n, w, reps) });
    this.onNet('rd', m => this.startQ(m));
    this.onNet('rep', m => { if (this.isHost) this.arb.report(m.n, this.opp, m); });
    this.onNet('res', m => { if (!this.isHost) this.applyRes(m); });
    if (this.remi) this.net.recv = { rd: m => this.botQ(m) };
    this.setup('Calcul mental', 'Le même calcul pour vous deux : le plus rapide à donner la BONNE réponse gagne le point.\nUne mauvaise réponse te sort de la question.', [
      { k: 'niv', label: 'Niveau', vals: [['petit', '6-7 ans'], ['moyen', '8-10 ans'], ['grand', '11-13 ans'], ['expert', 'Grands']], def: 'moyen' },
      { k: 'op', label: 'Calculs', vals: [['mix', 'Mélange'], ['addsub', '+ et −'], ['mult', 'Tables ×']], def: 'mix' },
      { k: 'pts', label: 'Points pour gagner', vals: [[3, '3'], [5, '5'], [7, '7']], def: 5 }], (seed, cfg) => { this.total = cfg.pts; this.paintBoard(); if (this.isHost) this.at(.8, () => this.nextQ()); });
  }
  paintBoard() { this.board.replaceChildren(this.draw2(this.pts[this.me], this.pts[this.opp], this.total || (this.cfg && this.cfg.pts) || 5)); this.setStat(this.pts[this.me] + ' pt', this.pts[this.opp] + ' pt'); }
  nextQ() {
    if (this.over) return; const q = makeQ(this.cfg.niv, this.cfg.op), m = { n: ++this.n, q: q.t, a: q.a, d: 1.1 };
    this.net.send('rd', m); this.startQ(m); this.arb.open(m.n, m.d + this.lat() + 25);
  }
  startQ(m) {
    if (this.over) return; this.n = m.n; this.cur = { ...m, shown: false, locked: false }; this.inp = ''; this.paintIn(); this.disp.className = 'ca-in';
    this.qEl.textContent = 'Prêt ?'; this.nn.textContent = 'Calcul ' + m.n; this.flash.textContent = ' '; this.keys.forEach(k => k.disabled = true);
    this.at(m.d + (this.isHost ? this.lat() : 0), () => this.show());
  }
  show() { const c = this.cur; if (!c || this.over) return; c.shown = true; c.t0 = this.nowT(); this.qEl.textContent = c.q + ' = ?'; this.qEl.classList.remove('pc-pop'); void this.qEl.offsetWidth; this.qEl.classList.add('pc-pop'); this.keys.forEach(k => k.disabled = false); }
  paintIn() { this.disp.textContent = this.inp || ' '; }
  digit(d) { const c = this.cur; if (!c || !c.shown || c.locked || this.frozen || this.over || this.inp.length >= 4) return; this.inp += d; this.s.sfx('tick'); this.paintIn(); }
  submit() {
    const c = this.cur; if (!c || !c.shown || c.locked || this.frozen || this.over || !this.inp) return; c.locked = true; this.keys.forEach(k => k.disabled = true);
    const ok = Number(this.inp) === c.a, rep = { n: c.n, ok, rt: Math.round((this.nowT() - c.t0) * 1000) / 1000 };
    this.disp.classList.add(ok ? 'ok' : 'ko'); this.flash.textContent = ok ? 'Bonne réponse ! On attend l\'autre…' : 'Raté… ce n\'était pas ça.'; this.flash.style.color = ok ? '#27e0b3' : '#ff5470';
    if (!ok) { this.s.sfx('hit'); this.s.vibrate(90); this.card.classList.remove('pc-shake'); void this.card.offsetWidth; this.card.classList.add('pc-shake'); } else this.s.sfx('tick');
    if (this.isHost) this.arb.report(c.n, 'h', rep); else this.net.send('rep', rep);
  }
  decide(r, final) {
    const H = r.h, G = r.g, best = () => { const a = [['h', H], ['g', G]].filter(x => x[1] && x[1].ok); if (!a.length) return null; a.sort((x, y) => x[1].rt - y[1].rt || (x[0] === 'h' ? -1 : 1)); return a[0][0]; };
    if (H && G) return { done: true, w: best() }; if (final) return { done: true, w: best() }; return { done: false };
  }
  resolve(n, w, reps) { const m = { n, w, a: this.cur.a, rt: { h: reps.h && reps.h.rt, g: reps.g && reps.g.rt } }; this.net.send('res', m); this.applyRes(m); }
  applyRes(m) {
    if (this.over || m.n !== this.n) return; const c = this.cur; if (c) c.locked = true; this.keys.forEach(k => k.disabled = true); this.card.classList.remove('pc-shake');
    if (m.w) this.pts[m.w]++; const mine = m.w === this.me, theirs = m.w === this.opp;
    this.qEl.textContent = this.cur.q + ' = ' + m.a;
    if (mine) { this.flash.textContent = 'Point pour toi !'; this.flash.style.color = '#27e0b3'; this.s.sfx('win'); } else if (theirs) { this.flash.textContent = 'Point pour ' + this.oppA.name; this.flash.style.color = '#ff8a98'; this.s.sfx('block'); } else { this.flash.textContent = 'Personne n\'a trouvé : c\'était ' + m.a + '.'; this.flash.style.color = '#ffe9a8'; }
    this.flash.classList.remove('pc-pop'); void this.flash.offsetWidth; this.flash.classList.add('pc-pop'); this.paintBoard();
    const tot = this.cfg.pts;
    if (this.pts.h >= tot || this.pts.g >= tot) { const win = this.pts[this.me] >= tot; this.at(1.4, () => this.end(win, 'Toi : ' + this.pts[this.me] + ' point(s)\n' + this.oppA.name + ' : ' + this.pts[this.opp] + ' point(s)')); }
    else if (this.isHost) this.at(1.8, () => this.nextQ());
  }
  /* ----- Rémi : plus le calcul est dur, plus il met de temps ----- */
  botQ(m) {
    const hard = Math.min(2.2, 1 + (m.a > 99 ? .5 : 0) + (m.a > 400 ? .5 : 0) + (m.q.includes('×') && m.a > 60 ? .4 : 0));
    const rt = Math.max(1.1, lerp(11, 3.2) * hard * (.75 + Math.random() * .5)), ok = Math.random() > lerp(.3, .03);
    this.at(m.d + rt, () => this.botSay('rep', { n: m.n, ok, rt }));
  }
}
export default {
  id: 'calcul', name: 'Calcul mental', short: 'Le plus rapide à trouver le résultat marque le point.',
  how: ['Le même calcul s\'affiche pour vous deux.', 'Tape le résultat avec le pavé, puis OK.', 'Le plus rapide à donner la bonne réponse gagne le point.', 'Choisis le niveau : petits, moyens ou grands.'],
  create: ctx => new Calcul(ctx),
};
