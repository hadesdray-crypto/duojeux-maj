// 1, 2, 3, soleil : chaque appui sur l'écran = un pas. Au feu vert on avance ; au feu rouge (« Soleil ! ») on ne touche plus l'écran
// ET on ne bouge plus le téléphone (accéléromètre + gyroscope, seuil réglable, courte tolérance). Niveaux : plus long, feux plus rapides.
import { Duo } from '../core/kit.js';
import { h, store, clamp } from '../core/util.js';
import { avatarSvg } from '../core/avatars.js';
import { sprEl, sprSet, ready } from '../core/sprites.js';
import { css, winBadge } from '../core/winfx.js';
css('solfx', '@keyframes sbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes sturn{0%{transform:scaleX(-1)}100%{transform:scaleX(1)}}.sol-sun{display:flex;flex-direction:column;align-items:center;gap:2px;margin:2px auto;min-height:100px}.sol-sun .lab{font-size:24px;font-weight:800}.sol-menu{display:flex;gap:8px;margin:4px 8px;flex-wrap:wrap}.sol-menu .btn{flex:1;min-width:110px;min-height:44px}.sol-tap{flex:1;min-height:48px;max-height:90px;display:flex;align-items:center;justify-content:center;text-align:center;border:2px dashed #ffffff55;border-radius:16px;margin:4px 8px;font-weight:800;font-size:16px;touch-action:manipulation;user-select:none}.sol-set{margin:4px 8px;display:flex;align-items:center;gap:8px;font-size:14px;flex-wrap:wrap}.sol-set input{flex:1;min-width:120px}.sol-gauge{height:10px;margin:2px 8px;background:#0007;border-radius:6px;overflow:hidden}.sol-gauge i{display:block;height:100%;width:0;background:#ff5470}');

export const MAXLVL = 8;
/** Réglages d'un niveau : distance, vitesse des feux, durée du feu vert (s) et du feu rouge (s). */
export const levelCfg = n => { const L = clamp(n | 0 || 1, 1, MAXLVL); return { lvl: L, goal: 24 + 6 * L, speed: 1 + .22 * (L - 1), green: [Math.max(.7, 2.6 - .25 * L), Math.max(1.4, 3.8 - .3 * L)], red: [1.6 + .1 * L, 2.2 + .25 * L] }; };
/** Seuils de mouvement selon la tolérance 1 (sévère) à 5 (large). */
export const thresholds = t => ({ acc: 1.2 + t * .8, gyro: 40 + t * 30 });
export const getLevel = () => clamp(Number(store.get('soleilLvl', 1)) || 1, 1, MAXLVL);
const rr = ([a, b]) => a + Math.random() * (b - a);

class Soleil extends Duo {
  constructor(ctx) {
    super(ctx); this.cfg = levelCfg(getLevel()); this.goal = this.cfg.goal; this.pos = 0; this.opos = 0; this.green = true; this.redSince = 0; this.started = false; this.ltT = 0; this.cd = 0; this.shake = 0; this.faults = 0;
    this.tol = clamp(Number(store.get('soleilTol', 3)) || 3, 1, 5);
    this.hud(h('span', {}, 'Niveau ' + this.cfg.lvl), h('span', {}, ''));
    this.pl.style.display = 'none'; this.tr = h('div', {}); this.root.append(this.tr);
    this.sun = sprEl('n_sun0', 84); this.sunLab = h('div', { class: 'lab', style: 'color:#2fbf71' }, 'VAS-Y'); this.lamp = h('div', { class: 'sol-sun' }, this.sun, this.sunLab); this.root.append(this.lamp);
    this.note = this.big(''); this.gauge = h('div', { class: 'sol-gauge', 'aria-label': 'Mouvement du téléphone' }, h('i')); this.root.append(this.note, this.gauge);
    this.tapZone = h('div', { class: 'sol-tap', role: 'button', 'aria-label': 'Un pas : touche n\'importe où sur l\'écran' }, 'Touche l\'écran n\'importe où : 1 appui = 1 pas');
    const sl = h('input', { type: 'range', min: 1, max: 5, step: 1, value: this.tol, 'aria-label': 'Tolérance au mouvement du téléphone', oninput: e => { this.tol = +e.target.value; store.set('soleilTol', this.tol); lab.textContent = tolTxt(this.tol); } });
    const tolTxt = t => ['', 'très sévère', 'sévère', 'normale', 'large', 'très large'][t], lab = h('span', {}, tolTxt(this.tol));
    this.root.append(this.tapZone, h('div', { class: 'sol-set' }, h('span', {}, 'Tolérance au mouvement :'), sl, lab));
    this.menu = h('div', { class: 'sol-menu' }, h('button', { class: 'btn sec', onclick: () => this.restart() }, 'Recommencer'), h('button', { class: 'btn sec', onclick: () => this.ctx.exit() }, 'Quitter'));
    this.root.append(this.menu);
    // un pas = un appui n'importe où dans le jeu (sauf sur les boutons, le réglage et les fenêtres)
    const tap = e => { if (e.target.closest('button,input,.bigmsg,a')) return; e.preventDefault(); this.step(); };
    this.root.addEventListener('pointerdown', tap); this.sub(() => this.root.removeEventListener('pointerdown', tap));
    this.onNet('pg', m => { this.opos = m.n; this.draw(); });
    this.onNet('lt', m => this.setLight(m.g));
    this.onNet('lvl', m => { if (this.over) { store.set('soleilLvl', clamp(m.n, 1, MAXLVL)); return; } this.cfg = levelCfg(m.n); this.goal = m.goal || this.cfg.goal; this.hudEl.children[0].textContent = 'Niveau ' + this.cfg.lvl; this.draw(); });
    this.onNet('win', () => { if (!this.over) this.end(false, this.oppA.name + ' est arrivé avant toi.'); });
    this.draw(); this.gate('1, 2, 3, soleil — niveau ' + this.cfg.lvl, this.rules(), () => this.start());
    this.loop(dt => this.update(dt));
  }
  rules() { return 'Objectif : arriver le premier au bout de la piste (' + this.goal + ' pas).\n1. Feu VERT : touche l\'écran n\'importe où, chaque appui = un pas.\n2. Feu ROUGE (« Soleil ! ») : ne touche plus l\'écran et ne bouge plus le téléphone.\n3. Si tu bouges ou si tu touches : tu recules de 6 pas.\nSi tu gagnes, tu passes au niveau suivant (feux plus rapides, piste plus longue).'; }
  restart() { if (this.remi) this.ctx.restart(); else this.askReplay(); }
  start() { this.started = true; if (this.isHost) { this.net.send('lvl', { n: this.cfg.lvl, goal: this.goal }); this.ltT = 2; this.setLight(true, true); } this.say('Un, deux, trois, soleil !'); }
  setLight(g, send) {
    this.green = g; this.redSince = 0; this.badFor = 0; sprSet(this.sun, g ? 'n_sun0' : 'n_sun1', 84); this.sun.style.animation = g ? 'none' : 'sturn .25s ease-out';
    this.sunLab.style.color = g ? '#2fbf71' : '#ff5470'; this.sunLab.textContent = g ? 'VAS-Y' : 'SOLEIL ! STOP';
    this.note.textContent = g ? '' : 'Ne touche plus, ne bouge plus !'; this.note.style.color = g ? '#27e0b3' : '#ff5470';
    if (send) this.net.send('lt', { g }); if (!g) { this.say('Soleil !'); this.s.sfx('block'); }
  }
  draw() {
    const row = (a, p) => {
      const pc = Math.min(100, p / this.goal * 100);
      return h('div', { style: 'position:relative;height:50px;margin:3px 8px;background:linear-gradient(#5a4326,#3d2d18);border:2px solid #2a1e10;border-radius:14px;overflow:hidden;box-shadow:inset 0 3px 8px #0008' },
        h('div', { style: 'position:absolute;left:0;top:0;bottom:0;width:' + pc + '%;background:#f5d58a22' }),
        h('div', { style: 'position:absolute;right:0;top:0;bottom:0;width:16px;background:repeating-conic-gradient(#fff 0 25%,#1b1f33 0 50%) 0 0/8px 8px;border-left:2px solid #0006' }),
        h('div', { style: 'position:absolute;right:22px;bottom:2px;font-weight:800;font-size:12px;opacity:.85' }, a.name + ' ' + p + ' / ' + this.goal),
        h('div', { style: 'position:absolute;top:5px;left:calc(' + pc * .8 + '% + 2px);transition:left .15s;filter:drop-shadow(0 3px 2px #0009)', html: avatarSvg(a.avatar, 40) }));
    };
    this.tr.replaceChildren(row(this.meA, this.pos), row(this.oppA, this.opos));
    this.setStat(this.pos + ' / ' + this.goal, this.opos + ' / ' + this.goal);
  }
  step() {
    if (!this.started || this.over) return;
    if (!this.green) { if (this.redSince > .3) this.caught('Tu as touché l\'écran !'); return; }
    this.pos++; this.s.sfx('tick'); this.net.send('pg', { n: this.pos }); this.draw();
    if (this.pos >= this.goal) { this.net.send('win'); this.end(true, 'Tu es arrivé le premier au niveau ' + this.cfg.lvl + ' !'); }
  }
  caught(why) {
    if (this.cd > 0 || this.over) return; this.cd = 1; this.faults++; this.pos = Math.max(0, this.pos - 6); this.s.sfx('hit'); this.s.vibrate(200); this.net.send('pg', { n: this.pos }); this.draw();
    this.note.textContent = why + ' Recule de 6.'; this.note.style.color = '#ff5470'; this.badFor = 0;
  }
  /** Fin de course : le gagnant peut monter d'un niveau. */
  end(win, d) {
    this.started = false; if (win && getLevel() < MAXLVL) { store.set('soleilLvl', getLevel() + 1); this.nextLvl = true; }
    if (win) this.net.send('lvl', { n: getLevel(), goal: levelCfg(getLevel()).goal });
    if (!win && !this.remi) { /* le perdant garde son niveau : le prochain départ vient du gagnant */ }
    this.finish(win, d + (win && this.nextLvl ? '\nProchain départ : niveau ' + getLevel() + '.' : ''));
    const m = this.msg; if (m) { const p = m.querySelector('p'); if (p) p.style.whiteSpace = 'pre-line'; const b = [...m.querySelectorAll('button')].find(x => x.textContent === 'Rejouer'); if (b && win && this.nextLvl) b.textContent = 'Niveau suivant'; }
  }
  finish(win, d) { super.finish(win, d); winBadge(this, win, win ? null : 'n_alarm'); }
  /** Mouvement du téléphone : 0 (immobile) à 1 (au seuil). */
  motion() { const t = thresholds(this.tol), s = this.s; if (!s.motionSeen) return 0; return Math.max((s.accel || 0) / t.acc, (s.gyro || 0) / t.gyro); }
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    if (!this.started || this.over) return;
    const mo = this.motion(); this.gauge.firstChild.style.width = Math.min(100, mo * 100) + '%'; this.gauge.firstChild.style.background = mo >= 1 ? '#ff5470' : '#27e0b3';
    if (!this.green) {
      this.redSince += dt;
      // tolérance courte : on laisse .5 s pour s'arrêter, puis le seuil doit être dépassé 0,12 s de suite
      if (this.redSince > .5 && mo >= 1) { this.badFor = (this.badFor || 0) + dt; if (this.badFor > .12) this.caught('Tu as bougé le téléphone !'); } else this.badFor = 0;
    }
    if (this.isHost) {
      this.ltT -= dt;
      if (this.ltT <= 0) { const c = this.cfg; if (this.green) { this.ltT = rr(c.red) ; this.setLight(false, true); } else { this.ltT = rr(c.green); this.setLight(true, true); } }
    }
  }
}
export default { id: 'soleil', name: '1, 2, 3, soleil', short: 'Chaque appui = un pas. Au feu rouge : ne touche plus et ne bouge plus le téléphone !',
  how: ['Feu vert : touche l\'écran n\'importe où, chaque appui est un pas.', 'Feu rouge (« Soleil ! ») : ne touche plus l\'écran ET ne bouge plus le téléphone.', 'Si tu bouges ou touches, tu recules de 6 pas. Le réglage « Tolérance » ajuste la sensibilité.', 'Le premier arrivé gagne et passe au niveau suivant : piste plus longue, feux plus rapides.'],
  create: ctx => new Soleil(ctx) };
