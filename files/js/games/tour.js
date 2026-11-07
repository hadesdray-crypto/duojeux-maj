// Tour à abattre : une tour de blocs (bois, pierre, verre, glace) au centre ; chacun lance ses projectiles avec un lance-pierre.
// Celui dont le tir provoque la chute finale gagne. Vue de profil unique : sol de sable, lance-pierres en bois, boulets, bombes, harpons.
// Réseau : l'HÔTE fait tourner la physique (tour_engine.js) et envoie les positions ; l'invité affiche et envoie ses tirs.
import { Duo, rng } from '../core/kit.js';
import { h, modal, clamp, toast } from '../core/util.js';
import { css } from '../core/winfx.js';
import { makeAtlas } from '../core/atlas.js';
import { R as MR } from '../core/mer_rects.js';
import { boom } from '../core/boom.js';
import { level, lerp } from '../core/level.js';
import { saves, pidLink, oppOf } from '../core/saves.js';
import { World, buildWorld, LEVELS, AMMO, AMMO_KEYS, MAT, DT, SLING_X, SLING_Y, DMAX, WORLD_W, ball, tryShot, score } from './tour_engine.js';

/** Angle de tir (haut ou bas) pour toucher un point à (dx, dy) du lance-pierre avec cette puissance ; null si trop loin. */
function aimAt(type, pow, dx, dy, high) {
  const v = AMMO[type].k * DMAX * pow, g = 9.8, D = v ** 4 - g * (g * dx * dx + 2 * dy * v * v); if (D < 0 || dx < 0.3) return null;
  const a = Math.atan((v * v + (high ? 1 : -1) * Math.sqrt(D)) / (g * dx)); return a > 0.05 && a < 1.45 ? a : null;
}
const MER = makeAtlas('img/mer.webp', MR);
const CW = 360, CH = 440, PPM = CW / WORLD_W, GY = CH - 64; // échelle : 22,5 px par mètre, sol à 64 px du bas
const PULL_PX = 50; // 50 px d'étirement du doigt = 1 mètre de lance-pierre
const SHORT = { boulet: 'Boulet', rebond: 'Rebond', bombe: 'Bombe', fleche: 'Harpon', caillou: 'Caillou' };
const TCODE = AMMO_KEYS;
const MODES = [['turn', 'Chacun son tour'], ['sim', 'En même temps']];

css('tour', `
.tr-hud{display:flex;gap:6px;padding:4px 8px;background:#0008;align-items:center;font-weight:800;font-size:.92em}
.tr-hud .pl{display:flex;flex-direction:column;min-width:0;flex:0 0 27%}.tr-hud .pl.r{text-align:right}
.tr-hud .pl b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tr-hud .pl span{color:var(--mut);font-weight:700;font-size:.85em}
.tr-hud .pl.on b{color:#27e0b3}
.tr-prog{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;text-align:center}
.tr-bar{position:relative;height:14px;border-radius:8px;background:#0b1230;border:2px solid #c9a227;overflow:hidden}
.tr-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#27e0b3,#ffb020,#ff5470);transition:width .25s}
.tr-status{text-align:center;font-weight:800;padding:3px 8px;min-height:1.5em;color:#27e0b3;font-size:.98em}
.tr-status.wait{color:#ffb020}
.tr-ammo{display:flex;gap:5px;padding:6px 6px 0;background:var(--card)}
.tr-ammo button{flex:1 1 0;min-width:0;min-height:54px;border-radius:12px;border:3px solid #7a5a10;background:#f3dfa8;color:#3a2410;font-weight:800;font-size:.8em;padding:3px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;touch-action:manipulation;line-height:1.1}
.tr-ammo button.on{border-color:#27e0b3;background:#d6f7e9;box-shadow:0 0 0 2px #27e0b3}
.tr-ammo button:disabled{opacity:.4}.tr-ammo button b{font-size:1.25em}
.tr-info{background:var(--card);text-align:center;font-size:.82em;color:var(--mut);padding:3px 8px 0;min-height:1.6em}
.tr-act{display:flex;gap:8px;padding:6px 8px 8px;background:var(--card)}
.tr-act .btn{flex:1;min-height:48px;padding:6px 8px}
.tr-opt{display:flex;flex-direction:column;gap:6px;width:100%;max-width:340px}.tr-opt b{font-size:.95em}
.tr-opt .row{gap:6px;flex-wrap:wrap}.tr-opt .btn{min-height:48px;padding:6px 8px;font-size:.92em;flex:1 1 40%}
`);

const RULES = [
  'Une tour est posée au centre, faite de pièces en bois, pierre, verre et glace.',
  'Glisse ton doigt vers l\'arrière puis lâche : le lance-pierre envoie un projectile. Plus tu tires, plus il va vite.',
  'Boulet lourd : écrase. Balle rebondissante : ricoche. Bombe : explose au choc. Harpon : traverse le bois, le verre et la glace. Caillou : léger et très rapide.',
  'Chacun a le même nombre de projectiles, juste assez pour faire tomber la tour.',
  'Celui dont le tir provoque la chute finale de la tour gagne. Si les projectiles sont finis avant, celui qui a fait le plus de dégâts gagne.',
];

class Tour extends Duo {
  constructor(ctx) {
    super(ctx); this.seat = this.isHost ? 0 : 1; this.mirror = this.seat === 1; this.pl.remove();
    this.lv = 0; this.mode = 'turn'; this.started = false; this.inv = [{}, {}]; this.turn = 0; this.busy = false; this.sel = 'boulet'; this.prog = 0; this.credit = [0, 0]; this.cool = [0, 0];
    this.fx = []; this.snap = null; this.acc = 0; this.snapT = 0; this.stT = 0; this.shotN = 0; this.gotN = [0, 0]; this.aimOpp = null; this.aim = null; this.endT = 0; this.last = performance.now();
    this.hudL = h('div', { class: 'pl', 'data-who': 'me' }); this.hudR = h('div', { class: 'pl r', 'data-who': 'opp' }); this.barI = h('i'); this.progT = h('div', { class: 'mut', style: 'font-size:.8em;font-weight:700' }, 'Écroulement : 0 %');
    this.hud(this.hudL, h('div', { class: 'tr-prog' }, this.progT, h('div', { class: 'tr-bar' }, this.barI)), this.hudR); this.hudEl.className = 'tr-hud';
    this.status = h('div', { class: 'tr-status' }); this.root.append(this.status);
    this.makeCanvas(CW, CH);
    this.ammoEl = h('div', { class: 'tr-ammo' }); this.infoEl = h('div', { class: 'tr-info' });
    this.act = h('div', { class: 'tr-act' }, h('button', { class: 'btn sec', 'data-act': 'rules', onclick: () => this.showRules() }, '? Règles'), h('button', { class: 'btn sec', 'data-act': 'menu', onclick: () => this.menu() }, 'Menu'));
    this.root.append(this.ammoEl, this.infoEl, this.act);
    pidLink(this);
    this.onNet('tgo', m => { this.net.send('tgoack'); if (this.gone) return; this.gone = true; this.clearMessage(); this.startMatch(m.lv, m.mode); });
    this.onNet('tgoack', () => { this.acked = true; });
    this.onNet('tsn', m => this.recvSnap(m));
    this.onNet('tst', m => this.recvState(m));
    this.onNet('tfire', m => this.recvFire(m));
    this.onNet('taim', m => { this.aimOpp = m.d ? { dx: m.d[0], dy: m.d[1], t: performance.now() } : null; });
    this.wirePointer(); this.startGate(); this.loop(dt => this.update(dt));
  }
  /* ---------- Départ ---------- */
  startGate() {
    const text = RULES.join('\n'); this.opt = { lv: 0, mode: 'turn' };
    if (this.isHost) {
      this.message('Tour à abattre', text, [{ label: 'Commencer', onclick: () => this.hostGo() }]);
      const btn = this.msg.querySelector('button'); const p = this.msg.querySelector('p'); if (p) { p.style.whiteSpace = 'pre-line'; p.style.fontSize = '.92em'; }
      const row = (label, key, choices) => { const r = h('div', { class: 'row' }); const draw = () => r.replaceChildren(...choices.map(([v, lab]) => h('button', { class: 'btn ' + (this.opt[key] === v ? '' : 'sec'), 'data-opt': key + '=' + v, onclick: () => { this.opt[key] = v; draw(); } }, lab))); draw(); this.msg.insertBefore(h('div', { class: 'tr-opt' }, h('b', {}, label), r), btn); };
      row('Quelle tour ?', 'lv', LEVELS.map((L, i) => [i, L.name])); row('Comment on joue ?', 'mode', MODES);
    } else { this.message('Tour à abattre', text + '\nAttends que l\'autre lance.', []); const p = this.msg.querySelector('p'); if (p) { p.style.whiteSpace = 'pre-line'; p.style.fontSize = '.92em'; } }
  }
  hostGo() {
    if (this.gone) return; this.gone = true; const { lv, mode } = this.opt; this.net.send('tgo', { lv, mode }); this.clearMessage(); this.startMatch(lv, mode);
    if (!this.remi) { let n = 0; const iv = setInterval(() => { if (this.acked || ++n > 10 || !this.alive) clearInterval(iv); else this.net.send('tgo', { lv, mode }); }, 1500); this.sub(() => clearInterval(iv)); }
  }
  startMatch(lv, mode) {
    this.lv = lv; this.mode = mode; this.L = LEVELS[lv]; this.w = buildWorld(lv); this.started = true; this.over = false; this.credit = [0, 0]; this.prog = 0;
    const N = this.L.ammo, order = ['boulet', 'bombe', 'fleche', 'caillou', 'rebond']; const inv = {}; for (const k of AMMO_KEYS) inv[k] = 1; for (let i = 0; i < N - AMMO_KEYS.length; i++) inv[order[i % 5]]++;
    this.inv = [{ ...inv }, { ...inv }]; this.turn = ((this.opt && this.opt.first) || 0); this.busy = false; this.cool = [0, 0]; this.fx = []; this.shotAt = 0; this.sel = 'boulet';
    this.lastScore = 0; this.scoreT = 0; this.ai = null; this.aiT = 2; this.paintHud(); this.paintAmmo(); this.setStatus();
  }
  paint() { if (this.hudL && this.started) this.paintHud(); }
  total(seat) { return Object.values(this.inv[seat]).reduce((a, b) => a + b, 0); }
  names() { return [this.seat === 0 ? 'Toi' : this.oppA.name, this.seat === 1 ? 'Toi' : this.oppA.name]; }
  /* ---------- Entrées : glisser-lâcher ---------- */
  wirePointer() {
    const pos = e => { const r = this.cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * this.cv.width / r.width - this.ox) / this.sc, y: ((e.clientY - r.top) * this.cv.height / r.height - (this.oy2 || this.oy)) / this.sc }; };
    this.cv.addEventListener('pointerdown', e => { if (!this.canFire(this.seat)) { this.denied(); return; } e.preventDefault(); try { this.cv.setPointerCapture(e.pointerId); } catch {} const p = pos(e); this.aim = { x0: p.x, y0: p.y, dx: 0, dy: 0 }; this.sendAim(); });
    this.cv.addEventListener('pointermove', e => { if (!this.aim) return; const p = pos(e); this.aim.dx = p.x - this.aim.x0; this.aim.dy = p.y - this.aim.y0; this.sendAim(); });
    const up = e => { if (!this.aim) return; const a = this.aim; this.aim = null; this.net.send('taim', { d: null }); this.release(a); };
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', () => { this.aim = null; this.net.send('taim', { d: null }); });
  }
  sendAim() { const now = performance.now(); if (now - (this.aimSent || 0) < 90 || !this.aim) return; this.aimSent = now; this.net.send('taim', { d: [Math.round(this.aim.dx), Math.round(this.aim.dy)] }); }
  denied() { if (this.over || !this.started) return; if (!this.total(this.seat)) toast('Tu n\'as plus de projectile.'); else if (this.mode === 'turn' && this.turn !== this.seat) toast('Ce n\'est pas encore ton tour.'); else if (this.busy) toast('Attends que la tour se calme.'); else if (this.cool[this.seat] > 0) toast('Le lance-pierre se recharge…'); }
  /** Vecteur de tir (angle au-dessus de l'horizontale vers la tour, puissance 0..1) depuis le glissement du doigt. */
  aimVec(a) { const px = -a.dx / PULL_PX, py = a.dy / PULL_PX; const len = Math.hypot(px, py); return { ang: Math.atan2(py, px), pow: Math.min(1, len / DMAX), ok: px > 0.05 && len > 0.2 }; }
  release(a) {
    const v = this.aimVec(a); if (!v.ok || v.ang < 0.03 || v.ang > 1.5) { if (Math.hypot(a.dx, a.dy) > 8) toast('Tire vers l\'arrière et vers le bas pour lancer vers la tour.'); return; }
    this.tryFire(this.sel, v.ang, v.pow);
  }
  /** Tir du joueur de ce téléphone. */
  tryFire(type, ang, pow) {
    if (!this.canFire(this.seat) || !(this.inv[this.seat][type] > 0)) return false;
    if (this.isHost) return this.fire(this.seat, type, ang, pow);
    const n = ++this.shotN; this.pendingFire = { n, type, ang, pow }; this.sendFire(); this.inv[this.seat][type]--; this.busy = true; this.cool[this.seat] = 1.2; this.paintAmmo();
    let k = 0; const iv = setInterval(() => { if (!this.alive || this.gotN[1] >= n || ++k > 8) clearInterval(iv); else this.sendFire(); }, 900); this.sub(() => clearInterval(iv)); return true;
  }
  sendFire() { const f = this.pendingFire; if (f) this.net.send('tfire', f); }
  canFire(seat) {
    if (!this.started || this.over || this.ending) return false; if (!this.total(seat)) return false;
    if (this.mode === 'turn') return this.turn === seat && !this.busy; return this.cool[seat] <= 0;
  }
  recvFire(m) {
    if (!this.isHost || !this.started || this.over) return; if ((m.n | 0) <= this.gotN[1]) return; if (!AMMO[m.type]) return;
    if (this.fire(1, m.type, clamp(+m.ang || 0.5, 0.03, 1.5), clamp(+m.pow || 0.5, 0.15, 1))) this.gotN[1] = m.n | 0; else if (!this.canFire(1) && this.gotN[1] < (m.n | 0)) { this.gotN[1] = m.n | 0; this.sendState(); }
  }
  /** Hôte : lance vraiment le projectile dans la simulation. */
  fire(seat, type, ang, pow) {
    if (!this.canFire(seat) || !(this.inv[seat][type] > 0)) return false;
    this.inv[seat][type]--; this.w.shoot(seat, type, ang, pow); this.busy = this.mode === 'turn'; this.cool[seat] = 1.2; this.shotAt = this.w.t; this.lastShooter = seat;
    this.paintAmmo(); this.setStatus(); this.sendState(); return true;
  }
  /* ---------- Boucle ---------- */
  update(dt) {
    if (!this.started) { this.draw(dt); return; }
    for (let i = 0; i < 2; i++) this.cool[i] = Math.max(0, this.cool[i] - dt);
    if (this.isHost) this.hostStep(dt); else this.guestStep(dt);
    this.draw(dt);
  }
  hostStep(dt) {
    if (!this.over) {
      this.acc += Math.min(dt, 0.05); let n = 0; while (this.acc >= DT && n++ < 8) { this.w.step(); this.acc -= DT; }
      this.scoreT += dt; if (this.scoreT > 0.2) { this.scoreT = 0; const s = score(this.w), d = s - this.lastScore; if (d > 0 && this.w.lastHit >= 0 && !this.w.latched) this.credit[this.w.lastHit] += d; this.lastScore = Math.min(s, 49); }
      this.drainEvents(this.w.events.splice(0));
      const p = this.w.progress(); this.prog = Math.min(1, p.frac / this.w.thr); this.paintProg();
      if (this.w.latched && !this.ending) { this.ending = true; const by = this.w.finalBy >= 0 ? this.w.finalBy : (this.lastShooter || 0); this.endT = 1.6; this.result = { w: by, why: 'fall' }; this.sendState(); }
      if (this.ending) { this.endT -= dt; if (this.endT <= 0) this.endNow(this.result); }
      else this.turnLogic(dt);
      this.snapT += dt; if (this.snapT > 1 / 15 && !this.remi) { this.snapT = 0; this.sendSnap(); }
      this.stT += dt; if (this.stT > 0.7 && !this.remi) { this.stT = 0; this.sendState(); }
      if (this.remi) this.remiThink(dt);
    }
    this.fx = this.fx.filter(f => (f.t += dt) < f.d);
  }
  turnLogic(dt) {
    const calm = this.w.calm() || (this.w.t - this.shotAt > 8) || (!this.w.bodies.some(b => b.proj) && this.w.speedMax() < 0.3 && this.w.t - this.shotAt > 1);
    if (this.mode === 'turn') {
      if (this.busy && calm) {
        this.busy = false; const o = 1 - this.turn;
        if (this.total(o)) this.turn = o; else if (!this.total(this.turn)) { this.finishOut(); return; }
        this.setStatus(); this.sendState();
      }
      if (!this.busy && !this.total(0) && !this.total(1)) this.finishOut();
    } else if (!this.total(0) && !this.total(1) && calm && this.w.t - this.shotAt > 1) this.finishOut();
  }
  /** Plus de projectiles et la tour tient encore : le plus de dégâts gagne. */
  finishOut() {
    if (this.ending) return; this.ending = true; this.endT = 0.4; const [a, b] = this.credit; this.result = a === b ? { w: 'd', why: 'out' } : { w: a > b ? 0 : 1, why: 'out' }; this.sendState();
  }
  endNow(r) {
    if (this.over || this.finished) return; this.sendState(); this.showEnd(r);
  }
  showEnd(r) {
    if (this.finished) return; this.finished = true; const win = r.w === this.seat; const names = this.names();
    const txt = r.why === 'fall' ? (win ? 'Ton tir a fait tomber la tour !' : names[r.w] + ' a fait tomber la tour.') : r.w === 'd' ? 'Les projectiles sont finis et vous avez fait autant de dégâts. Égalité.' : (win ? 'Les projectiles sont finis : tu as fait le plus de dégâts.' : 'Les projectiles sont finis : l\'autre a fait le plus de dégâts.');
    saves.result(this.ctx.gameId, oppOf(this), r.w === 'd' ? 'd' : win ? 'w' : 'l');
    if (r.w === 'd') { this.over = true; this.record(false); this.s.sfx('ok'); this.message('Égalité !', txt, [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]); } else this.finish(win, txt);
    this.setStatus();
  }
  menu() {
    modal('Menu', [h('p', {}, 'Que veux-tu faire ?')], [{ label: 'Continuer', cls: '' }, { label: 'Règles', cls: 'sec', onclick: () => { this.showRules(); return false; } },
      { label: 'Recommencer', cls: 'sec', onclick: () => { if (this.remi) this.ctx.restart(); else { this.askReplay(); } } }, { label: 'Quitter la partie', cls: 'warn', onclick: () => this.ctx.exit() }]);
  }
  showRules() { modal('Tour à abattre', [...RULES.map((t, i) => h('div', { class: 'stepline' }, h('span', { class: 'num' }, String(i + 1)), h('span', {}, t))), ...AMMO_KEYS.map(k => h('div', { class: 'mut' }, AMMO[k].name + ' : ' + AMMO[k].info))], [{ label: 'OK' }]); }
  /* ---------- Réseau ---------- */
  sendState() {
    if (this.remi || !this.isHost) return;
    this.net.send('tst', { turn: this.turn, busy: this.busy, inv: this.inv, prog: this.prog, credit: this.credit.map(x => Math.round(x * 10) / 10), gn: this.gotN[1], over: this.over, end: this.ending ? this.result : null, mode: this.mode, lv: this.lv });
  }
  recvState(m) {
    if (!this.started) return; this.turn = m.turn; this.credit = m.credit; this.gotN[1] = Math.max(this.gotN[1], m.gn || 0);
    const pend = this.pendingFire && this.gotN[1] < this.pendingFire.n; // mon tir est parti mais l'hôte ne l'a pas encore compté : je garde mon stock local
    if (pend) this.inv[0] = m.inv[0]; else this.inv = m.inv;
    this.busy = m.busy || (pend && this.mode === 'turn'); this.prog = m.prog; this.paintProg(); this.paintAmmo(); this.setStatus();
    if (m.end && !this.over && !this.endSeen) { this.endSeen = true; this.ending = true; this.result = m.end; setTimeout(() => this.alive && this.showEnd(m.end), 1700); }
  }
  sendSnap() {
    const out = []; for (const b of this.w.bodies) { if (b.st) continue; out.push(b.proj ? [b.id, Math.round(b.x * 100), Math.round(b.y * 100), Math.round(b.a * 100), 0, TCODE.indexOf(b.type), b.owner] : [b.id, Math.round(b.x * 100), Math.round(b.y * 100), Math.round(b.a * 100), Math.round(Math.min(1, b.dmg / b.hp) * 100)]); }
    this.net.send('tsn', { b: out, e: this.evOut.splice(0), wt: this.w.t });
  }
  get evOut() { return this._ev || (this._ev = []); }
  recvSnap(m) {
    if (!this.started || this.isHost) return; const seen = new Set();
    for (const e of m.b) {
      seen.add(e[0]); let b = this.w.byId(e[0]);
      if (!b && e.length > 5) { const T = TCODE[e[5]]; if (!T) continue; b = ball(T, e[1] / 100, e[2] / 100, 0, 0, e[6]); b.id = e[0]; b.tx = e[1] / 100; b.ty = e[2] / 100; b.x = b.tx; b.y = b.ty; this.w.add(b); }
      if (!b) continue; b.tx = e[1] / 100; b.ty = e[2] / 100; b.ta = e[3] / 100; if (!b.proj) b.dmg = (e[4] / 100) * b.hp; b.seen = performance.now();
    }
    for (const b of [...this.w.bodies]) if (!b.st && !seen.has(b.id) && this.snapOnce) { this.w.bodies = this.w.bodies.filter(x => x !== b); if (b.str) { b.broken = true; this.w.removed.push(b); } }
    this.snapOnce = true; for (const e of m.e || []) this.playEvent(e);
  }
  guestStep(dt) {
    const k = 1 - Math.exp(-dt * 22);
    for (const b of this.w.bodies) { if (b.tx === undefined) continue; b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k; b.a += (b.ta - b.a) * k; b.c = Math.cos(b.a); b.s = Math.sin(b.a); }
    this.fx = this.fx.filter(f => (f.t += dt) < f.d); this.paintProg();
  }
  drainEvents(evs) { for (const e of evs) { this.playEvent(e); if (!this.remi) this.evOut.push(e); } }
  playEvent(e) {
    if (e.t === 'break') { this.fx.push({ k: 'debris', m: e.m, x: e.x, y: e.y, t: 0, d: 1.1, w: e.w, h: e.h }); (e.m === 'pierre' ? boom.thud : boom.crack)(this.s); }
    else if (e.t === 'boom') { this.fx.push({ k: 'boom', x: e.x, y: e.y, t: 0, d: 0.8, r: e.r }); boom.big(this.s); this.s.vibrate(60); }
    else if (e.t === 'shot') { this.s.sfx('tick'); this.fx.push({ k: 'puff', x: e.x, y: e.y, t: 0, d: 0.4 }); }
    else if (e.t === 'hit') { if (e.J > 3) boom.thud(this.s); this.fx.push({ k: 'spark', x: e.x, y: e.y, t: 0, d: 0.3 }); }
    else if (e.t === 'fall') { this.s.sfx('win'); }
  }
  /* ---------- Rémi (solo) ---------- */
  remiThink(dt) {
    if (this.ending || this.over) return; const seat = 1;
    if (!this.ai) {
      if (!this.canFire(seat)) return; this.aiT -= dt; if (this.aiT > 0) return;
      const types = AMMO_KEYS.filter(k => this.inv[seat][k] > 0); if (!types.length) return;
      this.ai = { n: Math.max(2, Math.round(lerp(2, 9))), i: 0, best: null, types }; return;
    }
    for (let k = 0; k < 2 && this.ai.i < this.ai.n; k++, this.ai.i++) {
      const tg = this.w.bodies.filter(b => b.str && !b.dead), t = tg.length ? tg[(Math.random() * tg.length) | 0] : null; if (!t) break;
      const type = this.ai.types[(Math.random() * this.ai.types.length) | 0], pow = 0.6 + Math.random() * 0.4, ang = aimAt(type, pow, Math.abs(t.x - SLING_X[seat]), t.y - SLING_Y, Math.random() < 0.7);
      if (ang == null) continue; const r = tryShot(this.w, seat, type, ang, pow, 3.5); if (!this.ai.best || r.score > this.ai.best.score) this.ai.best = { score: r.score, type, ang, pow };
    }
    if (this.ai.i >= this.ai.n) {
      const b = this.ai.best; this.ai = null; this.aiT = this.mode === 'turn' ? 0.8 : lerp(7, 3) + Math.random() * 2; if (!b) return;
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; const ang = clamp(b.ang + g() * lerp(0.1, 0.018), 0.05, 1.45), pow = clamp(b.pow + g() * lerp(0.1, 0.02), 0.3, 1);
      this.remiAim = { t: 0, ang, pow }; this.remiShot = { type: b.type, ang, pow, at: 0.55 };
    }
  }
  /* ---------- Affichage HUD ---------- */
  paintHud() {
    const nm = this.names(), me = this.seat, o = 1 - me; const on = s => this.mode === 'turn' && this.turn === s && !this.over;
    const one = (el, s) => { el.className = 'pl' + (s === o ? ' r' : '') + (on(s) ? ' on' : ''); el.replaceChildren(h('b', {}, nm[s]), h('span', {}, this.total(s) + (this.total(s) > 1 ? ' projectiles' : ' projectile'))); };
    one(this.hudL, me); one(this.hudR, o);
  }
  paintProg() { const p = Math.round(this.prog * 100); this.barI.style.width = p + '%'; this.progT.textContent = 'Écroulement : ' + p + ' %' + (p >= 100 ? ' — la tour tombe !' : ''); }
  paintAmmo() {
    this.paintHud(); const inv = this.inv[this.seat];
    if (!(inv[this.sel] > 0)) this.sel = AMMO_KEYS.find(k => inv[k] > 0) || this.sel;
    this.ammoEl.replaceChildren(...AMMO_KEYS.map(k => h('button', { class: this.sel === k ? 'on' : '', 'data-type': k, disabled: !(inv[k] > 0), 'aria-label': AMMO[k].name, onclick: () => { this.sel = k; this.paintAmmo(); this.s.sfx('tick'); } }, h('b', {}, String(inv[k] || 0)), SHORT[k])));
    this.infoEl.textContent = AMMO[this.sel].name + ' — ' + AMMO[this.sel].info;
  }
  setStatus() {
    if (!this.started) return; let t = '', cls = '';
    if (this.over) t = ''; else if (this.ending) t = 'La tour s\'écroule !'; else if (this.mode === 'turn') { if (this.busy) { t = 'Les pièces bougent…'; cls = 'wait'; } else if (this.turn === this.seat) t = this.total(this.seat) ? 'À toi : glisse le doigt vers l\'arrière et lâche' : 'Plus de projectile'; else { t = (this.remi ? 'Rémi' : this.oppA.name) + ' vise…'; cls = 'wait'; } }
    else t = this.total(this.seat) ? 'Tire quand tu veux (le lance-pierre se recharge un instant)' : 'Plus de projectile : regarde la tour';
    this.status.textContent = t; this.status.className = 'tr-status ' + cls;
  }
  /* ---------- Dessin ---------- */
  lx(x) { return this.mirror ? WORLD_W - x : x; }
  sx(x) { return this.lx(x) * PPM; } sy(y) { return GY - y * PPM; }
  draw(dt) {
    if (!this.sc) return; super.begin(); const g = this.g; g.restore(); g.save(); this.oy2 = this.cv.height - CH * this.sc; g.setTransform(this.sc, 0, 0, this.sc, this.ox, this.oy2); this.drawBack(g);
    if (this.w) {
      for (const b of this.w.bodies) if (b.k === 'box' && !b.ground) this.drawBox(g, b);
      this.drawSlings(g);
      for (const b of this.w.bodies) if (b.proj) this.drawProj(g, b);
      if (this.aim) this.drawAim(g);
    } else this.drawSlings(g);
    this.drawFx(g);
    if (this.remiShot) { const r = this.remiShot; r.at -= dt; if (r.at <= 0) { this.remiShot = null; this.remiAim = null; if (!this.over) this.fire(1, r.type, r.ang, r.pow); } }
    this.endDraw();
  }
  drawBack(g) {
    const top = -(this.oy2 || 0) / this.sc - 4, wide = this.ox / this.sc + 4; const sky = g.createLinearGradient(0, top, 0, GY); sky.addColorStop(0, '#3f9cf0'); sky.addColorStop(0.65, '#bfe6ff'); sky.addColorStop(1, '#ffe9b8'); g.fillStyle = sky; g.fillRect(-wide, top, CW + wide * 2, GY - top + 2);
    g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(300, 54, 24, 0, 7); g.fill(); g.fillStyle = '#fff6c855'; g.beginPath(); g.arc(300, 54, 38, 0, 7); g.fill();
    g.fillStyle = '#ffffffcc'; for (const [x, y, s] of [[60, 70, 1], [190, 110, 1.3], [320, 150, .8]]) { g.beginPath(); g.ellipse(x, y, 30 * s, 10 * s, 0, 0, 7); g.ellipse(x + 18 * s, y - 6 * s, 20 * s, 9 * s, 0, 0, 7); g.ellipse(x - 16 * s, y - 4 * s, 18 * s, 8 * s, 0, 0, 7); g.fill(); }
    const hz = GY - 72; g.fillStyle = '#2a8fd6'; g.fillRect(-wide, hz, CW + wide * 2, GY - hz); g.fillStyle = '#ffffff55'; for (let x = 6; x < CW; x += 38) g.fillRect(x, hz + 6 + (x % 3) * 5, 18, 2);
    g.fillStyle = '#3a7a4a'; g.beginPath(); g.moveTo(0, hz); g.quadraticCurveTo(40, hz - 26, 90, hz); g.fill(); g.beginPath(); g.moveTo(250, hz); g.quadraticCurveTo(310, hz - 34, 360, hz); g.fill();
    g.fillStyle = '#e8c985'; g.fillRect(-wide, GY, CW + wide * 2, CH - GY + 4); const sg = g.createLinearGradient(0, GY, 0, CH); sg.addColorStop(0, '#f0d695'); sg.addColorStop(1, '#c9a35a'); g.fillStyle = sg; g.fillRect(-wide, GY, CW + wide * 2, CH - GY + 4);
    g.fillStyle = '#b88c46'; g.fillRect(-wide, GY, CW + wide * 2, 3); g.fillStyle = '#d8b46c'; for (let x = 10; x < CW; x += 47) { g.beginPath(); g.ellipse(x, GY + 22 + (x % 5) * 6, 7, 2.5, 0, 0, 7); g.fill(); }
  }
  drawSlings(g) {
    for (const seat of [0, 1]) {
      const x = this.sx(SLING_X[seat]), y = this.sy(SLING_Y), mine = seat === this.seat;
      let d = null; if (mine) d = this.aim ? { dx: this.aim.dx, dy: this.aim.dy } : null; else if (this.remi) d = this.remiPullDisplay(seat); else if (this.aimOpp && performance.now() - this.aimOpp.t < 600) d = { dx: -this.aimOpp.dx, dy: this.aimOpp.dy };
      let px = x, py = y; if (d) { const m = Math.hypot(d.dx, d.dy) / PULL_PX, k = Math.min(1, DMAX / (m || 1)); px = x + d.dx / PULL_PX * k * PPM; py = y + d.dy / PULL_PX * k * PPM; }
      // poteau
      g.fillStyle = '#7a4a22'; g.fillRect(x - 6, y + 2, 12, GY - y - 2); g.fillStyle = '#9a6a38'; g.fillRect(x - 6, y + 2, 4, GY - y - 2); g.fillStyle = '#4a2c10'; g.fillRect(x - 12, GY - 4, 24, 6);
      g.strokeStyle = '#7a4a22'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x - 10, y - 16); g.moveTo(x, y + 4); g.lineTo(x + 10, y - 16); g.stroke();
      g.strokeStyle = '#2a1608'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 10, y - 16); g.lineTo(px, py); g.lineTo(x + 10, y - 16); g.stroke();
      g.fillStyle = '#5a3a1a'; g.beginPath(); g.ellipse(px, py, 7, 5, 0, 0, 7); g.fill();
      g.fillStyle = mine ? '#0b6b55' : '#6b1a2a'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillText(mine ? 'TOI' : (this.remi ? 'RÉMI' : this.oppA.name.toUpperCase().slice(0, 8)), x, GY + 20);
      if (mine && d && this.sel && this.canFire(seat)) this.drawDots(g, x, y, d);
    }
  }
  remiPullDisplay(seat) { if (seat !== 1 || !this.remiAim) return null; const r = this.remiAim; r.t += 0.016; const k = Math.min(1, r.t / 0.5), len = r.pow * DMAX * PULL_PX * k; return { dx: Math.cos(r.ang) * len, dy: Math.sin(r.ang) * len }; }
  drawDots(g, x, y, d) {
    const v = this.aimVec(d); if (!v.ok) return; const T = AMMO[this.sel], sp = T.k * DMAX * Math.max(0.15, v.pow), vx = Math.cos(v.ang) * sp, vy = Math.sin(v.ang) * sp;
    const n = Math.round(lerp(30, 7)); g.fillStyle = '#ffffffcc'; for (let i = 1; i <= n; i++) { const t = i * 0.07; const wx = SLING_X[this.seat] + (this.mirror ? -1 : 1) * vx * t, wy = SLING_Y + vy * t - 4.9 * t * t; if (wy < 0) break; g.beginPath(); g.arc(this.sx(wx), this.sy(wy), 2.6 - i * 0.04, 0, 7); g.fill(); }
  }
  drawAim(g) { /* le tracé est fait par drawSlings */ }
  drawBox(g, b) {
    const w = b.hw * 2 * PPM, hh = b.hh * 2 * PPM, x = this.sx(b.x), y = this.sy(b.y); g.save(); g.translate(x, y); g.rotate(this.mirror ? b.a : -b.a);
    const d = Math.min(1, b.dmg / b.hp), M = b.mat; g.lineJoin = 'round';
    if (M === 'bois') { const gr = g.createLinearGradient(0, -hh / 2, 0, hh / 2); gr.addColorStop(0, '#c48a4a'); gr.addColorStop(1, '#8e5a26'); g.fillStyle = gr; g.fillRect(-w / 2, -hh / 2, w, hh); g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.beginPath(); if (w > hh) for (let k = -hh / 2 + 4; k < hh / 2 - 1; k += 5) { g.moveTo(-w / 2 + 2, k); g.lineTo(w / 2 - 2, k + 1); } else for (let k = -w / 2 + 4; k < w / 2 - 1; k += 5) { g.moveTo(k, -hh / 2 + 2); g.lineTo(k + 1, hh / 2 - 2); } g.stroke(); g.strokeStyle = '#4a2c10'; g.lineWidth = 1.6; g.strokeRect(-w / 2, -hh / 2, w, hh); g.fillStyle = '#3a2410'; const nl = Math.max(w, hh) > 30; if (nl) { for (const s of [-1, 1]) { g.beginPath(); g.arc(w > hh ? s * (w / 2 - 4) : 0, w > hh ? 0 : s * (hh / 2 - 4), 1.5, 0, 7); g.fill(); } } }
    else if (M === 'pierre') { const gr = g.createLinearGradient(0, -hh / 2, 0, hh / 2); gr.addColorStop(0, '#b4bac4'); gr.addColorStop(1, '#7c838f'); g.fillStyle = gr; g.fillRect(-w / 2, -hh / 2, w, hh); g.strokeStyle = '#4a505c'; g.lineWidth = 2; g.strokeRect(-w / 2, -hh / 2, w, hh); g.lineWidth = 1; g.beginPath(); if (w > 30) { g.moveTo(-w / 6, -hh / 2); g.lineTo(-w / 6, 0); g.moveTo(w / 5, 0); g.lineTo(w / 5, hh / 2); } g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.stroke(); g.fillStyle = '#ffffff33'; g.fillRect(-w / 2 + 2, -hh / 2 + 2, w - 4, 3); }
    else if (M === 'verre') { g.fillStyle = '#bfeeff66'; g.fillRect(-w / 2, -hh / 2, w, hh); g.strokeStyle = '#eafcff'; g.lineWidth = 2; g.strokeRect(-w / 2, -hh / 2, w, hh); g.strokeStyle = '#ffffffcc'; g.lineWidth = 2; g.beginPath(); g.moveTo(-w / 2 + 3, hh / 2 - 3); g.lineTo(-w / 2 + Math.min(w, hh) * 0.6, -hh / 2 + 3); g.stroke(); g.strokeStyle = '#6fb6d0'; g.lineWidth = 1; g.strokeRect(-w / 2 - 1, -hh / 2 - 1, w + 2, hh + 2); }
    else { const gr = g.createLinearGradient(0, -hh / 2, 0, hh / 2); gr.addColorStop(0, '#e6f6ffcc'); gr.addColorStop(1, '#9ad2f0cc'); g.fillStyle = gr; g.fillRect(-w / 2, -hh / 2, w, hh); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(-w / 2, -hh / 2, w, hh); g.strokeStyle = '#5aa0c8'; g.lineWidth = 1; g.strokeRect(-w / 2 - 1, -hh / 2 - 1, w + 2, hh + 2); g.fillStyle = '#ffffff'; g.fillRect(-w / 2 + 3, -hh / 2 + 3, Math.min(w, 8), 2); }
    if (d > 0.25) { const r = rng(b.id * 7919); g.strokeStyle = M === 'verre' ? '#ffffffee' : '#2a1608cc'; g.lineWidth = 1.4; const n = d > 0.6 ? 3 : 2; for (let i = 0; i < n; i++) { g.beginPath(); let cx = (r() - .5) * w * .6, cy = (r() - .5) * hh * .6; g.moveTo(cx, cy); for (let k = 0; k < 3; k++) { cx += (r() - .5) * w * .5; cy += (r() - .5) * hh * .5; g.lineTo(cx, cy); } g.stroke(); } }
    g.restore();
  }
  drawProj(g, b) {
    const x = this.sx(b.x), y = this.sy(b.y), r = b.r * PPM; g.save(); g.translate(x, y);
    if (b.type === 'boulet') { if (!MER.sprC(g, 'ball', 0, 0, r * 2.2)) { g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); } }
    else if (b.type === 'bombe') { if (!MER.sprC(g, 'bomb', 0, 0, r * 2.6)) { g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); } }
    else if (b.type === 'rebond') { const gr = g.createRadialGradient(-r * .3, -r * .3, 1, 0, 0, r); gr.addColorStop(0, '#ffb0a0'); gr.addColorStop(1, '#d02a2a'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.strokeStyle = '#7a1010'; g.lineWidth = 1.5; g.stroke(); g.strokeStyle = '#ffffff99'; g.beginPath(); g.arc(0, 0, r * .62, 0.4, 2.2); g.stroke(); }
    else if (b.type === 'caillou') { g.fillStyle = '#8c8f98'; g.beginPath(); g.ellipse(0, 0, r * 1.1, r, b.a, 0, 7); g.fill(); g.strokeStyle = '#4a505c'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#ffffff55'; g.beginPath(); g.arc(-r * .3, -r * .3, r * .3, 0, 7); g.fill(); }
    else { g.rotate(this.projAngle(b)); g.fillStyle = '#d9dee6'; g.beginPath(); g.moveTo(r * 3.2, 0); g.lineTo(r * 1.4, -r * 1.2); g.lineTo(r * 1.4, r * 1.2); g.fill(); g.strokeStyle = '#6b4a22'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-r * 3, 0); g.lineTo(r * 1.5, 0); g.stroke(); g.fillStyle = '#e04a4a'; g.beginPath(); g.moveTo(-r * 3, 0); g.lineTo(-r * 4, -r * 1.4); g.lineTo(-r * 2.2, 0); g.lineTo(-r * 4, r * 1.4); g.fill(); }
    g.restore();
  }
  /** Angle d'affichage (écran) d'un projectile : sa direction de vol. */
  projAngle(b) { const vx = this.isHost ? b.vx : (b.tx - b.x) * 15, vy = this.isHost ? b.vy : (b.ty - b.y) * 15; if (Math.hypot(vx, vy) > 0.5) b.dirA = Math.atan2(-vy, (this.mirror ? -1 : 1) * vx); return b.dirA || 0; }
  drawFx(g) {
    for (const f of this.fx) {
      const k = f.t / f.d, x = this.sx(f.x), y = this.sy(f.y);
      if (f.k === 'boom') { g.globalAlpha = 1 - k; const s = (f.r || 2) * PPM * (0.8 + k * 0.6); MER.sprC(g, k < 0.5 ? 'x1' : 'x2', x, y, s); g.globalAlpha = Math.max(0, 0.7 - k); MER.sprC(g, 'smoke', x, y - k * 20, s * 0.7); g.globalAlpha = 1; }
      else if (f.k === 'debris') { g.globalAlpha = 1 - k * k; if (f.m === 'bois') MER.sprC(g, 'debris', x, y + k * 10, Math.max(f.w, f.h) * PPM * (1 + k * 0.5)); else { const col = { pierre: '#9aa0aa', verre: '#bfeeff', glace: '#dff3ff' }[f.m] || '#aaa'; g.fillStyle = col; const r = rng((f.x * 1000) | 0); for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = (8 + r() * 26) * k; g.fillRect(x + Math.cos(a) * d * (f.w > f.h ? 1.6 : 1), y + Math.sin(a) * d + k * k * 30, 4, 4); } } g.globalAlpha = 1; }
      else if (f.k === 'puff') { g.globalAlpha = (1 - k) * 0.6; MER.sprC(g, 'smoke', x, y, 16 + k * 14); g.globalAlpha = 1; }
      else if (f.k === 'spark') { g.globalAlpha = 1 - k; g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(x, y, 3 + k * 8, 0, 7); g.fill(); g.globalAlpha = 1; }
    }
  }
}
export default { id: 'tour', name: 'Tour à abattre', short: 'Lance-pierres à deux : fais tomber la tour d\'un dernier tir.', how: RULES, create: ctx => new Tour(ctx) };
