// Briques communes des jeux « à deux » : joueurs affichés (avatars), départ commun, pistes de course.
import { h } from './util.js';
import { GameBase } from '../games/base.js';
import { profile } from './profile.js';
import { avatarSvg } from './avatars.js';
import { sprEl, sprSet, spr, ready } from './sprites.js';
import { css, winBadge } from './winfx.js';

/** Noms affichés : « Joueur » (nom par défaut) devient « Toi » chez soi et « L'autre joueur » chez l'autre. */
export const ownName = n => (!n || n === 'Joueur') ? 'Toi' : String(n).slice(0, 14);
export const oppName = n => (!n || n === 'Joueur' || n === 'Ami') ? "L'autre joueur" : String(n).slice(0, 14);
export const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

export class Duo extends GameBase {
  constructor(ctx) {
    super(ctx);
    this.isHost = this.role === 'host'; this.remi = !!(ctx.net && ctx.net.remi);
    const me = profile.get(); this.meA = { avatar: me.avatar, name: ownName(me.name) };
    this.oppA = this.remi ? { avatar: 'robot', name: 'Rémi' } : { avatar: 'chat', name: oppName('') }; this.gotWho = this.remi;
    this.stat = { me: '', opp: '' };
    this.onNet('who', m => { this.oppA = { avatar: m.a, name: oppName(m.n) }; this.gotWho = true; this.paint(); if (!m.re) this.net.send('who', { a: me.avatar, n: me.name, re: true }); });
    const ask = () => { if (!this.gotWho && this.alive) this.net.send('who', { a: me.avatar, n: me.name }); };
    ask(); const iv = setInterval(ask, 1200); this.sub(() => clearInterval(iv));
    this.pl = h('div', { class: 'row', style: 'justify-content:space-around;align-items:center;padding:4px 0' });
    this.root.append(this.pl); this.paint();
    this.wireReplay();
  }
  paint() {
    const c = (a, label, st) => h('div', { style: 'text-align:center' }, h('div', { html: avatarSvg(a.avatar, 56) }), h('div', { style: 'font-weight:700' }, a.name), h('div', { class: 'mut' }, st || label));
    this.pl.replaceChildren(c(this.meA, 'Toi', this.stat.me), c(this.oppA, '', this.stat.opp));
  }
  setStat(me, opp) { this.stat = { me, opp }; this.paint(); }
  /** Départ commun : l'hôte lance, l'autre attend. onGo(seed) est appelé des deux côtés avec le même nombre. */
  gate(title, how, onGo) {
    this.onNet('go', m => { this.net.send('goack'); if (this.gone) return; this.gone = true; this.clearMessage(); onGo(m.seed); });
    this.onNet('goack', () => { this.acked = true; });
    if (this.isHost) this.message(title, how, [{ label: 'Commencer', onclick: () => { if (this.gone) return; this.gone = true; const seed = (Math.random() * 1e9) | 0; this.net.send('go', { seed }); this.clearMessage(); onGo(seed);
      if (!this.remi) { let n = 0; const iv = setInterval(() => { if (this.acked || ++n > 10 || !this.alive) clearInterval(iv); else this.net.send('go', { seed }); }, 1500); this.sub(() => clearInterval(iv)); } } }]);
    else this.message(title, how + '\nAttends que l\'autre lance.', []);
    if (this.msg) { const p = this.msg.querySelector('p'); if (p) p.style.whiteSpace = 'pre-line'; }
  }
  /** Fin quand les deux ont un score : plus grand = gagnant. */
  compare(mine, theirs, fmt = v => String(v)) {
    const d = 'Toi : ' + fmt(mine) + '\n' + this.oppA.name + ' : ' + fmt(theirs);
    if (mine === theirs) { if (this.over) return; this.over = true; this.record(false); this.s.sfx('ok'); this.message('Égalité !', d, [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]); this.msg.querySelector('p').style.whiteSpace = 'pre-line'; return; }
    this.finish(mine > theirs, d); this.msg.querySelector('p').style.whiteSpace = 'pre-line';
  }
  big(text, color = '#27e0b3') { return h('div', { style: 'text-align:center;font-size:30px;font-weight:800;color:' + color + ';padding:6px;min-height:1.4em' }, text); }
  say(t) { this.ctx.tts && this.ctx.tts.speak(t); }
}

/* Course à pied sur place : « Course de pas » et « 1, 2, 3, soleil » (feu vert / feu rouge). */
export class Race extends Duo {
  constructor(ctx, o) {
    super(ctx); this.o = o; this.goal = o.goal; this.pos = 0; this.opos = 0; this.green = true; this.redSince = 0; this.stepAt = 0; this.started = false; this.ltT = 0;
    this.hud(h('span', {}, o.light ? 'Feu vert : avance' : 'Cours sur place'), h('span', {}, ''));
    this.tr = h('div', {}); this.root.append(this.tr);
    css('racefx', '@keyframes rbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes rturn{0%{transform:scaleX(-1)}100%{transform:scaleX(1)}}.rsun{display:flex;flex-direction:column;align-items:center;gap:2px;margin:4px auto}.rsun .lab{font-size:24px;font-weight:800}.rrun{display:flex;justify-content:center;margin:2px 0;animation:rbob .6s ease-in-out infinite}');
    this.lamp = o.light ? h('div', { class: 'rsun', style: 'min-height:150px' }) : null;
    if (this.lamp) { this.sun = sprEl('n_sun0', 112); this.sunLab = h('div', { class: 'lab', style: 'color:#2fbf71' }, 'VAS-Y'); this.lamp.append(this.sun, this.sunLab); this.root.append(this.lamp); }
    else { this.runner = h('div', { html: avatarSvg(this.meA.avatar, 118) }); this.runWrap = h('div', { class: 'rrun', style: 'animation:none' }, this.runner); this.root.append(this.runWrap); }
    this.note = this.big(''); this.root.append(this.note);
    this.btn = h('button', { class: 'btn big', style: 'min-height:96px;touch-action:manipulation', onpointerdown: e => { e.preventDefault(); this.step(true); } }, o.light ? 'Avancer (ou marche)' : 'Faire un pas (ou cours)');
    this.root.append(h('div', { class: 'controls' }, this.btn));
    this.onNet('pg', m => { this.opos = m.n; this.draw(); });
    this.onNet('lt', m => this.setLight(m.g));
    this.onNet('win', () => { if (!this.over) { this.finish(false, this.oppA.name + ' est arrivé avant toi.'); } });
    this.draw(); this.gate(o.title, o.how, () => this.start());
    this.loop(dt => this.update(dt));
  }
  start() { this.started = true; this.lastPg = 0; if (this.o.light && this.isHost) { this.ltT = 2.5; this.setLight(true, true); } this.say(this.o.light ? 'Un, deux, trois, soleil !' : 'Partez !'); }
  setLight(g, send) {
    this.green = g; this.redSince = 0; if (this.lamp) { sprSet(this.sun, g ? 'n_sun0' : 'n_sun1', 112); this.sun.style.animation = g ? 'none' : 'rturn .25s ease-out'; this.sunLab.style.color = g ? '#2fbf71' : '#ff5470'; this.sunLab.textContent = g ? 'VAS-Y' : 'STOP !'; }
    if (g && this.note && this.redSince === 0) this.note.textContent = '';
    if (send) this.net.send('lt', { g }); if (!g) { this.say('Soleil !'); this.s.sfx('block'); }
  }
  draw() {
    const row = (a, p, mine) => {
      const pc = Math.min(100, p / this.goal * 100), prints = [];
      if (ready()) for (let i = 0; i < Math.min(p, this.goal); i += 2) prints.push(h('div', { style: 'position:absolute;top:' + (i % 4 ? 36 : 14) + 'px;left:calc(' + (i / this.goal * 86) + '% + 20px);opacity:.55' }, sprEl(i % 4 ? 'n_fr1' : 'n_fr0', 18)));
      return h('div', { style: 'position:relative;height:72px;margin:4px 8px;background:linear-gradient(#5a4326,#3d2d18);border:2px solid #2a1e10;border-radius:14px;overflow:hidden;box-shadow:inset 0 3px 8px #0008' },
        h('div', { style: 'position:absolute;left:0;top:0;bottom:0;width:' + pc + '%;background:#f5d58a22' }), ...prints,
        h('div', { style: 'position:absolute;right:0;top:0;bottom:0;width:16px;background:repeating-conic-gradient(#fff 0 25%,#1b1f33 0 50%) 0 0/8px 8px;border-left:2px solid #0006;opacity:.95' }),
        h('div', { style: 'position:absolute;top:8px;left:calc(' + pc * 0.80 + '% + 2px);transition:left .15s;filter:drop-shadow(0 3px 2px #0009)', html: avatarSvg(a.avatar, 54) }),
        h('div', { style: 'position:absolute;right:24px;bottom:4px;font-weight:800;font-size:12px;opacity:.8' }, 'ARRIVÉE'));
    };
    this.tr.replaceChildren(row(this.meA, this.pos, true), row(this.oppA, this.opos, false));
    this.setStat(this.pos + ' / ' + this.goal, this.opos + ' / ' + this.goal);
    if (this.runner) { this.runWrap.style.animation = this.pos && !this.over ? 'rbob .5s ease-in-out infinite' : 'none'; }
  }
  finish(win, d) { super.finish(win, d); winBadge(this, win, win ? null : 'n_alarm'); }
  step(manual) {
    if (!this.started || this.over) return;
    if (this.o.light && !this.green) { if (this.redSince > .35) this.caught(); return; }
    this.pos++; this.stepAt = performance.now(); this.s.sfx('tick'); this.net.send('pg', { n: this.pos }); this.draw();
    if (this.pos >= this.goal) { this.net.send('win'); this.finish(true, 'Tu es arrivé le premier !'); }
  }
  caught() {
    if (this.pos === 0 && this.cd > 0) return; if (this.cd > 0) return; this.cd = 1; // une seule faute par seconde
    this.pos = Math.max(0, this.pos - 6); this.s.sfx('hit'); this.s.vibrate(200); this.net.send('pg', { n: this.pos }); this.draw();
    this.note.textContent = 'Tu as bougé ! Recule de 6.'; this.note.style.color = '#ff5470'; setTimeout(() => { this.note.textContent = ''; }, 1500);
  }
  update(dt) {
    if (!this.started || this.over) return;
    this.cd = Math.max(0, (this.cd || 0) - dt);
    if (this.o.light) {
      if (!this.green) this.redSince += dt;
      if (this.isHost) { this.ltT -= dt; if (this.ltT <= 0) { if (this.green) { this.ltT = 1.6 + Math.random() * 1.4; this.setLight(false, true); } else { this.ltT = 2 + Math.random() * 2.2; this.setLight(true, true); } } }
      if (!this.green) this.note.textContent = this.redSince > .35 ? 'Ne bouge plus !' : '';
    }
    const now = performance.now();
    if (this.s.motionSeen) {
      if (!this.green && this.redSince > .5 && this.s.accel > 3.4 && this.o.light) this.caught();
      else if (this.s.accel > 2.6 && now - this.stepAt > 380) { this.stepAt = now; this.step(false); }
    }
  }
}
