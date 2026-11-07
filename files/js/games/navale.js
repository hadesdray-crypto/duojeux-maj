// Bataille navale pirate : chacun place sa flotte en secret, puis on tire au canon chacun son tour. Vue de dessus.
import { TurnGame, pick } from '../core/boardkit.js';
import { saves, oppOf, resumeProtocol, newId } from '../core/saves.js';
import { N, SHIPS, canPlace, cellsOf, randomFleet, resolve, fleetValid, aiShot } from './navale_engine.js';
import { h, toast, modal } from '../core/util.js';
import { level } from '../core/level.js';
import { css } from '../core/winfx.js';
import { uiEl } from '../core/uisprites.js';

css('navale', `
.nv-wrap{--nb:min(calc(100vw - 24px),max(170px,calc(100dvh - 470px)),520px);display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
.nv-grid{display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr);width:var(--nb);height:var(--nb);border-radius:8px;overflow:hidden;border:3px solid #c9a227;box-shadow:0 4px 12px #000a;background:#0b3a66;user-select:none;-webkit-user-select:none}
.nv-grid.mini{width:min(150px,38vw);height:min(150px,38vw);border-width:2px}
.nv-c{position:relative;background:linear-gradient(135deg,#1c6fae,#12528a);border:1px solid #0b3a6666;touch-action:manipulation;cursor:pointer}
.nv-c.s{background:linear-gradient(180deg,#a9733a,#7a4a22);border:1px solid #3e2410}
.nv-c.s.hz.f{border-radius:50% 0 0 50%/50% 0 0 50%}.nv-c.s.hz.e{border-radius:0 50% 50% 0/0 50% 50% 0}
.nv-c.s.vt.f{border-radius:50% 50% 0 0/50% 50% 0 0}.nv-c.s.vt.e{border-radius:0 0 50% 50%/0 0 50% 50%}
.nv-c.prev{background:#27e0b366}.nv-c.bad{background:#ff547066}
.nv-c .miss{position:absolute;inset:26%;border-radius:50%;border:3px solid #ffffffcc;box-shadow:0 0 0 3px #ffffff44;animation:bkpop .3s}
.nv-c .hit{position:absolute;inset:12%;border-radius:50%;background:radial-gradient(circle,#fff7a0 0,#ffa31a 38%,#e0203f 70%,#e0203f00 100%);animation:bkpulse .8s infinite}
.nv-c.sunk{background:linear-gradient(180deg,#4a2e1a,#2a170a)}
.nv-c.sunk .hit{background:radial-gradient(circle,#ff8a3a 0,#8a1020 55%,#00000000 100%)}
.nv-c.last{box-shadow:inset 0 0 0 3px #ffe45a}
.nv-lab{font-weight:800;font-size:.85em;color:var(--mut)}
.nv-tray{display:flex;gap:4px;width:min(calc(100vw - 16px),520px);justify-content:center;flex-wrap:nowrap}
.nv-ship{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:48px;min-width:0;flex:1 1 0;padding:4px 3px;border-radius:12px;border:3px solid #7a5a10;background:#f3dfa8;color:#3e2410;font-weight:800;font-size:.64em;box-sizing:border-box;overflow-wrap:anywhere;hyphens:auto;text-align:center}
.nv-ship.on{border-color:#27e0b3;background:#d6f7e9}.nv-ship.done{opacity:.45}
.nv-ship i{display:flex;gap:1px}.nv-ship i b{width:9px;height:9px;background:#7a4a22;border-radius:2px}
.nv-btns{display:flex;gap:6px;width:var(--nb)}.nv-btns .btn{flex:1;min-width:0;min-height:50px;padding:6px 4px;font-size:.9em}
`);

const HOW = ['Place ta flotte en secret : 5 bateaux. Touche un bateau, puis la case où le poser. « Tourner » change le sens.', 'Quand les deux flottes sont prêtes, on tire au canon chacun son tour : touche une case de la mer ennemie.', 'Éclaboussure = raté. Flamme = touché. Coule tous les bateaux de l\'autre pour gagner !'];
const NOENG = { init: () => ({ t: 0 }), turn: s => s.t, moves: () => [], apply: s => s, result: () => null, ai: () => null, key: () => '' };

class Navale extends TurnGame {
  constructor(ctx) {
    super(ctx, { title: 'Bataille navale', sideNames: ['Flotte', 'Flotte'], engine: NOENG, how: HOW });
    this.onNet('rdy', () => { this.oppReady = true; this.seen(); this.tryStartBattle(); });
    this.onNet('shot', m => this.recvShot(m));
    this.onNet('res', m => this.recvRes(m));
  }
  begin(seed, opt, gid) {
    this.opt = opt; this.seed = seed; this.seen(); this.gid = gid || newId(); this.created = Date.now(); this.mySide = (this.isHost === (seed % 2 === 0)) ? 0 : 1; this.state = { t: 0 };
    this.phase = 'place'; this.fleet = []; this.horiz = true; this.selLen = -1; this.ready = false; this.oppReady = this.oppReady || false; this.battle = false;
    this.view = new Array(100).fill(0); this.inc = new Array(100).fill(0); this.shots = new Set(); this.myShots = new Set(); this.done = new Map(); this.nShot = 0; this.pending = null; this.waiting = false;
    this.oppSunk = []; this.mySunk = 0; this.stage.replaceChildren(); this.buildPlace(); this.update(true);
    if (this.remi) { this.oppReady = true; this.remiFleet = randomFleet(); this.remiShots = new Set(); }
  }
  /* ---------- Sauvegarde et reprise (la flotte reste secrète : chaque téléphone ne garde que la sienne) ---------- */
  gameLabel() { return 'Bataille en mer'; }
  hasProgress() { return !!this.battle; }
  saveNow() {
    if (!this.battle || this.over || !this.gid) return;
    saves.put({ id: this.gid, game: 'navale', kind: 'navale', opp: oppOf(this), mySide: this.mySide, seed: this.seed, opt: this.opt, created: this.created || Date.now(),
      fleet: this.fleet, view: this.view, inc: this.inc, shots: [...this.shots], myShots: [...this.myShots], done: [...this.done], nShot: this.nShot, oppSunk: this.oppSunk, pending: this.pending, t: this.state.t,
      turn: this.state.t === this.mySide ? 'me' : 'opp', label: (this.nShot + this.shots.size) + ' tirs', remi: this.remi ? { fleet: this.remiFleet, view: this.rView || null, sunk: this.rSunk || [] } : null,
      n: this.nShot + this.shots.size, h: '' });
  }
  initResume() {
    this.rp = resumeProtocol(this, {
      mine: rec => ({ fired: rec.nShot, recv: rec.shots.length, side: rec.mySide }),
      decide: (rec, info) => {
        if (this.remi) return { ok: true, final: {} };
        if (info.side === rec.mySide) return { ok: false, why: 'side' };
        const d1 = rec.nShot - info.recv, d2 = info.fired - rec.shots.length;
        if (d1 < 0 || d1 > 1 || d2 < 0 || d2 > 1) return { ok: false, why: 'far' };
        return { ok: true, final: {}, note: (d1 || d2) ? 'Un tir était en route quand la partie s\'est arrêtée : il est renvoyé.' : '' };
      },
      load: (rec, final, note) => this.loadResume(rec, final, note),
    });
  }
  loadResume(rec, final, note) {
    if (this.gone) return; this.gone = true; this.clearMessage(); this.seen();
    this.opt = rec.opt; this.seed = rec.seed; this.mySide = rec.mySide; this.gid = rec.id; this.created = rec.created; this.state = { t: rec.t };
    this.fleet = rec.fleet; this.view = rec.view; this.inc = rec.inc; this.shots = new Set(rec.shots); this.myShots = new Set(rec.myShots); this.done = new Map(rec.done); this.nShot = rec.nShot; this.oppSunk = rec.oppSunk || [];
    this.mySunk = 0; this.ready = true; this.oppReady = true; this.battle = true; this.phase = 'battle'; this.pending = null; this.waiting = false; this.horiz = true;
    if (this.remi) { this.remiFleet = rec.remi.fleet; this.remiShots = new Set(this.myShots); this.rView = rec.remi.view || undefined; this.rSunk = rec.remi.sunk; }
    this.stage.replaceChildren(); this.buildBattle(); this.update(true);
    if (rec.pending && !this.remi) { const { i, n } = rec.pending; this.waiting = true; this.pending = { i, n }; this.lastShot = i; this.net.send('shot', { i, n });
      const iv = setInterval(() => { if (!this.pending || this.pending.n !== n || !this.alive || this.over) clearInterval(iv); else this.net.send('shot', { i, n }); }, 2500); this.sub(() => clearInterval(iv)); }
    this.setStatus(); this.afterTurnChange(); toast('Partie reprise.'); if (note) modal('Partie reprise', [h('p', {}, note)], [{ label: 'On continue' }]);
  }
  update(first) { super.update(first); if (this.battle) this.saveNow(); }
  /* ---------- Placement ---------- */
  buildPlace() {
    this.grid = h('div', { class: 'nv-grid', role: 'grid' }); for (let i = 0; i < 100; i++) this.grid.append(h('div', { class: 'nv-c', 'data-i': i, onclick: () => this.placeAt(i) }));
    this.tray = h('div', { class: 'nv-tray' });
    this.btnRot = h('button', { class: 'btn sec', onclick: () => { this.horiz = !this.horiz; this.paintPlace(); } });
    this.btnRnd = h('button', { class: 'btn sec', onclick: () => { this.fleet = randomFleet(); this.selLen = -1; this.s.sfx('tick'); this.paintPlace(); } }, 'Au hasard');
    this.btnClr = h('button', { class: 'btn sec', onclick: () => { this.fleet = []; this.selLen = SHIPS[0].len; this.paintPlace(); } }, 'Effacer');
    this.btnGo = h('button', { class: 'btn', onclick: () => this.setReady() }, 'Prêt !');
    this.wrapP = h('div', { class: 'nv-wrap' }, h('div', { class: 'nv-lab' }, 'Ta flotte (secrète)'), this.grid, this.tray, h('div', { class: 'nv-btns' }, this.btnRot, this.btnRnd), h('div', { class: 'nv-btns' }, this.btnClr, this.btnGo));
    this.stage.append(this.wrapP); this.selLen = SHIPS[0].len; this.selIdx = 0; this.paintPlace();
  }
  placed() { return this.fleet.length; }
  nextShip() { const used = this.fleet.map(s => s.len).slice(); for (let k = 0; k < SHIPS.length; k++) { const j = used.indexOf(SHIPS[k].len); if (j >= 0) used.splice(j, 1); else return k; } return -1; }
  placeAt(i) {
    if (this.ready || this.over) return; const r = (i / N) | 0, c = i % N;
    const hit = this.fleet.findIndex(s => s.cells.includes(i)); // toucher un bateau posé le reprend
    if (hit >= 0) { const sh = this.fleet.splice(hit, 1)[0]; this.selIdx = SHIPS.findIndex(x => x.len === sh.len && !this.fleet.some(f => f.len === x.len && SHIPS.filter(y => y.len === x.len).length < 2)); if (this.selIdx < 0) this.selIdx = SHIPS.findIndex(x => x.len === sh.len); this.horiz = sh.horiz; this.s.sfx('tick'); this.paintPlace(); return; }
    if (this.selIdx < 0) return;
    const len = SHIPS[this.selIdx].len; let rr = r, cc = c;
    if (this.horiz && cc + len > N) cc = N - len; if (!this.horiz && rr + len > N) rr = N - len;
    if (!canPlace(this.fleet, len, rr, cc, this.horiz)) { this.s.sfx('warn'); toast(rr < 0 ? 'Ici ça ne rentre pas.' : 'Il y a déjà un bateau ici, ou ça sort de la mer.'); return; }
    this.fleet.push({ len, cells: cellsOf(rr, cc, len, this.horiz), horiz: this.horiz }); this.s.sfx('ok'); this.selIdx = this.nextShip(); this.paintPlace();
  }
  paintPlace() {
    if (!this.grid) return; const mark = new Map(); this.fleet.forEach(s => s.cells.forEach((x, k) => mark.set(x, { f: k === 0, e: k === s.len - 1, hz: s.horiz })));
    [...this.grid.children].forEach((c, i) => { const m = mark.get(i); c.className = 'nv-c' + (m ? ' s ' + (m.hz ? 'hz' : 'vt') + (m.f ? ' f' : '') + (m.e ? ' e' : '') : ''); });
    const used = this.fleet.map(s => s.len).slice();
    this.tray.replaceChildren(...SHIPS.map((sh, k) => { const j = used.indexOf(sh.len); const done = j >= 0; if (done) used.splice(j, 1); return h('button', { class: 'nv-ship' + (this.selIdx === k ? ' on' : '') + (done ? ' done' : ''), 'data-ship': k, onclick: () => { if (done || this.ready) return; this.selIdx = k; this.paintPlace(); } }, h('i', {}, ...Array.from({ length: sh.len }, () => h('b'))), sh.name); }));
    this.btnRot.replaceChildren(uiEl('ic_refresh', '', 24), this.horiz ? 'Tourner : à plat' : 'Tourner : debout');
    this.btnGo.disabled = this.fleet.length !== SHIPS.length || this.ready; this.btnGo.style.opacity = this.btnGo.disabled ? .5 : 1;
    [this.btnRot, this.btnRnd, this.btnClr].forEach(b => { b.disabled = this.ready; });
  }
  setReady() {
    if (this.ready || !fleetValid(this.fleet)) return; this.ready = true; this.paintPlace(); this.btnGo.textContent = 'Flotte prête';
    const send = () => { if (!this.battle && this.alive) this.net.send('rdy'); }; send(); if (!this.remi) { const iv = setInterval(() => { if (this.battle || !this.alive) clearInterval(iv); else send(); }, 2000); this.sub(() => clearInterval(iv)); }
    this.tryStartBattle(); this.setStatus();
  }
  tryStartBattle() {
    if (this.battle || !this.ready || !this.oppReady || !this.state) return; this.battle = true; this.phase = 'battle'; this.net.send('rdy');
    this.stage.replaceChildren(); this.buildBattle(); this.update(true); this.afterTurnChange();
  }
  /* ---------- Combat ---------- */
  buildBattle() {
    this.att = h('div', { class: 'nv-grid', role: 'grid' }); for (let i = 0; i < 100; i++) this.att.append(h('div', { class: 'nv-c', 'data-i': i, onclick: () => this.fire(i) }));
    this.mini = h('div', { class: 'nv-grid mini' }); for (let i = 0; i < 100; i++) this.mini.append(h('div', { class: 'nv-c' }));
    this.stage.append(h('div', { class: 'nv-wrap' }, h('div', { class: 'nv-lab' }, 'Mer ennemie : touche pour tirer'), this.att, h('div', { class: 'nv-lab' }, 'Ta flotte'), this.mini));
  }
  myTurn() { return this.battle && !this.waiting && super.myTurn(); }
  extraStat(side) { if (!this.battle) return ''; const alive = side === this.mySide ? this.fleet.filter(s => !s.cells.every(x => this.shots.has(x))).length : SHIPS.length - this.oppSunk.length; return ' · ' + alive; }
  turnText() { return 'À toi : touche la mer ennemie'; }
  flash(txt, kind = 0) { this.news = { txt, kind }; clearTimeout(this.newsT); this.newsT = setTimeout(() => { this.news = null; this.alive && this.setStatus(); }, 1800); }
  setStatus() {
    if (this.news && !this.over && this.battle && !this.paused) { this.statusEl.textContent = this.news.txt; this.statusEl.className = 'bk-status' + (this.news.kind === 2 ? ' bad' : this.news.kind === 1 ? '' : ' wait'); return; }
    if (this.state && this.phase === 'place' && !this.over && !this.paused) { this.statusEl.textContent = this.ready ? 'Flotte prête. J\'attends l\'autre joueur…' : 'Place ta flotte'; this.statusEl.className = 'bk-status' + (this.ready ? ' wait' : ''); return; }
    super.setStatus();
  }
  whyText(r) { return r.why === 'sunk' ? (r.w === this.mySide ? 'Tous les bateaux ennemis sont coulés !' : 'Ta flotte est coulée.') : r.why === 'resign' ? 'Abandon.' : ''; }
  paintBoard() {
    if (this.phase === 'place') { this.paintPlace(); return; } if (!this.att) return;
    const mark = new Map(); this.fleet.forEach(s => s.cells.forEach((x, k) => mark.set(x, { f: k === 0, e: k === s.len - 1, hz: s.horiz })));
    [...this.att.children].forEach((c, i) => { const v = this.view[i]; c.className = 'nv-c' + (v === 3 ? ' sunk' : '') + (this.lastShot === i ? ' last' : ''); c.innerHTML = v === 1 ? '<i class="miss"></i>' : v >= 2 ? '<i class="hit"></i>' : ''; });
    [...this.mini.children].forEach((c, i) => { const m = mark.get(i), v = this.inc[i]; c.className = 'nv-c' + (m ? ' s ' + (m.hz ? 'hz' : 'vt') + (m.f ? ' f' : '') + (m.e ? ' e' : '') : '') + (v === 3 ? ' sunk' : ''); c.innerHTML = v === 1 ? '<i class="miss"></i>' : v >= 2 ? '<i class="hit"></i>' : ''; });
  }
  fire(i) {
    if (!this.myTurn() || this.view[i]) return; this.lastShot = i; const n = this.nShot++; this.myShots.add(i);
    if (this.remi) { const res = resolve(this.remiFleet, new Set([...this.myShots].filter(x => x !== i)), i); this.gotResult({ i, n, ...res }); return; }
    this.waiting = true; this.pending = { i, n }; this.saveNow(); this.net.send('shot', { i, n }); this.setStatus(); this.s.sfx('fire');
    const iv = setInterval(() => { if (!this.pending || this.pending.n !== n || !this.alive || this.over) clearInterval(iv); else this.net.send('shot', { i, n }); }, 2500); this.sub(() => clearInterval(iv));
  }
  recvRes(m) { this.seen(); if (!this.pending || m.n !== this.pending.n) return; this.pending = null; this.gotResult(m); }
  gotResult(m) {
    this.waiting = false; const i = m.i;
    if (m.r === 'miss') { this.view[i] = 1; this.s.sfx('tick'); this.flash('À l\'eau !'); }
    else if (m.r === 'hit') { this.view[i] = 2; this.s.sfx('hit'); this.flash('Touché !', 1); }
    else { m.cells.forEach(x => { this.view[x] = 3; }); this.oppSunk.push(m.len); this.s.sfx('hit'); this.s.sfx('win'); this.flash('Coulé ! Un bateau de moins.', 1); }
    this.state = { t: 1 - this.mySide }; this.update(); this.setStatus();
    if (m.all) { this.ending = true; setTimeout(() => this.alive && this.endGame({ w: this.mySide, why: 'sunk' }), 700); return; }
    this.afterTurnChange();
  }
  recvShot(m) {
    this.seen(); if (!this.battle || this.over) return; const n = m.n | 0;
    if (this.done.has(n)) { this.net.send('res', this.done.get(n)); return; }
    if (this.state.t === this.mySide || this.shots.has(m.i) || !(m.i >= 0 && m.i < 100)) return;
    const res = resolve(this.fleet, this.shots, m.i); this.shots.add(m.i);
    const out = { i: m.i, n, ...res }; this.done.set(n, out); this.net.send('res', out); this.applyIncoming(out);
  }
  applyIncoming(r) {
    const i = r.i; if (r.r === 'miss') this.inc[i] = 1; else if (r.r === 'hit') this.inc[i] = 2; else r.cells.forEach(x => { this.inc[x] = 3; });
    this.s.sfx(r.r === 'miss' ? 'tick' : 'warn'); if (r.r !== 'miss') this.s.vibrate && this.s.vibrate(60);
    this.flash(r.r === 'miss' ? 'Son tir tombe à l\'eau.' : r.r === 'hit' ? 'Un de tes bateaux est touché !' : 'Un de tes bateaux est coulé !', r.r !== 'miss' ? 2 : 0);
    this.state = { t: this.mySide }; this.update();
    if (r.all) { this.ending = true; setTimeout(() => this.alive && this.endGame({ w: 1 - this.mySide, why: 'sunk' }), 700); return; }
    this.afterTurnChange();
  }
  afterTurnChange() {
    if (!this.battle || this.over) return;
    if (this.remi && this.state.t !== this.mySide) this.remiShoot();
  }
  remiShoot() {
    if (this.thinking) return; this.thinking = true; this.setStatus(); const tok = this.tk = (this.tk || 0) + 1;
    const go = () => {
      if (!this.alive || this.over || tok !== this.tk) { this.thinking = false; return; }
      if (this.paused) { setTimeout(go, 300); return; }
      const rl = SHIPS.map(s => s.len); for (const l of this.rSunk || []) { const j = rl.indexOf(l); if (j >= 0) rl.splice(j, 1); }
      const i = aiShot(this.rView ||= new Array(100).fill(0), rl, level());
      const res = resolve(this.fleet, this.shots, i); this.shots.add(i);
      if (res.r === 'miss') this.rView[i] = 1; else if (res.r === 'hit') this.rView[i] = 2; else { res.cells.forEach(x => { this.rView[x] = 3; }); (this.rSunk ||= []).push(res.len); }
      this.thinking = false; this.applyIncoming({ i, ...res });
    };
    setTimeout(go, 900 + Math.random() * 500);
  }
}
export default { id: 'navale', name: 'Bataille navale', short: 'Cache ta flotte et coule celle de l\'autre au canon.', how: HOW, create: ctx => new Navale(ctx) };
