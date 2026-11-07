// Othello pirate : encadre les jetons de l'autre pour les retourner. Jetons d'ébène contre jetons d'ivoire.
import { TurnGame, frame } from '../core/boardkit.js';
import { engine, moves, count } from './othello_engine.js';
import { h, toast } from '../core/util.js';
import { css } from '../core/winfx.js';

css('othello', `
.ot-board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);width:var(--bs);height:var(--bs);background:#0e5a3c;border-radius:6px;box-shadow:inset 0 0 0 2px #0008;user-select:none;-webkit-user-select:none}
.ot-c{position:relative;display:flex;align-items:center;justify-content:center;border:1px solid #06301f;background:linear-gradient(135deg,#127a50,#0c5a3a);touch-action:manipulation;cursor:pointer}
.ot-c.last::before{content:"";position:absolute;inset:0;background:#ffe45a44}
.ot-d{width:82%;height:82%;border-radius:50%;box-shadow:0 3px 4px #000a,inset 0 -3px 5px #0005,inset 0 2px 3px #fff5}
.ot-d.k0{background:radial-gradient(circle at 35% 30%,#6a7392,#151a2e 60%,#05070f);border:2px solid #c9a227}
.ot-d.k1{background:radial-gradient(circle at 35% 30%,#ffffff,#efe3c0 60%,#b9a36a);border:2px solid #7a5a10}
.ot-hint{position:absolute;width:26%;height:26%;border-radius:50%;background:#ffe45acc;box-shadow:0 0 0 2px #0006;animation:bkpulse 1.1s infinite}
`);
const HOW = ['Les noirs commencent. Touche une case allumée pour poser un jeton.', 'Tous les jetons de l\'autre pris en sandwich entre tes jetons se retournent.', 'Si tu ne peux pas jouer, ton tour passe tout seul.', 'Quand plus personne ne peut jouer, celui qui a le plus de jetons gagne.'];
class Othello extends TurnGame {
  constructor(ctx) { super(ctx, { title: 'Othello', sideNames: ['Ébène', 'Ivoire'], engine, how: HOW }); }
  buildBoard(stage) {
    this.boardEl = h('div', { class: 'ot-board', role: 'grid' });
    for (let i = 0; i < 64; i++) this.boardEl.append(h('div', { class: 'ot-c', 'data-i': i, onclick: () => this.tap(i) }));
    stage.append(frame(this.boardEl));
  }
  extraStat(side) { return this.state ? ' · ' + count(this.state.b)[side] : ''; }
  whyText(r) { return r.why === 'resign' ? 'Abandon.' : r.score ? `Score final : ${r.score[0]} contre ${r.score[1]}.` + (r.w === 'd' ? ' Égalité.' : '') : ''; }
  paintBoard() {
    const s = this.state, mv = this.myTurn() ? moves(s) : [], lm = this.lastMove, fl = new Set(this.flipAnim || []);
    [...this.boardEl.children].forEach((c, i) => {
      const v = s.b[i]; c.className = 'ot-c' + (lm && lm.i === i ? ' last' : '');
      c.replaceChildren(...(v >= 0 ? [h('div', { class: 'ot-d k' + v })] : mv.some(m => m.i === i) ? [h('i', { class: 'ot-hint' })] : []));
      if (fl.has(i) && c.firstChild) { try { c.firstChild.animate([{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(90deg) scale(1.1)', offset: .5 }, { transform: 'rotateY(0)' }], { duration: 380 }); } catch {} }
    });
    this.flipAnim = null;
  }
  onApplied(prev, m, byMe) { this.flipAnim = this.state.flipped; this.s.sfx(m.pass ? 'warn' : 'tick'); }
  update(first) {
    super.update(first);
    if (!this.over && this.myTurn()) { const mv = moves(this.state); if (mv.length === 1 && mv[0].pass) { toast('Tu ne peux pas jouer : ton tour passe.'); setTimeout(() => this.alive && this.myTurn() && this.tryMove({ pass: 1 }), 1100); } }
    else if (!this.over && this.state && this.E.turn(this.state) !== this.mySide && !this.remi) { const mv = moves(this.state); if (mv.length === 1 && mv[0].pass) toast('L\'autre ne peut pas jouer : son tour passe.'); }
  }
  tap(i) { if (!this.myTurn() || !moves(this.state).some(m => m.i === i)) return; this.tryMove({ i }); }
}
export default { id: 'othello', name: 'Othello', short: 'Retourne les jetons de l\'autre et prends le plateau.', how: HOW, create: ctx => new Othello(ctx) };
