// Puissance 4 pirate : aligne 4 pièces (rubis contre doublons d'or) dans la coque du navire.
import { TurnGame, frame } from '../core/boardkit.js';
import { engine, moves, dropRow, W, H } from './puissance4_engine.js';
import { h } from '../core/util.js';
import { css } from '../core/winfx.js';

css('p4', `
.p4-board{position:relative;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(6,1fr);width:var(--bs);aspect-ratio:7/6;max-height:calc(var(--bs)*6/7 + 4px);background:linear-gradient(180deg,#7a4a22,#4d2b10);border-radius:8px;padding:4px;gap:0;box-shadow:inset 0 0 0 2px #0007;user-select:none;-webkit-user-select:none}
.p4-cell{position:relative;display:flex;align-items:center;justify-content:center;touch-action:manipulation;cursor:pointer}
.p4-cell::before{content:"";position:absolute;inset:8%;border-radius:50%;background:radial-gradient(circle at 50% 40%,#0a1226,#1a2a55);box-shadow:inset 0 3px 5px #000c,0 1px 0 #ffffff33}
.p4-cell.hot::after{content:"";position:absolute;inset:0;background:#27e0b322}
.p4-coin{position:relative;width:78%;height:78%;border-radius:50%;box-shadow:inset 0 -4px 6px #0006,inset 0 3px 4px #fff7,0 2px 3px #000a}
.p4-coin.c0{background:radial-gradient(circle at 35% 30%,#ff8fa0,#e0203f 55%,#8a0f25);border:2px solid #ffd6dc}
.p4-coin.c1{background:radial-gradient(circle at 35% 30%,#fff3b0,#f0b81c 55%,#a8730a);border:2px solid #fff0b0}
.p4-coin::after{content:"";position:absolute;inset:24%;border-radius:50%;border:2px solid #0004}
.p4-coin.win{animation:bkpulse .6s infinite;outline:4px solid #27e0b3}
.p4-hint{display:flex;width:var(--bs);justify-content:space-between;padding:0 4px;height:26px}
.p4-hint i{flex:1;text-align:center}
.p4-hint .coin{display:inline-block;width:22px;height:22px;border-radius:50%}
`);

class P4 extends TurnGame {
  constructor(ctx) {
    super(ctx, { title: 'Puissance 4', undo: true, sideNames: ['Rubis', 'Or'], engine, how: ['Chacun son tour, touche une colonne : ta pièce tombe tout en bas.', 'Aligne 4 pièces de ta couleur : en ligne, en colonne ou en diagonale.', 'Empêche l\'autre d\'en aligner 4 avant toi !'] });
  }
  buildBoard(stage) {
    this.hint = h('div', { class: 'p4-hint' }, ...Array.from({ length: W }, () => h('i')));
    this.boardEl = h('div', { class: 'p4-board', role: 'grid' });
    for (let k = 0; k < W * H; k++) this.boardEl.append(h('div', { class: 'p4-cell', 'data-c': k % W, 'data-k': k, onclick: () => this.tap(k % W) }));
    stage.append(frame(this.boardEl)); this.winLine = null;
  }
  turnText() { return 'À toi : touche une colonne'; }
  whyText(r) { return r.why === 'four' ? (r.w === this.mySide ? 'Quatre pièces alignées !' : 'Quatre pièces alignées par l\'autre.') : r.why === 'full' ? 'Le plateau est plein. Égalité.' : r.why === 'resign' ? 'Abandon.' : ''; }
  paintBoard() {
    const b = this.state.b, r = this.over ? this.E.result(this.state) : null, line = r && r.line || [];
    [...this.boardEl.children].forEach((c, k) => {
      const v = b[k]; const had = c.firstChild; const want = v >= 0 ? 'p4-coin c' + v + (line.includes(k) ? ' win' : '') : '';
      if (!want) { c.replaceChildren(); return; }
      if (!had) c.replaceChildren(h('div', { class: want })); else had.className = want;
    });
    this.boardEl.classList.toggle('myturn', this.myTurn());
  }
  onApplied(prev, m, byMe) {
    this.dropCell = this.state.last; this.s.sfx(byMe ? 'tick' : 'hit');
  }
  update(first) {
    super.update(first);
    if (this.dropCell != null) { const k = this.dropCell; this.dropCell = null; const coin = this.boardEl.children[k] && this.boardEl.children[k].firstChild; if (coin) { const sz = this.boardEl.clientWidth / 7, dist = ((k / W) | 0) + 1; try { coin.animate([{ transform: `translateY(${-dist * sz}px)` }, { transform: 'translateY(0)', offset: .7 }, { transform: 'translateY(-8%)', offset: .85 }, { transform: 'none' }], { duration: 120 + dist * 70, easing: 'ease-in' }); } catch {} } }
  }
  tap(c) {
    if (!this.myTurn()) return; if (dropRow(this.state, c) < 0) { this.s.sfx('warn'); return; }
    this.tryMove({ c });
  }
}
export default { id: 'puissance4', name: 'Puissance 4', short: 'Aligne 4 pièces avant l\'autre.', how: ['Chacun son tour, touche une colonne : ta pièce tombe tout en bas.', 'Aligne 4 pièces de ta couleur : en ligne, en colonne ou en diagonale.', 'Empêche l\'autre d\'en aligner 4 avant toi !'], create: ctx => new P4(ctx) };
