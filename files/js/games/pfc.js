// Épée – Bouclier – Canon : le pierre-feuille-ciseaux des pirates. Choix secrets, révélés ensemble (engagement chiffré : impossible de tricher).
import { PackGame } from './c_base.js';
import { h } from '../core/util.js';
import { lerp } from '../core/level.js';
import { css } from '../core/winfx.js';
import { ico } from '../core/ui.js';
import { R as AR, SIZE as ASZ } from '../core/art_rects.js';

const OPTS = [{ n: 'Épée', k: 'k_sword', c: '#c9d3e8' }, { n: 'Bouclier', k: 'ic_shield', c: '#4da3ff' }, { n: 'Canon', k: 'k_cannon', c: '#ffb020' }];
const BEATS = { 0: 2, 1: 0, 2: 1 };
const WHY = ['L\'épée tranche la mèche du canon.', 'Le bouclier arrête l\'épée.', 'Le boulet fracasse le bouclier.'];
const PICK_T = 10;
css('pfc', `.pf-arena{position:relative;height:178px;border-radius:18px;background:radial-gradient(circle at 50% 30%,#2a4a8a,#0b1230);border:3px solid #c9a227;box-shadow:inset 0 0 24px #000a,0 4px 10px #0008;display:flex;align-items:center;justify-content:space-around;overflow:hidden}
.pf-side{display:flex;flex-direction:column;align-items:center;gap:6px;width:42%}
.pf-card{width:104px;height:104px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(#f6e6bc,#e4cb8f);border:3px solid #8a6a32;box-shadow:0 4px 8px #0009}
.pf-card.back{background:repeating-linear-gradient(45deg,#2b3c78,#2b3c78 8px,#22305f 8px,#22305f 16px);border-color:#c9a227}
.pf-card.win{box-shadow:0 0 18px #ffd24d,0 4px 8px #0009;border-color:#ffd24d}
.pf-card.lose{filter:saturate(.4) brightness(.75)}
.pf-who{font-weight:700;font-size:.85em;color:#ffe9a8}
.pf-vs{font-weight:900;font-size:1.3em;color:#ffd24d;text-shadow:0 2px 4px #000}
.pf-pick{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pf-b{min-height:112px;border-radius:18px;border:4px solid #0007;background:linear-gradient(#6b4a26,#4a321a);color:#fff3d6;font-weight:800;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;touch-action:manipulation;box-shadow:inset 0 3px 0 #ffffff33,0 5px 0 #0006}
.pf-b:active{transform:translateY(4px)}
.pf-b.sel{border-color:#ffd24d;box-shadow:0 0 14px #ffd24d99,0 5px 0 #0006}
.pf-b[disabled]{filter:saturate(.5) brightness(.8)}
.pf-hist{display:flex;gap:6px;justify-content:center;min-height:26px;flex-wrap:wrap}
.pf-h{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8em;color:#10162e}
.pf-h.w{background:#27e0b3}.pf-h.l{background:#ff6b83}.pf-h.d{background:#c9d3e8}
@keyframes pfflip{0%{transform:rotateY(90deg) scale(.8)}100%{transform:rotateY(0) scale(1)}}.pf-flip{animation:pfflip .35s ease-out}`);

const sym = (i, size = 76) => {
  const o = OPTS[i], r = AR[o.k];
  if (o.k.startsWith('ic_')) return ico(o.k, size);
  if (!r) return h('span', { style: 'font-weight:900;color:#3a2812' }, o.n);
  const k = size / Math.max(r[2], r[3]); return h('span', { style: 'display:inline-block;width:' + r[2] * k + 'px;height:' + r[3] * k + 'px;background:url(img/art.webp) -' + r[0] * k + 'px -' + r[1] * k + 'px/' + ASZ[0] * k + 'px ' + ASZ[1] * k + 'px no-repeat' });
};
const rnd = n => Math.floor(Math.random() * n);
const fallbackHash = s => { let a = 5381, b = 52711; for (let i = 0; i < s.length; i++) { a = (a * 33) ^ s.charCodeAt(i); b = (b * 31 + s.charCodeAt(i)) | 0; } return 'f' + (a >>> 0).toString(16) + (b >>> 0).toString(16); };
async function sha(s) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return fallbackHash(s); }
}

class Pfc extends PackGame {
  constructor(ctx) {
    super(ctx, { id: 'pfc', name: 'Épée, bouclier, canon' });
    this.me = this.isHost ? 'h' : 'g'; this.pts = { me: 0, opp: 0 }; this.n = 0; this.rs = {}; this.hist = []; this.myHist = [];
    this.board = h('div'); this.flash = h('div', { class: 'pc-flash', style: 'font-size:1.15em' }, ' ');
    this.cardMe = h('div', { class: 'pf-card back' }); this.cardOpp = h('div', { class: 'pf-card back' });
    this.arena = h('div', { class: 'pf-arena' }, h('div', { class: 'pf-side' }, this.cardMe, h('div', { class: 'pf-who' }, 'Toi')), h('div', { class: 'pf-vs' }, 'CONTRE'), h('div', { class: 'pf-side' }, this.cardOpp, h('div', { class: 'pf-who' }, this.oppA.name)));
    this.btns = OPTS.map((o, i) => h('button', { class: 'pf-b', 'aria-label': o.n, disabled: true, onclick: () => this.choose(i) }, sym(i, 60), h('span', {}, o.n)));
    this.histBox = h('div', { class: 'pf-hist' }); this.timer = h('div', { class: 'pc-flash', style: 'font-size:1rem;min-height:1.3em;opacity:.85' }, ' ');
    this.main.append(this.board, this.arena, this.flash, this.timer, h('div', { class: 'pf-pick' }, ...this.btns), this.histBox);
    this.onNet('cm', m => { const r = this.R(m.n); r.oh = m.h; this.step(r); });
    this.onNet('rv', m => { const r = this.R(m.n); r.oc = m.c; r.on = m.x; this.step(r); });
    if (this.remi) this.net.recv = { cm: m => this.botCommit(m), rv: m => this.botReveal(m) };
    this.setup('Épée, bouclier, canon', 'Chaque manche, choisis en secret : épée, bouclier ou canon.\nL\'épée bat le canon, le bouclier bat l\'épée, le canon bat le bouclier.\nLes deux choix sont dévoilés ensemble : personne ne peut tricher.', [
      { k: 'win', label: 'Manches à gagner', vals: [[2, '2'], [3, '3'], [4, '4']], def: 3 }], (seed, cfg) => { this.total = cfg.win; this.paintScore(); this.at(.7, () => this.nextRound()); });
  }
  R(n) { return this.rs[n] || (this.rs[n] = { n, my: null, oh: null, oc: null, on: null, sent: false, done: false }); }
  paintScore() { this.board.replaceChildren(this.draw2(this.pts.me, this.pts.opp, this.total || (this.cfg && this.cfg.win) || 3)); this.setStat(this.pts.me + ' pt', this.pts.opp + ' pt'); }
  nextRound() {
    if (this.over) return; const r = this.R(++this.n); this.cur = r; this.picked = false;
    this.cardMe.className = 'pf-card back'; this.cardOpp.className = 'pf-card back'; this.cardMe.replaceChildren(); this.cardOpp.replaceChildren();
    this.btns.forEach(b => { b.disabled = false; b.classList.remove('sel'); });
    this.flash.textContent = 'Manche ' + r.n + ' : fais ton choix !'; this.flash.style.color = '#ffe9a8'; this.timer.textContent = '';
    r.tid = this.at(PICK_T, () => { if (this.cur === r && r.my == null) { this.flash.textContent = 'Temps écoulé : choix au hasard.'; this.choose(rnd(3)); } });
    this.tick(r, PICK_T);
    if (this.remi) this.botPlan(r);
    if (r.oh != null) this.step(r);
  }
  tick(r, left) { if (this.cur !== r || r.my != null || this.over) return; this.timer.textContent = left <= 5 ? left + ' s' : ''; if (left > 0) this.at(1, () => this.tick(r, left - 1)); }
  async choose(i) {
    const r = this.cur; if (!r || r.my != null || this.over || this.frozen) return; r.my = i; r.nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.btns.forEach((b, j) => { b.disabled = true; b.classList.toggle('sel', j === i); }); this.cancel(r.tid); this.timer.textContent = '';
    this.cardMe.replaceChildren(sym(i, 70)); this.cardMe.className = 'pf-card pc-pop'; this.s.sfx('tick');
    this.flash.textContent = 'Choix caché. On attend ' + this.oppA.name + '…'; this.flash.style.color = '#ffe9a8';
    this.myHist.push(i);
    const hh = await sha(r.n + ':' + i + ':' + r.nonce); if (!this.alive) return; r.mh = hh; this.net.send('cm', { n: r.n, h: hh }); this.step(r);
  }
  /** Fait avancer la manche : dévoiler quand les deux ont choisi, résoudre quand tout est reçu. */
  async step(r) {
    if (this.over || r.done) return;
    if (r.my != null && r.mh && r.oh != null && !r.sent) { r.sent = true; this.net.send('rv', { n: r.n, c: r.my, x: r.nonce }); }
    if (r.sent && r.oc != null && !r.fin) {
      r.fin = true; let ok = true;
      if (!this.remi) ok = (await sha(r.n + ':' + r.oc + ':' + r.on)) === r.oh;
      if (!this.alive) return; this.reveal(r, ok);
    }
  }
  reveal(r, ok) {
    if (r.done || this.over) return; r.done = true; const m = r.my, o = ok ? r.oc : -1; let out = 'd';
    if (!ok) out = 'w'; else if (BEATS[m] === o) out = 'w'; else if (BEATS[o] === m) out = 'l';
    this.cardOpp.replaceChildren(o >= 0 ? sym(o, 70) : h('b', {}, '?')); this.cardOpp.className = 'pf-card pf-flip' + (out === 'l' ? ' win' : out === 'w' ? ' lose' : '');
    this.cardMe.className = 'pf-card' + (out === 'w' ? ' win' : out === 'l' ? ' lose' : '');
    if (out === 'w') { this.pts.me++; this.flash.textContent = 'Manche gagnée ! ' + (ok ? WHY[m] : 'Choix invalide : manche pour toi.'); this.flash.style.color = '#27e0b3'; this.s.sfx('win'); }
    else if (out === 'l') { this.pts.opp++; this.flash.textContent = 'Manche perdue. ' + WHY[o]; this.flash.style.color = '#ff8a98'; this.s.sfx('block'); }
    else { this.flash.textContent = 'Égalité : on rejoue la manche.'; this.flash.style.color = '#ffe9a8'; }
    this.hist.push(out); this.histBox.replaceChildren(...this.hist.map(x => h('span', { class: 'pf-h ' + x }, x === 'w' ? '+' : x === 'l' ? '−' : '=')));
    if (o >= 0) { this.oppHist = (this.oppHist || []); this.oppHist.push(o); }
    this.paintScore(); const tot = this.cfg.win;
    if (this.pts.me >= tot || this.pts.opp >= tot) { const win = this.pts.me >= tot; this.at(1.5, () => this.end(win, 'Toi : ' + this.pts.me + ' manche(s)\n' + this.oppA.name + ' : ' + this.pts.opp + ' manche(s)')); }
    else this.at(2.2, () => this.nextRound());
  }
  /* ----- Rémi : il choisit avant de voir ton choix ; aux niveaux hauts il devine tes habitudes ----- */
  botPlan(r) {
    const hist = this.myHist; let c = rnd(3);
    if (hist.length >= 2 && Math.random() < lerp(.05, .55)) { const cnt = [0, 0, 0]; hist.forEach(x => cnt[x]++); const last = hist[hist.length - 1]; const likely = Math.random() < .5 ? cnt.indexOf(Math.max(...cnt)) : last; c = (Object.keys(BEATS).find(k => BEATS[k] == likely)) * 1; }
    r.bot = c;
  }
  botCommit(m) { this.at(.4 + Math.random() * lerp(2.2, .8), () => this.botSay('cm', { n: m.n, h: 'bot' })); }
  botReveal(m) { const r = this.R(m.n); this.at(.2, () => this.botSay('rv', { n: m.n, c: r.bot != null ? r.bot : rnd(3), x: '' })); }
}
export default {
  id: 'pfc', name: 'Épée, bouclier, canon', short: 'Pierre-feuille-ciseaux de pirates : devine le choix de l\'autre.',
  how: ['Chacun choisit en secret : épée, bouclier ou canon.', 'L\'épée bat le canon, le bouclier bat l\'épée, le canon bat le bouclier.', 'Les choix sont dévoilés en même temps, sans triche possible.', 'Le premier à gagner assez de manches gagne.'],
  create: ctx => new Pfc(ctx),
};
