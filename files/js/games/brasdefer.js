// Bras de fer : secoue le téléphone (ou tape sur le gros bouton) en rythme. La force, le souffle et le rythme décident.
// L'hôte calcule la position des mains pour les deux ; l'autre téléphone envoie ses efforts et affiche ce que l'hôte annonce.
import { SensorDuo, brainFor, cl, avImg } from './pack_d_kit.js';
import { h } from '../core/util.js';
import { lerp } from '../core/level.js';

const W = 360, H = 480, BPM = 2.4, STEP = .05, COST = 7, REGEN = 14;

class BrasDeFer extends SensorDuo {
  constructor(ctx) {
    super(ctx);
    this.pts = { me: 0, opp: 0 }; this.rd = 0; this.pos = 0; this.mst = 100; this.ost = 100; this.phase = 'wait'; this.wins = 2; this.t0 = 0; this.lastEf = 0; this.sendT = 0; this.btn = 0; this.wig = 0; this.flash = 0; this.fx = [];
    this.hs = 100; this.gs = 100; this.hostPts = { h: 0, g: 0 }; this.betweenT = 0;
    this.hud(h('span', {}, 'Manche 1'), h('span', {}, ''));
    this.note = h('div', { class: 'pdbig', style: 'text-align:center;min-height:1.6em;padding:2px 8px;font-size:1.05em' }, '');
    this.gauge = h('div', { class: 'pdgauge', style: 'margin:0 12px' }, h('i'));
    this.makeCanvas(W, H);
    this.root.insertBefore(h('div', {}, this.note, this.gauge), this.cv);
    this.pull = h('button', { class: 'btn big tir', style: 'touch-action:none;min-height:64px;margin:6px 12px', 'aria-label': 'TIRE', onpointerdown: e => { e.preventDefault(); this.effort('tap'); } }, 'TIRE !');
    this.root.append(this.pull);
    this.mo.cb = (t, m, r) => { if ((m > 9 || r > 260) && t - this.lastMo > 130) { this.lastMo = t; this.effort('shake'); } };
    this.lastMo = 0;
    this.onNet('ef', m => { if (this.isHost) this.apply('g', +m.p || 1); });
    this.onNet('ps', m => { if (!this.isHost) this.view(m); });
    this.onRel('fin', m => { if (!this.isHost) this.endGame(!!m.gw, m.hs, m.gs); });
    this.flow('Bras de fer', 'Secoue ton téléphone, ou tape sur « TIRE ! », en suivant le rythme du cercle.\nUn effort pile sur le rythme compte plus. Si tu vas trop vite, tu t\'essouffles et ta force baisse.\nPousse la main de l\'autre jusqu\'à la table pour gagner la manche.', [
      { key: 'rounds', label: 'Nombre de manches', choices: [[1, '1'], [3, '3'], [5, '5']], def: 3 },
    ], false, () => { this.wins = ((+this.cfg.rounds || 3) + 1) / 2; this.t0 = performance.now(); if (this.isHost) this.newRound(); });
    this.loop(dt => this.update(dt));
  }
  beatPhase() { const p = (((performance.now() - this.t0) / 1000) * BPM) % 1; return p; }
  /** Effort local : secousse ou toucher. */
  effort() {
    if (!this.started || this.over || this.paused || this.phase !== 'play') return;
    const ph = this.beatPhase(), onBeat = ph < .16 || ph > .84, p = onBeat ? 1.5 : 1;
    this.wig = .12; this.btn = .1; this.s.vibrate(20); this.s.sfx(onBeat ? 'ok' : 'atk');
    this.fx.push({ t: 0, x: 180, y: 250, good: onBeat });
    if (this.isHost) this.apply('h', p); else this.net.send('ef', { p });
  }
  /** Hôte : un effort de h (hôte) ou g (l'autre). */
  apply(who, p) {
    if (!this.isHost || this.phase !== 'play' || this.over) return;
    const k = who === 'h' ? 'hs' : 'gs', s = this[k], f = .35 + .65 * Math.min(1, s / 40);
    this[k] = Math.max(0, s - COST); this.pos = cl(this.pos + (who === 'h' ? 1 : -1) * STEP * p * f, -1, 1);
    if (Math.abs(this.pos) >= 1) this.roundEnd(this.pos > 0 ? 'h' : 'g');
  }
  newRound() {
    this.pos = 0; this.hs = this.gs = 100; this.phase = 'between'; this.betweenT = 1.5; this.note.textContent = 'Manche ' + (this.rd + 1) + ' : prêts ?'; this.note.style.color = '#ffd24d';
    this.sync();
  }
  roundEnd(w) {
    this.hostPts[w]++; this.rd++; this.phase = 'between'; this.betweenT = 2.2; this.lw = w;
    if (this.hostPts.h >= this.wins || this.hostPts.g >= this.wins) { const gw = this.hostPts.g > this.hostPts.h; this.rel('fin', { gw, hs: this.hostPts.h, gs: this.hostPts.g }); this.endGame(!gw, this.hostPts.h, this.hostPts.g); this.sync(); return; }
    this.sync();
  }
  sync() { this.net.send('ps', { pos: +this.pos.toFixed(3), hs: Math.round(this.hs), gs: Math.round(this.gs), ph: this.phase, ph1: this.hostPts.h, pg: this.hostPts.g, rd: this.rd, last: this.lw || '' }); this.view(null); }
  /** Affichage depuis la vue de l'hôte. */
  view(m) {
    if (m) { this.hostPts = { h: m.ph1, g: m.pg }; this.hsV = m.hs; this.gsV = m.gs; this.rawPos = m.pos; if (m.rd !== this.rd) { this.rd = m.rd; } this.lw = m.last; if (m.ph !== this.phase) this.phaseChange(m.ph); this.phase = m.ph; }
    const i = this.isHost; const raw = m ? m.pos : this.pos;
    this.tPos = i ? raw : -raw; this.pts = { me: i ? this.hostPts.h : this.hostPts.g, opp: i ? this.hostPts.g : this.hostPts.h };
    this.mst = m ? (i ? m.hs : m.gs) : (i ? this.hs : this.gs); this.ost = m ? (i ? m.gs : m.hs) : (i ? this.gs : this.hs);
    this.hudEl.children[0].textContent = 'Manche ' + Math.min(this.rd + 1, 9); this.setStat(this.pts.me, this.pts.opp);
  }
  phaseChange(ph) {
    if (ph === 'between' && this.lw && !this.over) {
      const mine = (this.lw === 'h') === this.isHost; this.note.textContent = mine ? 'Manche gagnée !' : 'Manche perdue…'; this.note.style.color = mine ? '#27e0b3' : '#ff5470'; this.s.sfx(mine ? 'win' : 'lose'); this.s.vibrate(mine ? 60 : 200);
    } else if (ph === 'between') { this.note.textContent = 'Manche ' + (this.rd + 1) + ' : prêts ?'; this.note.style.color = '#ffd24d'; }
    if (ph === 'play') { this.note.textContent = 'Tire en rythme !'; this.note.style.color = '#fff'; this.t0 = performance.now(); this.lw = ''; this.s.sfx('warn'); }
  }
  endGame(win, hs, gs) {
    if (this.over) return; this.phase = 'end';
    const me = this.isHost ? hs : gs, op = this.isHost ? gs : hs;
    this.pts = { me, opp: op };
    if (this.remi && this.net.speak) this.net.speak(win ? 'lose' : 'win');
    setTimeout(() => this.finish(win, 'Manches : toi ' + me + ' – ' + op + ' ' + this.oppA.name), 900);
  }
  update(dt) {
    if (!this.paused && this.started && !this.over) {
      if (this.isHost) {
        this.hs = Math.min(100, this.hs + REGEN * dt); this.gs = Math.min(100, this.gs + REGEN * dt);
        if (this.phase === 'between' && this.phase !== 'end') { this.betweenT -= dt; if (this.betweenT <= 0) { this.pos = 0; this.hs = this.gs = 100; this.phase = 'play'; this.phaseChange('play'); this.sync(); } }
        this.sendT += dt; if (this.sendT > .08) { this.sendT = 0; this.sync(); }
      }
    }
    this.pos = this.pos; const tp = this.tPos || 0; this.vp = (this.vp || 0) + (tp - (this.vp || 0)) * Math.min(1, dt * 12);
    this.wig = Math.max(0, this.wig - dt); this.btn = Math.max(0, this.btn - dt); this.flash = Math.max(0, this.flash - dt);
    this.fx.forEach(f => { f.t += dt; }); this.fx = this.fx.filter(f => f.t < .5);
    this.gauge.firstChild.style.width = cl(this.mst, 0, 100) + '%';
    this.gauge.firstChild.style.background = this.mst < 25 ? 'linear-gradient(#ff7a90,#d33)' : 'linear-gradient(#ffd24d,#ff9a1f)';
    this.pull.style.filter = this.btn > 0 ? 'brightness(1.4)' : '';
    this.draw();
  }
  draw() {
    if (!this.cv.width) return; this.begin(); const g = this.g;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a1a0e'); bg.addColorStop(1, '#4a2e17'); g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
    // planches du mur de taverne et lanterne
    g.strokeStyle = '#00000044'; g.lineWidth = 3; for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 330); g.stroke(); }
    const gl = g.createRadialGradient(180, 40, 5, 180, 40, 190); gl.addColorStop(0, 'rgba(255,200,100,.55)'); gl.addColorStop(1, 'rgba(255,200,100,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, 330);
    g.fillStyle = '#c9a227'; g.fillRect(176, 0, 8, 22); g.fillStyle = '#ffd24d'; g.beginPath(); g.roundRect(166, 22, 28, 30, 6); g.fill();
    // joueurs
    const side = (x, a, name, st, col) => {
      g.strokeStyle = col; g.lineWidth = 5; g.fillStyle = '#1b2a4a'; g.beginPath(); g.arc(x, 130, 44, 0, 7); g.fill(); g.stroke();
      const im = avImg(a); if (im) { g.save(); g.beginPath(); g.arc(x, 130, 40, 0, 7); g.clip(); g.drawImage(im, x - 40, 90, 80, 80); g.restore(); }
      g.fillStyle = '#fff'; g.font = '700 14px system-ui'; g.textAlign = 'center'; g.fillText(name, x, 198);
      g.fillStyle = '#0008'; g.fillRect(x - 40, 206, 80, 9); g.fillStyle = st < 25 ? '#ff5470' : '#ffd24d'; g.fillRect(x - 40, 206, 80 * cl(st, 0, 100) / 100, 9);
    };
    side(66, this.meA.avatar, 'Toi', this.mst, '#27e0b3'); side(294, this.oppA.avatar, this.oppA.name, this.ost, '#ff5470');
    // table (tonneau et planches) vue de côté
    g.fillStyle = '#6b4220'; g.fillRect(0, 300, W, 26); g.fillStyle = '#8a5a2e'; g.fillRect(0, 300, W, 8); g.strokeStyle = '#2b1708'; g.lineWidth = 3; g.strokeRect(-2, 300, W + 4, 26);
    g.fillStyle = '#4a2e17'; g.fillRect(20, 326, 40, 154); g.fillRect(300, 326, 40, 154);
    // bras : coudes sur la table, mains qui se joignent
    const hx = 180 + cl(this.vp || 0, -1, 1) * 78, hy = 262 - Math.abs(this.vp || 0) * 6 + (this.wig > 0 ? -5 : 0);
    const arm = (ex, col) => { g.lineCap = 'round'; g.strokeStyle = '#2b1708'; g.lineWidth = 40; g.beginPath(); g.moveTo(ex, 290); g.lineTo(hx, hy); g.stroke(); g.strokeStyle = col; g.lineWidth = 32; g.beginPath(); g.moveTo(ex, 290); g.lineTo(hx, hy); g.stroke(); g.strokeStyle = '#e6b48a'; g.lineWidth = 26; g.beginPath(); g.moveTo(ex + (hx - ex) * .55, 290 + (hy - 290) * .55); g.lineTo(hx, hy); g.stroke(); };
    arm(66, '#2a6a8a'); arm(294, '#8a2a3a');
    g.fillStyle = '#e6b48a'; g.strokeStyle = '#2b1708'; g.lineWidth = 3; g.beginPath(); g.arc(hx, hy, 19, 0, 7); g.fill(); g.stroke();
    // choppes
    g.fillStyle = '#c9a227'; g.fillRect(120, 275, 22, 25); g.fillRect(220, 275, 22, 25); g.fillStyle = '#fff8'; g.fillRect(124, 279, 14, 5); g.fillRect(224, 279, 14, 5);
    // anneau de rythme
    const ph = this.beatPhase(), cx = 180, cy = 400, on = ph < .16 || ph > .84;
    g.strokeStyle = '#ffffff55'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.stroke();
    g.fillStyle = on && this.phase === 'play' ? '#27e0b3' : '#ffd24d'; g.beginPath(); g.arc(cx, cy, 10 + (on ? 6 : 0), 0, 7); g.fill();
    g.strokeStyle = '#ffd24d'; g.lineWidth = 5; const ra = 34 + 34 * (1 - ph) * 0.8; g.beginPath(); g.arc(cx, cy, Math.max(12, ra), 0, 7); g.globalAlpha = this.phase === 'play' ? .8 : .2; g.stroke(); g.globalAlpha = 1;
    for (const f of this.fx) { g.globalAlpha = 1 - f.t / .5; g.fillStyle = f.good ? '#27e0b3' : '#fff'; g.beginPath(); g.arc(hx, hy - 20 - f.t * 60, 6, 0, 7); g.fill(); } g.globalAlpha = 1;
    this.endDraw();
  }
}

function brain(b) {
  let on = false, pz = false, ph = 'between', t = 0, next = 0.5;
  b.recv = { pz: m => { pz = !!m.on; }, st: () => { on = true; b.speak('hello'); }, ps: m => { ph = m.ph; }, cfg: () => {}, fin: () => {} };
  b.every(40, dt => {
    if (!on || pz || ph !== 'play') return; t += dt; next -= dt;
    if (next <= 0) { next = (1 / lerp(1.7, 3.3)) * (0.85 + Math.random() * .3); const beat = Math.random() < lerp(.3, .85); b.emit('ef', { p: beat ? 1.5 : 1, _i: null }); }
  });
}
export default {
  id: 'brasdefer', name: 'Bras de fer', short: 'Secoue ton téléphone en rythme et plaque la main de l\'autre sur la table.',
  how: ['Secouez votre téléphone (ou tapez sur TIRE !) pour pousser la main de l\'autre.', 'Un effort pile sur le rythme du cercle compte plus.', 'Si vous allez trop vite, vous vous essoufflez : votre force baisse.', 'Le premier à gagner les manches gagne le bras de fer.'],
  create: ctx => { brainFor(ctx.net, brain); return new BrasDeFer(ctx); },
};
