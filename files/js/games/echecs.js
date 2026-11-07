// Échecs à deux : toutes les règles (roque, prise en passant, promotion, échec, mat, pat, nulles), coups légaux surlignés.
import { TurnGame, slide, frame } from '../core/boardkit.js';
import { engine, moves, inCheck, posKey, sqName } from './echecs_engine.js';
import { h } from '../core/util.js';
import { css } from '../core/winfx.js';

css('echecs', `
.ch-board{position:relative;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);width:var(--bs);height:var(--bs);max-width:100%;border-radius:6px;overflow:hidden;box-shadow:inset 0 0 0 2px #0006;user-select:none;-webkit-user-select:none}
.ch-sq{position:relative;display:flex;align-items:center;justify-content:center;touch-action:manipulation;cursor:pointer}
.ch-sq.l{background:linear-gradient(135deg,#f0d49c,#dfb877)}.ch-sq.d{background:linear-gradient(135deg,#a8703a,#855227)}
.ch-sq.last::before{content:"";position:absolute;inset:0;background:#ffe45a66}
.ch-sq.sel::before{content:"";position:absolute;inset:0;background:#27e0b388;box-shadow:inset 0 0 0 3px #27e0b3}
.ch-sq.chk::before{content:"";position:absolute;inset:0;background:radial-gradient(circle,#ff2a4acc 0,#ff2a4a00 75%)}
.ch-sq .dot{position:absolute;width:30%;height:30%;border-radius:50%;background:#1b2250aa;box-shadow:0 0 0 2px #fff6;animation:bkpulse 1.1s infinite}
.ch-sq .ring{position:absolute;inset:3px;border-radius:50%;box-shadow:inset 0 0 0 4px #ff5470cc;animation:bkpulse 1.1s infinite}
.ch-sq svg{width:88%;height:88%;position:relative;filter:drop-shadow(0 2px 1.5px #0007);pointer-events:none}
.ch-sq .co{position:absolute;font-size:9px;font-weight:800;opacity:.7;color:#4a2c12;pointer-events:none}
.ch-sq .co.a{left:2px;top:1px}.ch-sq .co.b{right:2px;bottom:1px}
.ch-promo{position:absolute;inset:0;background:#050a1ccc;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
.ch-promo .row{width:92%;gap:8px}.ch-promo button{background:#e8c88a;border:3px solid #7a5a10;border-radius:14px;min-height:76px;padding:2px;box-shadow:0 4px 0 #5a3d10}
.ch-promo svg{width:100%;height:60px}
`);

const SVG = {
  p: '<circle cx="22.5" cy="13" r="6"/><rect x="17" y="20" width="11" height="3.5" rx="1.7"/><path d="M16.5 38C16.5 29 19.5 26 20 23.5H25C25.5 26 28.5 29 28.5 38Z"/><rect x="13" y="37.5" width="19" height="4.5" rx="2.2"/>',
  r: '<path d="M13 41V36.5H32V41Z"/><path d="M15.5 36.5L16.5 19H28.5L29.5 36.5Z"/><path d="M12.5 19V9H17V12.5H20.4V9H24.6V12.5H28V9H32.5V19Z"/>',
  n: '<path d="M13.5 41C13.5 31 17.5 26.5 21.5 22.5C19.5 21.5 16.5 22.5 14.5 25.5L11.5 23C13.5 19 16.5 15 19.5 12L19.5 7.5L23 10C30.5 10 35 16 33.5 26C32.5 32 31.5 36 31.5 41Z"/><circle cx="23.5" cy="15.5" r="1.4" class="eye"/>',
  b: '<circle cx="22.5" cy="6.3" r="2.4"/><path d="M22.5 8C27.5 12 29.5 16.5 27.5 20.5C26.5 22.5 25.5 23.5 25.5 25H19.5C19.5 23.5 18.5 22.5 17.5 20.5C15.5 16.5 17.5 12 22.5 8Z"/><rect x="16.5" y="24.5" width="12" height="3.2" rx="1.6"/><path d="M18 27.7H27C28 31.5 30.5 35.5 31.5 38.5H13.5C14.5 35.5 17 31.5 18 27.7Z"/><rect x="12" y="38" width="21" height="4" rx="2"/>',
  q: '<path d="M11.5 35L8.5 14.5L16 22.5L19 10.5L22.5 21.5L26 10.5L29 22.5L36.5 14.5L33.5 35Z"/><circle cx="8.5" cy="13" r="2.3"/><circle cx="19" cy="9" r="2.3"/><circle cx="26" cy="9" r="2.3"/><circle cx="36.5" cy="13" r="2.3"/><circle cx="22.5" cy="7" r="2.3"/><rect x="11.5" y="34" width="22" height="3.5" rx="1.7"/><rect x="9.5" y="37.5" width="26" height="4.5" rx="2.2"/>',
  k: '<rect x="21" y="2.5" width="3" height="10" rx="1"/><rect x="17.5" y="5.8" width="10" height="3" rx="1"/><path d="M12.5 41L13.5 25C13.5 18.5 17.5 15 22.5 15C27.5 15 31.5 18.5 31.5 25L32.5 41Z"/><rect x="11" y="37" width="23" height="4.5" rx="2.2"/><path d="M16.5 27.5H28.5" stroke-width="1.6" fill="none"/>',
};
let uid = 0;
export function pieceSvg(p) {
  const w = p === p.toUpperCase(), u = p.toLowerCase(), id = 'g' + (++uid);
  const fill = w ? ['#fffdf2', '#d8c48f'] : ['#59627f', '#0f1428'], stroke = w ? '#5a4310' : '#e3bd45';
  return `<svg viewBox="0 0 45 45" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${fill[0]}"/><stop offset="1" stop-color="${fill[1]}"/></linearGradient></defs><g fill="url(#${id})" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round">${SVG[u]}</g>${u === 'n' ? `<circle cx="23.5" cy="15.5" r="1.3" fill="${stroke}"/>` : ''}</svg>`;
}
const NAMES = { q: 'dame', r: 'tour', b: 'fou', n: 'cavalier' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

class Echecs extends TurnGame {
  constructor(ctx) {
    super(ctx, {
      title: 'Échecs', undo: true, sideNames: ['Blancs', 'Noirs'], engine,
      how: ['Les blancs commencent. Touche une pièce, puis la case où elle va.', 'Les cases possibles s\'allument. Protège ton roi !', 'Échec et mat : le roi est attaqué et ne peut plus fuir, la partie est gagnée.', 'Roque, prise en passant et promotion sont permis.'],
    });
    this.counts = {};
  }
  buildBoard(stage) {
    this.sel = -1; this.targets = [];
    this.boardEl = h('div', { class: 'ch-board', role: 'grid' });
    for (let k = 0; k < 64; k++) this.boardEl.append(h('div', { class: 'ch-sq ' + (((k >> 3) + (k & 7)) % 2 ? 'd' : 'l'), 'data-k': k, onclick: () => this.tap(this.sqOf(k)) }));
    stage.append(frame(this.boardEl));
    if (!this.resuming) { this.counts = {}; this.note(this.state); }
  }
  onReplayStart(s) { this.counts = {}; this.note(s); }
  onReplayStep(s) { this.note(s); }
  /** Position affichée k → case du plateau (le joueur noir voit le plateau retourné). */
  sqOf(k) { return this.mySide === 0 ? k : 63 - k; }
  kOf(sq) { return this.mySide === 0 ? sq : 63 - sq; }
  note(s) { const key = posKey(s); this.counts[key] = (this.counts[key] || 0) + 1; }
  extraResult(s) { return this.counts[posKey(s)] >= 3 ? { w: 'd', why: 'rep' } : null; }
  whyText(r) {
    return { mat: 'Échec et mat !', pat: 'Pat : le roi n\'est pas attaqué mais plus aucun coup n\'est possible. Égalité.', mat_insuf: 'Il ne reste pas assez de pièces pour gagner. Égalité.', 50: 'Cinquante coups sans prise ni pion. Égalité.', rep: 'La même position trois fois. Égalité.', resign: 'Abandon.' }[r.why] || '';
  }
  turnText() { return inCheck(this.state) ? 'Ton roi est en échec !' : 'À toi de jouer !'; }
  extraStat(side) {
    let w = 0, b = 0; for (const p of this.state.b) { if (!p || p.toLowerCase() === 'k') continue; if (p === p.toUpperCase()) w += VAL[p.toLowerCase()]; else b += VAL[p.toLowerCase()]; }
    const d = (side === 0 ? w - b : b - w); return d > 0 ? '  (+' + d + ')' : '';
  }
  paintBoard() {
    const s = this.state, el = this.boardEl; if (!el) return; const lm = this.lastMove, kc = inCheck(s) ? s.b.indexOf(s.t === 0 ? 'K' : 'k') : -1;
    [...el.children].forEach((c, k) => {
      const sq = this.sqOf(k), p = s.b[sq]; c.className = 'ch-sq ' + (((k >> 3) + (k & 7)) % 2 ? 'd' : 'l') + (lm && (sq === lm.f || sq === lm.t) ? ' last' : '') + (sq === this.sel ? ' sel' : '') + (sq === kc ? ' chk' : '');
      c.setAttribute('aria-label', sqName(sq) + (p ? ' ' + p : '')); c.dataset.sq = sq;
      c.innerHTML = (p ? pieceSvg(p) : '') + (this.targets.includes(sq) ? (p ? '<i class="ring"></i>' : '<i class="dot"></i>') : '')
        + ((k >> 3) === 7 ? '<span class="co b">' + 'abcdefgh'[this.sqOf(k) & 7] + '</span>' : '') + ((k & 7) === 0 ? '<span class="co a">' + (8 - (this.sqOf(k) >> 3)) + '</span>' : '');
    });
  }
  onApplied(prev, m, byMe) {
    this.sel = -1; this.targets = []; this.note(this.state);
    const cap = prev.b[m.t] || (prev.b[m.f].toLowerCase() === 'p' && m.t === prev.ep && (m.f & 7) !== (m.t & 7));
    this.s.sfx(inCheck(this.state) ? 'warn' : cap ? 'hit' : 'tick'); if (cap && !byMe) this.s.vibrate(40);
    this.anim = { f: m.f, t: m.t };
  }
  update(first) {
    super.update(first);
    if (this.anim && this.boardEl) { const a = this.anim; this.anim = null; const fk = this.kOf(a.f), tk = this.kOf(a.t), el = this.boardEl.children[tk]; const pe = el && el.querySelector('svg'); if (pe) { const sz = this.boardEl.clientWidth / 8; slide(pe, ((fk & 7) - (tk & 7)) * sz, ((fk >> 3) - (tk >> 3)) * sz); } }
  }
  tap(sq) {
    if (!this.myTurn()) return; const s = this.state, p = s.b[sq], mine = p && ((p === p.toUpperCase()) === (this.mySide === 0));
    if (this.sel >= 0 && this.targets.includes(sq)) {
      const cand = moves(s).filter(m => m.f === this.sel && m.t === sq);
      if (cand.length > 1) { this.askPromo(cand); return; }
      this.tryMove(cand[0]); return;
    }
    if (mine && sq !== this.sel) { this.sel = sq; this.targets = moves(s).filter(m => m.f === sq).map(m => m.t); this.s.sfx('tick'); }
    else { this.sel = -1; this.targets = []; }
    this.paintBoard();
  }
  askPromo(cand) {
    const white = this.mySide === 0; const box = h('div', { class: 'ch-promo' }, h('div', { style: 'font-weight:800;font-size:1.2em' }, 'Choisis ta nouvelle pièce'),
      h('div', { class: 'row' }, ...['q', 'r', 'b', 'n'].map(q => h('button', { 'aria-label': NAMES[q], 'data-promo': q, html: pieceSvg(white ? q.toUpperCase() : q), onclick: () => { box.remove(); this.tryMove(cand.find(m => m.p === q)); } }))));
    this.stage.parentNode.style.position = 'relative'; this.root.append(box);
  }
}
export default { id: 'echecs', name: 'Échecs', short: 'Le grand classique : mets le roi de l\'autre échec et mat.', how: ['Les blancs commencent. Touche une pièce, puis la case où elle va.', 'Les cases possibles s\'allument. Protège ton roi !', 'Échec et mat : le roi est attaqué et ne peut plus fuir, la partie est gagnée.', 'Roque, prise en passant et promotion sont permis.'], create: ctx => new Echecs(ctx) };
