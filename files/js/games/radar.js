// Radar, chaud-froid et cache-cache.
// Dehors : le GPS de chaque téléphone (jusqu'à plusieurs kilomètres). Dans la maison : pas de GPS, on joue dans un EMPLACEMENT enregistré
// (pièces de la zone de jeu, même stockage que Running Forest) : le téléphone compte les pas et la boussole donne le cap.
// Chaud-froid : la couleur, les bips, la vibration et le cadran dépendent de la distance ET du cap (face à la cible = chaud, dos = froid).
import { GameBase } from './base.js';
import { h, clamp } from '../core/util.js';
import { geo } from '../core/sensors.js';
import { pickZone, Zone } from '../core/zone.js';
import { level } from '../core/level.js';
import { sprC, bgUrl, ready } from '../core/sprites.js';
const BG = new Image(); BG.onload = () => { BG.ok = true; }; BG.src = bgUrl('radar');
const ORIGIN = { lat: 48.85, lon: 2.35 };

const MODES = {
  radar: { name: 'Radar', how: 'Vous voyez tous les deux l\'autre point sur le radar.' },
  chaud: { name: 'Chaud-froid', how: 'Pas de carte : seulement des couleurs, des bips et un cadran. Plus c\'est rouge et plus les bips vont vite, plus tu es près et tourné vers la cible.' },
  cache: { name: 'Cache-cache', how: 'L\'un se cache, l\'autre cherche avec le chaud-froid. Quand tu es tout près, touche TROUVÉ.' },
};
const norm180 = a => ((a % 360) + 540) % 360 - 180;
const fmtM = d => d < 10 ? (Math.round(d * 10) / 10 + '').replace('.', ',') + ' m' : d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1).replace('.', ',') + ' km';

class Radar extends GameBase {
  constructor(ctx) {
    super(ctx);
    this.isHost = this.role === 'host'; this.mode = 'radar'; this.seeker = 'host'; this.me = null; this.opp = null; this.prev = null; this.trend = 0; this.beepT = 0;
    this.timeLeft = 300; this.started = false; this.phase = 'menu'; this.zone = null; this.sim = null; this.warm = 0; this.face = null; this.ref = null; this.count = 0; this.gpsOk = true;
    this.hud(h('span', {}, 'Distance : …'), h('span', {}, ''));
    this.makeCanvas(360, 420);
    this.note = h('div', { class: 'bigtxt', style: 'padding:8px;min-height:3.6em' }, '');
    this.turnL = h('button', { class: 'btn sec', style: 'flex:1', onclick: () => { this.sim.head = (this.sim.head + 345) % 360; } }, 'Tourner à gauche');
    this.turnR = h('button', { class: 'btn sec', style: 'flex:1', onclick: () => { this.sim.head = (this.sim.head + 15) % 360; } }, 'Tourner à droite');
    this.stepBox = h('div', { class: 'row', style: 'display:none;gap:8px;width:100%' }, this.turnL, h('button', { class: 'btn', style: 'flex:1', onclick: () => this.step() }, 'Faire un pas'), this.turnR);
    this.found = h('button', { class: 'btn big', style: 'display:none', onclick: () => this.tryFound() }, 'TROUVÉ !');
    this.root.append(h('div', { class: 'controls', style: 'flex-direction:column' }, this.note, this.stepBox, this.found));
    this.onNet('gp', m => { this.opp = m.p; });
    this.onNet('setup', m => { this.mode = m.mode; this.seeker = m.seeker; this.startPlay(Zone.from(m.zone)); });
    this.onNet('foundq', () => { const d = this.dist(); if (d != null && d < (this.zone ? 3 : 14)) { this.net.send('foundok'); this.finishFound(); } else this.net.send('foundno'); });
    this.onNet('foundok', () => this.finishFound());
    this.onNet('foundno', () => this.note.textContent = 'Pas encore : tu es trop loin. Continue !');
    this.wireReplay();
    this.intro();
    this.loop(dt => this.update(dt));
    this.sub(() => geo.stop());
  }
  get iSeek() { return this.mode === 'cache' ? (this.seeker === 'host') === this.isHost : true; }
  get closeR() { return this.zone ? 2.5 : 10; }

  intro() {
    this.phase = 'menu'; this.started = false;
    if (this.isHost) {
      this.message('Radar et cache-cache', 'Choisis un jeu. Ensuite tu choisiras où jouer : dehors avec le GPS, ou dans un emplacement de la maison.', Object.entries(MODES).map(([k, v]) => ({
        label: v.name, cls: k === 'radar' ? '' : 'sec', onclick: () => { this.mode = k; this.where(); },
      })));
    } else this.message('Radar et cache-cache', 'Attends que l\'autre choisisse le jeu et l\'endroit.', []);
  }
  /** Où jouer : dehors (GPS) ou dans un emplacement enregistré (pièce(s) de la maison). */
  where() {
    this.message(MODES[this.mode].name + ' : où joues-tu ?', 'Dehors : le GPS guide. Dans la maison : choisis un emplacement enregistré (une pièce, ou plusieurs pour une grande maison) ; tu peux en enregistrer un nouveau.', [
      { label: 'Dans la maison (emplacements)', onclick: () => { this.clearMessage(); pickZone(this.root, this.s, z => this.launch(z), () => this.where(), { title: 'Choisis un emplacement', intro: 'Choisis un emplacement enregistré (ou plusieurs pour une grande maison), ou délimite-en un nouveau. Place-toi au milieu de la pièce, face au mur « devant ».', noFree: true }); } },
      { label: 'Dehors (GPS)', cls: 'sec', onclick: () => { if (!('geolocation' in navigator) && !geo.fake) { this.message('GPS indisponible', 'Ce téléphone ne permet pas le GPS. Joue plutôt dans la maison, avec un emplacement.', [{ label: 'Choisir un emplacement', onclick: () => this.where() }, { label: 'Retour', cls: 'sec', onclick: () => this.intro() }]); return; } this.launch(null); } },
      { label: 'Retour', cls: 'sec', onclick: () => this.intro() }]);
  }
  launch(zone) { this.net.send('setup', { mode: this.mode, seeker: this.seeker, zone: zone ? zone.toJSON() : null }); this.startPlay(zone); }
  startPlay(zone) {
    this.clearMessage(); this.zone = zone || null; this.over = false; this.prev = null; this.trend = 0; this.timeLeft = 300; this.walked = 0; this.lastStep = 0; this.lastWarn = 0;
    if (this.zone) { this.net.send('zone', { rooms: this.zone.rooms }); this.sim = { lat: ORIGIN.lat, lon: ORIGIN.lon, head: 0 }; this.me = { lat: ORIGIN.lat, lon: ORIGIN.lon, acc: 3 }; this.stepBox.style.display = 'flex'; }
    else {
      this.sim = null; this.stepBox.style.display = 'none';
      this.gpsOk = geo.start(p => { if (p) this.me = p; else this.gpsErr = true; });
      if (!this.gpsOk) { this.message('GPS indisponible', 'Ce téléphone ne permet pas le GPS. Joue dans la maison, avec un emplacement.', [{ label: 'Choisir un emplacement', onclick: () => this.where() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]); return; }
    }
    this.started = true; this.phase = 'count'; this.count = 3.2; this.lastTick = 4; this.ref = null;
    this.ctx.tts && this.ctx.tts.speak(MODES[this.mode].how);
  }
  /** La boussole est-elle là ? Sinon les boutons « Tourner » la remplacent. */
  get compass() { return this.s.compassSeen && this.s.heading != null; }
  /** Cap du joueur dans le repère du jeu. Dans la maison : 0 = vers le mur « devant » (cap pris au départ). Dehors : vrai nord (ou rien sans boussole). */
  head() {
    if (this.zone) { if (this.compass) { if (this.ref == null) this.ref = this.s.heading; return (this.s.heading - this.ref + 360) % 360; } return this.sim ? this.sim.head : 0; }
    return this.compass ? this.s.heading : null;
  }
  step() {
    if (!this.sim || this.over || this.phase === 'menu') return; const a = (this.head() || 0) * Math.PI / 180, d = 0.8;
    const nlat = this.sim.lat + Math.cos(a) * d / 111320, nlon = this.sim.lon + Math.sin(a) * d / (111320 * Math.cos(this.sim.lat * Math.PI / 180));
    const r = geo.rel(ORIGIN, { lat: nlat, lon: nlon }); if (this.zone && !this.zone.contains(r.x, r.y)) { this.leaveAlert(); return; }
    this.sim.lat = nlat; this.sim.lon = nlon; this.me = { lat: nlat, lon: nlon, acc: 3 }; this.walked += d; this.s.sfx('tick');
  }
  leaveAlert() { const now = performance.now(); if (now - this.lastWarn < 1200) return; this.lastWarn = now; this.s.sfx('warn'); this.s.vibrate(150); this.warnT = now; }
  dist() { return this.me && this.opp ? geo.rel(this.me, this.opp).dist : null; }
  tryFound() { this.net.send('foundq'); }
  finishFound() { if (this.over) return; this.over = true; this.s.sfx('win'); this.s.vibrate(200); this.message(this.iSeek ? 'Trouvé !' : 'Tu as été trouvé !', '', [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]); }

  /** Chaleur 0..1 : moitié distance, moitié cap (face à la cible = chaud, dos = froid). Sans boussole : distance seule. */
  compute(d) {
    let scale = 100; if (this.zone) { const b = this.zone.bounds; scale = Math.max(6, Math.hypot(b.x1 - b.x0, b.y1 - b.y0)); }
    const prox = 1 - clamp(d / scale, 0, 1), hd = this.head();
    this.face = null;
    if (hd != null && this.me && this.opp) {
      const r = geo.rel(this.me, this.opp); this.diff = norm180(r.bearing - hd); this.face = Math.cos(this.diff * Math.PI / 180);
      this.warm = d < this.closeR ? 1 : clamp(.5 * prox + .5 * (this.face + 1) / 2, 0, 1);
    } else this.warm = d < this.closeR ? 1 : prox;
  }
  clue(d) {
    const lv = level(), f = this.face;
    if (d < this.closeR) return 'BRÛLANT ! Touche TROUVÉ si la cible est tout près.';
    let a;
    if (f == null) a = this.compass || this.zone ? 'Avance et écoute les bips.' : 'Pas de boussole : avance et regarde si ça chauffe.';
    else if (lv >= 5) a = 'Tourne sur toi-même et avance : écoute les bips.';
    else if (f > .85) a = 'Tu fais face à la cible : avance !';
    else if (f > .3) a = lv <= 3 ? 'Presque : tourne un peu à ' + (this.diff > 0 ? 'droite' : 'gauche') + '.' : 'Presque : tourne encore un peu.';
    else if (f > -.3) a = lv <= 3 ? 'La cible est sur ton côté ' + (this.diff > 0 ? 'droit' : 'gauche') + '.' : 'La cible est sur le côté.';
    else a = 'Tu tournes le dos à la cible : fais demi-tour.';
    return a + (this.trend > .03 ? ' Tu te rapproches.' : this.trend < -.03 ? ' Tu t\'éloignes.' : '');
  }

  update(dt) {
    this.sendT = (this.sendT || 0) + dt; if (this.sendT > 1.5 && this.me) { this.sendT = 0; this.net.send('gp', { p: this.me }); }
    const sp = this.hudEl.children;
    if (this.zone) {
      this.turnL.style.display = this.turnR.style.display = this.compass ? 'none' : '';
      const now = performance.now(); if (this.started && !this.over && this.s.motionSeen && this.s.accel > 2.6 && now - this.lastStep > 380) { this.lastStep = now; this.step(); }
    }
    if (!this.started) { this.draw(null); return; }
    const d = this.dist();
    if (this.phase === 'count') {
      this.count -= dt; const n = Math.ceil(this.count);
      if (n !== this.lastTick && n >= 1) { this.lastTick = n; this.s.beep(500, 80, 'triangle'); this.s.vibrate(30); }
      sp[0].textContent = 'Prépare-toi…'; sp[1].textContent = '';
      this.note.textContent = 'Avance de quelques pas pour commencer.' + (this.zone ? (this.compass ? ' Boussole détectée.' : ' Sans boussole : boutons Tourner.') : '');
      this.found.style.display = 'none';
      if (this.count <= 0) { this.phase = 'play'; if (this.zone && this.compass) this.ref = this.s.heading; this.s.sfx('ok'); this.s.vibrate(80); this.beepT = 0; }
      this.draw(d); return;
    }
    if (!this.over && this.mode === 'cache') { this.timeLeft -= dt; if (this.timeLeft <= 0) { this.over = true; this.message('Temps écoulé', this.iSeek ? 'Tu n\'as pas trouvé à temps.' : 'Tu n\'as pas été trouvé : tu gagnes !', [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]); } }
    if (d == null) { sp[0].textContent = 'Distance : recherche…'; this.note.textContent = this.gpsErr && !this.zone ? 'Active la localisation du téléphone.' : 'On cherche les deux positions…'; }
    else {
      this.compute(d);
      const showD = this.mode === 'radar' || !this.iSeek || level() <= 2; sp[0].textContent = showD ? 'Distance : ' + fmtM(d) : 'Distance cachée';
      if (this.prev != null) this.trend = this.trend * .9 + (this.prev - d) * .1; this.prev = d;
      if (this.mode !== 'radar' && this.iSeek) { if (!this.over) this.note.textContent = this.clue(d); if (!this.over) this.bip(dt); }
      else this.note.textContent = this.mode === 'radar' ? (this.zone ? 'Haut du radar = devant toi. Marche vers le point rouge.' : MODES.radar.how) : 'Cache-toi bien !';
    }
    sp[1].textContent = this.mode === 'cache' ? 'Temps : ' + Math.max(0, Math.round(this.timeLeft)) + ' s' : '';
    this.found.style.display = this.mode === 'cache' && this.iSeek && !this.over ? 'block' : 'none';
    this.draw(d);
  }
  /** Bips (plus rapides et plus aigus quand ça chauffe) et vibration quand c'est chaud. */
  bip(dt) {
    this.beepT -= dt; if (this.beepT > 0) return;
    const w = this.warm; this.beepT = clamp(1.6 - 1.5 * w, .12, 1.6); this.s.beep(280 + w * 800, w > .85 ? 40 : 60, 'triangle');
    if (w > .7) this.s.vibrate(w > .9 ? 40 : 25);
  }

  draw(d) {
    if (!this.cv.width) return; this.begin(); const g = this.g, now = performance.now(), art = BG.ok && ready();
    const hot = d == null || this.phase !== 'play' ? 0 : this.warm;
    const showBg = this.mode !== 'radar' && this.iSeek && this.started;
    g.fillStyle = showBg ? `rgb(${Math.round(20 + hot * 220)},${Math.round(30 + (1 - Math.abs(hot - .5) * 2) * 40)},${Math.round(150 - hot * 130)})` : '#0a1328'; g.fillRect(0, 0, 360, 420);
    if (art) { g.save(); g.globalAlpha = showBg ? .35 : .85; g.globalCompositeOperation = showBg ? 'overlay' : 'source-over'; const k = Math.max(360 / BG.naturalWidth, 420 / BG.naturalHeight); g.drawImage(BG, (360 - BG.naturalWidth * k) / 2, (420 - BG.naturalHeight * k) / 2, BG.naturalWidth * k, BG.naturalHeight * k); g.restore(); if (!showBg) { g.fillStyle = '#04101a66'; g.fillRect(0, 0, 360, 420); } }
    const cx = 180, cy = 210, R = 150;
    if (!showBg) {
      if (art) {
        sprC(g, 'k_radar4', cx, cy, R * 2 + 20);
        if (g.createConicGradient) { const a0 = (now / 2200) % 1 * Math.PI * 2; const cg = g.createConicGradient(a0, cx, cy); cg.addColorStop(0, '#39ff6a88'); cg.addColorStop(.12, '#39ff6a00'); cg.addColorStop(1, '#39ff6a00'); g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip(); g.fillStyle = cg; g.fillRect(cx - R, cy - R, R * 2, R * 2); g.restore(); }
      } else {
        g.strokeStyle = '#27e0b355'; g.lineWidth = 2; for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(cx, cy, R * i / 3, 0, 7); g.stroke(); }
        g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      }
      g.fillStyle = '#27e0b3'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill(); g.strokeStyle = '#fff8'; g.lineWidth = 2; g.stroke();
      if (this.started && d != null && this.me && this.opp) {
        const r = geo.rel(this.me, this.opp); const ranges = this.zone ? [4, 8, 15, 30, 60] : [20, 50, 100, 250, 500, 1000, 5000, 20000, 100000]; const range = ranges.find(v => v >= r.dist * 1.05) || 500000;
        const hd = this.head(), head = hd == null ? 0 : hd; const a = (r.bearing - head) * Math.PI / 180;
        const k = Math.min(r.dist / range, 1) * R, ox = cx + Math.sin(a) * k, oy = cy - Math.cos(a) * k;
        if (art) { const p = Math.floor(now / 330) % 3; g.globalAlpha = .9; sprC(g, 'k_ping' + p, ox, oy, 44 + p * 8); g.globalAlpha = 1; }
        g.fillStyle = '#ff5470'; g.beginPath(); g.arc(ox, oy, 9, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#cfe8ff'; g.font = '13px sans-serif'; g.fillText('Bord du cercle : ' + (range >= 1000 ? range / 1000 + ' km' : range + ' m'), 90, 408);
        g.fillText(hd == null ? 'Nord en haut' : 'Haut = devant toi', 120, 20);
      }
    } else {
      if (art) { const bob = Math.sin(now / 300) * 5; sprC(g, hot > .6 ? 'k_star' : 'k_lens', cx, cy - 115 + bob, 76); }
      const word = d == null || this.phase !== 'play' ? '…' : d < this.closeR ? 'BRÛLANT' : hot > .75 ? 'CHAUD' : hot > .55 ? 'TIÈDE' : hot > .35 ? 'FRAIS' : 'FROID';
      g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.shadowColor = '#000a'; g.shadowBlur = 6; g.fillText(word, cx, cy - 40); g.shadowBlur = 0; g.textAlign = 'left';
      this.drawDial(g, 180, 322, 62, d);
    }
    if (this.zone) this.drawPlan(g);
    if (this.started && this.phase === 'count') { g.fillStyle = '#050a1caa'; g.fillRect(0, 0, 360, 420); g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 10; g.fillText(String(Math.max(1, Math.ceil(this.count))), cx, 240); g.font = 'bold 22px sans-serif'; g.fillText('Avance de quelques pas', cx, 300); g.shadowBlur = 0; g.textAlign = 'left'; }
    this.endDraw();
  }
  /** Cadran de cap : le haut = devant toi. La flèche montre où est la cible ; vers le haut = tu lui fais face (rouge), vers le bas = dos (bleu). */
  drawDial(g, x, y, r, d) {
    const f = this.face, lv = level(); g.save();
    const col = f == null ? '#cfe8ff' : `rgb(${Math.round(70 + (f + 1) / 2 * 185)},${Math.round(150 - Math.abs(f) * 40)},${Math.round(255 - (f + 1) / 2 * 210)})`;
    g.fillStyle = '#050a1c99'; g.beginPath(); g.arc(x, y, r + 8, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y - r - 12); g.lineTo(x - 7, y - r + 2); g.lineTo(x + 7, y - r + 2); g.closePath(); g.fill();
    g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText('devant', x, y - r - 16);
    if (f != null && this.phase === 'play' && d != null) {
      if (lv <= 3) {
        g.save(); g.translate(x, y); g.rotate(this.diff * Math.PI / 180);
        g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -r + 8); g.lineTo(-15, 8); g.lineTo(0, 0); g.lineTo(15, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
      } else { g.fillStyle = col; g.beginPath(); g.arc(x, y, 12 + Math.max(0, f) * 20, 0, 7); g.fill(); }
      if (lv < 5) { g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(f > .85 ? 'Face à la cible' : f < -.3 ? 'Dos à la cible' : 'Sur le côté', x, y + r + 26); }
    } else if (this.phase === 'play') { g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.fillText('Pas de boussole', x, y + 5); }
    g.restore();
  }
  /** Petit plan de la pièce (en haut à droite) : toi en vert, et le point rouge seulement en mode radar ; alerte quand on touche un mur. */
  drawPlan(g) {
    const B = this.zone.bounds, sc = Math.min(84 / (B.x1 - B.x0), 58 / (B.y1 - B.y0)), ox = 268, oy = 12;
    g.save(); g.globalAlpha = .85; g.fillStyle = '#0b1e2b'; g.fillRect(ox - 6, oy - 6, 98, 72); g.fillStyle = '#123a52';
    this.zone.rooms.forEach(r => g.fillRect(ox + (r.x0 - B.x0) * sc, oy + (B.y1 - r.y1) * sc, (r.x1 - r.x0) * sc, (r.y1 - r.y0) * sc));
    const dot = (p, c) => { const r = geo.rel(ORIGIN, p); g.fillStyle = c; g.beginPath(); g.arc(ox + (r.x - B.x0) * sc, oy + (B.y1 - r.y) * sc, 4, 0, 7); g.fill(); };
    if (this.opp && this.mode === 'radar') dot(this.opp, '#ff5470'); if (this.me) dot(this.me, '#27e0b3');
    g.restore();
    if (performance.now() - (this.warnT || -9e9) < 1200) { g.fillStyle = '#ff5470f0'; g.fillRect(20, 150, 320, 46); g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('Mur ! Tu sors de la pièce', 180, 180); g.textAlign = 'left'; }
  }
}
export default { id: 'radar', name: 'Radar et cache-cache', short: 'Retrouve l\'autre dehors ou dans la maison : radar, chaud-froid, cache-cache.', how: ['Dehors : GPS. Dans la maison : choisis un emplacement enregistré.', 'Radar : tu vois l\'autre point.', 'Chaud-froid : couleurs, bips et cadran. Tourne sur toi-même : face à la cible = chaud, dos = froid.', 'Cache-cache : touche TROUVÉ quand tu es tout près.'], create: ctx => new Radar(ctx) };
