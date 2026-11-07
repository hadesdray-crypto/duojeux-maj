// Canonnier en équipe : un PILOTE (dirige le vaisseau : gauche/droite, avant/arrière, bouclier) et un TIREUR (tire, gère la chauffe,
// les munitions et le gros tir). Le téléphone de celui qui crée la partie calcule le jeu ; l'autre envoie ses commandes et affiche le résultat.
import { GameBase, holdButton } from './base.js';
import { h, clamp } from '../core/util.js';
import { boom } from '../core/boom.js';
import { lerp } from '../core/level.js';

import { RECT } from './canon_atlas.js';
import { spr as aspr, sprC, ready as aready } from '../core/sprites.js';
const load = src => { const i = new Image(); i.onload = () => { i.ok = true; }; i.onerror = () => { i.ok = false; }; i.src = src; return i; };
const ATLAS = load('img/canon.webp'), BACK = load('img/canon-fond.webp'), BACK2 = load('img/bg/space.webp'), ISL = load('img/bg/island.webp'), STORM = load('img/bg/storm.webp');
const SKINS = [['pirate', 'Bateau pirate'], ['saucer', 'Soucoupe'], ['delta', 'Chasseur']];
/** Décors par niveau : [image, voile de couleur, nom]. Plus on avance, plus la carte change. */
const MAPS_SEA = [['n', null, 'Mer de nuit'], ['i', null, 'Baie des palmiers'], ['s', null, 'Mer en orage'], ['n', '255,90,40,.22', 'Nuit rougeoyante'], ['i', '10,20,60,.35', 'Baie sous la lune'], ['s', '120,30,160,.25', 'Orage violet']];
const MAPS_SPACE = [['x', null, 'Espace profond'], ['x', '150,60,220,.25', 'Nébuleuse violette'], ['x', '230,60,60,.25', 'Champ de feu'], ['x', '40,200,200,.22', 'Zone glacée'], ['x', '240,190,60,.2', 'Ceinture dorée'], ['x', '10,10,40,.45', 'Nuit noire']];
const LV_AT = [0, 8, 20, 36, 56, 80, 110, 145, 185, 230];     // ennemis détruits pour atteindre le niveau 1, 2, 3…
const pick3 = () => { const r = Math.random(); return r < .4 ? 0 : r < .7 ? 1 : 2; };
const ITEM_NAME = ['Tir triple', 'Tir quadruple', 'Vague de tirs'];
class Vaisseau extends GameBase {
  constructor(ctx) {
    super(ctx); this.sub(() => this.s.stopMic());
    this.isHost = this.role === 'host';
    this.myRole = this.isHost ? 'pilot' : 'gun';             // 'pilot' ou 'gun' ; le créateur peut échanger
    this.in = { dir: 0, fy: 0, sh: 0, fire: 0, sp: 0 };       // mes commandes
    this.gin = { dir: 0, fy: 0, sh: 0, fire: 0, sp: 0 };      // commandes de l'autre (côté créateur)
    this.th = 'pirate'; this.sim = this.fresh(); this.view = null; this.started = false; this.keyL = this.keyR = this.keyU = this.keyD = false;
    this.hud(h('span', {}, ''), h('span', {}, ''), h('span', {}, ''));
    this.makeCanvas(360, 480);
    this.panel = h('div', { class: 'controls', style: 'flex-direction:column;gap:6px' });
    this.root.append(this.panel);
    this.other = this.net && this.net.remi ? 'Rémi' : 'L\'autre';
    if (this.isHost) {
      this.onNet('in', m => { const g = this.gin, i = m.i || {}; this.gin = { ...g, ...i, fire: (g.fire || 0) + (i.fire || 0), sp: (g.sp || 0) + (i.sp || 0), shp: (g.shp || 0) + (i.shp || 0) }; });
    } else {
      this.onNet('st', m => { this.view = m.s; });
      this.onNet('roles', m => { this.myRole = m.host === 'pilot' ? 'gun' : 'pilot'; this.buildPanel(); this.showIntro(); });
      this.onNet('go', () => { this.clearMessage(); this.started = true; });
      this.onNet('skin', m => { this.th = m.th; });
      this.onNet('end', m => { this.view = m.s; this.endMission(m.s.sc, m.s.lv); });
    }
    this.onSense('key', e => { if (e.k === 'left') this.keyL = e.down; if (e.k === 'right') this.keyR = e.down; if (e.k === 'up') this.keyU = e.down; if (e.k === 'down') this.keyD = e.down; });
    this.wireReplay();
    this.buildPanel(); this.showIntro();
    this.loop(dt => this.update(dt));
    window.__can = this;
  }

  fresh() { return { x: 180, y: 430, hull: 5, ammo: 12, heat: 0, ov: 0, sh: 100, shOn: 0, spc: 0, mul: 0, mulT: 0, sc: 0, t: 0, spawn: 1.4, ast: [], bl: [], eb: [], it: [], cool: 0, kills: 0, lv: 1, lvT: 3, shots: 0, hits: 0, acc: .6, load: 0, since: 99, toast: '', toastT: 0 }; }
  roleName(r) { return r === 'pilot' ? 'PILOTE (tu diriges le vaisseau et tu actives le bouclier)' : 'TIREUR (tu tires et tu gères la chauffe)'; }

  showIntro() {
    const mine = this.roleName(this.myRole);
    if (this.isHost) {
      this.message('Canonnier en équipe', 'Ton rôle : ' + mine + '. ' + this.other + ' a l\'autre rôle.', [
        { label: 'Échanger les rôles', cls: 'sec', onclick: () => { this.myRole = this.myRole === 'pilot' ? 'gun' : 'pilot'; this.net.send('roles', { host: this.myRole }); this.buildPanel(); this.showIntro(); } },
        { label: 'Apparence : ' + (SKINS.find(k => k[0] === this.th) || SKINS[0])[1] + ' (changer)', cls: 'sec', onclick: () => { const i = (SKINS.findIndex(k => k[0] === this.th) + 1) % SKINS.length; this.th = SKINS[i][0]; this.net.send('skin', { th: this.th }); this.showIntro(); } },
        { label: 'Commencer', onclick: () => { this.net.send('go'); this.clearMessage(); this.started = true; } }]);
    } else this.message('Canonnier en équipe', 'Ton rôle : ' + mine + '. Attends que l\'autre lance la partie.', []);
    this.ctx.tts && this.ctx.tts.speak('Ton rôle : ' + (this.myRole === 'pilot' ? 'pilote' : 'tireur'));
  }

  buildPanel() {
    this.panel.replaceChildren();
    if (this.myRole === 'pilot') {
      const col = h('div', { style: 'display:flex;flex-direction:column;gap:6px;flex:1 1 0' },
        holdButton('AVANT', 'sec dir', v => this.keyU = v), holdButton('ARRIÈRE', 'sec dir', v => this.keyD = v));
      col.querySelectorAll('.btn').forEach(b => b.style.minHeight = '48px');
      const l = holdButton('GAUCHE', 'sec dir', v => this.keyL = v), r = holdButton('DROITE', 'sec dir', v => this.keyR = v);
      l.style.minHeight = r.style.minHeight = '102px';
      this.shBtn = h('button', { class: 'btn main big bouclier', style: 'min-height:52px', onclick: () => { this.in.shp = (this.in.shp || 0) + 1; this.flush(); this.s.vibrate && this.s.vibrate(20); } }, 'BOUCLIER');
      this.panel.append(h('div', { class: 'mut' }, 'Tu es le PILOTE : incline le téléphone (gauche/droite, avant/arrière) ou touche les boutons. Le tireur tire pour toi.'),
        h('div', { class: 'row pad' }, l, col, r), this.shBtn);
    } else {
      this.fireBtn = h('button', { class: 'btn warn tir' }, 'TIR');
      this.fireBtn.style.minHeight = '92px';
      const press = e => { e.preventDefault(); this.fireBtn.setPointerCapture && this.fireBtn.setPointerCapture(e.pointerId); this.fireBtn.classList.add('held'); this.holdFire = true; this.shoot(); this.s.vibrate && this.s.vibrate(15); };
      const rel = e => { e.preventDefault(); this.fireBtn.classList.remove('held'); this.holdFire = false; };
      this.fireBtn.addEventListener('pointerdown', press); this.fireBtn.addEventListener('pointerup', rel); this.fireBtn.addEventListener('pointercancel', rel); this.fireBtn.addEventListener('lostpointercapture', () => { this.holdFire = false; this.fireBtn.classList.remove('held'); });
      this.fireBtn.addEventListener('contextmenu', e => e.preventDefault());
      this.bigBtn = h('button', { class: 'btn main big gros', style: 'min-height:92px;flex:1 1 0', onclick: () => { this.in.sp = (this.in.sp || 0) + 1; this.flush(); } }, 'GROS TIR');
      this.voiceBtn = h('button', { class: 'btn sec voix', style: 'min-height:44px', onclick: () => this.toggleVoice() }, 'Tir à la voix : non');
      this.panel.append(h('div', { class: 'mut' }, 'Tu es le TIREUR : garde TIR appuyé pour tirer en rafale, mais surveille la chauffe et les munitions. Le gros tir se charge quand tu touches.'),
        h('div', { class: 'row pad' }, this.fireBtn, this.bigBtn), this.voiceBtn);
    }
  }
  shoot() { this.in.fire++; this.flush(); }
  /** Tir à la voix : chaque « pa » (début de son net) = un tir, un seul par son, même si on le prolonge. */
  async toggleVoice() {
    if (this.voice) { this.voice = false; this.s.stopMic(); this.voiceBtn.textContent = 'Tir à la voix : non'; return; }
    this.voiceBtn.textContent = 'Micro en cours…';
    const ok = await this.s.startMic();
    if (!ok) { this.voiceBtn.textContent = 'Micro refusé : tir à la voix indisponible'; return; }
    this.voice = true; this.vPrev = 0; this.vFloor = .02; this.vLast = 0; this.voiceBtn.textContent = 'Tir à la voix : OUI (dis « pa »)';
  }
  voiceStep(now) {
    if (!this.voice) return; const l = this.s.micLevel(), d = l - this.vPrev; this.vPrev = l;
    if (l < .5) this.vFloor = this.vFloor * .98 + l * .02;                 // bruit ambiant
    const thr = Math.max(.14, this.vFloor * 3.2);
    if (l > thr && d > .06 && now - this.vLast > 90) { this.vLast = now; this.shoot(); }
  }

  flush() { if (this.isHost) return; const i = { dir: this.in.dir, fy: this.in.fy, fire: this.in.fire, sp: this.in.sp, shp: this.in.shp || 0 }; this.in.fire = 0; this.in.sp = 0; this.in.shp = 0; this.net.send('in', { i }); }

  update(dt) {
    const now0 = performance.now(); this.voiceStep(now0);
    if (this.holdFire && this.myRole === 'gun') { this.autoT = (this.autoT || 0) + dt; if (this.autoT > .2) { this.autoT = 0; this.shoot(); } } else this.autoT = 0;
    // commandes locales (pilote : inclinaison = gauche/droite et avant/arrière)
    let dir = (this.keyR ? 1 : 0) - (this.keyL ? 1 : 0), fy = (this.keyD ? 1 : 0) - (this.keyU ? 1 : 0);
    if (this.myRole === 'pilot' && this.s.orientSeen) {
      if (!dir && Math.abs(this.s.tilt) > .12) dir = this.s.tilt;
      if (!fy && Math.abs(this.s.tiltY) > .15) fy = this.s.tiltY;     // pencher le haut vers l'avant = avancer
    }
    this.in.dir = this.myRole === 'pilot' ? dir : 0; this.in.fy = this.myRole === 'pilot' ? fy : 0;
    if (!this.isHost) { this.sendT = (this.sendT || 0) + dt; if (this.sendT > 1 / 15) { this.sendT = 0; this.flush(); } }
    if (this.isHost && this.started && !this.over) this.step(dt);
    if (this.isHost && this.started) { this.stT = (this.stT || 0) + dt; if (this.stT > 1 / 15) { this.stT = 0; this.net.send('st', { s: this.pack() }); } }
    const v = this.isHost ? this.pack() : this.view;
    this.updatePanel(v);
    this.draw(v);
  }
  /** Les boutons suivent l'état : gros tir prêt, bouclier disponible. */
  updatePanel(v) {
    if (!v) return;
    if (this.shBtn) { const ok = v.sh >= 30 && !v.shOn; this.shBtn.textContent = v.shOn ? 'BOUCLIER ACTIF' : ok ? 'BOUCLIER (prêt)' : 'BOUCLIER (recharge ' + Math.round(v.sh) + '%)'; this.shBtn.style.opacity = ok || v.shOn ? 1 : .55; }
    if (this.bigBtn) { const rd = v.spc >= 100; this.bigBtn.textContent = rd ? 'GROS TIR PRÊT !' : 'GROS TIR ' + Math.round(v.spc) + '%'; this.bigBtn.style.opacity = rd ? 1 : .55; }
    if (this.fireBtn) this.fireBtn.textContent = v.ov > 0 ? 'SURCHAUFFE' : v.ammo < 1 ? 'SANS MUNITIONS' : 'TIR';
  }

  /** Commandes utiles : pilote (dir, fy, bouclier) et tireur (tir, gros tir) viennent chacune du bon téléphone. */
  commands() {
    const hostPilot = this.myRole === 'pilot';
    const P = hostPilot ? this.in : this.gin, G = hostPilot ? this.gin : this.in;
    const c = { dir: P.dir || 0, fy: P.fy || 0, shp: P.shp || 0, fire: G.fire || 0, sp: G.sp || 0 };
    P.shp = 0; G.fire = 0; G.sp = 0;
    return c;
  }
  decor() { const M = this.th === 'pirate' ? MAPS_SEA : MAPS_SPACE; return M; }

  step(dt) {
    const s = this.sim, c = this.commands(), pir = this.th === 'pirate', lv = s.lv;
    s.t += dt; s.since += dt; s.lvT = Math.max(0, s.lvT - dt); s.toastT = Math.max(0, s.toastT - dt);
    // pilote : déplacement et bouclier
    s.x = clamp(s.x + c.dir * 150 * dt, pir ? 80 : 30, pir ? 345 : 330); s.y = clamp(s.y + c.fy * 100 * dt, 340, 440);
    if (c.shp && !s.shOn && s.sh >= 30) { s.shOn = 1; boom.crack(this.s); }
    if (s.shOn) { s.sh -= 30 * dt; if (s.sh <= 0) { s.sh = 0; s.shOn = 0; } } else if (s.since > 2) s.sh = Math.min(100, s.sh + 6 * dt);
    s.load = Math.max(0, s.load - .12 * dt);
    // tireur : chauffe, munitions, tirs
    if (s.ov > 0) { s.ov -= dt; s.heat = Math.max(30, s.heat - 25 * dt); if (s.ov <= 0) s.heat = 30; } else s.heat = Math.max(0, s.heat - 17 * dt);
    s.ammo = Math.min(12, s.ammo + 1.6 * dt); s.cool = Math.max(0, s.cool - dt); s.mulT = Math.max(0, s.mulT - dt); if (!s.mulT) s.mul = 0;
    const fireNow = () => { const off = s.mul === 4 ? [-21, -7, 7, 21] : s.mul === 3 ? [-16, 0, 16] : [0]; off.forEach(o => s.bl.push([s.x + o, s.y - 24, 0])); boom.shot(this.s); };
    s.pend = Math.min(3, (s.pend || 0) + c.fire);      // les appuis qui arrivent en paquet (réseau) ne sont pas perdus
    if (s.ov > 0) s.pend = 0;
    if (s.pend > 0 && s.ov <= 0 && s.ammo >= 1 && s.cool <= 0) { s.pend--; s.ammo -= 1; s.cool = .17; s.heat += 11; s.shots++; fireNow(); if (s.heat >= 100) { s.heat = 100; s.ov = 2.5; boom.thud(this.s); } }
    if (c.sp && s.spc >= 100 && s.ov <= 0) { s.spc = 0; s.bl.push([s.x, s.y - 30, 1]); boom.big(this.s); }
    s.bl.forEach(b => b[1] -= (b[2] ? 380 : 520) * dt); s.bl = s.bl.filter(b => b[1] > -60);
    // ennemis : de plus en plus nombreux, rapides, variés
    s.spawn -= dt;
    if (s.spawn <= 0) {
      s.spawn = Math.max(.5, 1.9 - .17 * (lv - 1)) * (.8 + Math.random() * .4); const r = Math.random();
      const pS = lv >= 3 ? Math.min(.14, .035 * (lv - 2)) : 0, kind = r < pS ? 2 : lv >= 2 && r < pS + Math.min(.5, .15 * (lv - 1)) ? 1 : 0, rad = 14 + Math.random() * 14;
      s.ast.push([20 + Math.random() * 320, -20, rad, Math.floor(Math.random() * 8), kind, lv >= 3 && rad > 24 ? 2 : 1, 1.5 + Math.random() * 1.5]);
    }
    for (const a of s.ast) {
      const base = 36 + lv * 7; a[1] += base * (a[4] === 2 ? .55 : a[4] === 1 ? 1.1 : 1) * dt;
      if (a[4] === 1) a[0] += clamp(s.x - (pir ? 40 : 0) - a[0], -1, 1) * (16 + 4 * lv) * dt;
      if (a[4] === 2) { a[6] -= dt; if (a[6] <= 0 && a[1] > 10 && a[1] < 300) { a[6] = Math.max(1.8, 3.6 - .12 * lv); s.eb.push([a[0], a[1] + a[2]]); } }
    }
    for (const e of s.eb) e[1] += (130 + 8 * lv) * dt; s.eb = s.eb.filter(e => e[1] < 500);
    // collisions : tirs sur ennemis
    const cx = s.x - (pir ? 40 : 0), hw = pir ? 40 : 26;
    for (const a of s.ast) for (const b of s.bl) {
      if (a.dead || b.gone) continue;
      const big = b[2], hit = big ? Math.abs(a[0] - b[0]) < a[2] + 36 && Math.abs(a[1] - b[1]) < a[2] + 24 : Math.hypot(a[0] - b[0], a[1] - b[1]) < a[2] + 7;
      if (!hit) continue;
      if (!big) { b.gone = true; s.hits++; s.spc = Math.min(100, s.spc + 9); } a[5] = big ? 0 : a[5] - 1;
      if (a[5] <= 0) { a.dead = true; s.kills++; s.sc += 10 + a[4] * 5; s.sh = Math.min(100, s.sh + 9); boom.crack(this.s); if (Math.random() < .22) s.it.push([a[0], a[1], pick3()]); }
      else boom.thud(this.s);
    }
    s.bl = s.bl.filter(b => !b.gone);
    s.acc = s.acc * .995 + (s.shots ? s.hits / s.shots : .6) * .005;
    const dmg = () => { s.since = 0; if (s.shOn) { s.sh = Math.max(0, s.sh - 12); if (!s.sh) s.shOn = 0; boom.crack(this.s); } else { s.hull--; s.load = Math.min(1, s.load + .35); boom.thud(this.s); this.s.vibrate(200); } };
    for (const a of s.ast) if (!a.dead && Math.abs(a[0] - cx) < a[2] + hw && Math.abs(a[1] - s.y) < a[2] + 24) { a.dead = true; dmg(); }
    for (const e of s.eb) if (Math.abs(e[0] - cx) < hw && Math.abs(e[1] - s.y) < 26) { e.dead = true; dmg(); }
    s.ast = s.ast.filter(a => !a.dead && a[1] < 520); s.eb = s.eb.filter(e => !e.dead);
    // objets lâchés : le pilote les ramasse en les touchant
    for (const it of s.it) { it[1] += 60 * dt; if (Math.hypot(it[0] - cx, it[1] - s.y) < 44) { it.dead = true; boom.crack(this.s); s.toast = ITEM_NAME[it[2]] + ' !'; s.toastT = 1.8; if (it[2] === 0) { s.mul = 3; s.mulT = 12; } else if (it[2] === 1) { s.mul = 4; s.mulT = 12; } else for (let k = 0; k < 11; k++) s.bl.push([20 + k * 32, s.y - 24, 0]); } }
    s.it = s.it.filter(i => !i.dead && i[1] < 500);
    // niveau suivant
    const nl = LV_AT.filter(k => s.kills >= k).length; if (nl > s.lv) { s.lv = Math.min(nl, LV_AT.length); s.lvT = 3.2; s.toast = 'Niveau ' + s.lv + ' : ' + this.decor()[(s.lv - 1) % this.decor().length][2]; s.toastT = 3; boom.big(this.s); }
    s.sc += dt * 1.5;
    if (s.hull <= 0) { this.net.send('end', { s: this.pack() }); this.endMission(s.sc, s.lv); }
  }
  pack() {
    const s = this.sim, r = Math.round;
    return { th: this.th, x: r(s.x), y: r(s.y), hull: s.hull, ammo: s.ammo, heat: s.heat, ov: s.ov, sh: s.sh, shOn: s.shOn, spc: s.spc, mul: s.mul, mulT: s.mulT, sc: r(s.sc), lv: s.lv, lvT: s.lvT, kills: s.kills, toast: s.toast, toastT: s.toastT,
      acc: s.acc, load: s.load, since: s.since, ast: s.ast.map(a => [r(a[0]), r(a[1]), r(a[2]), a[3], a[4], a[5]]), bl: s.bl.map(b => [r(b[0]), r(b[1]), b[2]]), eb: s.eb.map(e => [r(e[0]), r(e[1])]), it: s.it.map(i => [r(i[0]), r(i[1]), i[2]]) };
  }

  endMission(sc, lv) {
    if (this.over) return; this.over = true; boom.big(this.s);
    this.message('Mission terminée', 'Score de l\'équipe : ' + Math.round(sc) + ' (niveau ' + (lv || 1) + ' atteint)', [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]);
  }

  /** Tout le décor et les personnages viennent de la planche dessinée (img/canon.webp) ; sans elle, formes simples. */
  spr(g, name, x, y, w, h2) { const r = RECT[name]; if (!r || !ATLAS.ok) return false; g.drawImage(ATLAS, r[0], r[1], r[2], r[3], x, y, w == null ? r[2] : w, h2 == null ? r[3] : h2); return true; }
  /** Décor du niveau : image + voile de couleur ; les cartes changent quand on monte de niveau. */
  drawBack(g, t, v) {
    const M = this.decor(), m = M[((v && v.lv || 1) - 1) % M.length], img = { n: BACK, i: ISL, s: STORM, x: BACK2 }[m[0]];
    if (img && img.ok) {
      if (m[0] === 'n') { const k = 360 / img.naturalWidth; g.drawImage(img, 0, 150, img.naturalWidth, 480 / k, 0, 0, 360, 480); }
      else { const k = 480 / img.naturalHeight, sw = 360 / k; g.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, img.naturalHeight, 0, 0, 360, 480); }
    } else { g.fillStyle = m[0] === 'x' ? '#0b0a24' : '#1b1a3a'; g.fillRect(0, 0, 360, 480); }
    if (m[1]) { g.fillStyle = 'rgba(' + m[1] + ')'; g.fillRect(0, 0, 360, 480); }
    if (this.th === 'pirate') {
      g.fillStyle = '#9fe8ff22'; for (let i = 0; i < 4; i++) { const y = 440 + i * 14, o = Math.sin(t * 1.2 + i) * 10; g.fillRect(((i * 91 + o + 360) % 360) - 40, y, 80, 2); }
    } else if (aready()) { for (let i = 0; i < 6; i++) { g.globalAlpha = .45 + .45 * Math.sin(t * 1.7 + i * 2); aspr(g, 'x_gold' + (i % 3), (i * 61 + 15) % 340, 8 + (i * 43) % 110, 14, 14); } g.globalAlpha = 1; }
  }
  drawHero(g, v, now) {
    const dx = this.px == null ? 0 : v.x - this.px; this.px = v.x;
    if (this.prevHull != null && v.hull < this.prevHull) this.hitT = now; this.prevHull = v.hull;
    if (this.prevBl != null && (v.bl || []).length > this.prevBl) this.fireT = now; this.prevBl = (v.bl || []).length;
    this.tilt = (this.tilt || 0) * .85 + dx * .15;
    const pose = v.ov > 0 || now - (this.hitT || -9e9) < 700 ? 'dizzy' : now - (this.fireT || -9e9) < 170 ? 'fire' : Math.abs(this.tilt) > .5 ? 'aim2' : 'idle';
    const K = .55, bob = Math.sin(now / 400) * 2, x = v.x - 187 * K, y = 462 - 175 * K + bob;
    if (!ATLAS.ok) { g.fillStyle = v.ov > 0 ? '#ff5470' : '#c58a4a'; g.fillRect(v.x - 80, 440, 100, 24); return; }
    g.save(); g.translate(0, (v.y || 440) - 440); g.translate(v.x - 40, 455); g.rotate(clamp(this.tilt, -3, 3) * .03); g.translate(-(v.x - 40), -455);
    this.spr(g, 'h_' + pose, x, y, 230 * K, 175 * K); g.restore();
  }
  drawMonsters(g, v, now) {
    for (const a of v.ast || []) {
      const ty = a[3] || 0, fr = Math.floor(now / 220 + a[0]) % 2 ? 'b' : 'a', r = RECT['m' + ty + fr]; const sz = a[2] * 2.9;
      if (!r || !ATLAS.ok) { g.fillStyle = '#8c93b8'; g.beginPath(); g.arc(a[0], a[1], a[2], 0, 7); g.fill(); continue; }
      const k = sz / Math.max(r[2], r[3]), w = r[2] * k, hh = r[3] * k, wob = Math.sin(now / 300 + a[0]) * 2;
      this.spr(g, 'm' + ty + fr, a[0] - w / 2 + wob, a[1] - hh / 2, w, hh);
    }
  }
  drawShots(g, v) {
    for (const b of v.bl || []) {
      const r = RECT.i_ball; if (!r || !ATLAS.ok) { g.fillStyle = '#ffd24d'; g.fillRect(b[0] - 3, b[1] - 8, 6, 14); continue; }
      const k = b[2] ? .9 : .38; g.save(); g.translate(b[0], b[1]); g.rotate(-Math.PI / 2); g.drawImage(ATLAS, r[0], r[1], r[2], r[3], -r[2] * k + 10, -r[3] * k / 2, r[2] * k, r[3] * k); g.restore();
    }
  }
  /** Explosion à l'endroit où un monstre disparaît (touché ou écrasé), puis un petit nuage de fumée. */
  drawFx(g, v, now) {
    this.fx = this.fx || []; const cur = v.ast || [];
    for (const a of this.prevAst || []) if (a[1] < 470 && !cur.some(c => Math.abs(c[0] - a[0]) < 22 && Math.abs(c[1] - a[1]) < 40)) this.fx.push({ x: a[0], y: a[1], r: a[2], t: now });
    this.prevAst = cur.map(a => a.slice());
    this.fx = this.fx.filter(f => now - f.t < 900);
    if (!ATLAS.ok) return;
    for (const f of this.fx) {
      const k = Math.floor((now - f.t) / 65), sz = 30 + f.r * 2.6;
      if (k < 8) this.spr(g, 'boom' + k, f.x - sz / 2, f.y - sz / 2, sz, sz);
      else { const m = Math.min(2, Math.floor((now - f.t - 520) / 130)); g.globalAlpha = Math.max(0, 1 - (now - f.t - 520) / 380); this.spr(g, 'smoke' + Math.max(0, m), f.x - sz / 2, f.y - sz / 2 - (now - f.t - 520) / 25, sz, sz); g.globalAlpha = 1; }
    }
  }

  /** Thème espace : soucoupe ou chasseur, monstres de l'espace, lasers, explosions. */
  drawSpace(g, v, now, th) {
    const dx = this.px == null ? 0 : v.x - this.px; this.px = v.x;
    if (this.prevHull != null && v.hull < this.prevHull) this.hitT = now; this.prevHull = v.hull;
    if (this.prevBl != null && (v.bl || []).length > this.prevBl) this.fireT = now; this.prevBl = (v.bl || []).length;
    this.tilt = (this.tilt || 0) * .85 + dx * .15;
    for (const a of v.ast || []) { const ty = (a[3] || 0) % 8, fr = Math.floor(now / 240 + a[0]) % 2 ? 'b' : 'a'; sprC(g, 'e' + ty + fr, a[0] + Math.sin(now / 300 + a[0]) * 2, a[1], a[2] * 2.7); }
    for (const b of v.bl || []) { g.save(); g.translate(b[0], b[1]); g.rotate(-Math.PI / 2); if (b[2]) aspr(g, 'i_plasma', -30, -30, 64, 64); else aspr(g, 'i_laser', -34, -6, 46, 12); g.restore(); }
    const p = th === 'delta' ? 'd_' : 's_', hit = now - (this.hitT || -9e9) < 700 || v.ov > 0;
    const pose = hit ? 'dmg' : now - (this.fireT || -9e9) < 170 ? 'fire' : this.tilt > .6 ? 'bankR' : this.tilt < -.6 ? 'bankL' : 'idle';
    const bob = Math.sin(now / 350) * 2.5, y = v.y || 440; sprC(g, p + (pose === 'fire' ? 'idle' : pose), v.x, y + bob, 92);
    if (pose === 'fire') sprC(g, 'x_gold0', v.x, y - 42 + bob, 30);
    this.fxSpace(g, v, now);
  }
  fxSpace(g, v, now) {
    this.fx = this.fx || []; const cur = v.ast || [];
    for (const a of this.prevAst || []) if (a[1] < 470 && !cur.some(c => Math.abs(c[0] - a[0]) < 22 && Math.abs(c[1] - a[1]) < 40)) this.fx.push({ x: a[0], y: a[1], r: a[2], t: now });
    this.prevAst = cur.map(a => a.slice()); this.fx = this.fx.filter(f => now - f.t < 800);
    for (const f of this.fx) { const k = Math.floor((now - f.t) / 110), sz = 40 + f.r * 2.4; if (k < 3) sprC(g, 'x_boom' + k, f.x, f.y, sz); else { g.globalAlpha = Math.max(0, 1 - (now - f.t - 330) / 470); sprC(g, 'x_smoke' + Math.min(2, k - 3), f.x, f.y - (now - f.t - 330) / 22, sz); g.globalAlpha = 1; } }
  }

  txt(g, t, x, y, size, col, al) { g.font = 'bold ' + size + 'px sans-serif'; g.textAlign = al || 'left'; g.lineWidth = 3; g.strokeStyle = '#000c'; g.strokeText(t, x, y); g.fillStyle = col || '#fff'; g.fillText(t, x, y); g.textAlign = 'left'; }
  bar(g, x, y, w, hh, f, col, label, edge) {
    g.fillStyle = '#000a'; g.fillRect(x, y, w, hh); g.fillStyle = col; g.fillRect(x, y, w * clamp(f, 0, 1), hh);
    g.strokeStyle = edge || '#1b2a55'; g.lineWidth = 1.5; g.strokeRect(x, y, w, hh); this.txt(g, label, x + 4, y + hh - 3, 11.5, '#fff');
  }
  /** Projectiles ennemis, objets lâchés, bouclier : tout ce qui n'est pas propre à un thème. */
  drawExtras(g, v, now) {
    const ok = aready(), pir = v.th === 'pirate', cx = v.x - (pir ? 40 : 0), y = v.y || 440;
    for (const e of v.eb || []) { if (!(ok && sprC(g, 'x_blue0', e[0], e[1], 22))) { g.fillStyle = '#6fd0ff'; g.beginPath(); g.arc(e[0], e[1], 6, 0, 7); g.fill(); } }
    for (const it of v.it || []) {
      const nm = ['i_double', 'i_plasma', 'i_zap'][it[2]], lab = ['x3', 'x4', 'VAGUE'][it[2]], bob = Math.sin(now / 200 + it[0]) * 3;
      g.globalAlpha = .35 + .2 * Math.sin(now / 150); g.fillStyle = '#ffd24d'; g.beginPath(); g.arc(it[0], it[1] + bob, 22, 0, 7); g.fill(); g.globalAlpha = 1;
      if (!(ok && sprC(g, nm, it[0], it[1] + bob, 32))) { g.fillStyle = '#ffd24d'; g.fillRect(it[0] - 10, it[1] - 10, 20, 20); }
      this.txt(g, lab, it[0], it[1] + 30, 10, '#ffe58a', 'center');
    }
    if (v.shOn) { g.globalAlpha = .55 + .2 * Math.sin(now / 90); if (!(ok && sprC(g, 'i_shield', cx, y, 104))) { g.strokeStyle = '#6fe8ff'; g.lineWidth = 4; g.beginPath(); g.arc(cx, y, 48, 0, 7); g.stroke(); } g.globalAlpha = 1; }
    if (v.mul) this.txt(g, v.mul === 4 ? 'TIR QUADRUPLE ' + Math.ceil(v.mulT) : 'TIR TRIPLE ' + Math.ceil(v.mulT), 180, 104, 11, '#ffe58a', 'center');
  }
  /** Tableau de bord des DEUX rôles, visible par les deux joueurs : chauffe, munitions, gros tir (tireur) ; bouclier, esquive, coque (pilote). */
  drawHud(g, v, now) {
    const me = this.myRole, o = this.other, ge = clamp(v.acc * 1.15, 0, 1), pe = clamp(1 - v.load, 0, 1);
    g.fillStyle = '#000b'; g.beginPath(); g.roundRect ? g.roundRect(3, 3, 354, 82, 8) : g.rect(3, 3, 354, 82); g.fill();
    g.strokeStyle = '#ffd24d'; g.lineWidth = 2; g.strokeRect(me === 'gun' ? 6 : 184, 5, 170, 78);
    const who = r => me === r ? 'toi' : o;
    this.txt(g, 'TIREUR : ' + who('gun'), 10, 17, 11, '#ffd24d');
    this.bar(g, 10, 21, 162, 13, v.heat / 100, v.ov > 0 || v.heat > 80 ? '#ff5470' : '#ffb020', v.ov > 0 ? 'SURCHAUFFE !' : 'Chauffe de l\'arme');
    this.bar(g, 10, 36, 162, 13, v.ammo / 12, '#4da3ff', 'Munitions ' + Math.floor(v.ammo) + '/12');
    const rd = v.spc >= 100; this.bar(g, 10, 51, 162, 13, v.spc / 100, rd && Math.floor(now / 250) % 2 ? '#ffd24d' : '#b07cff', rd ? 'GROS TIR PRÊT' : 'Gros tir ' + Math.round(v.spc) + '%', rd ? '#ffd24d' : null);
    const gs = v.ov > 0 ? ['Surchauffe, ne tire plus', '#ff5470'] : v.ammo < 1 ? ['Sans munitions', '#ff5470'] : v.heat > 75 ? ['Chauffe trop !', '#ffb020'] : ge > .5 ? ['Tire juste : bien joué', '#7ddc6b'] : ['Tir peu précis', '#ffb020'];
    this.txt(g, gs[0], 10, 80, 11, gs[1]);
    this.txt(g, 'PILOTE : ' + who('pilot'), 188, 17, 11, '#ffd24d');
    this.bar(g, 188, 21, 162, 13, v.sh / 100, '#27e0b3', v.shOn ? 'BOUCLIER ACTIF' : 'Bouclier ' + Math.round(v.sh) + '%');
    this.bar(g, 188, 36, 162, 13, pe, pe > .5 ? '#7ddc6b' : '#ff5470', 'Esquive');
    for (let i = 0; i < Math.min(8, Math.max(0, v.hull)); i++) { if (!(aready() && aspr(g, 'i_heart', 190 + i * 20, 52, 17, 14))) { g.fillStyle = '#ff5470'; g.fillRect(190 + i * 20, 52, 14, 12); } }
    const ps = v.since < 1.5 ? ['Touché !', '#ff5470'] : v.shOn ? ['Bouclier en action', '#27e0b3'] : v.sh < 30 ? ['Bouclier en recharge', '#ffb020'] : pe > .6 ? ['Esquive bien', '#7ddc6b'] : ['Attention, il est touché', '#ffb020'];
    this.txt(g, ps[0], 188, 80, 11, ps[1]);
  }
  drawBanner(g, v) {
    if (v.toastT > 0 && v.toast) { g.globalAlpha = Math.min(1, v.toastT); this.txt(g, v.toast, 180, 128, 16, '#fff', 'center'); g.globalAlpha = 1; }
  }

  draw(v) {
    if (!this.cv.width) return; this.begin(); const g = this.g, now = performance.now(), t = now / 1000;
    const sp0 = v && v.th || this.th, space = sp0 !== 'pirate' && aready();
    this.drawBack(g, t, v || { th: sp0, lv: 1 });
    if (v) {
      if (space) this.drawSpace(g, v, now, sp0);
      else { this.drawMonsters(g, v, now); this.drawShots(g, v); this.drawHero(g, v, now); this.drawFx(g, v, now); }
      this.drawExtras(g, v, now); this.drawHud(g, v, now); this.drawBanner(g, v);
      const sp = this.hudEl.children; sp[0].textContent = 'Niveau : ' + v.lv; sp[1].textContent = 'Score : ' + Math.round(v.sc); sp[2].textContent = 'Détruits : ' + v.kills;
    }
    this.endDraw();
  }
}
export default { id: 'vaisseau', name: 'Canonnier en équipe', short: 'L\'un pilote le vaisseau, l\'autre tire et gère la chauffe : on se voit travailler.', how: ['Un seul vaisseau pour deux : le pilote le dirige (gauche, droite, avant, arrière), le tireur tire.', 'Pilote : incline le téléphone, active le bouclier de temps en temps ; il se recharge quand tu n\'es pas touché et que vous détruisez des ennemis.', 'Tireur : surveille la chauffe et les munitions ; après plusieurs tirs qui touchent, le GROS TIR est prêt.', 'Les ennemis détruits lâchent parfois tir triple, quadruple ou vague de tirs : le pilote les ramasse.', 'Les jauges des deux rôles sont affichées en haut : chacun voit si l\'autre assure. Plus vous jouez, plus c\'est dur.'], create: ctx => new Vaisseau(ctx) };
