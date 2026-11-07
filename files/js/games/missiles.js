// Duel de bateaux (vue de dessus) : chacun voit son bateau en bas et celui de l'autre en haut. Les canons tirent des boulets.
// Bouger : l'inclinaison du téléphone EST le bateau (gauche, droite, avance, recule), ou le doigt sur la mer. Deux pouces : tirs à droite, saut à gauche, gros tir explosif au milieu.
import { GameBase, holdButton } from './base.js';
import { h, clamp } from '../core/util.js';
import { spr, sprC } from '../core/sprites.js';
import { makeAtlas } from '../core/atlas.js';
import { R as MR } from '../core/mer_rects.js';
import { boom } from '../core/boom.js';
import { buildWorld, mirror, alive, fragTargets, DEB_V, BOAT_YMIN, BOAT_YMAX, BOAT_HX, BOAT_HY } from '../core/mer_world.js';
const MER = makeAtlas('img/mer.webp', MR);
const cover = (g, im, W, H) => { const k = Math.max(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * k, hh = im.naturalHeight * k; g.drawImage(im, (W - w) / 2, (H - hh) / 2, w, hh); };

// Vue dézoomée : la mer de jeu (360 x 560) est entourée d'une marge de mer visible (VX, VY) pour voir arriver les boulets et le bateau adverse.
const VW = 432, VH = 672, VX = 36, VY = 56, JUMP_T = .8, JUMP_CD = 3, BURST_CD = 3.2;
let MANCHE = 0; // numéro de la manche (augmente à chaque partie terminée) : plus de manches = un peu plus d'obstacles
const BOMB_CD = 8, BOMB_V = 300, BOMB_R = 60; // rechargement (s), vitesse, rayon de la zone = 8 × le rayon du boulet normal (7,5)
class Missiles extends GameBase {
  constructor(ctx) {
    super(ctx); this.isHost = this.role === 'host';
    this.lives = 5; this.score = 0; this.oppLives = 5;
    this.bombCool = 0; this.x = 180; this.y = 500; this.ox2 = 180; this.oy2 = 60; this.jmp = 0; this.jcool = 0; this.ojmp = 0; this.bcool = 0; this.burst = 0; this.burstT = 0; this.touch = null; this.manche = MANCHE; this.dir = 0; this.cool = 0; this.mine = []; this.theirs = []; this.t = 0; this.posT = 0; this.fx = []; this.flashL = 0; this.world = []; this.inv = 0; this.oinv = 0; this.shake = 0; this.debris = []; this.alertT = 0; this.alertTxt = ''; this.kick = 0; this.kickY = 0; this.seedOk = false; this.stars = Array.from({ length: 40 }, () => [Math.random() * 360, Math.random() * 560, Math.random() * 1.5 + .5]);
    this.hudL = h('span', {}, 'Mes vies : 5'); this.hudS = h('span', {}, 'Touchés : 0'); this.hudO = h('span', {}, 'Adversaire : 5');
    this.hud(this.hudL, this.hudS, this.hudO);
    this.makeCanvas(VW, VH);
    // Tenue à deux pouces : saut à gauche (bord), deux tirs à droite (bord), gros tir explosif au milieu.
    this.jumpBtn = h('button', { class: 'btn sec saut', onclick: () => this.jump() }, 'SAUT');
    this.fireBtn = h('button', { class: 'btn warn tir1', onclick: () => this.fire() }, 'TIR');
    this.burstBtn = h('button', { class: 'btn warn tir2', onclick: () => this.rafale() }, 'RAFALE');
    this.bombBtn = h('button', { class: 'btn bad bomb', onclick: () => this.bomb() }, 'GROS TIR EXPLOSIF');
    this.root.append(h('div', { class: 'controls merctl' }, this.jumpBtn, this.bombBtn, this.fireBtn, this.burstBtn));
    // Doigt posé sur la mer : le bateau va vers le doigt (secours quand l'inclinaison ne marche pas)
    const tp = e => { const r = this.cv.getBoundingClientRect(), d = this.cv.width / r.width; this.touch = { x: ((e.clientX - r.left) * d - this.ox) / this.sc - VX, y: ((e.clientY - r.top) * d - this.oy) / this.sc - VY }; };
    this.cv.addEventListener('pointerdown', e => { e.preventDefault(); this.cv.setPointerCapture && this.cv.setPointerCapture(e.pointerId); tp(e); });
    this.cv.addEventListener('pointermove', e => { if (this.touch) tp(e); });
    const tu = () => { this.touch = null; }; this.cv.addEventListener('pointerup', tu); this.cv.addEventListener('pointercancel', tu);

    // Îles et rochers : l'hôte tire une graine et la donne à l'autre (renvoyée jusqu'à accusé de réception) ; les deux téléphones construisent la même mer.
    this.onNet('seed', m => { if (!this.isHost) { this.setWorld(m.seed, m.m); this.net.send('seedack'); } });
    this.onNet('seedreq', () => { if (this.isHost) this.net.send('seed', { seed: this.seed, m: this.manche }); });
    this.onNet('seedack', () => { this.acked = true; });
    if (this.isHost) { this.seed = (Math.random() * 1e9) | 0; this.setWorld(this.seed, this.manche); this.net.send('seed', { seed: this.seed, m: this.manche }); let n = 0; const iv = setInterval(() => { if (this.acked || ++n > 12 || !this.alive) clearInterval(iv); else this.net.send('seed', { seed: this.seed, m: this.manche }); }, 1200); this.sub(() => clearInterval(iv)); }
    else this.net.send('seedreq');
    this.onNet('rockhit', m => { const o = this.world.find(r => r.id === m.id); if (!o || !alive(o)) return; o.hp--; o.hitAt = performance.now(); this.addFx(o.x, o.y, 'chip'); boom.crack(this.s); if (o.hp <= 0) this.destroyRock(o, false, m.tx * 360, m.s); });
    this.onNet('crash', m => { this.oppLives = m.lives; this.oinv = 1.2; if (m.k === 'deb') this.score++; this.addFx(this.ox2, this.oy2 + 8, 'splash'); this.addFx(this.ox2, this.oy2, 'chip'); boom.thud(this.s); this.refresh();
      if (m.lives <= 0) this.finish(true, m.k === 'deb' ? 'Tes rochers ont coulé l\'autre !' : 'L\'autre s\'est écrasé sur une île.'); });
    this.onNet('pos', m => { this.ox2 = (1 - m.x) * 360; if (m.y != null) this.oy2 = clamp((1 - m.y) * 560, 30, 190); });
    this.onNet('jump', () => { this.ojmp = JUMP_T; });
    this.onNet('fire', m => { this.theirs.push({ x: (1 - m.x) * 360, y: (m.y != null ? (1 - m.y) * 560 : this.oy2) + 42 }); boom.shot(this.s); });
    this.onNet('hit', m => { this.addFx(this.ox2, this.oy2 + 16, 'boom'); this.score++; this.oppLives = m.lives; boom.thud(this.s); this.refresh(); if (m.lives <= 0) this.finish(true, 'Tu as fait perdre ' + this.score + ' vies à l\'autre.'); });
    // Boulet explosif de l'autre : il tombe tout droit puis explose à la hauteur de mon bateau (je décide des dégâts, comme pour un tir normal).
    this.onNet('bomb', m => { this.theirs.push({ x: (1 - m.x) * 360, y: (m.y != null ? (1 - m.y) * 560 : this.oy2) + 42, big: true }); boom.big(this.s); });
    this.onNet('boom', m => { // résultat chez l'autre : grosse explosion sur son bateau
      this.addFx((1 - m.x) * 360, m.y != null ? (1 - m.y) * 560 : this.oy2, 'big'); boom.big(this.s); const dmg = this.oppLives - m.lives; this.oppLives = m.lives;
      if (dmg > 0) { this.score += dmg; this.addFx(this.ox2, this.oy2 + 16, 'boom'); }
      this.refresh(); if (m.lives <= 0) this.finish(true, 'Tu as fait perdre ' + this.score + ' vies à l\'autre.'); });
    this.onSense('key', e => { if (e.k === 'left') this.keyL = e.down; if (e.k === 'right') this.keyR = e.down; if (e.k === 'up') this.keyU = e.down; if (e.k === 'down') this.keyD = e.down; });
    this.onSense('shake', () => this.fire()); // une secousse tire aussi
    this.wireReplay();
    this.message('Duel de bateaux', 'Incline ton téléphone : à gauche, à droite, en avant pour avancer, en arrière pour reculer (ou pose le doigt sur la mer). À droite, TIR et RAFALE (3 boulets). À gauche, SAUT : ton bateau saute par-dessus les boulets et les îles, sans dégât pendant un instant. Au milieu, GROS TIR. Tu peux te cacher derrière une île, mais l\'autre peut la détruire. Un choc contre une île coûte 1 vie. Les rochers fissurés se brisent en 2 ou 3 tirs et leurs débris partent vers l\'autre bateau. Le GROS TIR explosif (toutes les 8 secondes) explose en grosse zone : -3 vies si tu es dedans. Évite-les !', [{ label: 'Commencer', onclick: () => { this.clearMessage(); this.started = true; this.ctx.tts && this.ctx.tts.speak('Go !'); } }]);
    this.loop(dt => this.update(dt));
  }
  finish(win, d) { if (!this.over) MANCHE++; super.finish(win, d); }
  refresh() { this.hudL.textContent = 'Mes vies : ' + this.lives; this.hudS.textContent = 'Touchés : ' + this.score; this.hudO.textContent = 'Adversaire : ' + this.oppLives; }
  shoot() { this.addFx(this.x, this.y - 38, 'muzzle'); this.mine.push({ x: this.x, y: this.y - 42 }); this.net.send('fire', { x: this.x / 360, y: this.y / 560 }); boom.shot(this.s); }
  fire() { if (!this.started || this.over || this.cool > 0) return; this.cool = .45; this.shoot(); }
  // Rafale : 3 boulets à la suite (recharge visible)
  rafale() { if (!this.started || this.over || this.bcool > 0) return; this.bcool = BURST_CD; this.burst = 3; this.burstT = 0; }
  // Saut : le bateau passe par-dessus boulets, débris et îles, invulnérable un court instant (recharge visible)
  jump() { if (!this.started || this.over || this.jcool > 0) return; this.jmp = JUMP_T; this.jcool = JUMP_CD; this.net.send('jump'); this.addFx(this.x, this.y + 6, 'splash'); boom.splash(this.s); this.s.vibrate(30); }
  bomb() {
    if (!this.started || this.over || this.bombCool > 0) return; this.bombCool = BOMB_CD;
    this.addFx(this.x, this.y - 38, 'muzzle'); this.mine.push({ x: this.x, y: this.y - 42, big: true }); this.net.send('bomb', { x: this.x / 360, y: this.y / 560 }); boom.big(this.s); this.s.vibrate(40);
  }

  // Texte d'un bouton à recharge : nom seul quand prêt, sinon nom + secondes restantes (bouton grisé)
  label(b, cd, name) { const rdy = cd <= 0; if (b.disabled !== !rdy) b.disabled = !rdy; const t = rdy ? name : name + ' ' + Math.ceil(cd) + ' s'; if (b.textContent !== t) b.textContent = t; }
  update(dt) {
    this.t += dt; this.cool = Math.max(0, this.cool - dt); this.inv = Math.max(0, this.inv - dt); this.jmp = Math.max(0, this.jmp - dt); this.ojmp = Math.max(0, this.ojmp - dt); this.jcool = Math.max(0, this.jcool - dt); this.bombCool = Math.max(0, this.bombCool - dt); this.bcool = Math.max(0, this.bcool - dt); this.oinv = Math.max(0, this.oinv - dt); this.shake = Math.max(0, this.shake - dt); this.alertT = Math.max(0, this.alertT - dt);
    this.label(this.bombBtn, this.bombCool, 'GROS TIR EXPLOSIF'); this.label(this.jumpBtn, this.jcool, 'SAUT'); this.label(this.burstBtn, this.bcool, 'RAFALE');
    if (this.burst > 0 && !this.over) { this.burstT -= dt; if (this.burstT <= 0) { this.burst--; this.burstT = .13; this.shoot(); } }
    if (this.started && !this.over) {
      let d = (this.keyR ? 1 : 0) - (this.keyL ? 1 : 0), e = (this.keyD ? 1 : 0) - (this.keyU ? 1 : 0);
      if (!d && this.s.orientSeen && Math.abs(this.s.tilt) > .12) d = this.s.tilt;
      if (!e && this.s.orientSeen && Math.abs(this.s.tiltY) > .12) e = this.s.tiltY; // en avant (haut du téléphone qui s'éloigne) = avance (y diminue), en arrière = recule
      if (this.touch) { const tx = clamp((this.touch.x - this.x) / 24, -1, 1), ty = clamp((this.touch.y - 20 - this.y) / 24, -1, 1); if (!d) d = tx; if (!e) e = ty; }
      this.x = clamp(this.x + (d * 230 + this.kick) * dt, 24, 336); this.y = clamp(this.y + (e * 150 + this.kickY) * dt, BOAT_YMIN, BOAT_YMAX); this.kick *= Math.max(0, 1 - 5 * dt); this.kickY *= Math.max(0, 1 - 5 * dt);
      for (const o of this.world) { // îles : solides, le choc me repousse vers le bas et coûte 1 vie (jamais en plein saut)
        if (o.k !== 'isle' || this.over || this.jmp > 0) continue;
        if (Math.abs(this.x - o.x) < o.r + BOAT_HX && Math.abs(this.y - o.y) < o.r + BOAT_HY) { this.y = clamp(o.y + o.r + BOAT_HY + 1, BOAT_YMIN, BOAT_YMAX); this.kickY = 120; if (this.inv <= 0) this.crash(o); }
      }
      this.posT += dt; if (this.posT > 1 / 15) { this.posT = 0; this.net.send('pos', { x: this.x / 360, y: this.y / 560 }); }
    }
    this.mine.forEach(m => m.y -= (m.big ? BOMB_V : 430) * dt);
    this.mine = this.mine.filter(m => { if (m.big) return m.y > this.oy2; const o = this.hitObs(m); if (o) { this.blocked(o, m, true); return false; } return m.y > -10; });
    this.updDebris(dt);
    for (const m of this.theirs) m.y += (m.big ? BOMB_V : 360) * dt;
    this.theirs = this.theirs.filter(m => {
      if (m.big) { // explosion à la hauteur de mon bateau : zone de destruction ×8, 3 vies d'un coup
        if (m.y < this.y || this.over) return m.y < this.y && !this.over;
        const hit = Math.abs(m.x - this.x) < BOMB_R && this.jmp <= 0; this.addFx(m.x, this.y, 'big'); boom.big(this.s);
        if (hit) { this.lives = Math.max(0, this.lives - 3); this.s.vibrate([200, 60, 200]); }
        this.refresh(); this.net.send('boom', { lives: this.lives, x: m.x / 360, y: this.y / 560 });
        if (hit && this.lives <= 0) this.finish(false, 'L\'autre t\'a coulé.');
        return false;
      }
      { const o = this.hitObs(m); if (o) { this.blocked(o, m, false); return false; } }
      if (m.y >= this.y - 14 && m.y <= this.y + 20 && Math.abs(m.x - this.x) < 26 && !this.over && this.jmp <= 0) {
        this.addFx(m.x, this.y, 'boom'); this.lives--; this.refresh(); boom.thud(this.s); this.s.vibrate(120);
        this.net.send('hit', { lives: this.lives });
        if (this.lives <= 0) this.finish(false, 'L\'autre t\'a fait perdre 5 vies.');
        return false;
      }
      if (m.y >= this.y + 24 && !this.over) { this.addFx(m.x, this.y + 30, 'splash'); boom.splash(this.s); return false; }
      return m.y < 640;
    });
    this.draw();
  }

  setWorld(seed, manche = 0) { const w = buildWorld(seed, manche); this.world = this.isHost ? w : mirror(w); this.seedOk = true; }
  hitObs(m) { for (const o of this.world) if (alive(o) && Math.hypot(m.x - o.x, m.y - o.y) < o.r + 5) return o; return null; }
  // Un boulet normal arrive sur une île (arrêté) ou sur un rocher (arrêté ; seul celui qui tire compte le coup, l'autre le reçoit par 'rockhit').
  blocked(o, m, mineShot) {
    if (o.k === 'isle') { this.addFx(m.x, m.y, 'chip'); boom.splash(this.s); return; }
    this.addFx(m.x, m.y, 'chip'); boom.crack(this.s); o.hitAt = performance.now();
    if (!mineShot) return;
    o.hp--; const s = (Math.random() * 1e9) | 0; this.net.send('rockhit', { id: o.id, tx: this.ox2 / 360, s });
    if (o.hp <= 0) this.destroyRock(o, true, this.ox2, s);
  }
  // Rocher détruit : 3 débris partent vers le bateau de l'autre (txS = position du bateau visé, vue de celui qui a détruit). Chez la victime ils font -1 vie chacun.
  destroyRock(o, byMe, txS, s) {
    o.hp = 0; this.addFx(o.x, o.y, 'boom'); boom.crack(this.s);
    const xs = fragTargets(txS, s).map(x => byMe ? x : 360 - x), ty = byMe ? this.oy2 : this.y;
    xs.forEach((x, i) => this.debris.push({ x: o.x, y: o.y, tx: x, ty, dly: .12 + i * .24, go: false, dmg: !byMe, rot: i * 2, w: 8 + i * 1.5 }));
    if (!byMe) { this.alertT = 1.4; this.alertTxt = 'ROCHERS ! ESQUIVE !'; this.s.vibrate([60, 40, 60]); }
  }
  updDebris(dt) {
    this.debris = this.debris.filter(d => {
      if (!d.go) { d.dly -= dt; if (d.dly > 0) return true; d.go = true; const dx = d.tx - d.x, dy = d.ty - d.y, L = Math.hypot(dx, dy) || 1; d.vx = dx / L * DEB_V; d.vy = dy / L * DEB_V; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.rot += dt * 7;
      if (d.dmg) {
        if (!this.over && this.inv <= 0 && this.jmp <= 0 && d.y >= this.y - 16 && d.y <= this.y + 20 && Math.abs(d.x - this.x) < 28) {
          this.lives = Math.max(0, this.lives - 1); this.inv = .5; this.shake = .35; this.alertT = 1.1; this.alertTxt = 'ROCHER ! -1 VIE'; this.s.vibrate(150); boom.thud(this.s);
          this.addFx(d.x, d.y, 'chip'); this.refresh(); this.net.send('crash', { lives: this.lives, k: 'deb' });
          if (this.lives <= 0) this.finish(false, 'Les rochers de l\'autre t\'ont coulé.'); return false;
        }
        if (d.y > this.y + 30) { this.addFx(d.x, 535, 'splash'); boom.splash(this.s); return false; }
      } else if (d.y < this.oy2 + 8) return false;
      return true;
    });
  }
  // Je me suis écrasé sur une île : -1 vie, je suis repoussé, le téléphone vibre, l'écran est secoué, courte invulnérabilité.
  crash(o) {
    this.lives = Math.max(0, this.lives - 1); this.inv = 1.6; this.shake = .55; this.alertT = 1.2; this.alertTxt = 'CHOC ! -1 VIE'; this.s.vibrate([120, 40, 120]); boom.thud(this.s);
    this.addFx(this.x, this.y, 'splash'); this.addFx(this.x + (this.x < o.x ? 14 : -14), this.y + 20, 'splash'); this.refresh(); this.net.send('crash', { lives: this.lives, k: 'isle' });
    if (this.lives <= 0) this.finish(false, 'Ton bateau s\'est brisé sur une île.');
  }
  addFx(x, y, kind) { this.fx.push({ x, y, kind, t: performance.now() }); }
  // Bateau vu de dessus (planche mer.webp) : proue vers le haut (le tien) ou vers le bas (l'autre) ; l'état de dégâts suit les vies.
  ship(x, y, up, kind, lives, jmp = 0) {
    const g = this.g, t = performance.now() / 1000, bob = Math.sin(t * 2 + x * .02) * 1.2, lift = jmp > 0 ? Math.sin(Math.PI * (1 - jmp / JUMP_T)) : 0, key = kind === 'me' ? 'c' : 'r';
    const dead = lives <= 0 && this.over;
    if ((kind === 'me' ? this.inv : this.oinv) > 0 && Math.floor(performance.now() / 90) % 2) g.globalAlpha = .4;
    g.save(); const ba = g.globalAlpha;
    if (lift > 0) { g.fillStyle = '#05243f55'; g.beginPath(); g.ellipse(x + 6, y + 8, 20 + lift * 4, 42 + lift * 6, 0, 0, 7); g.fill(); } // ombre restée sur l'eau pendant le saut
    g.translate(x, y + bob - lift * 16); g.scale(1 + lift * .22, 1 + lift * .22); if (!up) g.rotate(Math.PI);
    g.globalAlpha = .55; for (let i = 0; i < 2; i++) { const w = 54 + i * 14 + Math.sin(t * 4 + i) * 3; MER.sprW(g, 'waveB', 0, 58 + i * 12, w); } g.globalAlpha = ba;
    g.fillStyle = '#05243f44'; g.beginPath(); g.ellipse(5, 6, 24, 46, 0, 0, 7); g.fill();
    if (dead) { MER.sprH(g, 'wreck', 0, 4, 96); g.restore(); g.globalAlpha = 1; return; }
    const st = lives >= 4 ? 1 : lives >= 2 ? 2 : 3;
    if (!MER.sprH(g, key + st, 0, 0, 100)) { g.fillStyle = '#a8692f'; g.fillRect(-22, -48, 44, 96); }
    g.restore(); g.globalAlpha = 1;
  }
  // Boulet de canon vu de dessus (planche) : boule noire, ombre sur l'eau et petite fumée derrière.
  rocket(x, y, up) {
    const g = this.g, d = up ? 1 : -1;
    for (let i = 3; i >= 1; i--) { g.globalAlpha = .5 - i * .11; MER.sprC(g, 'smoke', x + Math.sin(i * 2 + y * .05) * 2, y + d * i * 10, 14 - i * 2); } g.globalAlpha = 1;
    g.fillStyle = '#05243f55'; g.beginPath(); g.ellipse(x + 4, y + 5, 7, 5, 0, 0, 7); g.fill();
    MER.sprC(g, 'ball', x, y, 17);
  }
  // Gros boulet explosif (planche : bombe à mèche allumée) : tourne sur lui-même, traînée de fumée et d'étincelles.
  bigball(x, y, up) {
    const g = this.g, d = up ? 1 : -1, t = performance.now() / 1000;
    for (let i = 4; i >= 1; i--) { g.globalAlpha = .5 - i * .09; MER.sprC(g, 'smoke', x + Math.sin(i * 2 + t * 9) * 3, y + d * i * 13, 26 - i * 3); } g.globalAlpha = 1;
    g.fillStyle = '#05243f55'; g.beginPath(); g.ellipse(x + 7, y + 9, 17, 12, 0, 0, 7); g.fill();
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 5) * .35); MER.sprC(g, 'bomb', 0, 0, 40); g.restore();
    if (Math.sin(t * 40) > 0) MER.sprC(g, 'spark', x + 10, y - d * 14, 26);
  }
  // Îles solides (sable, végétation) et rochers fissurés : plus un rocher est abîmé, plus il a de fissures.
  obstacles(g, now) {
    for (const o of this.world) {
      if (!alive(o)) continue;
      g.fillStyle = '#05243f55'; g.beginPath(); g.ellipse(o.x + 6, o.y + 8, o.r * 1.05, o.r * .85, 0, 0, 7); g.fill();
      g.globalAlpha = .5; MER.sprW(g, 'waveW', o.x, o.y + o.r * .75, o.r * 2.9); g.globalAlpha = 1;
      if (o.k === 'isle') { if (!MER.sprC(g, 'isle', o.x, o.y, o.r * 2.7)) { g.fillStyle = '#d8c48a'; g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); g.fill(); } continue; }
      const jit = o.hitAt && now - o.hitAt < 220 ? (Math.random() - .5) * 5 : 0, x = o.x + jit;
      if (!MER.sprC(g, o.v === 1 ? 'rock1' : 'rock2', x, o.y, o.r * 2.6)) { g.fillStyle = '#7b7468'; g.beginPath(); g.arc(x, o.y, o.r, 0, 7); g.fill(); }
      const dmg = o.max - o.hp, n = 2 + dmg * 2; g.save(); g.translate(x, o.y); g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < n; i++) { // fissures en zigzag qui partent du centre
        const an = o.a + i * (6.28 / n) + .5, L = o.r * (.55 + .12 * dmg); let px = 0, py = 0; g.beginPath(); g.moveTo(0, 0);
        for (let k = 1; k <= 3; k++) { const aa = an + (k % 2 ? .28 : -.28), rr = L * k / 3; px = Math.cos(aa) * rr; py = Math.sin(aa) * rr; g.lineTo(px, py); }
        g.strokeStyle = '#1d1710'; g.lineWidth = 2.6; g.stroke(); g.strokeStyle = '#e9ddc2aa'; g.lineWidth = .9; g.stroke();
      }
      g.restore();
    }
  }
  hearts(g, x, y, n, max, dir, sz = 20, st = 22) {
    for (let i = 0; i < max; i++) { const hx = x + dir * i * st; if (!spr(g, i < n ? 'k_heart' : 'k_broken', hx, y, sz)) { g.fillStyle = i < n ? '#ff5470' : '#444'; g.fillRect(hx, y, 16, 14); } }
  }
  drawFx(g) {
    const now = performance.now(); this.fx = this.fx.filter(f => now - f.t < (f.kind === 'big' ? 1000 : f.kind === 'splash' ? 800 : 700));
    for (const f of this.fx) {
      const a = (now - f.t) / 700;
      if (f.kind === 'big') { // grosse explosion : la zone exacte (rayon BOMB_R) = anneau de choc ; flamme, fumée, éclaboussures, débris
        const A = (now - f.t) / 1000, r = BOMB_R * Math.min(1, A * 2.2 + .15);
        g.globalAlpha = Math.max(0, 1 - A); MER.sprC(g, 'ring', f.x, f.y, r * 2.3);
        g.globalAlpha = Math.max(0, 1 - A * 1.2); MER.sprC(g, 'x2', f.x, f.y, BOMB_R * 2.2 * (.45 + A * .7));
        g.globalAlpha = Math.max(0, .9 - A); MER.sprC(g, 'smoke', f.x, f.y - A * 20, BOMB_R * 1.5 * (.5 + A));
        g.globalAlpha = Math.max(0, 1 - A * 1.1); MER.sprC(g, 'debris', f.x, f.y, r * 2.1);
        for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283 + .4, rr = r * (.6 + .4 * A); g.globalAlpha = Math.max(0, 1 - A * 1.3); MER.sprC(g, i % 2 ? 'spl2' : 'spl1', f.x + Math.cos(an) * rr, f.y + Math.sin(an) * rr, 26 + 10 * A); }
        g.globalAlpha = 1; continue;
      }
      if (f.kind === 'chip') { g.globalAlpha = a < .5 ? 1 : Math.max(0, 1 - (a - .5) / .5); MER.sprC(g, 'debris', f.x, f.y, 34 + a * 36); MER.sprC(g, 'spark', f.x, f.y, 30 + a * 20); g.globalAlpha = 1; continue; }
      if (f.kind === 'muzzle') { g.globalAlpha = 1 - a * 1.6 > 0 ? 1 - a * 1.6 : 0; MER.sprC(g, 'x1', f.x, f.y - 6, 34 + a * 20); MER.sprC(g, 'smoke', f.x, f.y - 14 - a * 16, 22 + a * 14); g.globalAlpha = 1; }
      else if (f.kind === 'splash') { g.globalAlpha = a < .6 ? 1 : 1 - (a - .6) / .4; MER.sprC(g, 'spl1', f.x, f.y, 36 + a * 20); g.globalAlpha = 1; }
      else { g.globalAlpha = a < .6 ? 1 : 1 - (a - .6) / .4; MER.sprC(g, 'x1', f.x, f.y, 56 + a * 40); MER.sprC(g, 'debris', f.x, f.y, 60 + a * 40); MER.sprC(g, 'spark', f.x, f.y, 50 + a * 30); g.globalAlpha = 1; }
    }
  }
  draw() {
    if (!this.cv.width) return; this.begin(); const g = this.g, now = performance.now(); g.translate(VX, VY); if (this.shake > 0) g.translate((Math.random() - .5) * 12 * Math.min(1, this.shake * 2), (Math.random() - .5) * 12 * Math.min(1, this.shake * 2));
    const art = MER.ready();
    // Mer vue de dessus : dégradé + éléments de la planche qui défilent lentement (rochers, îlots, tonneaux, caisses sur les bords) + vagues
    const sea = g.createLinearGradient(0, -VY, 0, 560 + VY); sea.addColorStop(0, '#0b4a7a'); sea.addColorStop(.5, '#0f78b0'); sea.addColorStop(1, '#0b4a7a'); g.fillStyle = sea; g.fillRect(-VX, -VY, VW, VH);
    if (art) {
      g.globalAlpha = .35; for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { const yy = ((r * 96 + now * .012 + c * 41) % 768) - 100, xx = c * 130 - 20 + (r % 2) * 50 + Math.sin(now / 2000 + r + c) * 5; MER.sprW(g, (r + c) % 2 ? 'waveB' : 'waveW', xx, yy, 44); } g.globalAlpha = 1;
      g.globalAlpha = .22; for (let r = 0; r < 3; r++) MER.sprC(g, 'glint', 40 + r * 140 + Math.sin(now / 1400 + r) * 8, ((r * 230 + now * .01) % 640) - 40, 120); g.globalAlpha = 1;
      const SC = [['barrel', -14, 300, 26], ['crate', 376, 400, 30], ['barrel', 374, 90, 24], ['crate', -10, 520, 28]];
      for (const [n, x, off, sz] of SC) { const yy = ((off + now * .014) % 700) - 70; MER.sprC(g, n, x, yy, sz); }
    }
    this.obstacles(g, now);
    this.ship(this.ox2, this.oy2, false, 'opp', this.oppLives, this.ojmp); this.ship(this.x, this.y, true, 'me', this.lives, this.jmp);
    for (const m of this.theirs) if (m.big) { // zone de danger à esquiver, visible tant que le boulet explosif arrive
      const p = .5 + .5 * Math.sin(now / 90); g.save(); g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = `rgba(255,90,60,${.5 + p * .4})`; g.fillStyle = `rgba(255,90,60,${.1 + p * .08})`;
      g.beginPath(); g.arc(m.x, this.y, BOMB_R, 0, 7); g.fill(); g.stroke(); g.restore(); }
    for (const m of this.mine) m.big ? this.bigball(m.x, m.y, true) : this.rocket(m.x, m.y, true);
    for (const m of this.theirs) m.big ? this.bigball(m.x, m.y, false) : this.rocket(m.x, m.y, false);
    // Débris de rocher qui arrivent sur mon bateau : cibles marquées en rouge + alerte
    const inc = this.debris.filter(d => d.dmg);
    if (inc.length) { const bl = Math.floor(now / 140) % 2; g.save(); g.lineWidth = 3; g.strokeStyle = bl ? '#ff3b30' : '#ffb84a'; for (const d of inc) { g.beginPath(); g.arc(d.tx, this.y, 22, 0, 7); g.moveTo(d.tx - 12, this.y - 12); g.lineTo(d.tx + 12, this.y + 12); g.moveTo(d.tx + 12, this.y - 12); g.lineTo(d.tx - 12, this.y + 12); g.stroke(); } g.restore(); }
    for (const d of this.debris) { if (!d.go) continue; g.save(); g.translate(d.x, d.y); g.rotate(d.rot); g.fillStyle = '#05243f66'; g.beginPath(); g.ellipse(4, 5, d.w, d.w * .8, 0, 0, 7); g.fill();
      g.fillStyle = '#7d756a'; g.strokeStyle = '#2a2118'; g.lineWidth = 2; g.beginPath(); g.moveTo(-d.w, -d.w * .4); g.lineTo(-d.w * .2, -d.w); g.lineTo(d.w, -d.w * .3); g.lineTo(d.w * .7, d.w * .8); g.lineTo(-d.w * .6, d.w * .7); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#b9b0a0'; g.fillRect(-d.w * .5, -d.w * .5, d.w * .5, d.w * .3); g.restore(); }
    if (art) this.drawFx(g);
    g.translate(-VX, -VY); // interface en repère de l'écran (hors zoom)
    if (this.alertT > 0) { g.fillStyle = `rgba(255,40,30,${Math.min(.3, this.alertT * .25)})`; g.fillRect(0, 0, VW, VH); }
    if (inc.length || this.alertT > 0) { g.save(); g.textAlign = 'center'; g.font = '800 22px sans-serif'; g.lineWidth = 5; g.strokeStyle = '#3a0a06'; g.fillStyle = Math.floor(now / 160) % 2 ? '#ffffff' : '#ffd54a'; const tx = this.alertT > 0 ? this.alertTxt : 'ROCHERS ! ESQUIVE !'; g.strokeText(tx, VW / 2, VH / 2); g.fillText(tx, VW / 2, VH / 2); g.restore(); }
    this.hearts(g, 10, VH - 26, this.lives, 5, 1);
    this.hearts(g, 10, 10, this.oppLives, 5, 1);
    const k = 1 - this.bombCool / BOMB_CD, kj = 1 - this.jcool / JUMP_CD;
    g.fillStyle = '#0008'; g.fillRect(VW - 136, VH - 22, 124, 12); g.fillStyle = k >= 1 ? '#ffb84a' : '#c4642a'; g.fillRect(VW - 134, VH - 20, 120 * k, 8);
    g.fillStyle = '#0008'; g.fillRect(VW - 136, VH - 52, 124, 12); g.fillStyle = kj >= 1 ? '#7fe3c8' : '#3a8f86'; g.fillRect(VW - 134, VH - 50, 120 * kj, 8);
    g.fillStyle = '#fff'; g.font = '700 10px sans-serif'; g.textAlign = 'right'; g.fillText(k >= 1 ? 'GROS TIR PRÊT' : 'GROS TIR…', VW - 12, VH - 26); g.fillText(kj >= 1 ? 'SAUT PRÊT' : 'SAUT…', VW - 12, VH - 56);
    this.endDraw();
  }
}
export default { id: 'missiles', name: 'Duel de bateaux', short: 'Coule le bateau de l\'autre à coups de canon et esquive ses boulets.', how: ['Incline le téléphone : à gauche ou à droite pour tourner, en avant pour avancer, en arrière pour reculer (ou pose le doigt sur la mer).', 'À droite : TIR (un boulet) et RAFALE (3 boulets). À gauche : SAUT, le bateau passe par-dessus boulets et îles sans dégât un instant (il se recharge).', 'Au milieu : GROS TIR explosif, zone 8 fois plus grande, -3 vies. Éloigne-toi du cercle rouge !', 'Cache-toi derrière une île : elle te protège, mais l\'autre peut la détruire à coups de canon.', 'Premier à faire perdre 5 vies gagne.'], create: ctx => new Missiles(ctx) };
