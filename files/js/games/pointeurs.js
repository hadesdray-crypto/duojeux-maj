// Duel de pointeurs : pointe VRAIMENT ton téléphone vers l'autre joueur et tire. Pistolet à silex pirate : de la poudre, un tir, on recharge.
// Tout est vu de face : tu vois l'autre devant toi, un viseur suit la direction de ton téléphone. Incline ton téléphone sur le côté pour esquiver.
import { SensorDuo, brainFor, wrap, cl, avImg } from './pack_d_kit.js';
import { h } from '../core/util.js';
import { holdButton } from './base.js';
import { lerp } from '../core/level.js';

const W = 360, H = 480, K = 4.5, CY = 245, DR = 25, LIVES = 5, COST = 40;
const MARG = { f: 14, m: 9, d: 5 };

class Pointeurs extends SensorDuo {
  constructor(ctx) {
    super(ctx);
    this.lives = LIVES; this.olives = LIVES; this.powder = 100; this.aim = { a: 0, p: 0 }; this.myO = 0; this.eo = 0; this.man = 0; this.fx = []; this.shake = 0; this.flash = 0; this.sendT = 0; this.touch = null; this.rid = 0; this.done = new Set();
    this.hud(h('span', {}, 'Vies : ' + LIVES), h('span', {}, ''));
    this.note = h('div', { class: 'pdbig', style: 'text-align:center;min-height:1.6em;padding:2px 8px;font-size:1.05em' }, '');
    this.gauge = h('div', { class: 'pdgauge', style: 'margin:0 12px' }, h('i'));
    this.makeCanvas(W, H);
    this.root.insertBefore(h('div', {}, this.note, this.gauge), this.cv);
    this.fireB = h('button', { class: 'btn tir', style: 'touch-action:none', 'aria-label': 'TIR', onpointerdown: e => { e.preventDefault(); this.fire(); } }, 'TIR');
    this.root.append(h('div', { class: 'controls' }, holdButton('Gauche', 'dir sec', v => { this.man = v ? -1 : (this.man === -1 ? 0 : this.man); }), this.fireB, holdButton('Droite', 'dir sec', v => { this.man = v ? 1 : (this.man === 1 ? 0 : this.man); })));
    this.cv.addEventListener('pointerdown', e => this.tp(e)); this.cv.addEventListener('pointermove', e => { if (this.touch) this.tp(e); }); this.cv.addEventListener('pointerup', () => { this.touch = null; });
    this.onSense('shield', e => { if (e.down) this.fire(); });
    this.onNet('dp', m => { this.eo = m.o; });
    this.onRel('sh', m => this.incoming(m));
    this.onRel('rs', m => this.outcome(m));
    this.flow('Duel de pointeurs', 'Pistolet à silex : pointe ton téléphone vers l\'autre joueur, appuie sur TIR.\nUn tir touche si ton viseur est sur lui. Incline le téléphone sur le côté pour esquiver.\nTu as de la poudre pour un tir à la fois, puis il faut recharger.\n5 vies chacun.', [
      { key: 'diff', label: 'Taille de la cible', choices: [['f', 'Facile (grande)'], ['m', 'Moyenne'], ['d', 'Difficile (petite)']], def: 'm' },
    ], true, () => { this.note.textContent = 'Pointe vers l\'autre et tire !'; this.say('En joue !'); });
    this.loop(dt => this.update(dt));
  }
  get marg() { return MARG[this.cfg.diff] || 9; }
  tp(e) { const r = this.cv.getBoundingClientRect(), k = this.cv.width / r.width, x = ((e.clientX - r.left) * k - this.ox) / this.sc, y = ((e.clientY - r.top) * k - this.oy) / this.sc; this.touch = { x, y }; }

  fire() {
    if (!this.started || this.over || this.paused) return;
    if (this.powder < COST) { this.note.textContent = 'Recharge… (la poudre se remplit)'; this.s.sfx('block'); return; }
    this.powder -= COST; const a = +this.aim.a.toFixed(1), p = +this.aim.p.toFixed(1), id = ++this.rid;
    this.fx.push({ k: 'shot', x: W / 2 + a * K, y: CY - p * K, t: 0 }); this.s.sfx('fire'); this.s.vibrate(50); this.mine = { id, a, p };
    this.rel('sh', { id, a, p });
  }
  /** Quelqu'un tire sur moi : c'est moi qui décide, avec ma position du moment. */
  incoming(m) {
    if (this.over || this.done.has('i' + m.id)) return; this.done.add('i' + m.id);
    const mine = -this.myO * DR, hit = Math.abs(m.a - mine) < this.marg && Math.abs(m.p) < this.marg * 1.6;
    this.fx.push({ k: 'muzzle', x: W / 2 + this.eo * -DR * K, y: CY, t: 0 }); this.s.sfx('atk');
    if (hit) { this.lives--; this.shake = .35; this.flash = .35; this.s.vibrate(250); this.s.sfx('hit'); this.fx.push({ k: 'hit', x: W / 2 + this.myO * 110, y: H - 70, t: 0 }); } else this.s.sfx('block');
    this.hudEl.children[0].textContent = 'Vies : ' + this.lives; this.rel('rs', { id: m.id, hit, lives: this.lives });
    if (this.remi && this.net.speak) this.net.speak(hit ? 'gotHim' : 'cold');
    this.setStat(this.lives, this.olives);
    if (this.lives <= 0) this.end(false);
  }
  outcome(m) {
    if (this.over || this.done.has('o' + m.id)) return; this.done.add('o' + m.id);
    this.olives = m.lives; this.setStat(this.lives, this.olives);
    const ex = W / 2 + this.eo * -DR * K;
    if (m.hit) { this.fx.push({ k: 'hit', x: ex, y: CY, t: 0 }); this.note.textContent = 'TOUCHÉ !'; this.note.style.color = '#27e0b3'; this.s.sfx('win'); this.s.vibrate(60); }
    else { this.fx.push({ k: 'splash', x: W / 2 + (this.mine ? this.mine.a * K : 0), y: CY + 120, t: 0 }); this.note.textContent = 'Raté…'; this.note.style.color = '#ffb020'; }
    if (this.olives <= 0) this.end(true);
  }
  end(win) { if (this.over) return; setTimeout(() => this.finish(win, 'Vies restantes : toi ' + this.lives + ' – ' + this.olives + ' ' + this.oppA.name), 700); this.ending = true; }

  update(dt) {
    if (this.paused) { this.draw(); return; }
    if (this.started && !this.over) {
      // visée : la direction du téléphone, ou le doigt s'il n'y a pas de capteur
      if (this.cal && this.o.seen) { this.aim = { a: cl(wrap(this.o.yaw - this.cal.yaw), -40, 40), p: cl(this.o.pitch - this.cal.pitch, -30, 30) }; }
      else if (this.touch) this.aim = { a: cl((this.touch.x - W / 2) / K, -40, 40), p: cl(-(this.touch.y - CY) / K, -30, 30) };
      // esquive : inclinaison (roulis) ou boutons
      const tgt = this.man ? this.man : (this.s.orientSeen ? this.s.tilt : this.myO);
      this.myO += cl(tgt - this.myO, -3 * dt, 3 * dt); this.myO = cl(this.myO, -1, 1);
      this.sendT += dt; if (this.sendT > .08) { this.sendT = 0; this.net.send('dp', { o: +this.myO.toFixed(2) }); }
      this.powder = Math.min(100, this.powder + 28 * dt); this.gauge.firstChild.style.width = this.powder + '%';
      this.gauge.firstChild.style.background = this.powder < COST ? 'linear-gradient(#ff7a90,#d33)' : 'linear-gradient(#ffd24d,#ff9a1f)';
    }
    this.fx.forEach(f => { f.t += dt; }); this.fx = this.fx.filter(f => f.t < .9); this.shake = Math.max(0, this.shake - dt); this.flash = Math.max(0, this.flash - dt);
    this.draw();
  }

  draw() {
    if (!this.cv.width) return; this.begin(); const g = this.g;
    if (this.shake > 0) g.translate((Math.random() - .5) * 10, (Math.random() - .5) * 10);
    // ciel et mer vus de face
    const sky = g.createLinearGradient(0, 0, 0, 250); sky.addColorStop(0, '#14214d'); sky.addColorStop(1, '#ffb36b'); g.fillStyle = sky; g.fillRect(-20, -20, W + 40, 275);
    const sea = g.createLinearGradient(0, 250, 0, H); sea.addColorStop(0, '#1b87b8'); sea.addColorStop(1, '#0b3a63'); g.fillStyle = sea; g.fillRect(-20, 250, W + 40, H);
    g.fillStyle = '#12305a'; g.beginPath(); g.moveTo(0, 252); g.lineTo(40, 232); g.lineTo(90, 252); g.fill(); g.beginPath(); g.moveTo(250, 252); g.lineTo(300, 226); g.lineTo(360, 252); g.fill();
    const t = performance.now() / 700; g.strokeStyle = '#ffffff30'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { const y = 270 + i * 22, x = ((i * 67 + t * 14) % 400) - 20; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 5, x + 28, y); g.stroke(); }
    // l'autre joueur, de face (son esquive le déplace sur le côté ; ce qu'on voit est le même que ce qui compte pour toucher)
    const ex = W / 2 + this.eo * -DR * K, ey = CY;
    g.fillStyle = '#0a1a2f55'; g.beginPath(); g.ellipse(ex, ey + 78, 44, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#1c2c55'; g.strokeStyle = '#0a1330'; g.lineWidth = 3; g.beginPath(); g.roundRect(ex - 32, ey - 4, 64, 78, 14); g.fill(); g.stroke();
    g.fillStyle = '#c9a227'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(ex, ey + 10 + i * 18, 3.2, 0, 7); g.fill(); }
    g.fillStyle = '#6b4220'; g.fillRect(ex - 32, ey + 40, 64, 6);
    g.strokeStyle = '#ff5470'; g.lineWidth = 4; g.fillStyle = '#1b2a4a'; g.beginPath(); g.arc(ex, ey - 24, 30, 0, 7); g.fill(); g.stroke();
    const im = avImg(this.oppA.avatar); if (im) { g.save(); g.beginPath(); g.arc(ex, ey - 24, 27, 0, 7); g.clip(); g.drawImage(im, ex - 27, ey - 51, 54, 54); g.restore(); }
    if (this.started && this.cfg.diff === 'f') { g.strokeStyle = '#ffd24d66'; g.lineWidth = 2; g.setLineDash([5, 5]); g.beginPath(); g.arc(ex, ey + 20, this.marg * K, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = '#fff'; g.font = '700 13px system-ui'; g.textAlign = 'center'; g.fillText(this.oppA.name, ex, ey + 98);
    // viseur
    if (this.started && !this.over) {
      const rx = W / 2 + this.aim.a * K, ry = CY - this.aim.p * K; g.strokeStyle = this.powder >= COST ? '#27e0b3' : '#ff7a90'; g.lineWidth = 3;
      g.beginPath(); g.arc(rx, ry, 18, 0, 7); g.moveTo(rx - 28, ry); g.lineTo(rx - 8, ry); g.moveTo(rx + 8, ry); g.lineTo(rx + 28, ry); g.moveTo(rx, ry - 28); g.lineTo(rx, ry - 8); g.moveTo(rx, ry + 8); g.lineTo(rx, ry + 28); g.stroke();
    }
    // effets
    for (const f of this.fx) {
      const u = f.t / .9; g.save(); g.globalAlpha = 1 - u;
      if (f.k === 'shot') { g.strokeStyle = '#ffe9a0'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, H - 20); g.lineTo(f.x, f.y); g.stroke(); g.fillStyle = '#222'; g.beginPath(); g.arc(f.x, f.y, 6, 0, 7); g.fill(); }
      else if (f.k === 'muzzle') { g.fillStyle = '#ffd24d'; g.beginPath(); g.arc(f.x, f.y + 20, 14 + u * 30, 0, 7); g.fill(); g.fillStyle = '#ff7a1f'; g.beginPath(); g.arc(f.x, f.y + 20, 8 + u * 12, 0, 7); g.fill(); }
      else if (f.k === 'hit') { g.fillStyle = '#ff5470'; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, r = (i % 2 ? 20 : 42) * (1 + u * .6); g.lineTo(f.x + Math.cos(a) * r, f.y + 10 + Math.sin(a) * r); } g.closePath(); g.fill(); }
      else if (f.k === 'splash') { g.strokeStyle = '#d9f1ff'; g.lineWidth = 4; g.beginPath(); g.ellipse(f.x, f.y, 14 + u * 30, 6 + u * 12, 0, 0, 7); g.stroke(); }
      g.restore();
    }
    // ma position d'esquive (en bas) et rampe du pont
    g.fillStyle = '#5b3a1b'; g.fillRect(-20, H - 36, W + 40, 40); g.strokeStyle = '#2b1708'; g.lineWidth = 3; g.beginPath(); g.moveTo(-20, H - 36); g.lineTo(W + 20, H - 36); g.stroke();
    g.fillStyle = '#27e0b3'; g.beginPath(); g.arc(W / 2 + this.myO * 110, H - 16, 11, 0, 7); g.fill(); g.strokeStyle = '#ffffff55'; g.beginPath(); g.moveTo(W / 2 - 110, H - 16); g.lineTo(W / 2 + 110, H - 16); g.stroke();
    if (this.flash > 0) { g.fillStyle = 'rgba(255,60,80,' + this.flash + ')'; g.fillRect(-20, -20, W + 40, H + 40); }
    this.endDraw();
  }
}

function brain(b) {
  let cfg = { diff: 'm' }, lives = LIVES, on = false, o = 0, ho = 0, t = 0, fireT = 3, pz = false;
  const rnd = (a, c) => a + Math.random() * (c - a), gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  b.recv = {
    pz: m => { pz = !!m.on; },
    cfg: m => { if (m.cfg) cfg = m.cfg; },
    st: () => { on = true; b.speak('hello'); },
    dp: m => { ho = m.o; },
    sh: m => {
      const marg = MARG[cfg.diff] || 9, dodge = -o * DR, hit = Math.abs(m.a - dodge) < marg && Math.abs(m.p) < marg * 1.6;
      if (hit) lives = Math.max(0, lives - 1); b.emit('rs', { id: m.id, hit, lives, _i: null }); if (hit) b.after(300, () => b.speak('hit')); else b.speak('block'); if (lives <= 0) b.after(900, () => b.speak('lose'));
    },
    rs: () => {},
  };
  b.every(60, dt => {
    if (!on || pz) return; t += dt;
    const amp = lerp(.35, .9), tgt = Math.sin(t * lerp(1.1, 2.4)) * amp + (Math.sin(t * 5.3) > .96 ? 1 : 0) * .4; o += (tgt - o) * Math.min(1, dt * lerp(3, 7)); o = Math.max(-1, Math.min(1, o));
    b.emit('dp', { o, _i: null });
    fireT -= dt; if (fireT <= 0 && lives > 0) {
      fireT = rnd(lerp(3.2, 1.4), lerp(4.6, 2.3)); const sig = lerp(11, 2.5), a = -ho * DR + gauss() * sig, p = gauss() * sig * .6;
      b.emit('sh', { id: Math.floor(Math.random() * 1e9), a, p, _i: null });
    }
  });
}
export default {
  id: 'pointeurs', name: 'Duel de pointeurs', short: 'Pointe ton téléphone vers l\'autre et tire : pistolet de pirate, poudre limitée.',
  how: ['Pointez chacun votre téléphone vers l\'autre pour régler la visée.', 'Le viseur suit la direction de ton téléphone : place-le sur l\'autre joueur et appuie sur TIR.', 'Incline ton téléphone sur le côté pour esquiver.', 'Un tir demande de la poudre : attends qu\'elle se remplisse entre deux tirs.', 'Chacun a 5 vies. Sans capteur de direction, vise avec le doigt.'],
  create: ctx => { brainFor(ctx.net, brain); return new Pointeurs(ctx); },
};
