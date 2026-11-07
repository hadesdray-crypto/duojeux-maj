// Trouve la sortie : un port encombré de bateaux vus de dessus. Fais glisser les bateaux pour libérer la sortie du vaisseau amiral rouge.
// Les deux joueurs ont exactement le même port (vérifié résoluble). Le premier dehors gagne la manche.
import { PackGame, Arbiter } from './c_base.js';
import { h } from '../core/util.js';
import { lerp } from '../core/level.js';
import { css } from '../core/winfx.js';
import { BANK } from './sortie_bank.js';

const N = 6, CELL = 46;
const LEVELS = { facile: { n: [6, 8], min: [5, 9] }, moyen: { n: [7, 9], min: [9, 14] }, difficile: { n: [9, 11], min: [15, 40] } };
const HULLS = [['#c9893a', '#7d4f1a'], ['#4da3ff', '#1f56b8'], ['#2fbf71', '#16764a'], ['#ffd24d', '#b88a10'], ['#b07cff', '#5f35a8'], ['#e8e2d0', '#9a9278'], ['#ff8a2a', '#a84d08'], ['#3fd0d0', '#177a7a']];
const MAXT = 150, HINT_COST = 8;
css('so', `.so-sea{position:relative;width:${N * CELL}px;height:${N * CELL}px;margin:0 auto;border-radius:10px;background:repeating-linear-gradient(0deg,#1b4f8f 0 ${CELL}px,#1a4a85 ${CELL}px ${CELL * 2}px);box-shadow:inset 0 0 22px #000b;touch-action:none;transition:opacity .3s}
.so-sea.hid{opacity:.18}
.so-wrap{position:relative;width:${N * CELL + 16}px;margin:0 auto;padding:8px 0 8px 8px;border-radius:16px;background:linear-gradient(#6b4a26,#4a321a);border:3px solid #2a1c0e;box-shadow:inset 0 2px 0 #ffffff26,0 4px 10px #0008}
.so-wrap:after{content:'';position:absolute;right:-3px;top:${8 + 2 * CELL}px;width:11px;height:${CELL}px;background:#1b4f8f;border-radius:0 6px 6px 0}
.so-exit{position:absolute;right:-1px;top:${8 + 2 * CELL + 14}px;width:0;height:0;border-left:16px solid #ffd24d;border-top:12px solid transparent;border-bottom:12px solid transparent;filter:drop-shadow(0 0 6px #ffd24d);animation:sopulse 1s infinite alternate;z-index:3}
@keyframes sopulse{to{transform:translateX(5px)}}
.so-car{position:absolute;box-sizing:border-box;border-radius:22px;border:3px solid #0008;box-shadow:inset 0 3px 0 #ffffff55,0 3px 6px #000a;cursor:grab;touch-action:none;transition:left .14s,top .14s;z-index:1}
.so-car.drag{transition:none;z-index:2;filter:brightness(1.12)}
.so-car:after{content:'';position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b0,#8a6a32);box-shadow:0 1px 2px #000a}
.so-car.red{background:linear-gradient(#ff5a5a,#a4202c)!important;border-color:#ffd24d}
.so-car.hint{animation:sohint .5s infinite alternate}
@keyframes sohint{to{box-shadow:0 0 14px 4px #ffd24d,inset 0 3px 0 #ffffff55}}
.so-car.out{transition:left .6s ease-in,opacity .6s;opacity:0}
.so-info{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:800}
.so-info span{background:#0b1230;border:2px solid #c9a227;border-radius:12px;padding:4px 10px;min-width:70px;text-align:center}
.so-act{display:flex;gap:8px}.so-act .btn{flex:1 1 0;min-height:52px}`);

const mul = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** Cases occupées par les bateaux (coords = position de chaque bateau sur son axe). */
function occ(cars, pos, skip = -1) {
  const g = new Uint8Array(N * N);
  cars.forEach((c, i) => { if (i === skip) return; for (let k = 0; k < c.len; k++) { const x = c.d === 'h' ? pos[i] + k : c.x, y = c.d === 'h' ? c.y : pos[i] + k; g[y * N + x] = 1; } });
  return g;
}
const posOf = cars => cars.map(c => c.d === 'h' ? c.x : c.y);
/** Plage de glissement possible [min, max] du bateau i. */
export function range(cars, pos, i) {
  const c = cars[i], g = occ(cars, pos, i), at = p => c.d === 'h' ? g[c.y * N + p] : g[p * N + c.x];
  let lo = pos[i], hi = pos[i]; while (lo > 0 && !at(lo - 1)) lo--; while (hi + c.len < N && !at(hi + c.len)) hi++; return [lo, hi];
}
/** Nombre minimal de glissements (un glissement = n'importe quelle distance) + chemin. Renvoie null si pas de solution. */
export function solve(cars, start = posOf(cars), cap = 150000) {
  const key = p => p.join(''), seen = new Map([[key(start), null]]); let fr = [start], d = 0;
  const goal = p => p[0] + cars[0].len >= N;
  if (goal(start)) return { min: 0, path: [] };
  while (fr.length && seen.size < cap) {
    d++; const nx = [];
    for (const p of fr) for (let i = 0; i < cars.length; i++) {
      const [lo, hi] = range(cars, p, i);
      for (let q = lo; q <= hi; q++) { if (q === p[i]) continue; const np = p.slice(); np[i] = q; const k = key(np); if (seen.has(k)) continue; seen.set(k, { from: p, car: i, to: q });
        if (goal(np)) { const path = []; let cur = np; while (seen.get(key(cur))) { const s = seen.get(key(cur)); path.unshift({ car: s.car, to: s.to }); cur = s.from; } return { min: d, path }; }
        nx.push(np); }
    }
    fr = nx;
  }
  return null;
}
/** Fabrique un port résoluble dont la solution minimale est dans la fourchette du niveau. */
export function makePuzzle(niv, rnd = Math.random, budget = 1300) {
  const bank = BANK[niv]; if (bank && budget >= 1300 && rnd() < .9) { const b = bank[Math.floor(rnd() * bank.length)]; return { cars: b[1].map(([x, y, len, d]) => ({ x, y, len, d })), min: b[0] }; }
  const L = LEVELS[niv] || LEVELS.moyen, t0 = performance.now(), ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), mid = (L.min[0] + L.min[1]) / 2;
  const grid = cars => { const g = new Uint8Array(N * N); cars.forEach(c => { for (let k = 0; k < c.len; k++) g[(c.d === 'h' ? c.y : c.y + k) * N + (c.d === 'h' ? c.x + k : c.x)] = 1; }); return g; };
  const fits = (c, g) => { for (let k = 0; k < c.len; k++) { const x = c.d === 'h' ? c.x + k : c.x, y = c.d === 'h' ? c.y : c.y + k; if (x >= N || y >= N || g[y * N + x]) return false; } return true; };
  const rcar = () => ({ x: ri(0, N - 1), y: ri(0, N - 1), len: rnd() < .7 ? 2 : 3, d: rnd() < .5 ? 'h' : 'v' });
  let best = null;
  while (performance.now() - t0 < budget || !best) {
    const cars = [{ x: ri(0, 2), y: 2, len: 2, d: 'h' }], n = ri(L.n[0], L.n[1]);
    for (let a = 0; cars.length - 1 < n && a < 300; a++) { const c = rcar(); if (c.d === 'h' && c.y === 2) continue; if (fits(c, grid(cars))) cars.push(c); }
    let s = solve(cars, undefined, 60000); if (!s) continue; let cur = s.min;
    // on durcit le port petit à petit : on déplace un bateau, on garde si la solution reste possible et ne raccourcit pas
    for (let it = 0; it < 900 && (cur < L.min[0]) && performance.now() - t0 < budget; it++) {
      const i = ri(1, cars.length - 1), old = cars[i], rest = cars.filter((_, j) => j !== i), c = rcar(); c.d = old.d; c.len = old.len;
      if (c.d === 'h' && c.y === 2) continue; if (!fits(c, grid(rest))) continue;
      const nc = cars.slice(); nc[i] = c; const s2 = solve(nc, undefined, 60000); if (s2 && s2.min >= cur) { cars[i] = c; cur = s2.min; }
    }
    if (cur >= L.min[0] && cur <= L.min[1]) return { cars, min: cur };
    if (!best || Math.abs(cur - mid) < Math.abs(best.min - mid)) best = { cars: cars.map(c => ({ ...c })), min: cur };
  }
  return best;
}

class Sortie extends PackGame {
  constructor(ctx) {
    super(ctx, { id: 'sortie', name: 'Trouve la sortie' });
    this.me = this.isHost ? 'h' : 'g'; this.opp = this.isHost ? 'g' : 'h'; this.wins = { h: 0, g: 0 }; this.n = 0; this.pu = null;
    this.board = h('div'); this.sea = h('div', { class: 'so-sea hid' }); this.wrap = h('div', { class: 'so-wrap' }, this.sea, h('div', { class: 'so-exit' }));
    this.tEl = h('span', {}, '0:00'); this.mEl = h('span', {}, '0 coup'); this.flash = h('div', { class: 'pc-flash', style: 'font-size:1.05em' }, ' ');
    this.bHint = h('button', { class: 'btn sec', onclick: () => this.hint() }, 'Indice (+' + HINT_COST + ' s)'); this.bReset = h('button', { class: 'btn sec', onclick: () => this.reset() }, 'Repartir de zéro');
    this.main.append(this.board, h('div', { class: 'so-info' }, this.tEl, this.mEl), this.wrap, this.flash, h('div', { class: 'so-act' }, this.bHint, this.bReset));
    this.arb = new Arbiter(this, { decide: (r, f) => this.decide(r, f), onResolve: (n, w, reps) => this.resolve(n, w, reps) });
    this.onNet('pu', m => this.startRound(m));
    this.onNet('rep', m => { if (this.isHost) this.arb.report(m.n, this.opp, m); });
    this.onNet('res', m => { if (!this.isHost) this.applyRes(m); });
    if (this.remi) this.net.recv = { pu: m => this.botRound(m) };
    this.setup('Trouve la sortie', 'Le port est encombré de bateaux vus de dessus. Fais-les glisser pour ouvrir le chemin au vaisseau amiral ROUGE jusqu\'à la sortie, à droite.\nVous avez le même port : le premier dehors gagne la manche.', [
      { k: 'niv', label: 'Difficulté', vals: [['facile', 'Facile'], ['moyen', 'Moyen'], ['difficile', 'Difficile']], def: 'moyen' },
      { k: 'win', label: 'Manches à gagner', vals: [[1, '1'], [2, '2'], [3, '3']], def: 2 }], (seed, cfg) => { this.total = cfg.win; this.paintBoard(); this.flash.textContent = 'Préparation du port…'; if (this.isHost) this.at(.5, () => this.nextRound()); });
  }
  paintBoard() { this.board.replaceChildren(this.draw2(this.wins[this.me], this.wins[this.opp], this.total || (this.cfg && this.cfg.win) || 2)); this.setStat(this.wins[this.me] + ' manche', this.wins[this.opp] + ' manche'); }
  nextRound() {
    if (this.over) return; const p = makePuzzle(this.cfg.niv); if (!p) { this.flash.textContent = 'Impossible de préparer le port.'; return; }
    const m = { n: ++this.n, cars: p.cars, min: p.min, d: 3 }; this.net.send('pu', m); this.startRound(m); this.arb.open(m.n, m.d + this.lat() + MAXT + 1);
  }
  startRound(m) {
    if (this.over) return; this.n = m.n; this.pu = { ...m, pos: posOf(m.cars), mv: 0, penalty: 0, hints: 0, started: false, done: false, t0: 0 };
    this.sea.classList.add('hid'); this.build(); this.updInfo(); this.bHint.disabled = true; this.bReset.disabled = true; this.flash.style.color = '#ffe9a8';
    const cd = k => { if (this.pu && this.pu.n === m.n && !this.over && k > 0) { this.flash.textContent = 'Manche ' + m.n + ' : prêt… ' + k; this.at(1, () => cd(k - 1)); } };
    cd(Math.round(m.d));
    this.at(m.d + (this.isHost ? this.lat() : 0), () => this.go(m.n));
  }
  go(n) { const p = this.pu; if (!p || p.n !== n || this.over) return; p.started = true; p.t0 = this.nowT(); this.sea.classList.remove('hid'); this.flash.textContent = 'Libère le vaisseau rouge !'; this.bHint.disabled = false; this.bReset.disabled = false; this.s.sfx('tick'); }
  build() {
    const p = this.pu; this.sea.replaceChildren(); this.els = p.cars.map((c, i) => {
      const [a, b] = i === 0 ? ['#ff5a5a', '#a4202c'] : HULLS[(i - 1) % HULLS.length];
      const e = h('div', { class: 'so-car' + (i === 0 ? ' red' : ''), style: 'background:linear-gradient(' + (c.d === 'h' ? '180deg' : '90deg') + ',' + a + ',' + b + ');width:' + (c.d === 'h' ? c.len * CELL : CELL) + 'px;height:' + (c.d === 'h' ? CELL : c.len * CELL) + 'px;padding:0', 'data-i': i });
      e.style.margin = '0'; e.style.width = (c.d === 'h' ? c.len * CELL - 4 : CELL - 4) + 'px'; e.style.height = (c.d === 'h' ? CELL - 4 : c.len * CELL - 4) + 'px';
      this.place(e, c, p.pos[i]); e.addEventListener('pointerdown', ev => this.drag(ev, i)); this.sea.append(e); return e; });
  }
  place(e, c, q) { e.style.left = (c.d === 'h' ? q * CELL : c.x * CELL) + 2 + 'px'; e.style.top = (c.d === 'h' ? c.y * CELL : q * CELL) + 2 + 'px'; }
  drag(ev, i) {
    const p = this.pu; if (!p || !p.started || p.done || this.frozen || this.over || this.dragging) return; ev.preventDefault(); this.clearHint();
    const c = p.cars[i], el = this.els[i], [lo, hi] = range(p.cars, p.pos, i), x0 = ev.clientX, y0 = ev.clientY, q0 = p.pos[i]; this.dragging = true; el.classList.add('drag');
    try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    const px = ev2 => { const d = (c.d === 'h' ? ev2.clientX - x0 : ev2.clientY - y0) / CELL; return Math.max(lo - q0, Math.min(hi - q0, d)) + q0; };
    const mv = ev2 => { const q = px(ev2); if (c.d === 'h') el.style.left = q * CELL + 2 + 'px'; else el.style.top = q * CELL + 2 + 'px'; };
    const up = ev2 => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.classList.remove('drag'); this.dragging = false;
      const q = Math.round(px(ev2)); this.place(el, c, q); if (q !== q0 && !p.done && this.pu === p) { p.pos[i] = q; p.mv++; this.s.sfx('tick'); this.updInfo(); if (i === 0 && q + c.len >= N) this.finishMe(); }
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  updInfo() { const p = this.pu; if (!p) return; this.mEl.textContent = p.mv + ' coup' + (p.mv > 1 ? 's' : ''); const t = p.started && !p.done ? Math.max(0, this.nowT() - p.t0 + p.penalty) : 0; this.showT(t); }
  showT(t) { const s = Math.floor(t); this.tEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  update(dt) { const p = this.pu; if (!p || !p.started || p.done) return; this.acc = (this.acc || 0) + dt; if (this.acc > .25) { this.acc = 0; this.updInfo(); } }
  reset() { const p = this.pu; if (!p || !p.started || p.done || this.frozen) return; p.pos = posOf(p.cars); this.clearHint(); p.cars.forEach((c, i) => this.place(this.els[i], c, p.pos[i])); p.mv = 0; this.updInfo(); this.flash.textContent = 'Le port est remis comme au départ.'; }
  clearHint() { (this.els || []).forEach(e => e.classList.remove('hint')); }
  hint() {
    const p = this.pu; if (!p || !p.started || p.done || this.frozen) return; this.clearHint(); const s = solve(p.cars, p.pos); if (!s || !s.path.length) return;
    p.penalty += HINT_COST; p.hints++; const st = s.path[0], c = p.cars[st.car]; this.els[st.car].classList.add('hint');
    const dir = c.d === 'h' ? (st.to > p.pos[st.car] ? 'vers la droite' : 'vers la gauche') : (st.to > p.pos[st.car] ? 'vers le bas' : 'vers le haut');
    this.flash.textContent = 'Fais glisser le bateau qui brille ' + dir + '.'; this.flash.style.color = '#ffe9a8'; this.updInfo();
  }
  finishMe() {
    const p = this.pu; if (p.done) return; p.done = true; this.clearHint(); const t = Math.round((this.nowT() - p.t0 + p.penalty) * 1000) / 1000;
    const el = this.els[0], c = p.cars[0]; el.classList.add('out'); el.style.left = N * CELL + 20 + 'px'; this.s.sfx('win'); this.flash.textContent = 'Dehors ! On attend le verdict…'; this.flash.style.color = '#27e0b3'; this.showT(t);
    const rep = { n: p.n, ok: true, tm: t }; if (this.isHost) this.arb.report(p.n, 'h', rep); else this.net.send('rep', rep);
  }
  decide(r, final) {
    const best = () => { const a = [['h', r.h], ['g', r.g]].filter(x => x[1] && x[1].ok); if (!a.length) return null; a.sort((x, y) => x[1].tm - y[1].tm || (x[0] === 'h' ? -1 : 1)); return a[0][0]; };
    if (r.h && r.g) return { done: true, w: best() }; if (final) return { done: true, w: best() }; return { done: false };
  }
  resolve(n, w, reps) { const m = { n, w, tm: { h: reps.h && reps.h.tm, g: reps.g && reps.g.tm } }; this.net.send('res', m); this.applyRes(m); }
  applyRes(m) {
    if (this.over || m.n !== this.n) return; const p = this.pu; if (p) p.done = true; this.bHint.disabled = true; this.bReset.disabled = true; this.clearHint();
    const mine = m.w === this.me, theirs = m.w === this.opp, f = x => x != null ? Math.round(x * 10) / 10 + ' s' : '—';
    if (m.w) this.wins[m.w]++;
    if (mine) { this.flash.textContent = 'Manche pour toi ! (' + f(m.tm[this.me]) + ')'; this.flash.style.color = '#27e0b3'; } else if (theirs) { this.flash.textContent = this.oppA.name + ' sort le premier (' + f(m.tm[this.opp]) + ').'; this.flash.style.color = '#ff8a98'; this.s.sfx('block'); } else { this.flash.textContent = 'Personne n\'est sorti à temps.'; this.flash.style.color = '#ffe9a8'; }
    this.paintBoard(); const tot = this.cfg.win;
    if (this.wins.h >= tot || this.wins.g >= tot) { const win = this.wins[this.me] >= tot; this.at(1.6, () => this.end(win, 'Toi : ' + this.wins[this.me] + ' manche(s)\n' + this.oppA.name + ' : ' + this.wins[this.opp] + ' manche(s)')); }
    else if (this.isHost) this.at(2.4, () => this.nextRound());
  }
  /* ----- Rémi : il sort en un temps lié au nombre de coups minimal ----- */
  botRound(m) {
    if (Math.random() < lerp(.2, 0)) return;
    const t = Math.max(6, m.min * lerp(7.5, 2.4) * (.8 + Math.random() * .4));
    this.at(m.d + t, () => this.botSay('rep', { n: m.n, ok: true, tm: t }));
  }
}
export default {
  id: 'sortie', name: 'Trouve la sortie', short: 'Fais glisser les bateaux pour libérer la sortie, avant l\'autre.',
  how: ['Les bateaux glissent seulement dans le sens de leur coque.', 'Libère le chemin du vaisseau amiral rouge jusqu\'à la sortie dorée.', 'Vous avez le même port : le premier dehors gagne la manche.', 'Un indice est possible, mais il coûte du temps.'],
  create: ctx => new Sortie(ctx),
};
