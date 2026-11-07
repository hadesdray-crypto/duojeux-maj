// Blackjack à deux : chacun joue contre la banque avec des jetons fictifs, et se mesure à l'autre. Mises, carte, rester, doubler, partager.
import { CardGame, cardEl, setCard, stdFace, cardBrain, thinkMs, shuffled, iconSvg, lerp } from './cards_kit.js';
import { rng } from '../core/kit.js';
import { css } from '../core/winfx.js';
import { h } from '../core/util.js';

const pts = id => { const r = id % 13; return r === 0 ? 11 : Math.min(10, r + 1); };
function val(cs) { let t = 0, a = 0; for (const c of cs) { t += pts(c); if (c % 13 === 0) a++; } while (t > 21 && a > 0) { t -= 10; a--; } return { t, soft: a > 0 }; }
const BETS = [10, 25, 50];
const ROUNDS = [{ label: 'Courte partie (5 manches)', val: 5 }, { label: 'Partie normale (8 manches)', val: 8 }, { label: 'Longue partie (12 manches)', val: 12 }];

class Engine {
  constructor(seed, opt) {
    this.rand = rng(seed); this.R = [5, 8, 12].includes(opt) ? opt : 8; this.chips = [100, 100]; this.m = [0, 0]; this.rd = 1; this.over = null; this.res = null; this.newShoe(); this.start();
  }
  newShoe() { this.shoe = shuffled(Array.from({ length: 104 }, (_, i) => i % 52), this.rand); }
  draw() { if (!this.shoe.length) this.newShoe(); return this.shoe.shift(); }
  start() {
    if (this.shoe.length < 24) this.newShoe();
    this.bets = [null, null]; this.hands = [[], []]; this.bank = []; this.ph = 'bet'; this.cur = -1; this.hi = 0; this.rev = false; this.res = null; this.order = this.rd % 2 ? [0, 1] : [1, 0];
  }
  reserved(p) { return this.hands[p].reduce((s, x) => s + x.bet, 0); }
  free(p) { return this.chips[p] - this.reserved(p); }
  act(p, a) {
    if (this.over) return false;
    if (a.k === 'bet') {
      if (this.ph !== 'bet' || this.bets[p] != null) return false; const v = a.v | 0;
      if (!(v >= 1 && v <= this.chips[p] && (v === this.chips[p] || BETS.includes(v)))) return false;
      this.bets[p] = v; if (this.bets[0] != null && this.bets[1] != null) this.deal(); return true;
    }
    if (this.ph !== 'play' || p !== this.cur) return false;
    const H = this.hands[p][this.hi]; if (!H || H.done) return false;
    if (a.k === 'hit') { H.c.push(this.draw()); if (val(H.c).t >= 21) H.done = true; }
    else if (a.k === 'stand') H.done = true;
    else if (a.k === 'double') { if (!this.canD(p)) return false; H.bet *= 2; H.dbl = true; H.c.push(this.draw()); H.done = true; }
    else if (a.k === 'split') {
      if (!this.canS(p)) return false; const [x, y] = H.c;
      const A = { c: [x, this.draw()], bet: H.bet, done: false, sp: true }, B = { c: [y, this.draw()], bet: H.bet, done: false, sp: true };
      [A, B].forEach(q => { if (val(q.c).t >= 21) q.done = true; }); this.hands[p] = [A, B];
    } else return false;
    this.advance(); return true;
  }
  canD(p) { const H = this.hands[p][this.hi]; return !!H && H.c.length === 2 && !H.done && this.free(p) >= H.bet; }
  canS(p) { const H = this.hands[p][this.hi]; return !!H && this.hands[p].length === 1 && H.c.length === 2 && pts(H.c[0]) === pts(H.c[1]) && this.free(p) >= H.bet; }
  deal() {
    for (const p of [0, 1]) this.hands[p] = [{ c: [], bet: this.bets[p], done: false }];
    for (let i = 0; i < 2; i++) { for (const p of this.order) this.hands[p][0].c.push(this.draw()); this.bank.push(this.draw()); }
    for (const p of [0, 1]) { const H = this.hands[p][0]; if (val(H.c).t === 21) { H.bj = true; H.done = true; } }
    this.ph = 'play'; this.advance();
  }
  advance() {
    for (const p of this.order) { const i = this.hands[p].findIndex(x => !x.done); if (i >= 0) { this.cur = p; this.hi = i; return; } }
    this.ph = 'bank'; this.cur = -1;
  }
  live() { return this.hands.some(hs => hs.some(x => val(x.c).t <= 21 && !x.bj)); }
  auto() { return this.over ? 0 : this.ph === 'bank' ? 1100 : this.ph === 'result' ? 4200 : 0; }
  autoStep() {
    if (this.ph === 'bank') {
      if (!this.rev) { this.rev = true; if (!(this.live() && val(this.bank).t < 17)) this.settle(); return; }
      if (this.live() && val(this.bank).t < 17) { this.bank.push(this.draw()); if (val(this.bank).t >= 17) this.settleSoon = true; return; }
      this.settle(); return;
    }
    if (this.ph === 'result') {
      if (this.rd >= this.R || this.chips[0] <= 0 || this.chips[1] <= 0) { const d = this.chips[0] - this.chips[1]; this.over = { w: d === 0 ? -1 : d > 0 ? 0 : 1 }; this.ph = 'over'; return; }
      this.rd++; this.start();
    }
  }
  settle() {
    const bv = val(this.bank).t, bbj = this.bank.length === 2 && bv === 21, net = [0, 0], out = [[], []];
    for (const p of [0, 1]) for (const H of this.hands[p]) {
      const pv = val(H.c).t; let d, o;
      if (pv > 21) { d = -H.bet; o = 'bust'; }
      else if (H.bj && !bbj) { d = Math.floor(H.bet * 1.5); o = 'bj'; }
      else if (H.bj && bbj) { d = 0; o = 'push'; }
      else if (bbj) { d = -H.bet; o = 'lose'; }
      else if (bv > 21 || pv > bv) { d = H.bet; o = 'win'; }
      else if (pv === bv) { d = 0; o = 'push'; } else { d = -H.bet; o = 'lose'; }
      net[p] += d; out[p].push({ o, d });
    }
    this.chips[0] += net[0]; this.chips[1] += net[1];
    this.res = { net, out, win: net[0] === net[1] ? -1 : net[0] > net[1] ? 0 : 1 }; if (this.res.win >= 0) this.m[this.res.win]++; this.ph = 'result'; this.rev = true;
  }
  view(p) {
    const o = 1 - p, mk = q => this.hands[q].map(x => ({ c: x.c.slice(), bet: x.bet, done: !!x.done, v: val(x.c), bj: !!x.bj, dbl: !!x.dbl }));
    const bc = this.rev ? this.bank.slice() : this.bank.slice(0, 1), ov = this.over, my = this.cur === p;
    const t = ov ? (ov.w < 0 ? 'Autant de jetons chacun.' : ov.w === p ? 'Tu as le plus de jetons !' : 'L\'autre a le plus de jetons.') + '\n' + this.chips[p] + ' – ' + this.chips[o] + ' jetons' : '';
    return { ph: this.ph, rd: this.rd, R: this.R, chips: [this.chips[p], this.chips[o]], m: [this.m[p], this.m[o]], bet: this.bets[p], ob: this.ph === 'bet' ? this.bets[o] != null : true,
      me: mk(p), opp: mk(o), bank: { c: bc, hid: !this.rev && this.bank.length > 1, v: val(bc) },
      turn: this.cur < 0 ? null : my ? 'me' : 'opp', hi: my ? this.hi : -1, ohi: this.cur === o ? this.hi : -1, can: my ? { d: this.canD(p), s: this.canS(p) } : null,
      res: this.res ? { n: [this.res.net[p], this.res.net[o]], out: [this.res.out[p], this.res.out[o]], w: this.res.win < 0 ? 'draw' : this.res.win === p ? 'me' : 'opp' } : null,
      sm: this.chips[p] + (this.chips[p] > 1 ? ' jetons' : ' jeton'), so: this.chips[o] + (this.chips[o] > 1 ? ' jetons' : ' jeton'), over: ov ? { w: ov.w < 0 ? 'draw' : ov.w === p ? 'me' : 'opp', t } : null, overDelay: 1300 };
  }
}

css('bjk', '.bj{width:100%;display:flex;flex-direction:column;gap:6px;--cw:52px}.bja{border:1.5px solid #d9a44166;border-radius:14px;background:#0a1030aa;padding:3px 8px;display:flex;flex-direction:column;gap:2px}.bjt{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:.9em}.bjt .ch{display:inline-flex;align-items:center;gap:4px}.bjh{display:flex;gap:14px;justify-content:center;min-height:calc(var(--cw) * 1.4 + 18px);align-items:flex-start}.bjh>div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 3px;border-radius:10px}.bjh>div.act{background:#ffd24d33;outline:2px solid #ffd24d}.bjc{display:flex}.bjc .pc+.pc{margin-left:calc(var(--cw) * -.55)}.bjv{font-size:.8em;font-weight:800;opacity:.95;white-space:nowrap}');
css('bjk2', '@media (max-height:700px){.bj{--cw:40px}.cg-act .btn{min-height:52px}}');

class Blackjack extends CardGame {
  constructor(ctx) {
    super(ctx, { title: 'Blackjack à deux', how: 'Chacun joue contre la banque, avec 100 jetons fictifs, et se mesure à l\'autre.\nMise d\'abord (en secret), puis chacun son tour : Carte, Rester, Doubler (une seule carte, mise doublée) ou Partager deux cartes de même valeur en deux jeux.\nApproche 21 sans le dépasser. La banque pioche jusqu\'à 17. Blackjack = 3 pour 2.\nÀ la fin, celui qui a le plus de jetons gagne.', options: { label: 'Durée de la partie :', choices: ROUNDS } });
    this.els = new Map();
  }
  makeEngine(seed, opt) { return new Engine(seed, opt); }
  build() {
    if (this.wrap) return; if (this.pl) this.pl.style.display = 'none'; this.board.replaceChildren(); this.board.style.justifyContent = 'flex-start'; this.board.style.overflowY = 'auto';
    this.wrap = h('div', { class: 'bj' }); this.board.append(this.wrap);
  }
  /** Retourne l'élément carte persistant (pour animer retournement et distribution). */
  card(key, id, down) {
    let e = this.els.get(key); const isNew = !e;
    if (!e) { e = cardEl(id != null ? stdFace(id) : '', down); this.els.set(key, e); if (isNew) e.classList.add('deal'); }
    else setCard(e, id != null ? stdFace(id) : null, down);
    e.dataset.live = '1'; return e;
  }
  render(v) {
    this.build(); const prev = this.prevView; this.prevView = v;
    if (v.ph === 'bet' && (!prev || prev.ph !== 'bet')) this.els.clear();
    this.els.forEach(e => { e.dataset.live = ''; });
    const chip = (n) => `<span class="ch">${iconSvg('coin', 18)}${n}</span>`;
    const hdr = (name, n, extra) => { const d = h('div', { class: 'bjt' }); d.innerHTML = `<span>${name}</span><span>${extra || ''}${chip(n)}</span>`; return d; };
    const handsRow = (arr, area, curHi, resArr) => h('div', { class: 'bjh' }, ...arr.map((H, i) => {
      const box = h('div', { class: curHi === i ? 'act' : '' }, h('div', { class: 'bjc' }, ...H.c.map((id, k) => this.card(area + i + '.' + k, id, false))));
      const st = resArr && resArr[i] ? ({ win: 'Gagné', bj: 'Blackjack !', push: 'Égalité', lose: 'Perdu', bust: 'Plus de 21' }[resArr[i].o] + ' ' + (resArr[i].d > 0 ? '+' : resArr[i].d < 0 ? '−' : '') + Math.abs(resArr[i].d)) : H.bj ? 'Blackjack !' : H.v.t > 21 ? 'Plus de 21' : H.v.t + (H.v.soft && H.v.t < 21 ? ' (souple)' : '') + (H.dbl ? ' · doublé' : '');
      box.append(h('div', { class: 'bjv' }, st + ' · mise ' + H.bet)); return box;
    }));
    // banque
    const B = v.bank, brow = h('div', { class: 'bjh', style: 'min-height:calc(var(--cw) * 1.4)' }, h('div', {}, h('div', { class: 'bjc' }, ...B.c.map((id, k) => this.card('b.' + k, id, false)), ...(B.hid ? [this.card('b.' + B.c.length, null, true)] : []))));
    const btxt = v.ph === 'bet' ? '' : B.hid ? 'Une carte cachée · ' + B.v.t + ' + ?' : 'Banque : ' + B.v.t;
    const nm = this.oppA.name, waiting = v.ph === 'bet';
    const aB = h('div', { class: 'bja' }, h('div', { class: 'bjt' }, h('span', {}, 'Banque pirate'), h('span', {}, btxt)), brow);
    const aO = h('div', { class: 'bja' }, hdr(nm, v.chips[1], v.ph === 'bet' ? (v.ob ? 'mise posée · ' : 'il mise… · ') : ''), v.opp.length ? handsRow(v.opp, 'o', v.ohi, v.res && v.res.out[1]) : h('div', { class: 'bjh' }));
    const aM = h('div', { class: 'bja' }, hdr('Toi', v.chips[0], ''), v.me.length ? handsRow(v.me, 'm', v.hi, v.res && v.res.out[0]) : h('div', { class: 'bjh' }));
    if (waiting) aB.querySelector('.bjh').replaceChildren(); // pas de cartes avant la mise
    this.wrap.replaceChildren(aB, aO, aM);
    this.els.forEach((e, k) => { if (!e.dataset.live) this.els.delete(k); });
    this.tbar.querySelector('.grow').textContent = 'Manche ' + Math.min(v.rd, v.R) + ' sur ' + v.R;
    // texte
    let log = '';
    if (v.over) log = v.res ? 'Dernière manche : toi ' + sg(v.res.n[0]) + ', ' + nm + ' ' + sg(v.res.n[1]) : '';
    else if (v.ph === 'bet') log = v.bet == null ? 'Mise ta somme (l\'autre ne la voit pas encore)' : 'Mise posée : ' + v.bet + '. J\'attends ' + nm + '…';
    else if (v.ph === 'play') log = v.turn === 'me' ? 'À toi de jouer' + (v.me.length > 1 ? ' (jeu ' + (v.hi + 1) + ')' : '') : 'Tour de ' + nm + '…';
    else if (v.ph === 'bank') log = 'La banque joue…';
    else if (v.res) log = 'Manche : toi ' + sg(v.res.n[0]) + ' jetons, ' + nm + ' ' + sg(v.res.n[1]) + '.\n' + (v.res.w === 'me' ? 'Tu gagnes la manche !' : v.res.w === 'opp' ? nm + ' gagne la manche.' : 'Manche égale.') + ' Manches gagnées : ' + v.m[0] + ' – ' + v.m[1];
    this.logEl.style.whiteSpace = 'pre-line'; this.logEl.textContent = log;
    // boutons
    this.actEl.replaceChildren(); this.actEl.style.display = '';
    const btn = (label, onclick, cls = '') => { const b = h('button', { class: 'btn ' + cls, onclick }, label); return b; };
    if (v.ph === 'bet' && v.bet == null) {
      const c = v.chips[0], opts = BETS.filter(b => b < c); const mk = n => btn('Miser ' + n, () => { this.s.sfx('ok'); this.act({ k: 'bet', v: n }); });
      this.actEl.append(...opts.map(mk), btn('Tapis : ' + c, () => { this.s.sfx('warn'); this.act({ k: 'bet', v: c }); }, 'warn'));
    } else if (v.ph === 'play' && v.turn === 'me') {
      const go = (k, sfx) => () => { this.s.sfx(sfx); this.act({ k }); };
      this.actEl.append(btn('Carte', go('hit', 'tick')), btn('Rester', go('stand', 'block'), 'sec'));
      const d = btn('Doubler', go('double', 'atk'), 'sec'), s = btn('Partager', go('split', 'atk'), 'sec'); d.disabled = !v.can.d; s.disabled = !v.can.s; this.actEl.append(d, s);
    } else { const t = h('div', { class: 'mut', style: 'padding:14px;text-align:center;font-weight:700' }, v.over ? 'Fin de partie…' : v.ph === 'result' ? 'Prochaine manche dans un instant…' : 'Patience…'); this.actEl.append(t); }
    if (prev) {
      const nc = v.me.reduce((s, x) => s + x.c.length, 0) + v.opp.reduce((s, x) => s + x.c.length, 0) + v.bank.c.length, pc = prev.me.reduce((s, x) => s + x.c.length, 0) + prev.opp.reduce((s, x) => s + x.c.length, 0) + prev.bank.c.length;
      if (nc > pc) this.s.sfx('tick');
      if (v.res && !prev.res) { this.s.sfx(v.res.n[0] > 0 ? 'win' : v.res.n[0] < 0 ? 'lose' : 'ok'); }
    }
  }
}
const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

/** Rémi : stratégie de base du blackjack au rang 5 ; au rang 1 il décide à l'instinct (reste vers 15) et mise au hasard. */
function decide(H, up, can, err) {
  const { t, soft } = val(H.c), p0 = pts(H.c[0]);
  if (Math.random() < err) return t >= 15 + (Math.random() < .3 ? 1 : 0) ? 'stand' : 'hit';
  if (can.s && H.c.length === 2 && p0 === pts(H.c[1])) {
    if (p0 === 11 || p0 === 8) return 'split';
    if (p0 === 9 && ![7, 10, 11].includes(up)) return 'split';
    if (p0 === 7 && up <= 7) return 'split';
    if (p0 === 6 && up <= 6) return 'split';
    if ((p0 === 2 || p0 === 3) && up >= 4 && up <= 7) return 'split';
  }
  if (soft) {
    if (t <= 17) return can.d && up >= 4 && up <= 6 && t >= 13 ? 'double' : 'hit';
    if (t === 18) return up <= 8 ? 'stand' : 'hit';
    return 'stand';
  }
  if (t <= 8) return 'hit';
  if (t === 9) return can.d && up >= 3 && up <= 6 ? 'double' : 'hit';
  if (t === 10) return can.d && up <= 9 ? 'double' : 'hit';
  if (t === 11) return can.d ? 'double' : 'hit';
  if (t === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (t <= 16) return up <= 6 ? 'stand' : 'hit';
  return 'stand';
}
export const brain = cardBrain(v => {
  const err = lerp(.4, 0);
  if (v.ph === 'bet' && v.bet == null) {
    const c = v.chips[0], last = v.rd >= v.R, behind = v.chips[0] < v.chips[1];
    let b;
    if (Math.random() < err) b = [10, 25, 50, c][Math.floor(Math.random() * 4)];
    else if (last && behind) b = c; else b = c >= 150 ? 50 : c >= 70 ? 25 : 10;
    if (b >= c) b = c; else if (![10, 25, 50].includes(b)) b = 10;
    return { ms: thinkMs(1500, 500), a: { k: 'bet', v: b } };
  }
  if (v.ph === 'play' && v.turn === 'me') {
    const H = v.me[v.hi]; if (!H) return null; const up = pts(v.bank.c[0]);
    return { ms: thinkMs(1900, 650), a: { k: decide({ c: H.c }, up, v.can || {}, err) } };
  }
  return null;
});

export default { id: 'blackjack', name: 'Blackjack à deux', short: 'Contre la banque et contre l\'autre, avec des jetons.', how: ['Chacun mise des jetons, puis joue contre la banque.', 'Carte, Rester, Doubler ou Partager deux cartes identiques.', 'Approche 21 sans le dépasser ; la banque pioche jusqu\'à 17.', 'À la fin, celui qui a le plus de jetons gagne.'], create: ctx => new Blackjack(ctx) };
export { Engine };
