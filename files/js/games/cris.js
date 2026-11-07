// Bataille de cris : à chaque manche le jeu donne un cri connu (Yahoo !, Boum !…) à reproduire. Le gagnant est celui qui reproduit le mieux le BON mot.
// Cascade : 1) reconnaissance vocale (Duo natif si présent, sinon navigateur) avec comparaison tolérante de la transcription ;
// 2) sinon volume + rythme des syllabes au micro ; 3) sinon un bouton à toucher une fois par syllabe.
import { Duo } from '../core/kit.js';
import { h } from '../core/util.js';
import { sprEl, sprSet } from '../core/sprites.js';
import { css, winBadge } from '../core/winfx.js';
css('crisfx', '@keyframes cshake{0%,100%{transform:translate(0,0)}25%{transform:translate(-3px,1px)}75%{transform:translate(3px,-1px)}}.chead{display:flex;justify-content:center;margin:2px 0}.ccri{text-align:center;font-size:34px;font-weight:900;color:#ffd24a;margin:2px 8px;min-height:1.3em}.cheard{text-align:center;margin:0 8px;min-height:1.4em;font-size:15px}.cmenu{display:flex;gap:8px;margin:4px 8px}.cmenu .btn{flex:1;min-height:44px}');

/** Les cris : texte affiché, variantes entendues par la reconnaissance (français), nombre de syllabes. */
export const CRIS = [
  { t: 'Yahoo !', v: ['yahou', 'yahoo', 'ya hou', 'yaou', 'yahouu', 'iaou'], syl: 2 },
  { t: 'Yihaa !', v: ['yiha', 'yihaa', 'yi ha', 'ihaa', 'yeah', 'yihaaa', 'rihanna'], syl: 2 },
  { t: 'Tac au tac !', v: ['tac au tac', 'taco tac', 'tac o tac', 'tac autac'], syl: 3 },
  { t: 'Boum !', v: ['boum', 'boom', 'bom', 'bouh', 'bon'], syl: 1 },
  { t: 'Hourra !', v: ['hourra', 'houra', 'oura', 'ourah', 'hurra', 'hourrah'], syl: 2 },
  { t: 'Banzaï !', v: ['banzai', 'bancai', 'banzaille', 'bans aï', 'bon zaï'], syl: 2 },
  { t: 'Geronimo !', v: ['geronimo', 'jeronimo', 'géronimo', 'jéronimo'], syl: 4 },
  { t: 'Waouh !', v: ['waouh', 'wao', 'ouah', 'wouah', 'waou', 'ouaou', 'wow'], syl: 1 },
  { t: 'Youpi !', v: ['youpi', 'you pi', 'youpie', 'ioupi'], syl: 2 },
  { t: 'Cocorico !', v: ['cocorico', 'coco rico', 'coquerico', 'cocoricot'], syl: 4 },
];
/** Écriture phonétique approximative (tolérante aux accents, h muet, doubles lettres, terminaisons muettes). */
export const phon = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, '')
  .replace(/qu|c(?=[aouklrt])|ck|k/g, 'k').replace(/c/g, 's').replace(/ph/g, 'f').replace(/w/g, 'ou').replace(/h/g, '').replace(/eau|au|o/g, 'o').replace(/ou|u/g, 'u').replace(/ai|ei|e/g, 'e').replace(/y/g, 'i')
  .replace(/z/g, 's').replace(/g(?=[ei])/g, 'j').replace(/(.)\1+/g, '$1').replace(/[sdtxp]$/g, '');
const lev = (a, b) => { const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; };
const sim1 = (a, b) => { a = phon(a); b = phon(b); if (!a || !b) return 0; return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length)); };
/** Ressemblance 0..1 entre ce qui a été entendu et le cri demandé (on regarde le texte entier, chaque mot et les paires de mots). */
export function similarity(heard, cri) {
  const c = typeof cri === 'number' ? CRIS[cri] : cri, words = String(heard || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return 0;
  const cands = [words.join(' ')]; words.forEach((w, i) => { cands.push(w); if (i < words.length - 1) cands.push(w + ' ' + words[i + 1]); if (i < words.length - 2) cands.push(w + ' ' + words[i + 1] + ' ' + words[i + 2]); });
  const refs = [c.t.replace(/[!]/g, ''), ...c.v]; let best = 0; for (const a of cands) for (const r of refs) best = Math.max(best, sim1(a, r)); return best;
}
/** Compte les « syllabes » dans une courbe de volume : pics séparés par des creux. */
export function countPeaks(levels, thr = .12) {
  let n = 0, up = false, lo = 1; for (const v of levels) { if (!up && v > thr && v > lo * 1.5 + .02) { up = true; n++; } else if (up && v < thr * .7) { up = false; lo = v; } if (!up) lo = Math.min(lo, v); } return n;
}

class Cris extends Duo {
  constructor(ctx) {
    super(ctx); this.round = 0; this.mine = []; this.theirs = []; this.phase = 'wait'; this.taps = 0; this.useMic = false; this.useVoice = false; this.order = []; this.heard = '';
    this.sub(() => { this.s.stopMic(); this.s.stopVoice(); });
    this.hud(h('span', {}, 'Manche 0 / 3'), h('span', {}, ''));
    this.cri = h('div', { class: 'ccri' }, ''); this.note = this.big(''); this.heardEl = h('p', { class: 'mut cheard' }, '');
    this.meter = h('div', { class: 'meter', style: 'height:26px;margin:6px 8px' }, h('i')); this.score = h('p', { class: 'mut', style: 'text-align:center;white-space:pre-line;margin:2px 8px' }, '');
    this.tap = h('button', { class: 'btn big', style: 'min-height:80px;touch-action:manipulation;display:none', onpointerdown: e => { e.preventDefault(); if (this.phase === 'shout') { this.taps++; this.s.sfx('tick'); } } }, 'Touche une fois par syllabe du cri');
    this.head = sprEl('n_head0', 150); this.headBox = h('div', { class: 'chead' }, this.head);
    this.root.append(this.headBox, this.cri, this.note, this.heardEl, this.meter, this.score, h('div', { class: 'controls' }, this.tap),
      h('div', { class: 'cmenu' }, h('button', { class: 'btn sec', onclick: () => this.restart() }, 'Recommencer'), h('button', { class: 'btn sec', onclick: () => this.ctx.exit() }, 'Quitter')));
    this.onNet('rd', m => { if (m.c != null) this.order[m.r] = m.c; this.beginRound(m.r); });
    this.onNet('cr', m => { this.theirs[m.r] = m.v; this.check(m.r); });
    this.onSense('voice', e => { if (this.phase === 'shout' && e.text) { this.heard = e.text; this.heardEl.textContent = 'J\'ai entendu : « ' + e.text + ' »'; this.gotVoice = true; this.best = Math.max(this.best || 0, similarity(e.text, this.order[this.round])); } });
    this.gate('Bataille de cris', 'Chaque manche, le jeu t\'affiche un cri célèbre (Yahoo !, Boum !, Hourra !…).\n1. Attends « CRIE ! » après le compte à rebours.\n2. Crie CE mot-là, fort et bien articulé, pendant 3 secondes.\n3. Le téléphone écoute : gagne celui qui reproduit le mieux le bon cri, pas seulement le plus fort.\n3 manches. (Sans reconnaissance vocale : on mesure le volume et le rythme ; sans micro : touche une fois par syllabe.)', async () => {
      this.useVoice = await this.s.startVoice().catch(() => false); this.useMic = await this.s.startMic().catch(() => false);
      if (!this.useVoice && !this.useMic) this.tap.style.display = ''; if (this.isHost) this.nextRound(0);
    });
    this.loop(dt => this.update(dt));
  }
  restart() { if (this.remi) this.ctx.restart(); else this.askReplay(); }
  nextRound(r) { if (this.order[r] == null) { const used = this.order.filter(x => x != null); let c; do c = (Math.random() * CRIS.length) | 0; while (used.includes(c)); this.order[r] = c; } this.net.send('rd', { r, c: this.order[r] }); this.beginRound(r); }
  async beginRound(r) {
    if (this.over) return; this.round = r; this.phase = 'count'; this.hudEl.children[0].textContent = 'Manche ' + (r + 1) + ' / 3'; this.taps = 0; this.acc = []; this.best = 0; this.gotVoice = false; this.heard = ''; this.score.textContent = ''; this.heardEl.textContent = '';
    const c = CRIS[this.order[r] ?? 0]; this.cri.textContent = 'Crie : « ' + c.t + ' »';
    for (const n of ['3', '2', '1']) { this.note.textContent = n; this.note.style.color = '#ffb020'; this.s.sfx('tick'); await new Promise(r => setTimeout(r, 800)); if (!this.alive) return; }
    this.phase = 'shout'; this.note.textContent = 'CRIE ! ' + c.t; this.note.style.color = '#ff5470'; this.s.vibrate(100); this.t0 = performance.now();
    setTimeout(() => this.endShout(), 3200);
  }
  update() {
    if (this.phase !== 'shout') { this.meter.firstChild.style.width = '0%'; sprSet(this.head, this.phase === 'count' ? 'n_head1' : 'n_head0', 150); this.head.style.animation = 'none'; return; }
    const v = this.useMic ? this.s.micLevel() : Math.min(1, this.taps / 8); this.acc.push(v); this.meter.firstChild.style.width = Math.round(v * 100) + '%';
    sprSet(this.head, v < .08 ? 'n_head1' : v < .22 ? 'n_head2' : v < .45 ? 'n_head3' : 'n_head4', 150); this.head.style.animation = v > .3 ? 'cshake .12s linear infinite' : 'none';
  }
  /** Note de la manche (0..100) : reconnaissance si elle a entendu quelque chose, sinon volume + rythme, sinon bouton. */
  scoreRound() {
    const c = CRIS[this.order[this.round] ?? 0], top = [...this.acc].sort((a, b) => b - a).slice(0, Math.max(1, Math.floor(this.acc.length / 3))), loud = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
    if (this.useVoice && this.gotVoice) { const fit = Math.max(0, Math.min(1, (this.best - .35) / .55)); this.mode = 'voix'; return Math.round(fit * 85 + Math.min(1, loud * 1.5) * (this.useMic ? 15 : 0) + (this.useMic ? 0 : 10 * fit)); }
    if (this.useMic) { this.mode = 'volume'; const pk = countPeaks(this.acc), rhythm = Math.max(0, 1 - Math.abs(pk - c.syl) / Math.max(2, c.syl)); return Math.round(Math.min(1, loud * 1.6) * 55 + rhythm * 30); }
    this.mode = 'bouton'; const ok = Math.max(0, 1 - Math.abs(this.taps - c.syl) / Math.max(2, c.syl)); return Math.round(ok * 80 + Math.min(1, this.taps / 8) * 10);
  }
  endShout() {
    if (this.phase !== 'shout' || !this.alive) return; this.phase = 'done'; const v = Math.max(0, Math.min(100, this.scoreRound()));
    this.mine[this.round] = v; this.net.send('cr', { r: this.round, v }); this.note.textContent = 'Ton cri : ' + v + ' / 100'; this.note.style.color = '#27e0b3'; this.check(this.round);
  }
  finish(win, d) { super.finish(win, d); winBadge(this, win, null); }
  check(r) {
    if (this.over || this.mine[r] == null || this.theirs[r] == null || this.done && this.done[r]) return; (this.done ||= {})[r] = true;
    const a = this.mine[r], b = this.theirs[r]; this.score.textContent = 'Manche ' + (r + 1) + ' (' + CRIS[this.order[r] ?? 0].t + ') — toi : ' + a + '   ' + this.oppA.name + ' : ' + b + '\n' + (a > b ? 'Tu gagnes la manche !' : a < b ? this.oppA.name + ' gagne la manche.' : 'Égalité.');
    const wins = this.mine.reduce((n, v, i) => n + (v > this.theirs[i] ? 1 : 0), 0), loss = this.mine.reduce((n, v, i) => n + (this.theirs[i] != null && v < this.theirs[i] ? 1 : 0), 0);
    this.setStat(wins + ' manche(s)', loss + ' manche(s)');
    if (r < 2) { if (this.isHost) setTimeout(() => this.alive && this.nextRound(r + 1), 2500); }
    else setTimeout(() => { if (this.alive) { this.s.stopMic(); this.s.stopVoice(); this.compare(wins, loss, v => v + ' manche(s)'); } }, 1800);
  }
}
export default { id: 'cris', name: 'Bataille de cris', short: 'Reproduis le bon cri (Yahoo !, Boum !…) : le plus fidèle gagne.',
  how: ['Chaque manche, un cri célèbre s\'affiche : Yahoo !, Yihaa !, Tac au tac !, Boum !, Hourra !…', 'Après le compte à rebours, crie CE mot, fort et bien articulé.', 'Le téléphone reconnaît le mot : le plus fidèle gagne la manche, pas seulement le plus fort.', 'Pas de reconnaissance vocale : on mesure volume et rythme. Pas de micro : touche une fois par syllabe.'], create: ctx => new Cris(ctx) };
