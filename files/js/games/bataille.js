// Bataille à deux : chacun retourne la carte du dessus de son tas ; la plus forte ramasse tout. Égalité = BATAILLE (une carte cachée puis une carte visible).
import { CardGame, cardEl, setCard, stdFace, cardName, cardBrain, thinkMs, shuffled, fitGrid, pick } from './cards_kit.js';
import { rng } from '../core/kit.js';
import { h } from '../core/util.js';

const str = id => { const r = id % 13; return r === 0 ? 14 : r + 1; };           // l'As est le plus fort
const SIZES = { 16: { label: 'Express (16 cartes)', cap: 40 }, 32: { label: 'Normale (32 cartes)', cap: 90 }, 52: { label: 'Longue (52 cartes)', cap: 160 } };

class Engine {
  constructor(seed, n) {
    this.rand = rng(seed); n = SIZES[n] ? n : 32; this.cap = SIZES[n].cap;
    // 4 couleurs ; on garde les n/4 rangs les plus forts quand le paquet est réduit
    const ranks = n === 52 ? Array.from({ length: 13 }, (_, i) => i) : n === 32 ? [0, 6, 7, 8, 9, 10, 11, 12] : [0, 9, 10, 11];
    const all = []; for (let s = 0; s < 4; s++) for (const r of ranks) all.push(s * 13 + r);
    const d = shuffled(all, this.rand); this.deck = [d.slice(0, d.length / 2), d.slice(d.length / 2)];
    this.flip = [null, null]; this.pile = []; this.buried = [0, 0]; this.phase = 'wait'; this.res = null; this.round = 1; this.war = 0; this.last = ''; this.winner = null; this.over = null;
  }
  act(p, a) {
    if (this.over || this.phase !== 'wait' || a.k !== 'flip' || this.flip[p] != null) return false;
    if (!this.deck[p].length) return false;
    const c = this.deck[p].shift(); this.flip[p] = c; this.pile.push(c);
    if (this.flip[0] != null && this.flip[1] != null) this.compare();
    return true;
  }
  compare() {
    const a = str(this.flip[0]), b = str(this.flip[1]);
    this.phase = 'show';
    if (a === b) { this.res = 'war'; this.war++; this.last = 'BATAILLE !'; }
    else { this.res = a > b ? 0 : 1; this.last = ''; }
  }
  auto() { return this.over ? 0 : this.phase === 'show' ? (this.res === 'war' ? 1700 : 1500) : 0; }
  autoStep() {
    if (this.phase !== 'show') return;
    if (this.res === 'war') {
      // chacun pose une carte cachée (s'il lui en reste plus d'une), puis on rejoue une carte visible
      for (let p = 0; p < 2; p++) if (this.deck[p].length > 1) { this.pile.push(this.deck[p].shift()); this.buried[p]++; }
      for (let p = 0; p < 2; p++) if (!this.deck[p].length) { this.end(1 - p, 'plus de cartes pour la bataille'); return; }
      this.flip = [null, null]; this.phase = 'wait'; this.res = null; return;
    }
    const w = this.res, pile = shuffled(this.pile, this.rand); this.deck[w].push(...pile); this.last = '';
    this.pile = []; this.flip = [null, null]; this.buried = [0, 0]; this.phase = 'wait'; this.res = null; this.round++;
    if (!this.deck[0].length) this.end(1, 'plus de cartes'); else if (!this.deck[1].length) this.end(0, 'plus de cartes');
    else if (this.round > this.cap) { const d = this.deck[0].length - this.deck[1].length; this.end(d === 0 ? -1 : d > 0 ? 0 : 1, 'temps écoulé'); }
  }
  end(w, why) { this.over = { w, why }; this.phase = 'over'; }
  view(p) {
    const o = 1 - p, both = this.phase === 'show', ov = this.over;
    const txt = ov ? (ov.w < 0 ? 'Égalité parfaite.' : ov.why === 'temps écoulé' ? 'Temps écoulé : ' + (ov.w === p ? 'tu as' : 'l\'autre a') + ' le plus de cartes.' : (ov.w === p ? 'Tu as ramassé toutes les cartes.' : 'L\'autre a ramassé toutes les cartes.')) + '\n' + this.deck[p].length + ' – ' + this.deck[o].length : '';
    return { n: this.deck[p].length, on: this.deck[o].length, pile: this.pile.length, ph: this.phase, round: this.round, cap: this.cap, buried: [this.buried[p], this.buried[o]], war: this.war,
      mine: this.flip[p], theirs: both || ov ? this.flip[o] : null, oflip: this.flip[o] != null, res: this.res === 'war' ? 'war' : this.res == null ? null : this.res === p ? 'me' : 'opp',
      sm: this.deck[p].length + (this.deck[p].length > 1 ? ' cartes' : ' carte'), so: this.deck[o].length + (this.deck[o].length > 1 ? ' cartes' : ' carte'), over: ov ? { w: ov.w < 0 ? 'draw' : ov.w === p ? 'me' : 'opp', t: txt } : null, overDelay: 1600 };
  }
}

class Bataille extends CardGame {
  constructor(ctx) {
    super(ctx, { title: 'Bataille', how: 'Chacun retourne la carte du dessus de son tas.\nLa plus forte ramasse les deux cartes (l\'As est le plus fort).\nÉgalité : c\'est la BATAILLE ! Chacun pose une carte cachée puis retourne la suivante.\nCelui qui ramasse toutes les cartes gagne.',
      options: { label: 'Longueur de la partie :', choices: Object.entries(SIZES).map(([k, v]) => ({ label: v.label, val: +k })) } });
    this.grid = null;
  }
  makeEngine(seed, opt) { return new Engine(seed, opt); }
  build() {
    if (this.table) return; const B = this.board; B.replaceChildren();
    this.table = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;align-items:center;justify-items:center;width:100%;max-width:340px' });
    const lab = t => h('div', { class: 'mut', style: 'font-weight:700;font-size:.95em' }, t);
    this.oDeck = cardEl('', true); this.oCard = cardEl('', true); this.mCard = cardEl('', true); this.mDeck = cardEl('', true, 'tap');
    this.oN = lab(''); this.mN = lab('');
    this.mid = h('div', { style: 'grid-column:1/3;min-height:2.2em;font-size:1.5em;font-weight:900;color:#ffb020;text-align:center;display:flex;align-items:center;justify-content:center' }, '');
    this.pileEl = h('div', { class: 'mut', style: 'grid-column:1/3;text-align:center;font-weight:700' }, '');
    this.table.append(this.oDeck, this.oCard, this.oN, h('div', {}), this.mid, this.pileEl, this.mCard, this.mDeck, h('div', {}), this.mN);
    this.table.append = this.table.append.bind(this.table); B.append(this.table);
    fitGrid(B, 2, 3, 12, 96);
    this.btn = h('button', { class: 'btn big', style: 'flex:1 1 100%', onclick: () => this.flipMine() }, 'Retourner ma carte'); this.actEl.append(this.btn);
    this.mDeck.addEventListener('pointerdown', e => { e.preventDefault(); this.flipMine(); });
  }
  flipMine() { const v = this.view; if (!v || v.ph !== 'wait' || v.mine != null || v.n === 0) return; this.s.sfx('tick'); this.act({ k: 'flip' }); }
  render(v) {
    this.build(); const prev = this.prevView; this.prevView = v;
    setCard(this.mCard, v.mine != null ? stdFace(v.mine) : '', v.mine == null);
    setCard(this.oCard, v.theirs != null ? stdFace(v.theirs) : '', v.theirs == null);
    this.oCard.classList.toggle('glow', v.res === 'opp'); this.mCard.classList.toggle('glow', v.res === 'me');
    this.mDeck.style.opacity = v.n ? 1 : .25; this.oDeck.style.opacity = v.on ? 1 : .25;
    this.oN.textContent = this.oppA.name + ' : ' + v.on; this.mN.textContent = 'Toi : ' + v.n;
    const burs = (v.buried[0] + v.buried[1]) ? ' (' + (v.buried[0] + v.buried[1]) + ' cachées)' : '';
    this.pileEl.textContent = v.pile ? 'Au milieu : ' + v.pile + (v.pile > 1 ? ' cartes' : ' carte') + burs : '';
    this.mid.textContent = v.res === 'war' ? 'BATAILLE !' : v.res === 'me' ? 'Tu gagnes la manche' : v.res === 'opp' ? this.oppA.name + ' gagne la manche' : '';
    this.mid.style.color = v.res === 'me' ? '#27e0b3' : v.res === 'opp' ? '#ff7a90' : '#ffb020';
    this.logEl.textContent = v.over ? '' : 'Manche ' + Math.min(v.round, v.cap) + ' sur ' + v.cap + (v.war ? ' – batailles : ' + v.war : '');
    const can = v.ph === 'wait' && v.mine == null && v.n > 0;
    this.btn.disabled = !can; this.btn.textContent = can ? (v.res === null && v.oflip ? 'Retourner ma carte (l\'autre a retourné la sienne)' : 'Retourner ma carte') : v.ph === 'wait' ? 'J\'attends l\'autre…' : '…';
    this.mDeck.classList.toggle('glow', can);
    if (!prev || prev.round !== v.round) { /* nouvelle manche */ }
    if (v.res === 'war' && (!prev || prev.res !== 'war')) { this.s.sfx('warn'); this.s.vibrate(80); this.say('Bataille !'); }
    else if (v.res && v.res !== 'war' && (!prev || prev.res !== v.res)) this.s.sfx(v.res === 'me' ? 'ok' : 'block');
  }
}

/** Rémi : il retourne sa carte après un temps de réflexion (le niveau règle sa vivacité). */
export const brain = cardBrain(v => (v.ph === 'wait' && v.mine == null && v.n > 0) ? { ms: thinkMs(2000, 600), a: { k: 'flip' } } : null);
export default { id: 'bataille', name: 'Bataille', short: 'Retourne ta carte : la plus forte ramasse tout.', how: ['Chacun retourne la carte du dessus de son tas.', 'La plus forte ramasse les deux cartes. L\'As est le plus fort.', 'Égalité : BATAILLE ! Une carte cachée, puis une carte visible.', 'Celui qui ramasse toutes les cartes gagne.'], create: ctx => new Bataille(ctx) };
export { Engine };
