// Morpion pirate sur carte au trésor : 3x3 (3 alignés) ou 9x9 (5 alignés). Croix rouge contre pièce d'or.
import { TurnGame, frame } from '../core/boardkit.js';
import { engine } from './morpion_engine.js';
import { h } from '../core/util.js';
import { css } from '../core/winfx.js';

css('morpion', `
.mo-board{display:grid;width:var(--bs);height:var(--bs);background:linear-gradient(135deg,#f3dfa8,#dcbf7a);border-radius:6px;box-shadow:inset 0 0 18px #7a5a1088;user-select:none;-webkit-user-select:none}
.mo-c{position:relative;display:flex;align-items:center;justify-content:center;border:1px solid #7a5a1066;touch-action:manipulation;cursor:pointer}
.mo-c.n3{border:2px solid #7a5a10aa}
.mo-c svg{width:80%;height:80%;animation:bkpop .25s ease-out;filter:drop-shadow(0 1px 1px #0006)}
.mo-c.last{background:#ffe45a55}.mo-c.win{background:#27e0b366;animation:bkpulse .7s infinite}
.mo-c.free:active{background:#27e0b333}
`);
const X = '<svg viewBox="0 0 40 40"><path d="M7 7L33 33M33 7L7 33" stroke="#7a0f25" stroke-width="9" stroke-linecap="round"/><path d="M7 7L33 33M33 7L7 33" stroke="#e0203f" stroke-width="5.5" stroke-linecap="round"/></svg>';
const O = '<svg viewBox="0 0 40 40"><defs><radialGradient id="mog" cx=".35" cy=".3"><stop offset="0" stop-color="#fff3b0"/><stop offset=".6" stop-color="#f0b81c"/><stop offset="1" stop-color="#a8730a"/></radialGradient></defs><circle cx="20" cy="20" r="14" fill="url(#mog)" stroke="#7a5a10" stroke-width="2.5"/><circle cx="20" cy="20" r="8" fill="none" stroke="#a8730a" stroke-width="2"/></svg>';

const HOW = ['Chacun son tour, touche une case vide pour y poser ta marque.', 'Petit plateau : aligne 3 marques. Grand plateau : aligne 5 marques.', 'En ligne, en colonne ou en diagonale. Bloque l\'autre aussi !'];
class Morpion extends TurnGame {
  constructor(ctx) {
    super(ctx, { title: 'Morpion', undo: true, sideNames: ['Croix rouge', 'Pièce d\'or'], engine, how: HOW, options: [{ key: 'size', label: 'Taille du plateau', def: 3, choices: [[3, 'Petit : 3 alignés'], [9, 'Grand : 5 alignés']] }] });
  }
  buildBoard(stage) {
    const n = this.state.n; this.boardEl = h('div', { class: 'mo-board', role: 'grid', style: `grid-template-columns:repeat(${n},1fr);grid-template-rows:repeat(${n},1fr)` });
    for (let i = 0; i < n * n; i++) this.boardEl.append(h('div', { class: 'mo-c n' + n, 'data-i': i, onclick: () => this.tap(i) }));
    stage.append(frame(this.boardEl));
  }
  whyText(r) { return r.why === 'line' ? (r.w === this.mySide ? 'Alignement réussi !' : 'L\'autre a aligné ses marques.') : r.why === 'full' ? 'Plus aucune case libre. Égalité.' : r.why === 'resign' ? 'Abandon.' : ''; }
  paintBoard() {
    const s = this.state, r = this.over ? this.E.result(s) : null, line = r && r.line || [], lm = this.lastMove;
    [...this.boardEl.children].forEach((c, i) => {
      const v = s.b[i]; c.className = 'mo-c n' + s.n + (v < 0 ? ' free' : '') + (lm && lm.i === i ? ' last' : '') + (line.includes(i) ? ' win' : '');
      const cur = c.dataset.v; if (String(v) !== cur) { c.dataset.v = v; c.innerHTML = v === 0 ? X : v === 1 ? O : ''; }
    });
  }
  onApplied(prev, m, byMe) { this.s.sfx(byMe ? 'tick' : 'hit'); }
  tap(i) { if (!this.myTurn() || this.state.b[i] >= 0) return; this.tryMove({ i }); }
}
export default { id: 'morpion', name: 'Morpion', short: 'Aligne 3 marques, ou 5 sur le grand plateau.', how: HOW, create: ctx => new Morpion(ctx) };
