// Running Forest : course-poursuite à pied. L'un se cache, l'autre le cherche avec le radar.
// Quand on arrive près de lui... il est déjà reparti ! (avec Rémi). À deux vrais joueurs, les rôles s'échangent à chaque prise.
// Sans GPS (dans la maison) : mode « pas » : le téléphone compte tes pas et te fait avancer.
import { GameBase } from './base.js';
import { h, clamp } from '../core/util.js';
import { geo } from '../core/sensors.js';
import { pickZone, Zone } from '../core/zone.js';
import { spr, sprC, ready, bgUrl } from '../core/sprites.js';
const BG = (() => { const i = new Image(); i.onload = () => { i.ok = true; }; i.src = bgUrl('forest'); return i; })();

const ORIGIN = { lat: 48.85, lon: 2.35 };
const DURATION = 600;       // 10 minutes
const KCAL_PER_M = 0.065;   // ~65 kcal par km, repère moyen

class Foret extends GameBase {
  constructor(ctx) {
    super(ctx);
    this.isHost = this.role === 'host'; this.remi = !!(ctx.net && ctx.net.remi);
    this.seeker = this.isHost;            // l'hôte cherche en premier ; Rémi se cache toujours
    this.me = null; this.opp = null; this.walked = 0; this.catches = 0; this.flees = 0; this.time = DURATION; this.cool = 0; this.started = false; this.stepMode = false;
    this.hud(h('span', {}, 'Distance : …'), h('span', {}, ''));
    this.makeCanvas(360, 400);
    this.note = h('div', { class: 'bigtxt', style: 'padding:6px;min-height:2.4em' }, '');
    this.stepBox = h('div', { class: 'row', style: 'display:none' },
      h('button', { class: 'btn sec', onclick: () => { this.sim.head = (this.sim.head + 345) % 360; } }, 'Tourner à gauche'),
      h('button', { class: 'btn', onclick: () => this.step() }, 'Faire un pas'),
      h('button', { class: 'btn sec', onclick: () => { this.sim.head = (this.sim.head + 15) % 360; } }, 'Tourner à droite'));
    this.root.append(h('div', { class: 'controls', style: 'flex-direction:column' }, this.note, this.stepBox));
    this.onNet('gp', m => { this.opp = m.p; });
    this.onNet('fgo', m => { this.begin2(m.step, Zone.from(m.zone)); });
    this.onNet('caught', () => { this.catches++; this.seeker = true; this.cool = 20; this.s.sfx('win'); this.s.vibrate(200); this.note.textContent = ''; });
    this.onNet('fled', m => { this.flees = m.n; this.s.sfx('hit'); this.s.vibrate(120); });
    this.wireReplay();
    this.intro();
    this.loop(dt => this.update(dt));
    this.sub(() => geo.stop());
  }

  intro() {
    const how = 'Un se cache, l\'autre cherche. Dehors, localisation activée : le GPS te guide. Dans la maison : choisis « Sans GPS » et fais des pas.';
    if (this.isHost) {
      this.message('Running Forest', how, [
        { label: 'Dehors (GPS)', onclick: () => { this.net.send('fgo', { step: 0 }); this.begin2(false); } },
        { label: 'Sans GPS (je marche)', cls: 'sec', onclick: () => { this.clearMessage(); pickZone(this.root, this.s, z => { this.net.send('fgo', { step: 1, zone: z ? z.toJSON() : null }); this.begin2(true, z); }, () => this.intro()); } }]);
    } else this.message('Running Forest', 'Attends que l\'autre lance. ' + how, []);
  }
  begin2(stepMode, zone) {
    this.clearMessage(); this.started = true; this.stepMode = stepMode; this.zone = stepMode ? zone || null : null; this.lastWarn = 0;
    if (this.zone) this.net.send('zone', { rooms: this.zone.rooms });
    if (stepMode) { this.sim = { lat: 48.85, lon: 2.35, head: 0 }; this.me = { lat: 48.85, lon: 2.35, acc: 3 }; this.stepBox.style.display = 'flex'; this.lastStep = 0; }
    else if (!geo.start(p => { if (p) this.me = p; })) { this.message('GPS indisponible', 'Choisis « Sans GPS » pour jouer dans la maison.', [{ label: 'Menu des jeux', onclick: () => this.ctx.exit() }]); }
    this.ctx.tts && this.ctx.tts.speak('Running Forest, c\'est parti !');
  }
  step() {
    if (!this.sim) return; const a = this.sim.head * Math.PI / 180, d = 0.8;
    const nlat = this.sim.lat + Math.cos(a) * d / 111320, nlon = this.sim.lon + Math.sin(a) * d / (111320 * Math.cos(this.sim.lat * Math.PI / 180));
    if (this.zone) { const r = geo.rel(ORIGIN, { lat: nlat, lon: nlon }); if (!this.zone.contains(r.x, r.y)) { this.leaveAlert(); return; } }
    this.sim.lat = nlat; this.sim.lon = nlon; this.me = { lat: nlat, lon: nlon, acc: 3 }; this.walked += d; this.s.sfx('tick');
  }
  /** Mur de la pièce : on prévient (son, vibration, message) et on ne laisse pas sortir. */
  leaveAlert() { const now = performance.now(); if (now - this.lastWarn < 1200) return; this.lastWarn = now; this.s.sfx('warn'); this.s.vibrate(150); this.warnT = now; }
  dist() { return this.me && this.opp ? geo.rel(this.me, this.opp).dist : null; }

  update(dt) {
    if (!this.started || this.over) { this.draw(); return; }
    this.time -= dt; this.cool = Math.max(0, this.cool - dt);
    if (this.stepMode) { const now = performance.now(); if (this.s.motionSeen && this.s.accel > 2.6 && now - this.lastStep > 380) { this.lastStep = now; this.step(); } }
    else if (this.me) { if (this.prev) { const mv = geo.rel(this.prev, this.me).dist; if (mv > 3 && mv < 60) { this.walked += mv; this.prev = this.me; } } else this.prev = this.me; }
    this.sendT = (this.sendT || 0) + dt; if (this.sendT > 1.5 && this.me) { this.sendT = 0; this.net.send('gp', { p: this.me }); }
    const d = this.dist(), sp = this.hudEl.children;
    sp[0].textContent = d == null ? 'Distance : recherche…' : 'Distance : ' + Math.round(d) + ' m'; sp[1].textContent = 'Temps : ' + Math.max(0, Math.round(this.time)) + ' s';
    if (this.seeker && this.cool > 0) this.note.textContent = 'Attends ' + Math.ceil(this.cool) + ' s : l\'autre se cache…';
    else if (this.seeker) this.note.textContent = d == null ? 'On cherche les deux positions…' : d < (this.zone ? 4 : 25) ? 'Tu es tout près !' : 'Trouve-le ! Approche-toi à moins de ' + this.catchR() + ' mètres.';
    else this.note.textContent = 'Cache-toi ! Il a 20 secondes d\'avance.';
    if (this.seeker && this.cool <= 0 && d != null && d < this.catchR()) this.caught();
    if (this.time <= 0) this.finishRun(false);
    this.draw(d);
  }
  catchR() { return this.zone ? 1.5 : 10; }
  caught() {
    this.catches++; this.s.sfx('win'); this.net.send('caught', { n: this.catches });
    if (this.remi) { this.finishRun(true); return; }
    this.seeker = false; this.cool = 20;
  }
  finishRun(won) {
    if (this.over) return; this.over = true; this.s.sfx(won ? 'win' : 'lose');
    const km = this.walked / 1000, kcal = Math.round(this.walked * KCAL_PER_M), min = Math.round((DURATION - this.time) / 60);
    const lines = ['Distance : ' + (this.walked < 1000 ? Math.round(this.walked) + ' m' : km.toFixed(2) + ' km'), 'Calories brûlées : environ ' + kcal, 'Durée : ' + min + ' min', this.remi ? 'Rémi s\'est enfui ' + this.flees + ' fois.' : 'Prises : ' + this.catches];
    if (this.remi) {
      const funny = !require_soft();
      const t = won ? (funny ? 'Bon… tu m\'as eu. J\'ai plus de souffle. Offre-moi un verre.' : 'Bravo, tu m\'as rattrapé !')
        : (funny ? 'Alors, tu vois, le sport c\'est bien, mais tu m\'as jamais rattrapé, gars.' : 'Beau parcours ! On recommence ?');
      this.net.say && this.net.say(t);
    }
    this.message(won ? 'Rattrapé !' : 'Temps écoulé', lines.join('\n'), [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]);
    this.msg.querySelector('p').style.whiteSpace = 'pre-line';
  }

  draw(d) {
    if (!this.cv.width) return; this.begin(); const g = this.g, now = performance.now(), t = now / 1000;
    if (BG.ok) { g.drawImage(BG, 0, 0, BG.naturalWidth, BG.naturalHeight, 0, 0, 360, 400); g.fillStyle = '#04140ccc'; g.fillRect(0, 0, 360, 400); }
    else {
      g.fillStyle = '#0d2a1c'; g.fillRect(0, 0, 360, 400);
      for (let i = 0; i < 14; i++) { const x = (i * 83) % 360, y = (i * 61) % 380 + 10; g.fillStyle = '#14402b'; g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 16, y + 8); g.lineTo(x - 16, y + 8); g.fill(); }
    }
    // décor dessiné autour du radar : souches, champignons, lucioles
    if (ready()) {
      sprC(g, 'k_stump', 40, 360, 60); sprC(g, 'k_mush', 320, 352, 44); sprC(g, 'k_mush', 300, 372, 28); sprC(g, 'k_stump', 328, 70, 48);
      for (let i = 0; i < 6; i++) sprC(g, 'k_fly', 40 + (i * 61) % 290 + Math.sin(t * 1.3 + i) * 14, 60 + (i * 47) % 280 + Math.cos(t * 1.1 + i * 2) * 12, 22);
      sprC(g, 'k_compass', 34, 36, 40);
    }
    const cx = 180, cy = 200, R = 150;
    g.strokeStyle = '#7dffb866'; g.lineWidth = 2; for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(cx, cy, R * i / 3, 0, 7); g.stroke(); }
    const run = this.started && !this.over && (this.stepMode ? now - (this.lastStep || 0) < 600 : (this.s.accel || 0) > 1.2);
    const frame = run ? Math.floor(t * 8) % 5 : -1;
    if (!(ready() && sprC(g, frame < 0 ? 'k_stand' : 'k_run' + frame, cx, cy - 6, 78))) { g.fillStyle = '#27e0b3'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill(); }
    if (this.started && this.seeker && this.me && this.opp) {
      const r = geo.rel(this.me, this.opp); const range = (this.zone ? [4, 8, 15, 30, 60] : [30, 60, 120, 250, 500, 1000, 5000]).find(v => v >= r.dist * 1.05) || 20000;
      const head = this.stepMode ? this.sim.head : (this.s.heading == null ? 0 : this.s.heading); const a = (r.bearing - head) * Math.PI / 180; const k = Math.min(r.dist / range, 1) * R;
      const ox = cx + Math.sin(a) * k, oy = cy - Math.cos(a) * k;
      if (!(ready() && sprC(g, 'k_hider', ox, oy, 54))) { g.fillStyle = '#ff5470'; g.beginPath(); g.arc(ox, oy, 10, 0, 7); g.fill(); }
      g.fillStyle = '#cfe9d9'; g.font = '13px sans-serif'; g.fillText('Bord du cercle : ' + range + ' m', 100, 388);
    } else if (this.started && !this.seeker) {
      if (ready()) sprC(g, 'k_hider', cx, cy + 70, 90);
      g.fillStyle = '#cfe9d9'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('Cache-toi !', cx, cy - 70); g.textAlign = 'left';
    }
    if (this.zone) this.drawZone(g, now);
    this.endDraw();
  }
  /** Petit plan de la pièce (en bas à droite) et alerte quand on touche un mur. */
  drawZone(g, now) {
    const B = this.zone.bounds, sc = Math.min(100 / (B.x1 - B.x0), 70 / (B.y1 - B.y0)), ox = 250, oy = 300;
    g.save(); g.globalAlpha = .85; g.fillStyle = '#0b1e2b'; g.fillRect(ox - 6, oy - 6, 112, 82); g.fillStyle = '#123a52';
    this.zone.rooms.forEach(r => g.fillRect(ox + (r.x0 - B.x0) * sc, oy + (B.y1 - r.y1) * sc, (r.x1 - r.x0) * sc, (r.y1 - r.y0) * sc));
    if (this.me) { const r = geo.rel(ORIGIN, this.me); g.fillStyle = '#27e0b3'; g.beginPath(); g.arc(ox + (r.x - B.x0) * sc, oy + (B.y1 - r.y) * sc, 4, 0, 7); g.fill(); }
    g.restore();
    if (now - (this.warnT || -9e9) < 1200) { g.fillStyle = '#ff5470f0'; g.fillRect(20, 150, 320, 46); g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('Mur ! Tu sors de la pièce', 180, 180); g.textAlign = 'left'; }
  }
}
import { store } from '../core/util.js';
function require_soft() { return store.get('remiHumor', false) === false; }
export default { id: 'foret', name: 'Running Forest', short: 'Cours dans la forêt : retrouve celui qui se cache (Rémi s\'enfuit !).', how: ['Un se cache, l\'autre cherche avec le radar.', 'Approche-toi à moins de 10 mètres.', 'Dehors : GPS. Dedans : « Sans GPS » et fais des pas.', 'À la fin : distance et calories.'], create: ctx => new Foret(ctx) };
