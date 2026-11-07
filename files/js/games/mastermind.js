// Mastermind pirate : trouve le code secret de pierres colorées. Moins d'essais = victoire. Deux façons de jouer :
// « même code » (duel sur le même coffre) ou « chacun son coffre » (deux codes différents).
import { PackGame } from './c_base.js';
import { h } from '../core/util.js';
import { lerp } from '../core/level.js';
import { css } from '../core/winfx.js';

const GEMS = [{ n: 'Rouge', c: '#e63946', d: '#8f1a26' }, { n: 'Bleu', c: '#3b82f6', d: '#1a4a9c' }, { n: 'Vert', c: '#2fbf71', d: '#16764a' }, { n: 'Jaune', c: '#ffd24d', d: '#b88a10' }, { n: 'Violet', c: '#b07cff', d: '#5f35a8' }, { n: 'Orange', c: '#ff8a2a', d: '#a84d08' }];
const SHP = ['circle(50%)', 'inset(8% round 30%)', 'polygon(50% 2%,98% 38%,80% 96%,20% 96%,2% 38%)', 'polygon(25% 3%,75% 3%,98% 50%,75% 97%,25% 97%,2% 50%)', 'polygon(50% 0,100% 50%,50% 100%,0 50%)', 'polygon(50% 4%,96% 92%,4% 92%)'];
css('mm', `.mm-hist{background:linear-gradient(#5b3d20,#3f2913);border:3px solid #2a1c0e;border-radius:14px;padding:6px;display:flex;flex-direction:column;gap:5px;min-height:150px;max-height:300px;overflow-y:auto;box-shadow:inset 0 3px 10px #000a}
.mm-row{display:flex;align-items:center;gap:6px;justify-content:space-between;padding:3px 6px;border-radius:10px;background:#0003}
.mm-row.cur{background:#ffd24d22;outline:2px dashed #ffd24d88}
.mm-num{width:22px;font-weight:800;font-size:.8em;opacity:.8;text-align:center}
.mm-pegs{display:flex;gap:5px;flex:1;justify-content:center}
.mm-peg{width:34px;height:34px;flex:0 0 auto;border-radius:50%;background:#1a1208;border:2px solid #0008;box-shadow:inset 0 3px 5px #000b}
.mm-gem{width:34px;height:34px;flex:0 0 auto;filter:drop-shadow(0 2px 2px #000a);background:var(--g)}
.mm-fb{display:grid;grid-template-columns:repeat(3,10px);gap:3px;width:42px;justify-content:center}
.mm-fb i{width:10px;height:10px;border-radius:50%;background:#1a1208;box-shadow:inset 0 1px 2px #000b}
.mm-fb i.b{background:radial-gradient(circle at 35% 30%,#fff3b0,#e0a912 70%)}
.mm-fb i.w{background:radial-gradient(circle at 35% 30%,#fff,#9aa3b8 75%)}
.mm-pal{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
.mm-pb{min-height:54px;border-radius:14px;border:3px solid #0007;background:#16224a;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.mm-pb:active{transform:translateY(3px)}
.mm-pb .mm-gem{width:min(36px,100%);height:auto;aspect-ratio:1}.mm-pb{min-width:0;padding:0}
.mm-act{display:flex;gap:8px}.mm-act .btn{flex:1 1 0;min-height:52px}
.mm-opp{text-align:center;font-weight:700;font-size:.9em}`);

const mul = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export function feedback(code, g) {
  let b = 0, w = 0; const cc = {}, gc = {};
  for (let i = 0; i < code.length; i++) { if (code[i] === g[i]) b++; else { cc[code[i]] = (cc[code[i]] || 0) + 1; gc[g[i]] = (gc[g[i]] || 0) + 1; } }
  for (const k in gc) w += Math.min(gc[k], cc[k] || 0);
  return [b, w];
}
const gem = i => h('span', { class: 'mm-gem', style: '--g:linear-gradient(145deg,' + GEMS[i].c + ',' + GEMS[i].d + ');clip-path:' + SHP[i], title: GEMS[i].n });

class Mastermind extends PackGame {
  constructor(ctx) {
    super(ctx, { id: 'mastermind', name: 'Mastermind pirate' });
    this.me = this.isHost ? 'h' : 'g'; this.opp = this.isHost ? 'g' : 'h';
    this.st = { me: { a: 0, s: false, t: 0 }, opp: { a: 0, s: false, t: 0, got: false } };
    this.cur = []; this.hist = [];
    this.oppLine = h('div', { class: 'mm-opp' }, ' ');
    this.histBox = h('div', { class: 'mm-hist' });
    this.curBox = h('div', { class: 'mm-row cur' });
    this.pal = h('div', { class: 'mm-pal' }, ...GEMS.map((g, i) => h('button', { class: 'mm-pb', 'aria-label': g.n, onclick: () => this.add(i) }, gem(i))));
    this.bOk = h('button', { class: 'btn big', onclick: () => this.submit() }, 'Valider');
    this.bDel = h('button', { class: 'btn sec', onclick: () => { this.cur.pop(); this.paintCur(); } }, 'Effacer');
    this.info = h('div', { class: 'pc-flash', style: 'font-size:1.05em;min-height:1.3em' }, ' ');
    this.main.append(this.oppLine, this.histBox, this.curBox, this.info, this.pal, h('div', { class: 'mm-act' }, this.bDel, this.bOk));
    this.onNet('prog', m => { Object.assign(this.st.opp, { a: m.a, s: !!m.s, t: m.tm || 0, got: true }); this.paintOpp(); this.check(); });
    if (this.remi) this.net.recv = {};
    this.setup('Mastermind pirate', 'Trouve le code secret du coffre : des pierres de couleur dans le bon ordre.\nPierre dorée = bonne couleur bien placée. Pierre argentée = bonne couleur mal placée.\nCelui qui trouve avec le moins d\'essais gagne.', [
      { k: 'len', label: 'Pierres dans le code', vals: [[4, '4 pierres'], [5, '5 pierres']], def: 4 },
      { k: 'mode', label: 'Coffre', vals: [['meme', 'Le même pour les deux'], ['chacun', 'Un coffre chacun']], def: 'meme' },
      { k: 'max', label: 'Essais permis', vals: [[8, '8'], [10, '10'], [12, '12']], def: 10 }], (seed, cfg) => this.beginGame(seed, cfg));
  }
  codeFor(who) { const r = mul(this.seed + (this.cfg.mode === 'chacun' && who === 'g' ? 7919 : 0)); return Array.from({ length: this.cfg.len }, () => Math.floor(r() * 6)); }
  beginGame(seed, cfg) {
    this.seed = seed; this.code = this.codeFor(this.me); this.t0 = this.clock; this.started = true;
    this.paintHist(); this.paintCur(); this.paintOpp(); this.info.textContent = 'Compose ton code puis valide.';
    if (this.remi) this.botStart();
  }
  elapsed() { return Math.round((this.clock - this.t0) * 10) / 10; }
  add(i) { if (!this.started || this.over || this.frozen || this.st.me.s || this.st.me.a >= this.cfg.max || this.cur.length >= this.cfg.len) return; this.cur.push(i); this.s.sfx('tick'); this.paintCur(); }
  paintCur() {
    const L = this.cfg ? this.cfg.len : 4; const done = this.st.me.s || (this.cfg && this.st.me.a >= this.cfg.max);
    this.curBox.replaceChildren(h('div', { class: 'mm-num' }, String(this.st.me.a + 1)), h('div', { class: 'mm-pegs' }, ...Array.from({ length: L }, (_, i) => this.cur[i] != null ? gem(this.cur[i]) : h('span', { class: 'mm-peg' }))), h('div', { class: 'mm-fb' }));
    this.bOk.disabled = !this.started || done || this.cur.length < L; this.bDel.disabled = !this.cur.length;
  }
  paintHist() {
    this.histBox.replaceChildren(...this.hist.map((r, n) => h('div', { class: 'mm-row' }, h('div', { class: 'mm-num' }, String(n + 1)), h('div', { class: 'mm-pegs' }, ...r.g.map(gem)),
      h('div', { class: 'mm-fb', style: 'grid-template-columns:repeat(' + (this.cfg.len <= 4 ? 2 : 3) + ',10px)' }, ...Array.from({ length: this.cfg.len }, (_, i) => h('i', { class: i < r.b ? 'b' : i < r.b + r.w ? 'w' : '' }))))));
    if (!this.hist.length) this.histBox.append(h('p', { style: 'text-align:center;opacity:.7;margin:auto' }, 'Tes essais s\'afficheront ici.'));
    this.histBox.scrollTop = 1e6;
  }
  paintOpp() { const o = this.st.opp; this.oppLine.textContent = this.oppA.name + ' : ' + (o.s ? 'a trouvé son code en ' + o.a + ' essai(s) !' : o.a + ' essai(s)'); this.setStat(this.st.me.a + '/' + (this.cfg ? this.cfg.max : '') , o.a + ''); }
  submit() {
    const L = this.cfg.len; if (this.cur.length < L || this.over || this.frozen || this.st.me.s) return;
    const [b, w] = feedback(this.code, this.cur); this.hist.push({ g: this.cur.slice(), b, w }); const st = this.st.me; st.a++; this.cur = [];
    if (b === L) { st.s = true; st.t = this.elapsed(); this.s.sfx('win'); this.info.textContent = 'Coffre ouvert en ' + st.a + ' essai(s) !'; this.info.style.color = '#27e0b3'; }
    else { this.s.sfx(b ? 'tick' : 'block'); this.info.style.color = '#ffe9a8'; this.info.textContent = b + ' bien placée(s), ' + w + ' mal placée(s)'; if (st.a >= this.cfg.max) this.info.textContent = 'Plus d\'essais !'; }
    st.t = st.t || this.elapsed(); this.paintHist(); this.paintCur(); this.paintOpp();
    this.net.send('prog', { a: st.a, s: st.s, tm: st.s ? st.t : this.elapsed() }); this.check();
  }
  /** Même calcul chez les deux joueurs : moins d'essais gagne, puis le plus rapide, puis l'hôte. */
  check() {
    if (this.over || !this.started) return; const me = this.st.me, o = this.st.opp, max = this.cfg.max;
    const meDone = me.s || me.a >= max, oDone = o.s || o.a >= max;
    let res = null;
    if (me.s && !o.s && o.a >= me.a) res = 'me'; else if (o.s && !me.s && me.a >= o.a) res = 'opp';
    else if (meDone && oDone) { if (me.s && o.s) res = me.a !== o.a ? (me.a < o.a ? 'me' : 'opp') : me.t !== o.t ? (me.t < o.t ? 'me' : 'opp') : (this.isHost ? 'me' : 'opp'); else if (me.s) res = 'me'; else if (o.s) res = 'opp'; else res = 'draw'; }
    if (!res) { if (meDone && !oDone) this.info.textContent = (me.s ? 'Bravo ! ' : '') + 'On attend ' + this.oppA.name + '…'; return; }
    if (this.finishing) return; this.finishing = true;
    this.at(1.2, () => { const win = res === 'me'; const code = this.code.map(i => GEMS[i].n).join(', ');
      this.end(res === 'draw' ? false : win, (res === 'draw' ? 'Aucun de vous n\'a ouvert le coffre.' : win ? 'Tu as ouvert le coffre !' : this.oppA.name + ' a été plus fort.') + '\nTon code : ' + code + '\nToi : ' + (me.s ? me.a + ' essai(s)' : 'pas trouvé') + '\n' + this.oppA.name + ' : ' + (o.s ? o.a + ' essai(s)' : 'pas trouvé')); });
  }
  /* ----- Rémi ----- */
  botStart() {
    const L = this.cfg.len, secret = this.codeFor(this.opp), q = lerp(.3, 1), think = lerp(16, 6);
    let cands = null; const all = () => { const out = []; const rec = (p) => { if (p.length === L) { out.push(p); return; } for (let i = 0; i < 6; i++) rec(p.concat(i)); }; rec([]); return out; };
    const bst = { a: 0, s: false };
    const step = () => {
      if (this.over || bst.s || bst.a >= this.cfg.max) return;
      if (!cands) cands = all();
      let g; if (Math.random() < q && cands.length) g = cands[Math.floor(Math.random() * cands.length)]; else g = Array.from({ length: L }, () => Math.floor(Math.random() * 6));
      const [b, w] = feedback(secret, g); bst.a++; cands = cands.filter(c => { const f = feedback(c, g); return f[0] === b && f[1] === w; });
      if (b === L) bst.s = true;
      this.botSay('prog', { a: bst.a, s: bst.s, tm: this.elapsed() });
      if (!bst.s && bst.a < this.cfg.max) this.at(think * (.7 + Math.random() * .6), step);
    };
    this.at(think * (.7 + Math.random() * .6), step);
  }
}
export default {
  id: 'mastermind', name: 'Mastermind pirate', short: 'Trouve le code secret du coffre en un minimum d\'essais.',
  how: ['Compose un code avec les pierres de couleur, puis valide.', 'Pierre dorée : bonne couleur au bon endroit. Pierre argentée : bonne couleur au mauvais endroit.', 'Vous jouez en même temps : le moins d\'essais gagne.', 'Choisissez le même coffre pour les deux, ou un coffre chacun.'],
  create: ctx => new Mastermind(ctx),
};
