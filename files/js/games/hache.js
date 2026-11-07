// Lancer de hache : ton téléphone est la hache. Balance le bras en visant l'autre, la hache vole sur l'écran, l'autre l'esquive.
// Honnêteté : la position réelle des téléphones n'est pas mesurée. C'est une simulation calculée à partir de ton geste
// (force, direction visée) et de la distance choisie. Sans capteur, on lance en glissant le doigt vers le haut.
import { SensorDuo, brainFor, wrap, cl, avImg } from './pack_d_kit.js';
import { h, store } from '../core/util.js';
import { holdButton } from './base.js';
import { lerp } from '../core/level.js';

const W = 360, H = 480, P = 40, ME = { x: 180, y: 380 }, OP = { x: 180, y: 90 };
const RAD = { f: 1.3, m: .9, d: .55 };
const WIN = 3;
const R_OF = p => 1 + p * 7.2;           // portée en mètres selon la force (0..1)
const IDEAL = d => cl((d - 1) / 7.2, 0, 1);

/* Bruit de vent synthétisé : souffle filtré qui balaie, plus un battement de rotation. up = le son monte (arrivée). */
function whoosh(s, dur, up) {
  try {
    if (!store.get('sound', true)) return; s.beep(1, 1, 'sine', .001); const a = s.audio; if (!a) return; const n = a.sampleRate * dur | 0, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const u = i / n, rot = .55 + .45 * Math.sin(u * dur * 38); d[i] = (Math.random() * 2 - 1) * rot * Math.sin(Math.PI * u); }
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4;
    const t = a.currentTime; f.frequency.setValueAtTime(up ? 300 : 1800, t); f.frequency.exponentialRampToValueAtTime(up ? 1800 : 260, t + dur); g.gain.value = .5;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start(); src.stop(t + dur);
  } catch {}
}
function thud(s, big) { s.beep(big ? 90 : 140, 140, 'sawtooth', .4); setTimeout(() => s.beep(big ? 55 : 80, 160, 'square', .3), 40); }
const ZONES = ['Tête', 'Épaule', 'Ventre', 'Jambe'];

class Hache extends SensorDuo {
  constructor(ctx) {
    super(ctx);
    this.rd = 0; this.pts = { me: 0, opp: 0 }; this.phase = 'idle'; this.fl = null; this.res = null; this.pos = { x: 0, y: 0 }; this.tgt = { x: 0, y: 0 }; this.man = { x: 0, y: 0 }; this.opos = { x: 0, y: 0 };
    this.swing = null; this.live = 0; this.drag = null; this.msgT = 0; this.sendT = 0; this.done = new Set();
    this.hud(h('span', {}, 'Manche 1'), h('span', {}, ''));
    this.makeCanvas(W, H);
    const hb = (l, dx, dy) => holdButton(l, 'sec', v => { this.man = v ? { x: dx, y: dy } : { x: 0, y: 0 }; });
    this.root.append(h('div', { class: 'controls' }, hb('Gauche', -1, 0), hb('Avant', 0, -1), hb('Arrière', 0, 1), hb('Droite', 1, 0)));
    this.note = h('div', { class: 'pdbig', style: 'text-align:center;min-height:2.6em;padding:2px 8px;font-size:1.05em' }, '');
    this.gauge = h('div', { class: 'pdgauge', style: 'margin:0 12px' }, h('i'));
    this.root.insertBefore(h('div', {}, this.note, this.gauge), this.cv);
    this.mo.cb = (t, m, r) => this.onMotion(t, m, r);
    this.cv.addEventListener('pointerdown', e => this.pd(e)); this.cv.addEventListener('pointermove', e => this.pm(e)); this.cv.addEventListener('pointerup', e => this.pu(e)); this.cv.addEventListener('pointercancel', () => { this.drag = null; });
    this.onRel('ax', m => this.gotAxe(m));
    this.onRel('hr', m => this.result(m.rd, !!m.hit, m.why));
    this.onNet('dp', m => { this.opos = { x: m.x, y: m.y }; });
    this.flow('Lancer de hache', 'Ton téléphone est la hache.\nBalance le bras vers l\'autre : la force et la direction décident où elle tombe.\nSi elle tombe sur l\'autre, il perd la manche. Sinon, il la gagne.\nPremier à 3 manches.\nAttention : la position réelle n\'est pas mesurée, c\'est une simulation faite à partir de ton geste.', [
      { key: 'dist', label: 'Distance entre vous (mètres)', choices: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], def: 3 },
      { key: 'mode', label: 'Version (Adulte : humour noir, pour les grands)', choices: [['n', 'Normale : cible'], ['a', 'Adulte : bonhomme dessiné']], def: 'n' },
      { key: 'diff', label: 'Cercle d\'impact', choices: [['f', 'Facile (grand)'], ['m', 'Moyen'], ['d', 'Difficile (petit)']], def: 'm' },
    ], true, () => this.newRound());
    this.loop(dt => this.update(dt));
  }
  get iThrow() { return (this.rd % 2 === 0) === this.isHost; }
  get D() { return +this.cfg.dist || 3; }
  get adult() { return this.cfg.mode === 'a'; }
  get rad() { return RAD[this.cfg.diff] || .9; }

  newRound() {
    this.fl = null; this.res = null; this.phase = 'wait'; this.swing = null; this.pos = { x: 0, y: 0 }; this.tgt = { x: 0, y: 0 }; this.msgT = performance.now();
    this.hudEl.children[0].textContent = 'Manche ' + (this.rd + 1); this.setStat(this.pts.me + ' / ' + WIN, this.pts.opp + ' / ' + WIN);
    this.note.textContent = this.iThrow ? 'À toi ! Vise l\'autre et balance le bras.' + (this.motionOk ? '' : ' (ou glisse le doigt vers le haut)') : this.oppA.name + ' va lancer. Prépare-toi à esquiver !';
    this.note.style.color = this.iThrow ? '#27e0b3' : '#ffb020'; this.gauge.style.visibility = this.iThrow ? 'visible' : 'hidden';
    if (this.remi) this.net.send('rd', { rd: this.rd, thrower: this.iThrow ? 'me' : 'opp', cfg: this.cfg });
    if (this.iThrow) this.say('À toi de lancer !');
  }

  /* ----- Lancer : on mesure le geste ----- */
  onMotion(t, m, r) {
    if (this.paused || this.over || this.phase !== 'wait' || !this.iThrow) return;
    this.live = m; const g = this.gauge.firstChild; g.style.width = Math.min(100, m / 45 * 100) + '%';
    const sw = this.swing;
    if (!sw) { if (m > 13) this.swing = { t0: t, peak: m, tp: t, rot: r }; return; }
    if (m > sw.peak) { sw.peak = m; sw.tp = t; }
    sw.rot = Math.max(sw.rot, r);
    if ((m < sw.peak * .55 && t - sw.t0 > 90) || t - sw.t0 > 500) {
      this.swing = null;
      if (sw.peak < 17) { this.note.textContent = 'Trop mou ! Balance plus fort.'; return; }
      const aim = this.o.at(t - sw.tp + 280); const p = cl((sw.peak - 14) / 32, 0, 1);
      let x = 0; if (this.cal && this.o.seen) x = this.D * Math.tan(cl(wrap(aim.yaw - this.cal.yaw), -55, 55) * Math.PI / 180);
      this.launch(p, x);
    }
  }
  launch(p, x) {
    if (this.phase !== 'wait') return; this.phase = 'fly';
    const R = R_OF(p), d = R - this.D, T = 1.15 + R * .1; x = cl(x, -this.D * 1.4, this.D * 1.4);
    this.s.vibrate(60); whoosh(this.s, T * .8, false);
    const msg = { rd: this.rd, x: +x.toFixed(2), d: +d.toFixed(2), p: +p.toFixed(2), T: +T.toFixed(2) };
    this.fl = { u: 0, T, mine: true, x, d, rd: this.rd, p }; this.rel('ax', msg);
    this.note.textContent = 'Force ' + Math.round(p * 100) + ' % (idéal ' + Math.round(IDEAL(this.D) * 100) + ' %)'; this.gauge.firstChild.style.width = p * 100 + '%'; this.waitT = 0;
  }
  pd(e) { if (this.phase === 'wait' && this.iThrow) { const q = this.vp(e); this.drag = { x: q.x, y: q.y, t: performance.now(), th: true }; } else { this.drag = { th: false }; this.pm(e); } try { this.cv.setPointerCapture(e.pointerId); } catch {} }
  pm(e) {
    if (!this.drag || this.drag.th) return; const q = this.vp(e);
    this.tgt = { x: cl((q.x - ME.x) / P, -1.6, 1.6), y: cl((q.y - ME.y) / P, -1.3, 1.3) }; this.dragging = true;
  }
  pu(e) {
    const d = this.drag; this.drag = null; this.dragging = false; if (!d || !d.th || this.phase !== 'wait' || !this.iThrow || this.paused) return;
    const q = this.vp(e), dx = q.x - d.x, dy = q.y - d.y, dt = Math.max(30, performance.now() - d.t); if (dy > -40) { this.note.textContent = 'Glisse le doigt vers le haut, plus fort et plus vite.'; return; }
    const v = Math.hypot(dx, dy) / dt, p = cl(v / 1.8, 0, 1), ang = Math.atan2(dx, -dy) * 180 / Math.PI; this.launch(p, this.D * Math.tan(cl(ang, -55, 55) * Math.PI / 180));
  }
  vp(e) { const r = this.cv.getBoundingClientRect(), k = this.cv.width / r.width; return { x: ((e.clientX - r.left) * k - this.ox) / this.sc, y: ((e.clientY - r.top) * k - this.oy) / this.sc }; }

  /* ----- Réception : esquive ----- */
  gotAxe(m) {
    if (m.rd !== this.rd || this.fl || this.over) return;
    this.phase = 'fly'; this.base = this.o.seen ? this.o.pitch : 0;
    this.fl = { u: 0, T: m.T, mine: false, x: -m.x, d: m.d, rd: m.rd, lx: -m.x, ly: m.d };
    this.note.textContent = 'La hache arrive ! Esquive !'; this.note.style.color = '#ff5470'; whoosh(this.s, m.T * .9, true); this.s.vibrate(90); this.say('Attention !');
  }
  result(rd, hit, why) {
    if (rd !== this.rd || this.done.has(rd) || this.over) return; this.done.add(rd);
    const f = this.fl; const imThrower = this.iThrow, myWin = imThrower ? hit : !hit;
    if (myWin) this.pts.me++; else this.pts.opp++;
    this.res = { hit, t: 0, mine: imThrower, why };
    if (f) f.u = Math.max(f.u, 1);
    if (hit) { this.s.vibrate(imThrower ? 80 : 400); thud(this.s, this.adult); } else this.s.sfx('block');
    if (hit && f) { const dy = imThrower ? -f.d - (-this.opos.y) : f.ly - this.pos.y, k = dy / this.rad; this.res.zone = k < -.5 ? 0 : k < -.1 ? 1 : k < .5 ? 2 : 3; if (this.res.zone === 0) this.s.beep(1200, 120, 'square', .2); }
    this.note.textContent = hit ? (imThrower ? 'Touché ! Tu gagnes la manche.' : 'Aïe, la hache t\'a eu. Manche perdue.') : (imThrower ? 'Raté ! ' + this.oppA.name + ' gagne la manche.' : 'Esquivé ! Tu gagnes la manche.');
    if (why === 'idle') this.note.textContent = imThrower ? 'Trop long ! Manche perdue.' : this.oppA.name + ' n\'a pas lancé : manche pour toi.';
    this.note.style.color = myWin ? '#27e0b3' : '#ff5470'; this.setStat(this.pts.me + ' / ' + WIN, this.pts.opp + ' / ' + WIN);
    if (this.remi) { const b = this.net; b.speak && b.speak(hit ? (imThrower ? 'hit' : 'gotHim') : 'block'); }
    this.phase = 'res'; this.resT = 0;
  }

  update(dt) {
    if (this.paused || this.over) { this.draw(); return; }
    if (this.started) {
      // déplacement de mon personnage (inclinaison, glissement ou boutons)
      let t = this.tgt;
      if (!this.dragging) {
        const sx = this.s.orientSeen && !this.man.x && !this.man.y ? this.s.tilt * 1.6 : 0;
        const sy = this.o.seen && !this.man.x && !this.man.y && this.base != null ? cl((this.o.pitch - this.base) / 25, -1, 1) * 1.2 : 0;
        if (this.man.x || this.man.y) this.tgt = t = { x: cl(this.pos.x + this.man.x * 2, -1.6, 1.6), y: cl(this.pos.y + this.man.y * 2, -1.3, 1.3) };
        else if (this.s.orientSeen && this.phase === 'fly' && !this.fl.mine) t = { x: sx, y: sy };
      }
      const dx = t.x - this.pos.x, dy = t.y - this.pos.y, dist = Math.hypot(dx, dy), step = Math.min(dist, 3.4 * dt);
      if (dist > 1e-4) { this.pos.x += dx / dist * step; this.pos.y += dy / dist * step; }
      this.sendT += dt; if (this.sendT > .08 && !this.remi) { this.sendT = 0; this.net.send('dp', { x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2) }); }
      const f = this.fl;
      if (f && this.phase === 'fly') {
        f.u += dt / f.T;
        if (!f.mine && f.u >= 1) { const dist2 = Math.hypot(this.pos.x - f.lx, this.pos.y - f.ly), hit = dist2 < this.rad; this.rel('hr', { rd: f.rd, hit }); this.result(f.rd, hit); }
        if (f.mine && f.u >= 1) { this.waitT = (this.waitT || 0) + dt; if (this.waitT > 3.5) { this.rel('hr', { rd: f.rd, hit: false }); this.result(f.rd, false); } }
      }
      if (this.phase === 'wait' && this.iThrow && performance.now() - this.msgT > 25000) { this.rel('hr', { rd: this.rd, hit: false, why: 'idle' }); this.result(this.rd, false, 'idle'); }
      if (this.phase === 'res') {
        this.resT += dt;
        if (this.resT > 2.2) {
          if (this.pts.me >= WIN || this.pts.opp >= WIN) { const w = this.pts.me >= WIN; this.phase = 'end'; this.finish(w, 'Manches : toi ' + this.pts.me + ' – ' + this.pts.opp + ' ' + this.oppA.name); }
          else { this.rd++; this.newRound(); }
        }
      }
    }
    this.draw();
  }

  /* ----- Dessin : arène vue de dessus (toi en bas, l'autre en haut) ----- */
  axe(g, x, y, rot, sz) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sz, sz);
    const wd = g.createLinearGradient(-4, 0, 4, 0); wd.addColorStop(0, '#4a2a10'); wd.addColorStop(.45, '#a8692e'); wd.addColorStop(1, '#5a3314');
    g.fillStyle = wd; g.strokeStyle = '#25130a'; g.lineWidth = 1.6; g.beginPath(); g.roundRect(-3.5, -6, 7, 40, 3.5); g.fill(); g.stroke();
    g.strokeStyle = '#2b1708aa'; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-2, 6 + i * 7); g.lineTo(2, 8 + i * 7); g.stroke(); }
    const gr = g.createLinearGradient(-26, -8, 0, 8); gr.addColorStop(0, '#5d6a80'); gr.addColorStop(.35, '#f2f7ff'); gr.addColorStop(.6, '#9fb0c8'); gr.addColorStop(1, '#6a7790');
    g.fillStyle = gr; g.strokeStyle = '#1d2433'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-3, -9); g.quadraticCurveTo(-30, -16, -26, 8); g.quadraticCurveTo(-30, 18, -3, 14); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#ffffffcc'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-22, -6); g.quadraticCurveTo(-25, 2, -22, 10); g.stroke();
    g.fillStyle = '#c9a227'; g.fillRect(-4.5, 12, 9, 4); g.restore();
  }
  /** Cible à anneaux (version normale) */
  target(g, x, y, r) {
    const cols = ['#f4f1e8', '#d9323f', '#f4f1e8', '#d9323f', '#ffd24d']; g.save(); g.strokeStyle = '#2b1708'; g.lineWidth = 2;
    cols.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r * (1 - i * .2), 0, 7); g.fill(); g.stroke(); }); g.restore();
  }
  /** Bonhomme de dessin animé (version adulte) ; hurt = zone touchée ou -1 */
  char(g, x, y, id, hurt, t) {
    g.save(); g.translate(x, y); if (hurt >= 0) g.rotate(Math.sin(t * 30) * .08 * Math.max(0, 1 - t));
    g.fillStyle = '#0a1a2f55'; g.beginPath(); g.ellipse(0, 40, 26, 8, 0, 0, 7); g.fill();
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.fillStyle = '#3a77d9'; g.beginPath(); g.roundRect(-16, -8, 32, 34, 8); g.fill(); g.stroke();
    g.fillStyle = '#2b3550'; g.beginPath(); g.roundRect(-14, 24, 12, 18, 4); g.roundRect(2, 24, 12, 18, 4); g.fill(); g.stroke();
    g.fillStyle = '#ffd7a8'; g.beginPath(); g.arc(0, -22, 17, 0, 7); g.fill(); g.stroke();
    const im = avImg(id); if (im) { g.save(); g.beginPath(); g.arc(0, -22, 15, 0, 7); g.clip(); g.drawImage(im, -15, -37, 30, 30); g.restore(); }
    else { g.fillStyle = '#111'; g.beginPath(); g.arc(-6, -24, 2.5, 0, 7); g.arc(6, -24, 2.5, 0, 7); g.fill(); }
    if (hurt >= 0) {
      const sy = [-30, -6, 8, 34][hurt]; g.fillStyle = '#d10f2a'; g.strokeStyle = '#7a0816'; g.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + 1, d = 6 + (i * 7 % 15) * Math.min(1, t * 3); g.beginPath(); g.arc(Math.cos(a) * d, sy + Math.sin(a) * d, 3 + i % 3, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.font = '900 14px system-ui'; g.textAlign = 'center'; g.fillText('SPLAT', 0, -52 - t * 10);
    }
    g.restore();
  }
  pawn(g, x, y, id, ring, name) {
    g.fillStyle = '#0a1a2f55'; g.beginPath(); g.ellipse(x + 3, y + 5, 22, 17, 0, 0, 7); g.fill();
    g.strokeStyle = ring; g.lineWidth = 4; g.fillStyle = '#1b2a4a'; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill(); g.stroke();
    const im = avImg(id); if (im) { g.save(); g.beginPath(); g.arc(x, y, 19, 0, 7); g.clip(); g.drawImage(im, x - 19, y - 19, 38, 38); g.restore(); }
    g.fillStyle = '#fff'; g.font = '700 12px system-ui'; g.textAlign = 'center'; g.fillText(name, x, y + 38);
  }
  draw() {
    if (!this.cv.width) return; this.begin(); const g = this.g;
    const fl = g.createLinearGradient(0, 0, 0, H); fl.addColorStop(0, '#7a4f26'); fl.addColorStop(1, '#5b3a1b'); g.fillStyle = fl; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#3a2410'; g.lineWidth = 2; for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let y = 0, k = 0; y < H; y += 40, k++) for (let x = (k % 2) * 60 + 30; x < W; x += 120) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 40); g.stroke(); }
    g.strokeStyle = '#c9a22788'; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(10, 235); g.lineTo(W - 10, 235); g.stroke(); g.setLineDash([]);
    const fle = this.fl, oppV = { x: OP.x - this.opos.x * P, y: OP.y - this.opos.y * P }, meV = { x: ME.x + this.pos.x * P, y: ME.y + this.pos.y * P };
    if (this.started) {
      // cercle d'impact autour de la position nominale de l'adversaire (celui qu'on essaie de toucher)
      g.strokeStyle = '#ff547099'; g.lineWidth = 3; g.setLineDash([6, 6]); g.beginPath(); g.arc(oppV.x, oppV.y, this.rad * P, 0, 7); g.stroke(); g.setLineDash([]);
    }
    const rs = this.res, hz = rs && rs.hit ? rs.zone : -1, tt = this.resT || 0;
    if (this.adult) {
      this.char(g, oppV.x, oppV.y, this.oppA.avatar, rs && rs.mine && rs.hit ? hz : -1, tt); this.char(g, meV.x, meV.y, this.meA.avatar, rs && !rs.mine && rs.hit ? hz : -1, tt);
    } else {
      this.target(g, oppV.x, oppV.y, 26); this.pawn(g, oppV.x, oppV.y + 40, this.oppA.avatar, '#ff5470', this.oppA.name); this.pawn(g, meV.x, meV.y, this.meA.avatar, '#27e0b3', 'Toi');
    }
    if (this.started && this.phase === 'wait' && this.iThrow) { const sw = Math.sin(performance.now() / 160) * .12 + Math.min(.6, this.live / 40); this.axe(g, ME.x + 70, ME.y + 70, -.3 - sw, 2.1); }
    if (fle) {
      const u = Math.min(1, fle.u);
      if (fle.mine) {
        const tx = OP.x + fle.x * P, ty = OP.y - fle.d * P, x = ME.x + (tx - ME.x) * u, y = ME.y + (ty - ME.y) * u;
        if (this.res || fle.u >= 1) { g.strokeStyle = this.res && this.res.hit ? '#27e0b3' : '#ffd24d'; g.lineWidth = 4; g.beginPath(); g.arc(tx, ty, 16, 0, 7); g.stroke(); }
        g.fillStyle = '#0006'; g.beginPath(); g.ellipse(x + 6, y + 8, 12, 7, 0, 0, 7); g.fill();
        this.axe(g, x, y - Math.sin(u * Math.PI) * 14, u * 30, u >= 1 ? .9 : 2 - u * 1.1);
      } else {
        const lx = ME.x + fle.lx * P, ly = ME.y + fle.ly * P, sx = lx + (180 - lx) * .35, sy = 20, x = sx + (lx - sx) * u, y = sy + (ly - sy) * u, df = this.cfg.diff;
        const show = df === 'f' || (df === 'm' && u > .45) || fle.u >= 1;
        if (show) { const pul = 1 + Math.sin(performance.now() / 90) * .08; g.strokeStyle = '#ff5470'; g.fillStyle = '#ff547033'; g.lineWidth = 4; g.beginPath(); g.arc(lx, ly, this.rad * P * pul, 0, 7); g.fill(); g.stroke(); }
        g.fillStyle = '#0006'; g.beginPath(); g.ellipse(x + 6, y + 8, 12, 7, 0, 0, 7); g.fill();
        this.axe(g, x, y - Math.sin(u * Math.PI) * 10 * (1 - u), u * 34, .5 + u * 1.6);
      }
    }
    if (this.res) {
      const t = this.resT || 0, hit = this.res.hit; const tx = this.res.mine ? OP.x + (fle ? fle.x * P : 0) : ME.x + (fle ? fle.lx * P : 0), ty = this.res.mine ? OP.y - (fle ? fle.d * P : 0) : ME.y + (fle ? fle.ly * P : 0);
      g.save(); g.globalAlpha = Math.max(0, 1 - t / 2.2); g.fillStyle = hit ? '#ff9a1f' : '#cfe8ff'; g.font = '900 34px system-ui'; g.textAlign = 'center'; g.fillText(hit ? 'TOUCHÉ !' : 'RATÉ', 180, 235);
      g.strokeStyle = hit ? '#ff5470' : '#cfe8ff'; g.lineWidth = 5; g.beginPath(); g.arc(tx, ty, 10 + t * 40, 0, 7); g.stroke(); g.restore();
    }
    this.endDraw();
  }
}

/* Rémi : lance et esquive selon son niveau (se branche sans toucher à remi.js). */
function brain(b) {
  let cfg = { dist: 3, diff: 'm' }, rd = 0, run = false, pos = { x: 0, y: 0 };
  const rnd = (a, c) => a + Math.random() * (c - a), gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  let pz = false;
  b.recv = {
    pz: m => { pz = !!m.on; },
    cfg: m => { if (m.cfg) cfg = m.cfg; },
    rd: m => {
      rd = m.rd; if (m.cfg) cfg = m.cfg; run = true; pos = { x: 0, y: 0 };
      if (m.thrower === 'opp') b.after(rnd(2200, 4200), () => {
        if (!run || pz) return; const D = +cfg.dist || 3, sx = lerp(1.5, .25), sd = lerp(1.7, .35), x = gauss() * sx, d = gauss() * sd, R = Math.max(1, D + d), p = Math.min(1, Math.max(0, (R - 1) / 7.2));
        b.emit('ax', { rd, x, d, p, T: 1.15 + R * .1, _i: null });
      });
    },
    ax: m => {
      const lx = -m.x, ly = m.d, rad = RAD[cfg.diff] || .9, nominal = Math.hypot(lx, ly), dodge = Math.random() < lerp(.2, .8);
      const fin = dodge ? Math.max(nominal, rad * 1.45) : nominal; const ang = Math.atan2(-ly || 1, -lx || 1);
      if (dodge) { const tx = lx + Math.cos(ang) * rad * 1.5, ty = ly + Math.sin(ang) * rad * 1.5, t0 = performance.now(); const iv = setInterval(() => { const u = Math.min(1, (performance.now() - t0) / 600); pos = { x: tx * u, y: ty * u }; b.emit('dp', pos); if (u >= 1) clearInterval(iv); }, 70); b.timers.push(iv); }
      b.after(m.T * 1000 + 120, () => { if (pz) return; b.emit('hr', { rd: m.rd, hit: fin < rad, _i: null }); });
    },
    hr: () => { run = true; },
  };
}
export default {
  id: 'hache', name: 'Lancer de hache', short: 'Balance le bras : la hache vole vers l\'autre, qui doit l\'esquiver.',
  how: ['Choisissez la distance et la taille du cercle d\'impact.', 'Pointez chacun votre téléphone vers l\'autre pour régler la direction.', 'À ton tour, balance le bras comme pour lancer une hache : la force et la direction visée décident où elle tombe.', 'Quand la hache arrive, esquive en inclinant le téléphone (ou en glissant le doigt).', 'Si la hache tombe dans le cercle, l\'autre perd la manche. Premier à 3 manches. La position réelle n\'est pas mesurée : c\'est une simulation faite à partir de ton geste.'],
  create: ctx => { brainFor(ctx.net, brain); return new Hache(ctx); },
};
