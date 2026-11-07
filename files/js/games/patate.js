// Patate chaude : le téléphone est une patate brûlante. Secoue pour la passer ! Celui qui la tient quand elle explose perd.
import { Duo } from '../core/kit.js';
import { h } from '../core/util.js';
import { sprEl, sprSet, ready } from '../core/sprites.js';
import { css, winBadge } from '../core/winfx.js';
import { boom } from '../core/boom.js';
css('patfx', '@keyframes pshake{0%,100%{transform:translate(0,0)}10%{transform:translate(-14px,8px)}20%{transform:translate(12px,-10px)}30%{transform:translate(-12px,-8px)}40%{transform:translate(10px,10px)}50%{transform:translate(-8px,6px)}60%{transform:translate(8px,-6px)}80%{transform:translate(-4px,3px)}}@keyframes pfly{to{transform:translateY(-150px) scale(.6);opacity:0}}@keyframes pflash{0%{opacity:.95}100%{opacity:0}}.pflash{position:absolute;inset:0;background:radial-gradient(circle,#fff,#ffb020 45%,#ff5470 80%);z-index:4;pointer-events:none;animation:pflash .9s ease-out both}.pmenu{display:flex;gap:8px;margin:4px 8px}.pmenu .btn{flex:1;min-height:44px}.phint{text-align:center;margin:0 8px;font-size:15px}@keyframes ptrem{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-4px,2px) rotate(-3deg)}75%{transform:translate(4px,-2px) rotate(3deg)}}@keyframes pboom{0%{transform:scale(.3);opacity:0}40%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}.ppot{display:flex;justify-content:center;transition:filter .3s,opacity .3s}.pwrap{position:relative;display:flex;justify-content:center;min-height:160px;align-items:center}');

const bomb = (c, size = 170) => `<svg viewBox="0 0 120 120" width="${size}" height="${size}"><circle cx="58" cy="70" r="40" fill="${c}" stroke="#000" stroke-opacity=".4" stroke-width="4"/><rect x="50" y="22" width="16" height="14" rx="3" fill="#7d8499"/><path d="M62 22 Q72 8 86 14" stroke="#cfa56a" stroke-width="4" fill="none"/><circle cx="88" cy="14" r="6" fill="#ffb020"/><ellipse cx="44" cy="56" rx="9" ry="6" fill="#fff" opacity=".35"/></svg>`;
class Patate extends Duo {
  constructor(ctx) {
    super(ctx); this.started = false; this.heat = 0; this.lastPass = 0; this.beepT = 0; this.fuse = 0; this.t = 0;
    this.pl.style.display = 'none'; this.passes = 0; this.hud(h('span', {}, 'Patate chaude'), h('span', {}, 'Passes : 0'));
    this.pic = h('div', { class: 'pwrap', style: 'margin:6px;touch-action:none' }); this.pot = sprEl('n_pot0', 150); this.potBox = h('div', { class: 'ppot' }, this.pot); this.pic.append(this.potBox); this.note = this.big('');
    this.hint = h('p', { class: 'mut phint' }, ''); this.root.append(this.pic, this.note, this.hint, h('div', { class: 'controls' }, h('button', { class: 'btn big', style: 'min-height:84px;touch-action:manipulation', onpointerdown: e => { e.preventDefault(); this.pass(); } }, 'Passer la patate')),
      h('div', { class: 'pmenu' }, h('button', { class: 'btn sec', onclick: () => this.restart() }, 'Recommencer'), h('button', { class: 'btn sec', onclick: () => this.ctx.exit() }, 'Quitter')));
    let y0 = null; this.pic.addEventListener('pointerdown', e => { y0 = e.clientY; }); this.pic.addEventListener('pointerup', e => { if (y0 != null && y0 - e.clientY > 50) this.pass(true); y0 = null; }); this.pic.addEventListener('pointercancel', () => { y0 = null; });
    this.onSense('shake', () => this.pass());
    this.onNet('pass', () => { if (this.over || this.exploding) return; this.holder = this.role; this.countPass(); this.s.vibrate(120); this.s.sfx('atk'); this.show(); });
    this.onNet('heat', m => { this.heat = m.v; });
    this.onNet('boom', m => this.boom(m.loser));
    this.gate('Patate chaude', 'But : ne pas avoir la patate quand elle explose !\n1. Un seul téléphone a la patate à la fois : l\'écran dit « Elle est chez toi ! » ou « Elle est chez l\'autre ».\n2. Quand tu l\'as, passe-la vite : glisse le doigt vers le haut sur la patate (lancer), secoue le téléphone ou touche « Passer la patate ».\n3. Plus on se la passe, plus la mèche raccourcit et plus ça bipe vite. À la fin elle explose : celui qui la tient perd.', seed => this.start(seed));
    this.loop(dt => this.update(dt)); this.show();
  }
  restart() { if (this.remi) this.ctx.restart(); else this.askReplay(); }
  countPass() { this.passes++; this.hudEl.children[1].textContent = 'Passes : ' + this.passes; if (this.isHost && this.started) { const rest = Math.max(.8, this.fuse - this.t); this.fuse = this.t + rest * .88; } }
  start(seed) { this.started = true; this.holder = seed % 2 === 0 ? 'host' : 'guest'; this.fuse = 14 + (seed % 1000) / 1000 * 14; this.t = 0; this.t0 = performance.now(); this.say('Attention, ça va exploser !'); this.show(); }
  other() { return this.role === 'host' ? 'guest' : 'host'; }
  mine() { return this.started && this.holder === this.role; }
  pass(throwIt) { if (!this.mine() || this.over) return; const n = performance.now(); if (n - this.lastPass < 700) return; this.lastPass = n; this.holder = this.other(); this.countPass(); this.net.send('pass'); this.s.sfx('block'); if (throwIt && this.potBox) { this.potBox.style.animation = 'pfly .35s ease-in both'; setTimeout(() => { if (this.potBox) this.potBox.style.animation = 'none'; this.show(); }, 360); } else this.show(); }
  show() {
    const mine = this.mine();
    if (ready() && this.potBox) {
      const hh = this.heat, k = hh < .25 ? 'n_pot0' : hh < .5 ? 'n_pot1' : hh < .75 ? 'n_pot2' : 'n_pot3'; sprSet(this.pot, k, 150);
      this.potBox.style.filter = mine ? 'drop-shadow(0 0 18px #ff5470)' : 'grayscale(.7) brightness(.7)'; this.potBox.style.opacity = mine ? 1 : .75;
      this.pot.style.animation = mine && this.started ? 'ptrem ' + (.5 - hh * .35).toFixed(2) + 's linear infinite' : 'none';
    } else if (this.potBox) { this.potBox.innerHTML = bomb(mine ? '#ff5470' : '#5b6384', 170); }
    this.note.textContent = !this.started ? '' : mine ? 'ELLE EST CHEZ TOI !' : 'Elle est chez ' + this.oppA.name + '.'; this.note.style.color = mine ? '#ff5470' : '#9aa6cf';
    this.hint.textContent = !this.started ? '' : mine ? 'Passe-la vite : glisse le doigt vers le haut sur la patate, secoue, ou touche « Passer la patate ».' : 'Attends : tu ne peux pas la passer. Prépare-toi à la recevoir !';
  }
  boom(loser) {
    if (this.over || this.exploding) return; this.exploding = true; this.started = false; const lose = loser === this.role;
    if (ready()) this.pic.replaceChildren(sprEl('n_boom1', 230, 'animation:pboom .5s ease-out both')); else this.pic.innerHTML = '<svg viewBox="0 0 120 120" width="200" height="200"><circle cx="60" cy="60" r="50" fill="#ffb020"/><circle cx="60" cy="60" r="30" fill="#ff5470"/></svg>';
    this.flash = h('div', { class: 'pflash' }); this.root.append(this.flash); boom.big(this.s);
    this.note.textContent = 'BOUM !'; this.note.style.color = '#ffb020'; this.hint.textContent = '';
    try { if (lose) { this.s.vibrate(700); navigator.vibrate && navigator.vibrate([150, 60, 300, 60, 400]); } else this.s.vibrate(150); } catch {}
    if (lose) { const t = this.ctx.root || this.root; t.style.animation = 'pshake .9s ease-in-out 1'; setTimeout(() => { t.style.animation = ''; }, 1000); }
    setTimeout(() => { if (!this.alive) return; if (this.flash) this.flash.remove(); this.finish(!lose, lose ? 'BOUM ! La patate a explosé chez toi.' : 'BOUM ! Elle a explosé chez ' + this.oppA.name + '.'); winBadge(this, !lose, lose ? 'n_bomb1' : null); }, 1600);
  }
  update(dt) {
    if (!this.started || this.over || this.exploding) return;
    if (this.isHost) {
      this.t = (performance.now() - this.t0) / 1000; this.heat = Math.min(1, this.t / this.fuse); this.hs = (this.hs || 0) + dt; if (this.hs > .3) { this.hs = 0; this.net.send('heat', { v: this.heat }); }
      if (this.t >= this.fuse) { this.net.send('boom', { loser: this.holder }); this.boom(this.holder); return; }
    }
    if ((this.shT = (this.shT || 0) + dt) > .4) { this.shT = 0; this.show(); }
    this.beepT -= dt; if (this.beepT <= 0) { this.beepT = 1 - this.heat * .8; if (this.mine()) { this.s.beep(500 + this.heat * 700, 60, 'square', .12); } }
  }
}
export default { id: 'patate', name: 'Patate chaude', short: 'Passe vite la patate brûlante : lancer vers le haut, secousse ou bouton !', how: ['Un seul téléphone a la patate : l\'écran dit qui l\'a.', 'Quand tu l\'as : glisse le doigt vers le haut (lancer), secoue ou touche « Passer la patate ».', 'À chaque passe la mèche raccourcit et les bips accélèrent.', 'Elle explose (boum, vibration, écran qui tremble) : celui qui la tient perd.'], create: ctx => new Patate(ctx) };
