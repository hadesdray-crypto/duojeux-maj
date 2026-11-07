// Dames françaises pirate : prise obligatoire (la plus longue), dames volantes, 10x10 ou 8x8.
import { TurnGame, slide, frame } from '../core/boardkit.js';
import { engine, moves } from './dames_engine.js';
import { h } from '../core/util.js';
import { css } from '../core/winfx.js';

css('dames', `
.dm-board{display:grid;width:var(--bs);height:var(--bs);border-radius:6px;overflow:hidden;box-shadow:inset 0 0 0 2px #0008;user-select:none;-webkit-user-select:none}
.dm-sq{position:relative;display:flex;align-items:center;justify-content:center;touch-action:manipulation;cursor:pointer}
.dm-sq.l{background:linear-gradient(135deg,#f0d49c,#dfb877)}.dm-sq.d{background:linear-gradient(135deg,#8a5430,#65381a)}
.dm-sq.last::before{content:"";position:absolute;inset:0;background:#ffe45a55}
.dm-sq.sel::before{content:"";position:absolute;inset:0;background:#27e0b388;box-shadow:inset 0 0 0 3px #27e0b3}
.dm-sq.path::before{content:"";position:absolute;inset:0;background:#27e0b355}
.dm-p{position:relative;width:80%;height:80%;border-radius:50%;box-shadow:0 3px 4px #000a,inset 0 -3px 5px #0006,inset 0 2px 3px #fff6;display:flex;align-items:center;justify-content:center}
.dm-p.w{background:radial-gradient(circle at 35% 30%,#fff7d8,#f0cf7a 60%,#b98a22);border:2px solid #fff0b0}
.dm-p.b{background:radial-gradient(circle at 35% 30%,#7a82a0,#1b2140 60%,#06091a);border:2px solid #c9a227}
.dm-p::after{content:"";position:absolute;inset:20%;border-radius:50%;border:2px solid #0004}
.dm-p svg{position:relative;z-index:1;width:62%;height:62%;filter:drop-shadow(0 1px 1px #0008)}
.dm-p.can{animation:bkpulse 1s infinite;outline:3px solid #27e0b3}
.dm-dot{position:absolute;width:34%;height:34%;border-radius:50%;background:#27e0b3cc;box-shadow:0 0 0 2px #fff7;animation:bkpulse 1.1s infinite}
`);
const CROWN = '<svg viewBox="0 0 40 40"><path d="M6 30L4 12L13 20L20 8L27 20L36 12L34 30Z" fill="#ffd84a" stroke="#7a5a10" stroke-width="2.2" stroke-linejoin="round"/><rect x="6" y="30" width="28" height="5" rx="2" fill="#e0a812" stroke="#7a5a10" stroke-width="2"/></svg>';
const HOW = ['Les pions avancent d\'une case en diagonale. Touche un pion, puis la case où il va.', 'Prendre est obligatoire, et il faut prendre le plus de pièces possible. Tu peux prendre en arrière.', 'Un pion qui atteint le bout du plateau devient dame : elle file en diagonale aussi loin qu\'elle veut.', 'Tu gagnes quand l\'autre n\'a plus de coup possible.'];

class Dames extends TurnGame {
  constructor(ctx) {
    super(ctx, { title: 'Dames', undo: true, sideNames: ['Clairs', 'Sombres'], engine, how: HOW, options: [{ key: 'size', label: 'Taille du plateau', def: 10, choices: [[10, 'Grand : 10 x 10'], [8, 'Petit : 8 x 8']] }] });
  }
  buildBoard(stage) {
    const n = this.state.n; this.n = n; this.sel = -1; this.pfx = [];
    this.boardEl = h('div', { class: 'dm-board', role: 'grid', style: `grid-template-columns:repeat(${n},1fr);grid-template-rows:repeat(${n},1fr)` });
    for (let k = 0; k < n * n; k++) this.boardEl.append(h('div', { class: 'dm-sq', 'data-k': k, onclick: () => this.tap(this.sqOf(k)) }));
    stage.append(frame(this.boardEl));
  }
  sqOf(k) { return this.mySide === 0 ? k : this.n * this.n - 1 - k; }
  kOf(sq) { return this.sqOf(sq); }
  extraStat(side) { if (!this.state) return ''; const c = this.state.b.filter(p => p && ((side === 0) === (p === 'w' || p === 'W'))).length; return ' · ' + c; }
  whyText(r) { return r.why === 'blocked' ? 'Plus aucun coup possible : la partie est perdue pour lui.' : r.why === 'quiet' ? 'Trop de coups de dame sans prise. Égalité.' : r.why === 'resign' ? 'Abandon.' : ''; }
  cands() { return moves(this.state).filter(m => m.f === this.sel && this.pfx.every((x, i) => m.path[i] === x)); }
  turnText() { const mv = moves(this.state); return mv.length && mv[0].caps.length ? 'Prise obligatoire !' : 'À toi de jouer !'; }
  paintBoard() {
    const s = this.state, n = this.n, el = this.boardEl; if (!el) return; const lm = this.lastMove, mv = this.myTurn() ? moves(s) : [];
    const forced = mv.length && mv[0].caps.length ? new Set(mv.map(m => m.f)) : new Set();
    const tg = this.sel >= 0 ? new Set(this.cands().map(m => m.path[this.pfx.length])) : new Set();
    [...el.children].forEach((c, k) => {
      const sq = this.sqOf(k), r = (sq / n) | 0, cc = sq % n, p = s.b[sq], dark = (r + cc) % 2 === 1;
      c.className = 'dm-sq ' + (dark ? 'd' : 'l') + (lm && (sq === lm.f || sq === lm.path[lm.path.length - 1]) ? ' last' : '') + (sq === this.sel ? ' sel' : '') + (this.pfx.includes(sq) ? ' path' : '');
      c.dataset.sq = sq; c.innerHTML = ''; if (p) { const king = p === 'W' || p === 'B'; c.append(h('div', { class: 'dm-p ' + p.toLowerCase() + (forced.has(sq) && this.sel < 0 ? ' can' : ''), html: king ? CROWN : '' })); }
      if (tg.has(sq)) c.append(h('i', { class: 'dm-dot' }));
    });
  }
  onApplied(prev, m, byMe) { this.sel = -1; this.pfx = []; this.s.sfx(m.caps.length ? 'hit' : 'tick'); if (this.state.promoted) this.s.sfx('ok'); this.anim = { f: m.f, t: m.path[m.path.length - 1] }; }
  update(first) {
    super.update(first);
    if (this.anim && this.boardEl) { const a = this.anim; this.anim = null; const fk = this.kOf(a.f), tk = this.kOf(a.t), el = this.boardEl.children[tk], pe = el && el.querySelector('.dm-p'); if (pe) { const sz = this.boardEl.clientWidth / this.n; slide(pe, ((fk % this.n) - (tk % this.n)) * sz, (((fk / this.n) | 0) - ((tk / this.n) | 0)) * sz, 300); } }
  }
  tap(sq) {
    if (!this.myTurn()) return; const s = this.state, p = s.b[sq], all = moves(s);
    if (this.sel >= 0) {
      const tg = this.cands().filter(m => m.path[this.pfx.length] === sq);
      if (tg.length) {
        this.pfx.push(sq); const done = tg.find(m => m.path.length === this.pfx.length);
        if (done) { this.tryMove(done); return; }
        this.s.sfx('tick'); this.paintBoard(); return;
      }
    }
    if (p && all.some(m => m.f === sq)) { this.sel = sq; this.pfx = []; this.s.sfx('tick'); }
    else { this.sel = -1; this.pfx = []; if (p && (s.t === 0) === (p === 'w' || p === 'W') && all[0] && all[0].caps.length) this.s.sfx('warn'); }
    this.paintBoard();
  }
}
export default { id: 'dames', name: 'Dames', short: 'Dames françaises : prise obligatoire et dames volantes.', how: HOW, create: ctx => new Dames(ctx) };
