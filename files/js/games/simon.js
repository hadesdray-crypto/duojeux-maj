// Simon à deux : retiens la suite de couleurs et sons, puis refais-la. Même suite pour les deux ; celui qui va le plus loin gagne.
import { Duo, rng } from '../core/kit.js';
import { h } from '../core/util.js';
import { sprEl, sprSet, ready } from '../core/sprites.js';
import { winBadge } from '../core/winfx.js';
const SK = [['n_padR0', 'n_padR1', ''], ['n_padG0', 'n_padG1', ''], ['n_padB0', 'n_padB1', ''], ['n_padR0', 'n_padR1', 'hue-rotate(50deg) saturate(1.4) brightness(1.2)']];
const PADS = [{ c: '#ff5470', f: 262 }, { c: '#2fbf71', f: 330 }, { c: '#4da3ff', f: 392 }, { c: '#ffd24d', f: 523 }];
const MAX = 12;
class Simon extends Duo {
  constructor(ctx) {
    super(ctx); this.seq = []; this.n = 1; this.i = 0; this.input = false; this.mine = null; this.theirs = null;
    this.hud(h('span', {}, 'Tour : 0'), h('span', {}, ''));
    this.note = this.big('');
    this.grid = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:8px' });
    this.pads = PADS.map((p, k) => { const b = h('button', { class: 'btn', 'aria-label': 'Couleur ' + (k + 1), style: 'min-height:120px;background:' + p.c + ';opacity:.45;touch-action:manipulation;display:flex;align-items:center;justify-content:center;padding:4px', onpointerdown: e => { e.preventDefault(); this.tap(k); } }); this.grid.append(b); b.skin = sprEl(SK[k][0], 140, 'filter:' + (SK[k][2] || 'none') + ';transition:transform .1s'); b.append(b.skin); if (ready()) { b.style.background = 'transparent'; b.style.boxShadow = 'none'; b.style.opacity = .55; } return b; });
    this.root.append(this.note, this.grid);
    this.onNet('sd', m => { this.theirs = m.n; this.fin(); });
    this.gate('Simon à deux', 'Regarde la suite de couleurs, puis refais-la.\nElle s\'allonge à chaque tour.\nCelui qui va le plus loin gagne.', seed => { const r = rng(seed); this.seq = Array.from({ length: MAX + 1 }, () => (r() * 4) | 0); setTimeout(() => this.play(), 600); });
  }
  flash(k, ms = 420) { const b = this.pads[k], art = ready(); b.style.opacity = 1; if (art) { sprSet(b.skin, SK[k][1], 140); b.skin.style.transform = 'scale(1.06)'; b.skin.style.filter = (SK[k][2] || '') + ' drop-shadow(0 0 16px ' + PADS[k].c + ')'; } this.s.beep(PADS[k].f, ms - 80, 'triangle', .2); setTimeout(() => { b.style.opacity = art ? .55 : .45; if (art) { sprSet(b.skin, SK[k][0], 140); b.skin.style.transform = 'none'; b.skin.style.filter = SK[k][2] || 'none'; } }, ms - 60); }
  async play() {
    if (this.over || this.mine != null) return; this.input = false; this.hudEl.children[0].textContent = 'Tour : ' + this.n; this.note.textContent = 'Regarde…'; this.note.style.color = '#ffb020';
    for (let k = 0; k < this.n; k++) { await new Promise(r => setTimeout(r, 650)); if (!this.alive) return; this.flash(this.seq[k]); }
    await new Promise(r => setTimeout(r, 450)); this.i = 0; this.input = true; this.note.textContent = 'À toi !'; this.note.style.color = '#27e0b3';
  }
  tap(k) {
    if (!this.input || this.over) return; this.flash(k, 260);
    if (k !== this.seq[this.i]) { this.input = false; this.done(this.n - 1); return; }
    this.i++; if (this.i >= this.n) { this.input = false; if (this.n >= MAX) { this.done(MAX); return; } this.n++; setTimeout(() => this.play(), 800); }
  }
  done(n) { this.mine = n; this.s.sfx(n >= MAX ? 'win' : 'lose'); this.net.send('sd', { n }); this.note.textContent = (n >= MAX ? 'Bravo ! Tu as réussi ' : 'Raté ! Tu as réussi ') + n + ' tour(s).'; this.note.style.color = '#ff5470'; this.message('Fini !', 'Tu as réussi ' + n + ' tour(s).\nJ\'attends ' + this.oppA.name + '…', []); this.msg.querySelector('p').style.whiteSpace = 'pre-line'; this.fin(); }
  finish(win, d) { super.finish(win, d); winBadge(this, win, null); }
  fin() { if (this.mine != null && this.theirs != null) { this.clearMessage(); this.compare(this.mine, this.theirs, v => v + ' tour(s)'); } }
}
export default { id: 'simon', name: 'Simon à deux', short: 'Retiens la suite de couleurs et de sons.', how: ['Regarde les couleurs qui s\'allument.', 'Refais la même suite.', 'Elle s\'allonge à chaque tour.', 'Celui qui va le plus loin gagne.'], create: ctx => new Simon(ctx) };
