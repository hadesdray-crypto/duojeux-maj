// Combat à l'épée « à ondes » : on ne touche JAMAIS l'autre téléphone.
// ATTAQUER = un mouvement circulaire avec le téléphone (ou un cercle dessiné au doigt). Une onde d'énergie part de ton écran vers l'autre téléphone, avec une vitesse fixe (1,7 s).
// DÉFENDRE = BLOQUER (bouton, secousse ou volume) au moment précis où l'onde traverse la zone de blocage. Bloqué : DUEL, chacun tape le plus vite possible pendant 3 s. Raté : on prend le coup.
// Option « visée façon pistolets » : on se vise l'un l'autre, l'onde part dans la direction du téléphone et passe à côté si on ne vise pas l'autre.
import { SensorDuo, cl, wrap } from './pack_d_kit.js';
import { h } from '../core/util.js';
import { makeAtlas } from '../core/atlas.js';
import { bgUrl } from '../core/sprites.js';
import { R as DR } from '../core/duel_rects.js';
const DU = makeAtlas('img/duel.webp', DR);
const BG = new Image(); BG.onload = () => { BG.ok = true; }; BG.src = bgUrl('deck');

const DUR = 1700, HALF = 230, DUEL_MS = 3000, LIVES = 3, AIM_TOL = 22, WX = 100, ZX = 135;
const POSES = {
  idle: ['p_idle', 32, 142, .55], prep: ['p_prep', 12, 78, .25], atk: ['p_atk', 110, 95, 1.45], guard: ['p_guard', 38, 111, .35], guardHit: ['p_guardHit', 9, 128, .45],
  dizzy: ['p_dizzy', 113, 135, 2.5], special: ['p_spec', 117, 93, 1.45], win: ['p_win', 109, 48, .15], rip: ['p_rip', 94, 93, 1.0],
  lose: ['p_lose'], fall: ['p_fall'], dodge: ['p_dodge'],
};
const how = ['Ne touche jamais l\'autre téléphone.', 'Pour attaquer : fais un mouvement circulaire avec ton téléphone, comme un coup d\'épée (ou dessine un cercle au doigt sur la scène, ou touche ATTAQUE). Une onde part de ton écran vers l\'autre téléphone.', 'Pour te défendre : touche BLOQUER (ou secoue, ou bouton de volume) au moment précis où l\'onde traverse la zone de blocage bleue, quand elle devient verte.', 'Blocage réussi : DUEL ! Chacun tape le plus vite possible pendant 3 secondes. Blocage raté : tu prends le coup.', 'Les tours alternent : après chaque échange, celui qui défendait attaque. Premier à enlever les 3 vies de l\'autre gagne.', 'Option « Avec visée » : on se vise l\'un l\'autre comme au pistolet, et l\'onde passe à côté si le téléphone ne vise pas l\'autre.'];

class Epee extends SensorDuo {
  constructor(ctx) {
    super(ctx); if (typeof window !== 'undefined') window.__epee = this;
    this.lives = LIVES; this.olives = LIVES; this.att = false; this.ph = 'idle'; this.wave = null; this.duel = null; this.q = []; this.fx = []; this.swing = 0; this.oppSwing = 0; this.hitT = 0; this.oppHurt = 0; this.blockT = 0; this.lock = 0; this.wid = 0; this.pendDl = {}; this.trail = []; this.pt = null; this.lastT = performance.now(); this.inWinPrev = false;
    this.hud(h('span', {}, 'Premier à ' + LIVES + ' vies'), h('span', {}, ''));
    this.setStat(LIVES, LIVES);
    this.makeCanvas(360, 360);
    this.stl = h('div', { class: 'bigtxt', style: 'min-height:2.9em;text-align:center;padding:0 10px;font-size:1.15em' }, '');
    this.atkBtn = h('button', { class: 'btn warn big', 'aria-label': 'ATTAQUE', onclick: () => this.launch(this.aimNow(), .7) }, 'ATTAQUE');
    this.blBtn = h('button', { class: 'btn big', style: 'touch-action:manipulation', 'aria-label': 'BLOQUER', onpointerdown: e => { e.preventDefault(); this.tryBlock(); } }, 'BLOQUER');
    this.tapBtn = h('button', { class: 'btn warn big', style: 'display:none;min-height:96px;touch-action:manipulation', 'aria-label': 'TAPE' }, 'TAPE !');
    this.ctl = h('div', { class: 'controls' }, this.blBtn, this.atkBtn, this.tapBtn);
    this.root.append(this.stl, this.ctl);
    this.root.addEventListener('pointerdown', () => { const d = this.duel; if (d && d.phase === 'tap' && !this.paused) { d.n++; this.s.vibrate(12); this.s.sfx('tick'); } });
    this.cv.style.touchAction = 'none';
    this.cv.addEventListener('pointerdown', e => { this.pt = []; this.trail = []; this.tpt(e); });
    this.cv.addEventListener('pointermove', e => { if (this.pt) this.tpt(e); });
    this.cv.addEventListener('pointerup', () => this.endTrace());
    this.cv.addEventListener('pointercancel', () => { this.pt = null; });
    this.onSense('circle', () => this.launch(this.aimNow(), .8));
    this.onSense('shake', () => this.tryBlock());
    this.onSense('shield', e => { if (e.down) this.tryBlock(); });
    this.onRel('wv', m => this.incoming(m));
    this.onRel('rs', m => this.outcome(m));
    this.onRel('dl', m => { if (this.duel && this.duel.id === m.id) this.duel.opN = m.n; else this.pendDl[m.id] = m.n; });
    this.onRel('dr', m => this.duelResult(m));
    this.flow('Combat à l\'épée', how.join('\n'), [
      { key: 'aim', label: 'Visée façon pistolets : on se vise l\'un l\'autre', choices: [['non', 'Sans visée'], ['oui', 'Avec visée']], def: 'non' },
    ], c => c.aim === 'oui', () => this.beginTurn(this.isHost));
    this.loop(() => this.update());
  }
  get aimOn() { return this.cfg && this.cfg.aim === 'oui'; }
  st(t) { this.stl.textContent = t; }
  after(ms, fn) { this.q.push({ t: ms, fn }); }

  /* ---------- entrées ---------- */
  tpt(e) { const r = this.cv.getBoundingClientRect(), k = this.cv.width / r.width; const p = { x: ((e.clientX - r.left) * k - this.ox) / this.sc, y: ((e.clientY - r.top) * k - this.oy) / this.sc }; this.pt.push(p); this.trail.push({ x: p.x, y: p.y, t: performance.now() }); }
  /** Cercle au doigt : angle cumulé autour du centre du tracé. */
  endTrace() {
    const p = this.pt; this.pt = null; if (!p || p.length < 8) return;
    const cx = p.reduce((a, q) => a + q.x, 0) / p.length, cy = p.reduce((a, q) => a + q.y, 0) / p.length;
    let sum = 0, rad = 0, last = null; for (const q of p) { const a = Math.atan2(q.y - cy, q.x - cx); rad += Math.hypot(q.x - cx, q.y - cy); if (last != null) { let d = a - last; d = Math.atan2(Math.sin(d), Math.cos(d)); sum += d; } last = a; }
    rad /= p.length;
    if (Math.abs(sum) >= 4.4 && rad > 14) this.launch(this.aimOn ? cl((cy - 200) / 1.3, -40, 40) : 0, .8);
  }
  /** Direction de l'onde : avec visée, cap du téléphone par rapport à l'autre joueur (un peu avant le geste). */
  aimNow() { if (this.aimOn && this.cal && this.o.seen) return cl(wrap(this.o.at(450).yaw - this.cal.yaw), -60, 60); return 0; }

  /* ---------- tours ---------- */
  beginTurn(att) {
    if (this.over) return; this.att = att; this.ph = att ? 'turn' : 'wait'; this.wave = null; this.duel = null; this.lock = 0;
    this.st(att ? 'TON TOUR : fais un cercle avec le téléphone (ou au doigt) pour envoyer l\'onde !' : this.oppA.name + ' prépare son attaque… Sois prêt à BLOQUER.');
  }
  launch(a, power) {
    if (!this.started || this.over || this.paused || this.ph !== 'turn') return;
    const id = ++this.wid; this.wave = { id, mine: true, age: 0, a, dur: DUR, done: false }; this.ph = 'wave'; this.swing = .4;
    this.rel('wv', { id, dur: DUR, a: +a.toFixed(1) }); this.s.whoosh(700, 500, 2600); this.s.vibrate([30, 40, 60]); this.st('L\'onde part ! ' + 'Elle met moins de 2 secondes à arriver…');
  }
  /** Une onde arrive sur moi. */
  incoming(m) {
    if (this.over || this.ph === 'wave' || this.ph === 'duel') return;
    const lat = cl((this.net.latency || 0), 0, 400);
    this.wave = { id: m.id, mine: false, age: lat, a: m.a || 0, dur: m.dur || DUR, done: false, off: this.aimOn && Math.abs(m.a || 0) > AIM_TOL }; this.ph = 'wave'; this.att = false; this.oppSwing = .4; this.inWinPrev = false;
    this.s.whoosh(900, 2400, 500); this.s.vibrate(40); this.st(this.wave.off ? 'Une onde part, mais elle passe à côté de toi.' : 'ONDE ! Touche BLOQUER quand elle devient verte dans la zone.');
  }
  inWin(w) { return Math.abs(w.age - w.dur) <= HALF; }
  tryBlock() {
    const w = this.wave; if (!this.started || this.over || this.paused || this.ph !== 'wave' || !w || w.mine || w.done || this.lock > 0) return;
    if (w.off) { this.st('L\'onde passe à côté de toi, pas besoin de bloquer.'); return; }
    if (this.inWin(w)) {
      w.done = true; this.blockT = .5; this.s.sfx('block'); this.s.vibrate([40, 30, 40]); this.fxAdd(ZX + 20, 200, 'block');
      this.rel('rs', { id: w.id, r: 'block', lives: this.lives }); this.startDuel(w.id, true);
    } else { this.lock = 350; this.st(w.age < w.dur ? 'Trop tôt ! Attends que la zone devienne verte.' : 'Trop tard !'); this.s.sfx('warn'); }
  }
  resolveHit(w) {
    w.done = true;
    if (w.off) { this.rel('rs', { id: w.id, r: 'miss', lives: this.lives }); this.st('L\'onde est passée à côté ! Pas de coup.'); this.s.sfx('ok'); this.after(1500, () => this.beginTurn(true)); return; }
    this.lives--; this.takeFx(); this.rel('rs', { id: w.id, r: 'hit', lives: this.lives }); this.st('Raté, tu prends le coup ! Vies : ' + this.lives);
    this.setStat(this.lives, this.olives);
    if (this.lives <= 0) this.after(800, () => this.finish(false, this.oppA.name + ' a gagné ce combat.')); else this.after(1500, () => this.beginTurn(true));
  }
  takeFx() { this.fxAdd(WX + 10, 190, 'hit'); this.hitT = .5; this.s.sfx('hit'); this.s.vibrate(220); }
  /** Résultat envoyé par celui qui défendait. */
  outcome(m) {
    const w = this.wave; if (this.over || !w || !w.mine || w.id !== m.id || w.got) return; w.got = true; w.done = true;
    this.olives = m.lives; this.setStat(this.lives, this.olives);
    if (m.r === 'block') { this.st('BLOQUÉ ! Le duel commence !'); this.s.sfx('block'); this.fxAdd(225, 200, 'block'); this.startDuel(m.id, false); return; }
    if (m.r === 'hit') { this.oppHurt = .5; this.fxAdd(255, 190, 'hit'); this.s.sfx('ok'); this.s.vibrate(60); this.st('TOUCHÉ ! L\'onde a frappé. Vies de ' + this.oppA.name + ' : ' + this.olives); }
    else { this.st('Dans le vide… ton onde est passée à côté. Vise mieux !'); this.s.sfx('warn'); }
    if (this.olives <= 0) { this.after(800, () => this.finish(true, 'Tu as gagné ce combat !')); return; }
    this.after(1500, () => this.beginTurn(false));
  }

  /* ---------- duel ---------- */
  startDuel(id, def) {
    this.ph = 'duel'; this.duel = { id, def, n: 0, t: DUEL_MS, phase: 'tap', opN: this.pendDl[id] == null ? null : this.pendDl[id], wait: 0 };
    this.tapBtn.style.display = ''; this.blBtn.style.display = 'none'; this.atkBtn.style.display = 'none'; this.st('DUEL ! Tape le plus vite possible sur l\'écran !'); this.s.vibrate([40, 30, 40]);
  }
  duelStep(real) {
    const d = this.duel; if (!d) return;
    if (d.phase === 'tap') { d.t -= real; if (d.t <= 0) { d.t = 0; d.phase = 'wait'; d.wait = 5000; this.endTap(); if (!d.def) this.rel('dl', { id: d.id, n: d.n }); this.st('Temps ! Résultat…'); } }
    else if (d.phase === 'wait') { d.wait -= real; if (d.def && (d.opN != null || d.wait <= 0)) this.decideDuel(); else if (!d.def && d.wait <= -6000) { d.phase = 'lost'; } }
  }
  endTap() { this.tapBtn.style.display = 'none'; this.blBtn.style.display = ''; this.atkBtn.style.display = ''; }
  /** Le défenseur décide du duel (une seule autorité) et prévient l'attaquant. Égalité : le défenseur gagne. */
  decideDuel() {
    const d = this.duel; if (!d || d.phase === 'done') return; d.phase = 'done'; const na = d.opN || 0, nd = d.n, w = na > nd ? 'att' : 'def';
    if (w === 'att') { this.lives--; this.takeFx(); this.setStat(this.lives, this.olives); }
    this.rel('dr', { id: d.id, w, lives: this.lives, na, nd }); this.showDuel(w === 'def', nd, na);
    if (this.lives <= 0) { this.after(1000, () => this.finish(false, this.oppA.name + ' a gagné ce combat.')); return; }
    this.after(2000, () => this.beginTurn(true));
  }
  duelResult(m) {
    const d = this.duel; if (this.over || !d || d.id !== m.id || d.phase === 'done') return; d.phase = 'done'; this.endTap();
    this.olives = m.lives; this.setStat(this.lives, this.olives); this.showDuel(m.w === 'att', m.na, m.nd);
    if (m.w === 'def') this.oppHurt = 0; else { this.oppHurt = .5; this.fxAdd(255, 190, 'hit'); }
    if (this.olives <= 0) { this.after(1000, () => this.finish(true, 'Tu as gagné ce combat !')); return; }
    this.after(2000, () => this.beginTurn(false));
  }
  showDuel(iWin, mine, theirs) {
    this.endTap(); this.s.sfx(iWin ? 'win' : 'hit'); this.s.vibrate(iWin ? 60 : 200);
    this.st((iWin ? 'Tu gagnes le duel !' : 'Tu perds le duel !') + ' (toi ' + mine + ' – ' + this.oppA.name + ' ' + theirs + ')' + (iWin ? '' : ' Tu prends le coup.'));
  }
  fxAdd(x, y, kind) { this.fx.push({ x, y, kind, t: performance.now() }); }

  /* ---------- boucle ---------- */
  update() {
    const now = performance.now(), real = Math.min(200, now - this.lastT); this.lastT = now;
    const d = real / 1000;
    if (!this.paused) {
      this.swing = Math.max(0, this.swing - d); this.oppSwing = Math.max(0, this.oppSwing - d); this.hitT = Math.max(0, this.hitT - d); this.oppHurt = Math.max(0, this.oppHurt - d); this.blockT = Math.max(0, this.blockT - d); this.lock = Math.max(0, this.lock - real);
      for (const e of this.q) e.t -= real; const ready = this.q.filter(e => e.t <= 0); this.q = this.q.filter(e => e.t > 0); ready.forEach(e => { try { e.fn(); } catch (x) { console.error(x); } });
      const w = this.wave;
      if (w && this.ph === 'wave') {
        w.age += real;
        if (!w.mine && !w.done) {
          const iw = this.inWin(w); if (iw && !this.inWinPrev) { this.s.vibrate(25); this.s.sfx('tick'); } this.inWinPrev = iw;
          if (w.age > w.dur + HALF) this.resolveHit(w);
        }
      }
      this.duelStep(real);
    }
    const ph = this.ph; this.atkBtn.disabled = !(ph === 'turn' && this.started); this.blBtn.disabled = !(ph === 'wave' && this.wave && !this.wave.mine && !this.wave.done);
    this.draw();
  }

  /* ---------- dessin ---------- */
  drawDeck(g) {
    if (BG.ok) { const k = Math.max(360 / BG.naturalWidth, 360 / BG.naturalHeight), w = BG.naturalWidth * k, hh = BG.naturalHeight * k; g.drawImage(BG, (360 - w) / 2, (360 - hh) / 2, w, hh); g.fillStyle = '#1a0c0033'; g.fillRect(0, 0, 360, 360); }
    else { g.fillStyle = '#10142a'; g.fillRect(0, 0, 360, 360); g.fillStyle = '#1a2040'; g.fillRect(0, 300, 360, 60); }
  }
  heart(g, x, y, full) { g.globalAlpha = full ? 1 : .25; DU.sprC(g, 'i_heart', x, y, 26); g.globalAlpha = 1; }
  pose(me) {
    if (me) {
      if (this.over) return this.lives <= 0 ? 'lose' : 'win';
      if (this.hitT > 0) return 'dizzy'; if (this.swing > 0) return 'atk'; if (this.ph === 'duel') return 'guardHit'; if (this.blockT > 0) return 'guard';
      if (this.ph === 'turn') return 'prep'; return 'idle';
    }
    if (this.over) return this.olives <= 0 ? 'lose' : 'win';
    if (this.oppSwing > 0) return 'atk'; if (this.oppHurt > 0) return 'dizzy'; if (this.ph === 'duel') return 'guardHit'; if (this.ph === 'wait') return 'prep'; return 'idle';
  }
  // Un duelliste : sprite de la planche (sans épée) ancré par les pieds, + épée dans le poing (épée de la planche, pivot = la poignée).
  // Pour le joueur, l'angle de la lame suit l'inertie du téléphone (this.sAng) ; pour l'adversaire, l'épée est posée sur ses poses.
  drawDuelist(g, pose, cx, feet, flip, hue, mine, sw) {
    const P = POSES[pose] || POSES.idle, r = DR[P[0]]; if (!r) return; const sc = 1.15;
    const w = r[2] * sc, hh = r[3] * sc;
    g.save(); g.translate(cx, feet); if (flip) g.scale(-1, 1); if (hue) g.filter = 'hue-rotate(' + hue + 'deg) saturate(1.2)';
    DU.spr(g, P[0], -w / 2, -hh, w, hh);
    if (P.length > 1) {
      const real = this.s.orientSeen || this.s.motionSeen, hit = pose === 'atk' || pose === 'special' || pose === 'rip';
      const extra = 0;
      const wob = hit ? Math.sin(performance.now() / 40) * .06 : 0;
      g.save(); g.translate(-w / 2 + P[1] * sc, -hh + P[2] * sc); g.rotate(P[3] + extra + wob);
      const key = pose === 'special' ? 'sw_elec' : (sw || 'sw1'), sr = DR[key]; const L = pose === 'special' ? 96 : 84, k = L / sr[3];
      if (pose === 'special') { g.globalAlpha = .9; }
      DU.spr(g, key, -sr[2] * k / 2, -sr[3] * k * .86, sr[2] * k, sr[3] * k);
      g.restore();
    }
    g.restore();
  }

  drawFx(g) {
    const now = performance.now(); this.fx = this.fx.filter(f => now - f.t < 520);
    for (const f of this.fx) {
      const a = (now - f.t) / 520, fade = a < .7 ? 1 : 1 - (a - .7) / .3; g.globalAlpha = fade;
      if (f.kind === 'hit') DU.sprC(g, a < .5 ? 'fx_star' : 'fx_red', f.x, f.y, 110 * (1 - a * .5));
      else if (f.kind === 'block') DU.sprC(g, 'fx_clash', f.x, f.y, 110 * (1 - a * .3));
      g.globalAlpha = 1;
    }
  }
  /** Zone de blocage : bleue en attente, verte et pulsante quand l'onde la traverse. cx = centre de la zone sur CET écran. */
  drawZone(g, cx, mine, w) {
    const on = w && !w.off && Math.abs(w.age - w.dur) <= HALF, pu = .5 + Math.sin(performance.now() / 70) * .2;
    g.save(); g.fillStyle = on ? 'rgba(60,230,120,' + (.3 + pu * .3) + ')' : 'rgba(90,170,255,.16)'; g.strokeStyle = on ? '#4dff8a' : 'rgba(150,210,255,.7)'; g.lineWidth = on ? 4 : 2; g.setLineDash(on ? [] : [8, 6]);
    g.beginPath(); g.roundRect(cx - 32, 110, 64, 215, 18); g.fill(); g.stroke(); g.setLineDash([]); g.restore();
    DU.sprC(g, 'i_shield', cx, 128, 30);
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(mine ? 'Ta zone' : 'Sa zone', cx, 104); g.shadowBlur = 0;
  }
  /** L'onde : croissants d'énergie qui avancent à vitesse fixe. mine = tirée par moi (vers la droite) ; sinon elle arrive de la droite vers ma zone. */
  drawWave(g) {
    const w = this.wave; if (!w || this.ph !== 'wave') return;
    const p = w.age / w.dur; if (p < 0 || p > 1.35) return;
    const dir = w.mine ? 1 : -1, x = w.mine ? 125 + p * 100 : 235 - p * 100;
    const y = 205 + cl(w.a, -60, 60) * 1.3, fade = p > 1 ? Math.max(0, 1 - (p - 1) / .35) : 1, sz = 40 + p * 14;
    g.save(); g.translate(x, y); g.scale(dir, 1); g.globalAlpha = fade;
    for (let i = 3; i >= 0; i--) { g.globalAlpha = fade * (i === 0 ? 1 : .55 / i); g.strokeStyle = i === 0 ? '#e9fbff' : '#59c8ff'; g.lineWidth = i === 0 ? 8 : 5; g.shadowColor = '#59c8ff'; g.shadowBlur = 16; g.beginPath(); g.arc(-i * 20, 0, sz, -1.05, 1.05); g.stroke(); }
    g.restore(); g.shadowBlur = 0; g.globalAlpha = fade; DU.sprC(g, 'fx_star', x + dir * sz * .45, y, 38); g.globalAlpha = 1;
  }
  draw() {
    if (!this.cv.width) return; this.begin(); const g = this.g;
    if (!DU.ready()) { g.fillStyle = '#10142a'; g.fillRect(0, 0, 360, 360); this.endDraw(); return; }
    this.drawDeck(g);
    this.drawDuelist(g, this.pose(true), 100, 330, false, 0, true, 'sw1'); this.drawDuelist(g, this.pose(false), 260, 330, true, 150, false, 'sw1');
    const w = this.wave, live = this.ph === 'wave' && w;
    if (this.ph !== 'idle' && this.ph !== 'duel') { this.drawZone(g, ZX, true, live && !w.mine ? w : null); this.drawZone(g, 360 - ZX, false, live && w.mine ? w : null); }
    this.drawWave(g); this.drawFx(g);
    for (let i = 0; i < LIVES; i++) { this.heart(g, 24 + i * 28, 24, i < this.lives); this.heart(g, 336 - i * 28, 24, i < this.olives); }
    g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'left'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText('Toi', 80, 352); g.textAlign = 'right'; g.fillText(this.oppA.name, 340, 352); g.shadowBlur = 0;
    const now = performance.now(); this.trail = this.trail.filter(p => now - p.t < 900);
    if (this.trail.length > 1) { g.strokeStyle = 'rgba(190,235,255,.9)'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); this.trail.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
    if (this.ph === 'turn' && !this.trail.length) { g.globalAlpha = .55 + Math.sin(now / 200) * .25; g.strokeStyle = '#bfeaff'; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.arc(180, 200, 46, 0, 6.28); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
    const wave = w && this.ph === 'wave' && !w.mine && !w.done && !w.off && Math.abs(w.age - w.dur) <= HALF;
    if (wave) { g.fillStyle = '#4dff8a'; g.strokeStyle = '#000'; g.lineWidth = 5; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.strokeText('BLOQUE MAINTENANT !', 180, 70); g.fillText('BLOQUE MAINTENANT !', 180, 70); }
    const d = this.duel;
    if (this.ph === 'duel' && d && d.phase !== 'done') {
      g.fillStyle = '#0008'; g.fillRect(0, 60, 360, 200); DU.sprC(g, 'fx_clash', 180, 150, 150 + Math.sin(now / 50) * 12);
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 5; g.textAlign = 'center'; g.font = 'bold 28px sans-serif'; g.strokeText('DUEL !', 180, 96); g.fillText('DUEL !', 180, 96);
      g.font = 'bold 56px sans-serif'; g.strokeText(String(d.n), 180, 235); g.fillStyle = '#ffd24d'; g.fillText(String(d.n), 180, 235);
      g.fillStyle = '#0009'; g.fillRect(40, 248, 280, 10); g.fillStyle = '#4dff8a'; g.fillRect(40, 248, 280 * d.t / DUEL_MS, 10);
      g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText(d.phase === 'tap' ? 'Tes coups : ' + (d.t / 1000).toFixed(1) + ' s' : 'Résultat…', 180, 278);
    }
    this.endDraw();
  }
}
export default { id: 'epee', name: 'Combat à l\'épée', short: 'Fais un cercle avec ton téléphone pour envoyer une onde, bloque l\'onde de l\'autre au bon moment.', how, create: ctx => new Epee(ctx) };
