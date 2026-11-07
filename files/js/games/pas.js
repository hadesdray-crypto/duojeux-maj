// Course de pas : appuis ALTERNÉS gauche / droite (comme de vrais pas). Un appui du même côté que le précédent n'avance pas.
import { Duo } from '../core/kit.js';
import { h } from '../core/util.js';
import { avatarSvg } from '../core/avatars.js';
import { sprEl, ready } from '../core/sprites.js';
import { winBadge } from '../core/winfx.js';
import { countdown, gameMenu, rulesList } from '../core/calib.js';
const GOAL = 50;
class Pas extends Duo {
  constructor(ctx) {
    super(ctx);
    this.goal = GOAL; this.pos = 0; this.opos = 0; this.next = 'L'; this.started = false; this.lock = 0; this.taps = []; this.ocad = 0; this.msgT = 0; this.sendT = 0; this.t = 0;
    this.hud(h('span', {}, 'Toi : 0,0 pas/s'), h('span', {}, 'L\'autre : 0,0 pas/s'));
    this.hudEl.style.fontSize = '.92em'; this.hudEl.style.whiteSpace = 'nowrap';
    this.tr = h('div', {}); this.root.append(this.tr);
    this.note = h('div', { style: 'text-align:center;font-weight:800;font-size:20px;min-height:1.5em;padding:4px' }, ''); this.root.append(this.note);
    const zone = (side, label) => { const z = h('button', { class: 'btn big', style: 'flex:1 1 0;min-height:150px;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:box-shadow .1s,opacity .1s', 'aria-label': label, oncontextmenu: e => e.preventDefault(), onpointerdown: e => { e.preventDefault(); this.tap(side); } }, ready() ? sprEl(side === 'L' ? 'n_fr0' : 'n_fr1', 56) : null, h('span', { style: 'font-size:1.3em' }, label)); return z; };
    this.zL = zone('L', 'PIED GAUCHE'); this.zR = zone('R', 'PIED DROIT');
    this.root.append(h('div', { class: 'controls', style: 'gap:12px' }, this.zL, this.zR));
    this.onNet('pg', m => { this.opos = m.n; this.ocad = m.c || 0; this.draw(); });
    this.onNet('win', () => { if (!this.over) this.finish(false, this.oppA.name + ' est arrivé avant toi.'); });
    this.draw(); this.mark();
    this.gate('Course de pas', 'Les règles :', () => { countdown(this, () => { this.started = true; this.t = 0; this.say('Partez !'); }); });
    rulesList(this, ['Appuie à tour de rôle sur PIED GAUCHE puis PIED DROIT, comme si tu courais avec tes pouces.', 'Seul un appui du côté attendu te fait avancer d\'un pas. Deux appuis du même côté : pas d\'avance et un petit faux pas.', 'Le côté attendu est allumé en vert. Plus tu alternes vite, plus tu avances vite.', 'Le premier qui fait ' + GOAL + ' pas gagne. Ta cadence et celle de l\'autre sont affichées en haut.']);
    gameMenu(this);
    this.loop(dt => this.update(dt));
  }
  mark() {
    const on = 'box-shadow:0 0 0 4px #2fbf71,0 0 22px #2fbf71;opacity:1', off = 'box-shadow:none;opacity:.55', L = this.next === 'L';
    this.zL.style.cssText += ';' + (L ? on : off); this.zR.style.cssText += ';' + (L ? off : on);
  }
  tap(side) {
    if (!this.started || this.over) return;
    if (this.lock > 0) return;
    if (side !== this.next) { this.lock = .35; this.s.sfx('block'); this.s.vibrate(60); this.note.textContent = 'Alterne ! Pied ' + (this.next === 'L' ? 'gauche' : 'droit') + ' maintenant.'; this.note.style.color = '#ff5470'; this.msgT = 1.2; this.flash(side === 'L' ? this.zL : this.zR); return; }
    this.pos++; this.next = side === 'L' ? 'R' : 'L'; this.taps.push(performance.now()); this.s.sfx('tick'); this.mark(); this.sendPg(); this.draw();
    if (this.pos >= this.goal) { this.net.send('win'); this.finish(true, 'Tu es arrivé le premier !\nCadence moyenne : ' + (this.pos / Math.max(.1, this.t)).toFixed(1).replace('.', ',') + ' pas/s'); }
  }
  flash(z) { z.style.background = '#ff5470'; setTimeout(() => { z.style.background = ''; }, 200); }
  cad() { const n = performance.now(); this.taps = this.taps.filter(t => n - t < 2500); return this.taps.length / 2.5; }
  sendPg() { this.net.send('pg', { n: this.pos, c: +this.cad().toFixed(1) }); }
  update(dt) {
    if (!this.started || this.over) return; this.t += dt; this.lock = Math.max(0, this.lock - dt);
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.note.textContent = ''; }
    const c = this.cad(), o = this.ocad, f = x => x.toFixed(1).replace('.', ',');
    this.hudEl.children[0].textContent = 'Toi : ' + f(c) + ' pas/s'; this.hudEl.children[1].textContent = (this.oppA.name.length > 9 ? 'L\'autre' : this.oppA.name) + ' : ' + f(o) + ' pas/s';
    this.sendT += dt; if (this.sendT > .5) { this.sendT = 0; this.sendPg(); }
    if (!this.msgT) { const d = this.pos - this.opos; this.note.style.color = d >= 0 ? '#2fbf71' : '#ffb347'; this.note.textContent = d > 0 ? 'Tu mènes de ' + d + ' pas' : d < 0 ? this.oppA.name + ' mène de ' + (-d) + ' pas' : 'À égalité'; }
  }
  draw() {
    const row = (a, p) => {
      const pc = Math.min(100, p / this.goal * 100);
      return h('div', { style: 'position:relative;height:64px;margin:3px 8px;background:linear-gradient(#5a4326,#3d2d18);border:2px solid #2a1e10;border-radius:14px;overflow:hidden;box-shadow:inset 0 3px 8px #0008' },
        h('div', { style: 'position:absolute;left:0;top:0;bottom:0;width:' + pc + '%;background:#f5d58a22' }),
        h('div', { style: 'position:absolute;right:0;top:0;bottom:0;width:16px;background:repeating-conic-gradient(#fff 0 25%,#1b1f33 0 50%) 0 0/8px 8px;border-left:2px solid #0006' }),
        h('div', { style: 'position:absolute;top:5px;left:calc(' + pc * .8 + '% + 2px);transition:left .15s;filter:drop-shadow(0 3px 2px #0009)', html: avatarSvg(a.avatar, 48) }),
        h('div', { style: 'position:absolute;right:24px;bottom:3px;font-weight:800;font-size:11px;opacity:.8' }, 'ARRIVÉE'));
    };
    this.tr.replaceChildren(row(this.meA, this.pos), row(this.oppA, this.opos));
    this.setStat(this.pos + ' / ' + this.goal, this.opos + ' / ' + this.goal);
  }
  finish(win, d) { super.finish(win, d); if (this.msg) { const p = this.msg.querySelector('p'); if (p) p.style.whiteSpace = 'pre-line'; } winBadge(this, win, win ? null : 'n_alarm'); }
}
export default { id: 'pas', name: 'Course de pas', short: 'Alterne gauche et droite le plus vite possible.', how: ['Appuie à tour de rôle sur PIED GAUCHE puis PIED DROIT.', 'Seul l\'appui du côté allumé en vert te fait avancer ; deux fois le même côté = faux pas.', 'Ta cadence (pas par seconde) est comparée à celle de l\'autre.', 'Le premier à ' + GOAL + ' pas gagne.'], create: ctx => new Pas(ctx) };
