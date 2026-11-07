// 7 familles à deux : on demande à l'autre une carte d'une famille qu'on possède déjà. Famille complète (6 cartes) = 1 point.
import { CardGame, cardEl, setCard, cardBrain, thinkMs, shuffled, iconSvg, lerp, rnd } from './cards_kit.js';
import { rng } from '../core/kit.js';
import { css } from '../core/winfx.js';
import { h } from '../core/util.js';

const FAMS = [
  { n: 'Trésors', c: '#b9831a', m: [['chest', 'Coffre'], ['coin', 'Pièce d\'or'], ['crown', 'Couronne'], ['jewel', 'Bijou'], ['ring', 'Bague'], ['key', 'Clé']] },
  { n: 'Armes', c: '#8a2f2f', m: [['sword', 'Sabre'], ['pistol', 'Pistolet'], ['cannon', 'Canon'], ['hook', 'Crochet'], ['axe', 'Hache'], ['ball', 'Boulet']] },
  { n: 'Navigation', c: '#1f5f8f', m: [['compass', 'Boussole'], ['map', 'Carte'], ['telescope', 'Longue-vue'], ['wheel', 'Barre'], ['anchor', 'Ancre'], ['flag', 'Pavillon']] },
  { n: 'Bateaux', c: '#4a3a8c', m: [['ship1', 'Voilier'], ['ship2', 'Brick'], ['ship3', 'Galion'], ['ship1b', 'Voilier noir'], ['ship2b', 'Brick noir'], ['ship3b', 'Galion noir']] },
  { n: 'Animaux marins', c: '#1b7d74', m: [['fish', 'Poisson'], ['crab', 'Crabe'], ['octopus', 'Pieuvre'], ['whale', 'Baleine'], ['turtle', 'Tortue'], ['shark', 'Requin']] },
  { n: 'Plage', c: '#b86a1a', m: [['palm', 'Palmier'], ['shell', 'Coquillage'], ['starfish', 'Étoile de mer'], ['bottle', 'Bouteille'], ['sun', 'Soleil'], ['volcano', 'Volcan']] },
  { n: 'Ciel', c: '#5a4fa0', m: [['moon', 'Lune'], ['star', 'Étoile'], ['cloud', 'Nuage'], ['storm', 'Orage'], ['rainbow', 'Arc-en-ciel'], ['parrot', 'Perroquet']] },
];
const fam = c => Math.floor(c / 6), mem = c => c % 6;
const cname = c => FAMS[fam(c)].m[mem(c)][1];
const famFace = c => { const F = FAMS[fam(c)]; return `<div class="fam"><div class="hd" style="background:${F.c}">${F.n}</div><div class="ic">${iconSvg(F.m[mem(c)][0], 'calc(var(--cw,64px) * .5)')}</div><div class="nm">${F.m[mem(c)][1]}</div></div>`; };
css('famk', '.fam .hd{font-size:calc(var(--cw,64px) * .17)}.fam .nm{font-size:calc(var(--cw,64px) * .155)}.fh{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;width:100%;overflow-y:auto;padding:4px;--cw:60px}.fo{display:flex;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap}.fch{border-radius:12px;border:2px solid #d9a441;padding:2px 8px;font-weight:800;font-size:.85em;color:#fff}.fsel{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;width:100%;--cw:54px}');

class Engine {
  constructor(seed) {
    this.rand = rng(seed); const d = shuffled(Array.from({ length: 42 }, (_, i) => i), this.rand);
    this.hand = [d.slice(0, 7), d.slice(7, 14)]; this.deck = d.slice(14); this.cur = this.rand() < .5 ? 0 : 1;
    this.fams = Array(7).fill(-1); this.last = null; this.seq = 0; this.ph = 'ask'; this.over = null; this.cont = false;
    this.lay(0); this.lay(1);
  }
  lay(p) { // pose les familles complètes
    for (let f = 0; f < 7; f++) if (this.fams[f] < 0 && this.hand[p].filter(c => fam(c) === f).length === 6) { this.fams[f] = p; this.hand[p] = this.hand[p].filter(c => fam(c) !== f); }
  }
  act(p, a) {
    if (this.over || this.ph !== 'ask' || p !== this.cur || a.k !== 'ask') return false;
    const c = a.c, o = 1 - p, H = this.hand[p];
    if (!(c >= 0 && c < 42) || H.includes(c) || !H.some(x => fam(x) === fam(c))) return false;
    this.seq++; let r;
    if (this.hand[o].includes(c)) { this.hand[o] = this.hand[o].filter(x => x !== c); H.push(c); r = 'got'; }
    else if (!this.deck.length) r = 'pass';
    else { const d = this.deck.shift(); H.push(d); r = d === c ? 'lucky' : 'draw'; }
    this.cont = r === 'got' || r === 'lucky'; this.last = { w: p, c, r }; this.lay(p); this.ph = 'show'; return true;
  }
  auto() { return this.ph === 'show' ? 2100 : 0; }
  autoStep() {
    if (this.ph !== 'show') return;
    if (!this.cont) this.cur = 1 - this.cur;
    for (let i = 0; i < 2; i++) for (let q = 0; q < 2; q++) if (!this.hand[q].length && this.deck.length) { this.hand[q].push(...this.deck.splice(0, Math.min(3, this.deck.length))); this.lay(q); }
    if (!this.hand[this.cur].length) this.cur = 1 - this.cur;
    this.ph = 'ask';
    const done = this.fams.every(f => f >= 0), stuck = !this.hand[0].length && !this.hand[1].length;
    if (done || stuck) { const s = [0, 1].map(p => this.fams.filter(f => f === p).length), d = s[0] - s[1]; this.over = { w: d === 0 ? -1 : d > 0 ? 0 : 1 }; this.ph = 'over'; }
  }
  view(p) {
    const o = 1 - p, ov = this.over, s = [p, o].map(q => this.fams.filter(f => f === q).length);
    const t = ov ? (ov.w < 0 ? 'Autant de familles chacun.' : ov.w === p ? 'Tu as réuni le plus de familles.' : 'L\'autre a réuni le plus de familles.') + '\n' + s[0] + ' – ' + s[1] : '';
    return { hand: this.hand[p].slice().sort((a, b) => a - b), on: this.hand[o].length, deck: this.deck.length, seq: this.seq, turn: this.cur === p ? 'me' : 'opp', ph: this.ph,
      fams: this.fams.map(f => f < 0 ? -1 : f === p ? 0 : 1), last: this.last ? { w: this.last.w === p ? 'me' : 'opp', c: this.last.c, r: this.last.r } : null,
      sm: s[0] + (s[0] > 1 ? ' familles' : ' famille'), so: s[1] + (s[1] > 1 ? ' familles' : ' famille'), over: ov ? { w: ov.w < 0 ? 'draw' : ov.w === p ? 'me' : 'opp', t } : null, overDelay: 1400 };
  }
}

class Familles extends CardGame {
  constructor(ctx) {
    super(ctx, { title: '7 familles', how: 'Chacun a 7 cartes. Il y a 7 familles de 6 cartes.\nÀ ton tour, demande à l\'autre une carte d\'une famille que tu possèdes déjà.\nS\'il l\'a, il te la donne et tu rejoues. Sinon tu piocheras une carte (tu rejoues si c\'est celle demandée).\nUne famille complète est posée et vaut 1 point. Le plus de familles gagne.' });
    this.selF = -1; this.selC = -1;
  }
  makeEngine(seed) { return new Engine(seed); }
  build() {
    if (this.hand) return; this.board.replaceChildren();
    this.oRow = h('div', { class: 'fo' }); this.mid = h('div', { class: 'mut', style: 'text-align:center;font-weight:700' }); this.chips = h('div', { class: 'fo' }); this.hand = h('div', { class: 'fh' });
    this.board.append(this.oRow, this.chips, this.mid, this.hand); this.board.style.justifyContent = 'flex-start'; this.board.style.overflow = 'hidden';
  }
  render(v) {
    this.build(); const prev = this.prevView; this.prevView = v; const mine = v.turn === 'me' && v.ph === 'ask';
    this.oRow.replaceChildren(h('span', { style: 'font-weight:800' }, this.oppA.name + ' : ' + v.on + ' cartes'), ...Array.from({ length: Math.min(v.on, 8) }, () => { const e = cardEl('', true); e.style.setProperty('--cw', '22px'); e.style.marginRight = '-12px'; return e; }));
    this.chips.replaceChildren(...FAMS.map((F, i) => h('span', { class: 'fch', style: `background:${v.fams[i] < 0 ? '#2a3568' : v.fams[i] === 0 ? '#12806a' : '#a03048'};opacity:${v.fams[i] < 0 ? .75 : 1}` }, F.n)));
    this.mid.textContent = 'Pioche : ' + v.deck + ' cartes · Familles posées : ' + v.fams.filter(f => f >= 0).length + ' sur 7';
    if (this.selF >= 0 && (!mine || !v.hand.some(c => fam(c) === this.selF))) { this.selF = -1; this.selC = -1; }
    this.hand.replaceChildren(...v.hand.map(c => { const e = cardEl(famFace(c), false, mine ? 'tap' : ''); if (fam(c) === this.selF) e.classList.add('glow'); e.addEventListener('pointerdown', ev => { ev.preventDefault(); if (!mine) return; this.selF = fam(c); this.selC = -1; this.s.sfx('tick'); this.render(this.view); }); return e; }));
    // zone d'action
    const L = v.last, nm = this.oppA.name;
    let log = '';
    if (v.over) log = '';
    else if (v.ph === 'show' && L) {
      const who = L.w === 'me' ? 'Tu demandes' : nm + ' demande', c = '« ' + cname(L.c) + ' » (' + FAMS[fam(L.c)].n + ')';
      log = who + ' : ' + c + '.\n' + (L.r === 'got' ? (L.w === 'me' ? nm + ' te la donne. Tu rejoues !' : 'Tu la lui donnes. Il rejoue.') : L.r === 'lucky' ? (L.w === 'me' ? 'Pas de chance… mais tu pioches justement cette carte ! Tu rejoues.' : 'Tu ne l\'as pas, mais il pioche justement cette carte ! Il rejoue.') : L.r === 'pass' ? 'Elle n\'est pas là et la pioche est vide.' : (L.w === 'me' ? 'Elle n\'est pas là : tu piocheras.' : 'Tu ne l\'as pas : il pioche.'));
    } else log = mine ? (this.selF < 0 ? 'À toi : touche une carte de ta main pour choisir une famille' : 'Choisis la carte à demander') : 'Tour de ' + nm + '…';
    this.logEl.style.whiteSpace = 'pre-line'; this.logEl.textContent = log;
    this.actEl.replaceChildren(); this.actEl.style.display = mine && this.selF >= 0 ? '' : 'none';
    if (mine && this.selF >= 0) {
      const miss = [0, 1, 2, 3, 4, 5].map(m => this.selF * 6 + m).filter(c => !v.hand.includes(c));
      const row = h('div', { class: 'fsel' }, ...miss.map(c => { const e = cardEl(famFace(c), false, 'tap' + (c === this.selC ? ' sel' : '')); e.addEventListener('pointerdown', ev => { ev.preventDefault(); this.selC = c; this.render(this.view); }); return e; }));
      const ok = h('button', { class: 'btn big', style: 'flex:1 1 100%', onclick: () => { if (this.selC < 0) return; const c = this.selC; this.selC = -1; this.selF = -1; this.s.sfx('atk'); this.act({ k: 'ask', c }); } }, this.selC >= 0 ? 'Demander « ' + cname(this.selC) + ' » à ' + nm : 'Touche la carte à demander');
      ok.disabled = this.selC < 0; this.actEl.append(row, ok);
    }
    if (prev && v.seq !== prev.seq && L) this.s.sfx(L.r === 'got' || L.r === 'lucky' ? (L.w === 'me' ? 'ok' : 'hit') : 'block');
    if (prev && v.fams.filter(f => f >= 0).length > prev.fams.filter(f => f >= 0).length) { this.s.sfx('win'); this.s.vibrate(60); }
  }
}

/** Rémi : retient ce que l'autre demande et ce qu'il a donné ; au rang 1 il oublie et choisit presque au hasard. */
export const brain = cardBrain((v, mem) => {
  if (v.seq !== mem.seq) {
    mem.seq = v.seq; const L = v.last;
    if (L) { if (L.w === 'opp') { mem.opp[fam(L.c)] = 1; if (L.r === 'got') mem.gave[L.c] = v.seq; } else if (L.r !== 'got') mem.no[L.c] = v.seq; else delete mem.gave[L.c]; }
  }
  v.fams.forEach((f, i) => { if (f >= 0) delete mem.opp[i]; });
  if (v.turn !== 'me' || v.ph !== 'ask' || !v.hand.length) return null;
  const know = lerp(.15, 1), noise = lerp(2.5, 0), H = v.hand, cands = [], cnt = f => H.filter(c => fam(c) === f).length;
  const laid = v.fams.filter(f => f >= 0).length * 6, unknown = Math.max(1, 42 - H.length - laid), prior = Math.min(.9, v.on / unknown);
  for (let c = 0; c < 42; c++) {
    const f = fam(c); if (H.includes(c) || v.fams[f] >= 0 || !cnt(f)) continue;
    let p = prior;
    if (Math.random() < know) {
      if (mem.gave[c]) p = .95;
      else {
        const fresh = x => mem.no[x] && v.seq - mem.no[x] < 3; let cand = 0; for (let m = 0; m < 6; m++) { const x = f * 6 + m; if (!H.includes(x) && !fresh(x)) cand++; }
        if (fresh(c)) p = prior * .25; else if (mem.opp[f]) p = Math.max(prior, Math.min(.9, 1 / Math.max(1, cand)));
      }
    }
    cands.push([p * (1 + cnt(f) * .8) + Math.random() * noise * .3, c]);
  }
  if (!cands.length) return null; cands.sort((a, b) => b[0] - a[0]);
  return { ms: thinkMs(2300, 800), a: { k: 'ask', c: cands[0][1] } };
}, () => ({ seq: -1, opp: {}, gave: {}, no: {} }));

export default { id: 'familles', name: '7 familles', short: 'Réunis des familles en demandant des cartes.', how: ['Chacun a 7 cartes, il y a 7 familles de 6 cartes.', 'Demande à l\'autre une carte d\'une famille que tu possèdes.', 'Il l\'a : tu la prends et tu rejoues. Sinon, tu pioches une carte.', 'Une famille complète est posée et rapporte 1 point.'], create: ctx => new Familles(ctx) };
export { Engine };
