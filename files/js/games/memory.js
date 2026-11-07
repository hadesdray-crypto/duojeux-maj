// Memory pirate à deux : on retourne deux cartes à tour de rôle ; une paire trouvée = on rejoue. Le plus de paires gagne.
import { CardGame, cardEl, setCard, cardBrain, thinkMs, shuffled, fitGrid, iconSvg, lerp } from './cards_kit.js';
import { rng } from '../core/kit.js';
import { h } from '../core/util.js';

const TREASURE = ['anchor', 'wheel', 'skull', 'chest', 'coin', 'sword', 'key', 'compass', 'flag', 'cannon', 'hook', 'parrot', 'map', 'barrel', 'telescope', 'crown', 'pistol', 'ring', 'jewel'];
const SEA = ['starfish', 'shell', 'bottle', 'palm', 'fish', 'crab', 'octopus', 'whale', 'turtle', 'shark', 'volcano', 'sun', 'moon', 'star', 'storm'];
const SHIPS = ['ship1', 'ship2', 'ship3', 'ship1b', 'ship2b', 'ship3b', 'anchor', 'wheel', 'flag', 'telescope', 'map', 'cannon', 'compass', 'palm', 'barrel'];
const THEMES = { t: TREASURE, s: SEA, v: SHIPS, m: [...TREASURE, ...SEA] };
const GRIDS = [
  { label: 'Petite grille · Trésors (12 cartes)', val: { n: 12, c: 3, r: 4, th: 't' } },
  { label: 'Grille moyenne · Bateaux (20 cartes)', val: { n: 20, c: 4, r: 5, th: 'v' } },
  { label: 'Grande grille · Mer et trésors (30 cartes)', val: { n: 30, c: 5, r: 6, th: 'm' } },
];

class Engine {
  constructor(seed, opt) {
    const o = opt && opt.n ? opt : GRIDS[1].val; this.o = o; this.rand = rng(seed);
    const pairs = o.n / 2, syms = shuffled(THEMES[o.th], this.rand).slice(0, pairs);
    this.cells = shuffled([...syms, ...syms], this.rand).map(y => ({ y, s: 0, o: -1 }));
    this.cur = this.rand() < .5 ? 0 : 1; this.picks = []; this.ph = 'pick'; this.pairs = [0, 0]; this.over = null; this.match = false;
  }
  act(p, a) {
    if (this.over || this.ph !== 'pick' || p !== this.cur || a.k !== 'pick') return false;
    const c = this.cells[a.i]; if (!c || c.s !== 0) return false;
    c.s = 1; this.picks.push(a.i);
    if (this.picks.length === 2) { this.ph = 'show'; this.match = this.cells[this.picks[0]].y === this.cells[this.picks[1]].y; }
    return true;
  }
  auto() { return this.ph === 'show' ? (this.match ? 900 : 1500) : 0; }
  autoStep() {
    if (this.ph !== 'show') return;
    const [a, b] = this.picks;
    if (this.match) { this.cells[a].s = this.cells[b].s = 2; this.cells[a].o = this.cells[b].o = this.cur; this.pairs[this.cur]++; }
    else { this.cells[a].s = this.cells[b].s = 0; this.cur = 1 - this.cur; }
    this.picks = []; this.match = false; this.ph = 'pick';
    if (this.cells.every(c => c.s === 2)) {
      const d = this.pairs[0] - this.pairs[1]; this.over = { w: d === 0 ? -1 : d > 0 ? 0 : 1 }; this.ph = 'over';
    }
  }
  view(p) {
    const o = 1 - p, ov = this.over;
    const t = ov ? (ov.w < 0 ? 'Autant de paires chacun.' : ov.w === p ? 'Tu as trouvé le plus de paires.' : 'L\'autre a trouvé le plus de paires.') + '\n' + this.pairs[p] + ' – ' + this.pairs[o] : '';
    return { c: this.o.c, r: this.o.r, turn: this.cur === p ? 'me' : 'opp', ph: this.ph, picks: this.picks.slice(), match: this.match, pm: this.pairs[p], po: this.pairs[o],
      cells: this.cells.map(c => ({ s: c.s, y: c.s ? c.y : null, o: c.o < 0 ? -1 : c.o === p ? 0 : 1 })),
      sm: this.pairs[p] + (this.pairs[p] > 1 ? ' paires' : ' paire'), so: this.pairs[o] + (this.pairs[o] > 1 ? ' paires' : ' paire'), over: ov ? { w: ov.w < 0 ? 'draw' : ov.w === p ? 'me' : 'opp', t } : null, overDelay: 1200 };
  }
}

class Memory extends CardGame {
  constructor(ctx) {
    super(ctx, { title: 'Memory des pirates', how: 'Retourne deux cartes à ton tour.\nSi elles sont identiques, tu gagnes la paire et tu rejoues.\nSinon elles se retournent et c\'est à l\'autre.\nLe plus de paires gagne.', options: { label: 'Choisis la grille :', choices: GRIDS } });
    this.cellEls = null;
  }
  makeEngine(seed, opt) { return new Engine(seed, opt); }
  build(v) {
    const key = v.c + 'x' + v.r; if (this.key === key) return; this.key = key;
    if (this.unfit) this.unfit();
    this.board.replaceChildren(); this.actEl.style.display = 'none';
    this.grid = h('div', { style: `display:grid;grid-template-columns:repeat(${v.c},var(--cw));gap:8px;justify-content:center` });
    this.cellEls = v.cells.map((_, i) => { const e = cardEl(null, true, 'tap'); e.style.animationDelay = (i * 25) + 'ms'; e.classList.add('deal'); e.addEventListener('pointerdown', ev => { ev.preventDefault(); this.pickCell(i); }); this.grid.append(e); return e; });
    this.board.append(this.grid); this.unfit = fitGrid(this.board, v.c, v.r, 8, 84);
  }
  pickCell(i) { const v = this.view; if (!v || v.ph !== 'pick' || v.turn !== 'me' || v.cells[i].s !== 0) return; this.s.sfx('tick'); this.act({ k: 'pick', i }); }
  render(v) {
    this.build(v); const prev = this.prevView; this.prevView = v;
    v.cells.forEach((c, i) => {
      const e = this.cellEls[i];
      setCard(e, c.y != null ? `<div class="memf">${iconSvg(c.y, 'calc(var(--cw,64px) * .66)')}</div>` : null, c.s === 0);
      e.classList.toggle('ok', c.s === 2); e.classList.toggle('dis', false);
      e.classList.toggle('glow', c.s === 1 && v.match);
      e.style.outlineColor = c.s === 2 ? (c.o === 0 ? '#27e0b3' : '#ff7a90') : '';
    });
    const mine = v.turn === 'me';
    this.logEl.textContent = v.over ? '' : v.ph === 'show' ? (v.match ? (mine ? 'Une paire ! Tu rejoues.' : this.oppA.name + ' trouve une paire.') : 'Pas de paire…') : mine ? 'À toi : retourne une carte' + (v.picks.length ? ' de plus' : '') : 'Tour de ' + this.oppA.name + '…';
    if (prev && v.ph === 'show' && prev.ph !== 'show') this.s.sfx(v.match ? 'ok' : 'block');
    if (prev && v.ph === 'pick' && prev.ph === 'pick' && v.picks.length > prev.picks.length && v.turn === 'opp') this.s.sfx('tick');
  }
}

/** Rémi : sa mémoire est parfaite au rang 5 ; au rang 1 il oublie souvent les cartes vues et rate des paires évidentes. */
export const brain = cardBrain((v, mem) => {
  if (v.turn !== 'me' || v.ph !== 'pick') return null;
  const keep = lerp(.1, 1), miss = lerp(.7, 0);
  v.cells.forEach((c, i) => {
    if (c.s === 2) { delete mem.k[i]; return; }
    if (c.s === 1 && !(i in mem.seen)) { mem.seen[i] = true; if (Math.random() < keep) mem.k[i] = c.y; }
  });
  v.cells.forEach((c, i) => { if (c.s === 0 && !(i in mem.k)) delete mem.seen[i]; });
  const down = v.cells.map((c, i) => c.s === 0 ? i : -1).filter(i => i >= 0);
  const unknown = down.filter(i => !(i in mem.k));
  const rpick = a => a[Math.floor(Math.random() * a.length)];
  let i;
  if (v.picks.length === 0) {
    const by = {}; let pair = null;
    for (const k of down) if (k in mem.k) { (by[mem.k[k]] = by[mem.k[k]] || []).push(k); if (by[mem.k[k]].length === 2) pair = by[mem.k[k]]; }
    if (pair && Math.random() >= miss) i = pair[0]; else i = unknown.length ? rpick(unknown) : rpick(down);
  } else {
    const f = v.cells[v.picks[0]].y, twin = down.find(k => k !== v.picks[0] && mem.k[k] === f);
    if (twin != null && Math.random() >= miss) i = twin; else { const u = unknown.filter(k => k !== v.picks[0]); i = u.length ? rpick(u) : rpick(down.filter(k => k !== v.picks[0])); }
  }
  if (i == null) return null;
  return { ms: thinkMs(1900, 700), a: { k: 'pick', i } };
}, () => ({ k: {}, seen: {} }));

export default { id: 'memory', name: 'Memory des pirates', short: 'Retrouve les paires cachées, tour à tour.', how: ['Retourne deux cartes à ton tour.', 'Deux cartes identiques : tu gardes la paire et tu rejoues.', 'Sinon elles se retournent et c\'est à l\'autre.', 'Le plus de paires gagne. Trois tailles de grille.'], create: ctx => new Memory(ctx) };
export { Engine };
