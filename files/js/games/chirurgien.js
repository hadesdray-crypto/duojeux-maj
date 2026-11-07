// Main de chirurgien, face à face : chacun suit son rond vert qui bouge et accélère, avec un tremblement qui augmente.
// Hors du rond, ta résistance baisse ; tu peux bousculer l'autre (maintiens pour charger, relâche pour pousser) pour le faire sortir du rond.
import { Duo } from '../core/kit.js';
import { h, clamp } from '../core/util.js';
import { spr, sprC, ready } from '../core/sprites.js';
import { winBadge } from '../core/winfx.js';
import { keepCal, calibPhase, gameMenu, rulesList } from '../core/calib.js';
const T = 45;
class Chir extends Duo {
  constructor(ctx) {
    super(ctx); keepCal(this);
    this.started = false; this.t = 0; this.ph = 0; this.man = { x: 0, y: 0 }; this.px = 0; this.py = 0; this.rc = { x: 0, y: 0, r: 56 }; this.gauge = 100; this.energy = 100; this.charge = 0; this.charging = false;
    this.tr = { x: 0, y: 0 }; this.kick = { x: 0, y: 0, vx: 0, vy: 0 }; this.shake = 0; this.mine = null; this.theirs = null; this.opp = { g: 100, dx: 0, dy: 0 }; this.sendT = 0; this.statT = 0; this.inside = true; this.pushNote = 0;
    this.hud(h('span', {}, 'Temps : ' + T), h('span', {}, 'Résistance : 100'));
    this.hudEl.style.fontSize = '.92em'; this.hudEl.style.whiteSpace = 'nowrap'; this.makeCanvas(320, 320);
    const pad = (l, dx, dy) => h('button', { class: 'btn sec', style: 'touch-action:none', onpointerdown: e => { e.preventDefault(); this.man = { x: dx, y: dy }; }, onpointerup: () => { this.man = { x: 0, y: 0 }; }, onpointerleave: () => { this.man = { x: 0, y: 0 }; }, onpointercancel: () => { this.man = { x: 0, y: 0 }; } }, l);
    this.pads = h('div', { class: 'controls' }, pad('Gauche', -1, 0), pad('Bas', 0, 1), pad('Haut', 0, -1), pad('Droite', 1, 0));
    this.pushBtn = h('button', { class: 'btn', style: 'touch-action:none;user-select:none;-webkit-user-select:none;min-height:64px', oncontextmenu: e => e.preventDefault(), onpointerdown: e => { e.preventDefault(); if (this.started && !this.over) this.charging = true; }, onpointerup: () => this.release(), onpointercancel: () => this.release(), onpointerleave: () => this.release() }, 'Bousculer : maintiens, puis relâche');
    this.root.append(this.pads, h('div', { class: 'controls' }, this.pushBtn));
    this.onNet('st', m => { this.opp = { g: m.g, dx: m.dx, dy: m.dy }; this.setS(); });
    this.onNet('push', m => this.gotPush(m.f || .5));
    this.onNet('out', () => { if (!this.over) this.finish(true, this.oppA.name + ' n\'a plus de résistance.'); });
    this.onNet('res', m => { this.theirs = m.v; this.fin(); });
    this.gate('Main de chirurgien', 'Les règles :', () => this.prep());
    rulesList(this, ['Ton rond vert bouge de plus en plus vite et rétrécit. Incline le téléphone pour garder la bulle dedans.', 'Hors du rond, ta résistance baisse ; dedans, elle remonte. À zéro, tu as perdu.', 'Ça tremble de plus en plus. Tu peux bousculer l\'autre : maintiens le bouton pour charger la force, relâche pour pousser.', 'Au bout de ' + T + ' secondes, la plus grande résistance gagne.']);
    gameMenu(this);
    this.loop(dt => this.update(dt));
  }
  prep() {
    calibPhase(this, { title: 'Calibration', text: 'Pose ton téléphone à plat (ou tenu comme pour jouer) et ne bouge plus, puis appuie sur Prêt.\nQuand les deux joueurs sont prêts, un décompte 3-2-1 lance la partie.', go: () => { this.started = true; this.t = 0; this.say('Doucement…'); } });
  }
  setS() { const a = 'Résistance ' + Math.round(this.gauge) + ' %', b = 'Résistance ' + Math.round(this.opp.g) + ' %'; if (a !== this._a || b !== this._b) { this._a = a; this._b = b; this.setStat(a, b); } }
  release() {
    if (!this.charging) return; this.charging = false; const f = this.charge; this.charge = 0; if (!this.started || this.over || f < .1) return;
    const cost = 15 + 45 * f; if (this.energy < cost) { this.s.sfx('block'); return; }
    this.energy -= cost; this.net.send('push', { f }); this.s.sfx('hit'); this.s.vibrate(40); this.pushNote = 1;
  }
  gotPush(f) {
    if (!this.started || this.over) return; const dx = this.px - this.rc.x, dy = this.py - this.rc.y, d = Math.hypot(dx, dy);
    let a = d > 6 ? Math.atan2(dy, dx) : Math.random() * 6.28; a += (Math.random() - .5) * .9; const v = 150 + 260 * f;
    this.kick.vx += Math.cos(a) * v; this.kick.vy += Math.sin(a) * v; this.shake = Math.max(this.shake, .6 + f); this.s.vibrate(80); this.s.sfx('hit');
  }
  update(dt) {
    if (this.started && !this.over && this.mine == null) {
      this.t += dt; const s = this.s, prog = clamp(this.t / T, 0, 1), k = this.kick;
      this.ph += dt * (.5 + 1.6 * prog * prog + .5 * prog);
      const amp = Math.min(1, this.t / 4) * (20 + 85 * Math.pow(prog, .7)); this.rc.r = 56 - 24 * prog;
      this.rc.x = amp * Math.sin(this.ph); this.rc.y = amp * .8 * Math.sin(this.ph * 1.31 + 1.3);
      const A = (3 + 20 * prog) * (this.shake > 0 ? 1.8 : 1); this.shake = Math.max(0, this.shake - dt);
      this.tr.x += (Math.random() * 2 - 1) * A * 5 * dt - this.tr.x * 4 * dt; this.tr.y += (Math.random() * 2 - 1) * A * 5 * dt - this.tr.y * 4 * dt;
      k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= Math.max(0, 1 - 3.5 * dt); k.vy *= Math.max(0, 1 - 3.5 * dt); k.x *= Math.max(0, 1 - 1.6 * dt); k.y *= Math.max(0, 1 - 1.6 * dt);
      const tx = s.orientSeen ? s.tilt : 0, ty = s.orientSeen ? s.tiltY : 0;
      this.px = clamp(tx * 140 + this.man.x * 90 + this.tr.x + k.x, -150, 150); this.py = clamp(ty * 140 + this.man.y * 90 + this.tr.y + k.y, -150, 150);
      this.inside = Math.hypot(this.px - this.rc.x, this.py - this.rc.y) < this.rc.r;
      this.gauge = clamp(this.gauge + (this.inside ? 4 : -(7 + 16 * prog)) * dt, 0, 100);
      this.energy = Math.min(100, this.energy + 8 * dt); if (this.charging) this.charge = Math.min(1, this.charge + dt); this.pushNote = Math.max(0, this.pushNote - dt);
      this.pushBtn.textContent = this.charging ? 'Charge ' + Math.round(this.charge * 100) + ' % : relâche !' : 'Bousculer : maintiens, puis relâche (énergie ' + Math.round(this.energy) + ' %)';
      this.hudEl.children[0].textContent = 'Temps : ' + Math.max(0, Math.ceil(T - this.t)); this.hudEl.children[1].textContent = 'Résistance : ' + Math.round(this.gauge);
      this.sendT += dt; if (this.sendT > .12) { this.sendT = 0; this.net.send('st', { g: Math.round(this.gauge), dx: +((this.px - this.rc.x) / this.rc.r).toFixed(2), dy: +((this.py - this.rc.y) / this.rc.r).toFixed(2) }); }
      this.setS();
      if (this.gauge <= 0) { this.net.send('out'); this.finish(false, 'Ta résistance est tombée à zéro.'); return; }
      if (this.t >= T) { this.mine = Math.round(this.gauge * 10); this.net.send('res', { v: this.mine }); this.started = false; this.message('Fini !', 'J\'attends ' + this.oppA.name + '…', []); this.fin(); }
    }
    this.pads.style.display = this.s.orientSeen ? 'none' : '';
    this.draw();
  }
  fin() { if (this.mine != null && this.theirs != null) { this.clearMessage(); this.compare(this.mine, this.theirs, v => 'résistance ' + (v / 10).toFixed(0) + ' %'); } }
  bar(g, x, w, v, label, col, right) {
    g.fillStyle = '#0009'; g.fillRect(x, 8, w, 16); g.fillStyle = col; g.fillRect(x, 8, w * clamp(v / 100, 0, 1), 16); g.strokeStyle = '#fff6'; g.lineWidth = 1; g.strokeRect(x, 8, w, 16);
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = right ? 'right' : 'left'; g.fillText(label, right ? x + w - 4 : x + 4, 20);
  }
  draw() {
    if (!this.cv.width) return; this.begin(); const g = this.g, art = ready(), inside = this.inside, tm = performance.now() / 1000, C = 160;
    const bg = g.createRadialGradient(C, C, 20, C, C, 230); bg.addColorStop(0, '#2f7f86'); bg.addColorStop(1, '#10303a'); g.fillStyle = bg; g.fillRect(0, 0, 320, 320);
    if (art) { g.globalAlpha = .9; spr(g, 'n_patient', 0, 62, 320); g.globalAlpha = 1; }
    const rx = C + this.rc.x, ry = C + this.rc.y, rr = this.rc.r;
    g.strokeStyle = '#ffffff22'; g.lineWidth = 2; g.beginPath(); g.moveTo(C, 30); g.lineTo(C, 310); g.moveTo(10, C); g.lineTo(310, C); g.stroke();
    g.fillStyle = inside ? '#2fbf7122' : '#2fbf7110'; g.beginPath(); g.arc(rx, ry, rr, 0, 7); g.fill();
    g.strokeStyle = inside ? '#2fbf71' : '#2fbf71aa'; g.lineWidth = 5; g.beginPath(); g.arc(rx, ry, rr, 0, 7); g.stroke();
    const x = C + this.px, y = C + this.py;
    if (art) { g.save(); g.globalAlpha = .5 + .3 * Math.sin(tm * 6); g.fillStyle = inside ? '#2fbf71' : '#ff5470'; g.beginPath(); g.arc(x, y, 20, 0, 7); g.fill(); g.restore(); sprC(g, 'n_tweez', x + 22, y - 22, 80); if (this.started) sprC(g, inside ? 'n_ok' : 'n_alarm', 30, 296, inside ? 40 : 46); }
    else { g.fillStyle = inside ? '#27e0b3' : '#ff5470'; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); }
    this.bar(g, 8, 140, this.gauge, 'Toi', this.gauge > 35 ? '#2fbf71' : '#ff5470', false); this.bar(g, 172, 140, this.opp.g, this.oppA.name, this.opp.g > 35 ? '#e08a2f' : '#ff5470', true);
    // vue réduite de l'autre : son point par rapport à son rond
    const mx = 282, my = 282, mr = 28; g.fillStyle = '#0008'; g.beginPath(); g.arc(mx, my, mr + 6, 0, 7); g.fill(); g.strokeStyle = '#e08a2f'; g.lineWidth = 3; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.stroke();
    g.fillStyle = Math.hypot(this.opp.dx, this.opp.dy) < 1 ? '#2fbf71' : '#ff5470'; g.beginPath(); g.arc(mx + clamp(this.opp.dx, -1.4, 1.4) * mr, my + clamp(this.opp.dy, -1.4, 1.4) * mr, 5, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(this.oppA.name.length > 9 ? 'L\'autre' : this.oppA.name, mx, my - mr - 9);
    if (this.pushNote > 0) { g.fillStyle = '#ffd36b'; g.font = 'bold 14px sans-serif'; g.fillText('Bousculade envoyée !', C, 50); }
    if (this.shake > 0 && this.started) { g.fillStyle = '#ff5470'; g.font = 'bold 14px sans-serif'; g.fillText('On te bouscule !', C, 50); }
    this.endDraw();
  }
  finish(win, d) { super.finish(win, d); winBadge(this, win, win ? null : 'n_alarm'); }
}
export default { id: 'chirurgien', name: 'Main de chirurgien', short: 'Face à face : garde la bulle dans ton rond qui bouge, bouscule l\'autre.', how: ['Pose ton téléphone à plat, appuie sur Prêt : la calibration se fait, puis décompte 3-2-1.', 'Garde la bulle dans ton rond vert : il bouge, accélère et rétrécit, et ça tremble de plus en plus.', 'Hors du rond, ta résistance baisse ; à zéro, tu perds.', 'Maintiens « Bousculer » puis relâche pour pousser l\'autre hors de son rond.', 'Au bout de 45 secondes, la plus grande résistance gagne.'], create: ctx => new Chir(ctx) };
