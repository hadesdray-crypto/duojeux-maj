// Course de billes : un long parcours en bois vu en perspective qui défile. Incline en avant pour rouler, de côté pour diriger.
// Les montées te ralentissent, les descentes t'accélèrent, les virages te poussent vers l'extérieur. Sortir de la piste = tu réapparais
// au même endroit après une pause. Chacun a son propre parcours (même longueur, même difficulté) ; tu vois l'avancement de l'autre.
import { Duo, rng } from '../core/kit.js';
import { h, clamp } from '../core/util.js';
import { sprC, ready } from '../core/sprites.js';
import { winBadge } from '../core/winfx.js';
import { keepCal, calibPhase, gameMenu, rulesList } from '../core/calib.js';

const STEP = 4, W = 360, H = 520, HY = 196, F = 300, HC = 5.6, CB = 7, EV = 2.2, ZNEAR = 4.7, SEGZ = 3, NS = 90, TAIL = 140;
const smooth = (a, n) => { const o = a.slice(); for (let i = 0; i < a.length; i++) { let t = 0, c = 0; for (let j = -n; j <= n; j++) { const q = a[i + j]; if (q != null) { t += q; c++; } } o[i] = t / c; } return o; };

/** Parcours : mêmes morceaux pour tous (donc même longueur et même difficulté), mais dans un ordre et avec des sens tirés au sort. */
export function makeTrack(seed) {
  const r = rng(seed), sg = () => (r() < .5 ? -1 : 1), tp = [];
  const kinds = ['curve', 'curve', 'curve', 'chicane', 'chicane', 'bump', 'bump', 'dip', 'hillcurve', 'long'];
  for (let i = kinds.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const keys = [{ len: 60, k: 0, g: 0 }];
  for (const t of kinds) {
    const s1 = sg(), m = .8 + r() * .5;
    if (t === 'curve') keys.push({ len: 90, k: s1 * m / 62, g: 0 }, { len: 30, k: 0, g: 0 });
    else if (t === 'chicane') keys.push({ len: 55, k: s1 * m / 48, g: 0 }, { len: 55, k: -s1 * m / 48, g: 0 }, { len: 20, k: 0, g: 0 });
    else if (t === 'bump') keys.push({ len: 60, k: 0, g: .09 }, { len: 60, k: 0, g: -.09 }, { len: 20, k: 0, g: 0 });
    else if (t === 'dip') keys.push({ len: 60, k: 0, g: -.09 }, { len: 60, k: 0, g: .09 }, { len: 20, k: 0, g: 0 });
    else if (t === 'hillcurve') keys.push({ len: 90, k: s1 * m / 70, g: .07 }, { len: 70, k: -s1 * m / 70, g: -.07 }, { len: 20, k: 0, g: 0 });
    else keys.push({ len: 130, k: 0, g: .06 }, { len: 60, k: 0, g: 0 }, { len: 110, k: s1 / 80, g: -.07 });
  }
  keys.push({ len: 80, k: 0, g: 0 });
  const L = keys.reduce((a, q) => a + q.len, 0), n = Math.ceil((L + TAIL) / STEP) + 8; let kap = [], slo = []; let acc = 0, ki = 0;
  for (let i = 0; i < n; i++) { const s = i * STEP; while (ki < keys.length - 1 && s >= acc + keys[ki].len) { acc += keys[ki].len; ki++; } const q = s < L ? keys[ki] : { k: 0, g: 0 }; kap.push(q.k * (1 + .5 * Math.min(1, s / L))); slo.push(q.g); }
  kap = smooth(smooth(kap, 4), 3); slo = smooth(smooth(slo, 4), 3);
  const el = [0]; for (let i = 1; i < n; i++) el.push(el[i - 1] + slo[i - 1] * STEP);
  const at = (a, s) => { const x = clamp(s / STEP, 0, a.length - 1.001), i = x | 0; return a[i] + (a[i + 1] - a[i]) * (x - i); };
  return { L, kap: s => at(kap, s), slo: s => at(slo, s), el: s => at(el, s), half: s => 3.6 - 1.3 * clamp(s / L, 0, 1) };
}
/** Un pas de physique (m, m/s). tx = inclinaison de côté (-1..1), ty = inclinaison avant/arrière (négatif = en avant). */
export function stepBall(T, b, tx, ty, dt) {
  const k = T.kap(b.s), gr = T.slo(b.s);
  const a = -ty * 7.5 - 30 * gr - .10 * b.v - .0016 * b.v * Math.abs(b.v);
  b.v = clamp(b.v + a * dt, -10, 40); if (Math.abs(b.v) < .15 && Math.abs(a) < .6) b.v = 0;
  b.s = Math.max(0, b.s + b.v * dt);
  const au = tx * 11 - k * b.v * b.v * .55 - 1.3 * b.uv;
  b.uv += au * dt; b.u += b.uv * dt;
}

class Billes extends Duo {
  constructor(ctx) {
    super(ctx); keepCal(this);
    this.started = false; this.falls = 0; this.man = { x: 0, y: 0 }; this.opp = { p: 0, v: 0, f: 0 }; this.T = makeTrack(1); this.L = this.T.L; this.t = 0; this.b = { s: 0, v: 0, u: 0, uv: 0 }; this.fall = 0; this.fallAt = 0; this.sendT = 0; this.rot = 0;
    this.hud(h('span', {}, 'Vitesse 0'), h('span', {}, 'Plat'), h('span', {}, 'Chutes 0'));
    this.hudEl.style.fontSize = '.92em'; this.hudEl.style.whiteSpace = 'nowrap'; this.makeCanvas(W, H);
    const pad = (l, dx, dy) => h('button', { class: 'btn sec', style: 'touch-action:none', onpointerdown: e => { e.preventDefault(); this.man = { x: dx, y: dy }; }, onpointerup: () => { this.man = { x: 0, y: 0 }; }, onpointerleave: () => { this.man = { x: 0, y: 0 }; }, onpointercancel: () => { this.man = { x: 0, y: 0 }; } }, l);
    this.pads = h('div', { class: 'controls' }, pad('Gauche', -1, 0), pad('Freiner', 0, 1), pad('Avancer', 0, -1), pad('Droite', 1, 0)); this.root.append(this.pads);
    this.onNet('bp', m => { this.opp = { p: m.p, v: m.v, f: m.f || 0 }; });
    this.onNet('win', () => { if (!this.over) this.finish(false, this.oppA.name + ' est arrivé avant toi.'); });
    this.gate('Course de billes', 'Les règles :', seed => this.prep(seed));
    rulesList(this, ['Incline le téléphone en avant pour rouler, en arrière pour freiner, de côté pour diriger.', 'Les montées te ralentissent, les descentes t\'accélèrent. Dans un virage, la bille file vers l\'extérieur : incline vers l\'intérieur.', 'Sors de la piste et tu réapparais au même endroit, mais tu perds du temps.', 'Chacun a son propre parcours ; tu vois l\'avancement de l\'autre en haut. Premier à l\'arrivée gagne.']);
    gameMenu(this);
    this.loop(dt => this.update(dt));
  }
  prep(seed) {
    this.T = makeTrack((seed ^ (this.isHost ? 0x1234567 : 0x7654321)) >>> 0); this.L = this.T.L;
    calibPhase(this, { title: 'Calibration', text: 'Pose ton téléphone à plat (ou tenu comme pour jouer) et ne bouge plus, puis appuie sur Prêt.\nQuand les deux joueurs sont prêts, un décompte 3-2-1 lance la course.', go: () => { this.started = true; this.t = 0; this.b = { s: 0, v: 0, u: 0, uv: 0 }; this.say('Roule !'); } });
  }
  update(dt) {
    this.pads.style.display = this.s.orientSeen ? 'none' : '';
    if (!this.started || this.over) { this.draw(); return; }
    const s = this.s, b = this.b, T = this.T; this.t += dt;
    if (this.fall > 0) {
      this.fall -= dt; b.u += b.uv * dt; b.v = 0;
      if (this.fall <= 0) { b.u = 0; b.uv = 0; b.v = 0; }
    } else {
      const tx = (s.orientSeen ? s.tilt : 0) + this.man.x, ty = (s.orientSeen ? s.tiltY : 0) + this.man.y;
      const n = 2; for (let i = 0; i < n; i++) stepBall(T, b, clamp(tx, -1.3, 1.3), clamp(ty, -1.3, 1.3), dt / n);
      this.rot += b.v * dt / .55;
      if (Math.abs(b.u) > T.half(b.s) + .3) { this.falls++; this.fall = 2; this.fallAt = this.t; b.uv = Math.sign(b.u) * Math.max(2, Math.abs(b.uv)); this.s.sfx('hit'); this.s.vibrate(150); this.hudEl.children[2].textContent = 'Chutes ' + this.falls; }
    }
    const gr = T.slo(b.s); this.hudEl.children[0].textContent = 'Vitesse ' + Math.round(Math.max(0, b.v) * 2); this.hudEl.children[1].textContent = gr > .025 ? 'Montée' : gr < -.025 ? 'Descente' : 'Plat';
    { const a = Math.round(clamp(b.s / this.L, 0, 1) * 100) + ' %', o = Math.round(clamp(this.opp.p, 0, 1) * 100) + ' %'; if (a !== this._a || o !== this._o) { this._a = a; this._o = o; this.setStat(a, o); } }
    this.sendT += dt; if (this.sendT > .2) { this.sendT = 0; this.net.send('bp', { p: +(b.s / this.L).toFixed(4), v: Math.round(Math.max(0, b.v) * 2), f: this.falls }); }
    if (b.s >= this.L) { this.net.send('bp', { p: 1, v: 0, f: this.falls }); this.net.send('win'); this.finish(true, 'Temps : ' + this.t.toFixed(1).replace('.', ',') + ' s, chutes : ' + this.falls); return; }
    this.draw();
  }
  draw() {
    if (!this.cv.width) return; this.begin(); const g = this.g, art = ready(), T = this.T, b = this.b;
    // fond : table en bois qui s'assombrit vers l'horizon
    const bg = g.createLinearGradient(0, 0, 0, HY); bg.addColorStop(0, '#120c06'); bg.addColorStop(1, '#4a3520'); g.fillStyle = bg; g.fillRect(0, 0, W, HY + 1);
    const gb = g.createLinearGradient(0, HY, 0, H); gb.addColorStop(0, '#3a2816'); gb.addColorStop(1, '#2d2012'); g.fillStyle = gb; g.fillRect(0, HY, W, H - HY);
    if (!this.phase) { this.stripe(g); this.endDraw(); return; }
    const sc = b.s - CB, Ec = T.el(b.s), camX = b.u * .8, P = [];
    let X = 0, th = 0;
    for (let k = 0; k <= NS; k++) {
      const z = Math.max(.01, k * SEGZ), s = sc + z; if (k > 0) { th += T.kap(s - SEGZ / 2) * SEGZ * .6; X += th * SEGZ; }
      if (z < ZNEAR - SEGZ) { P.push(null); continue; }
      const zz = Math.max(z, ZNEAR), sc2 = F / zz, y = HY + (HC - (T.el(Math.max(0, s)) - Ec) * EV) * sc2, hw = T.half(Math.max(0, s));
      P.push({ s, z: zz, y, cx: W / 2 + (X - camX) * sc2, hw: hw * sc2, sc2, gr: T.slo(Math.max(0, s)), half: hw });
    }
    let maxy = H + 5;
    for (let k = NS - 1; k >= 0; k--) {
      const a = P[k], c = P[k + 1]; if (!a || !c) continue; // a = proche, c = loin
      if (a.y <= c.y - .5 || c.y > H) continue;
      const par = Math.floor(Math.max(0, a.s) / 6) % 2, shade = clamp(1 - a.gr * 3, .7, 1.25), fog = clamp(a.z / 330, 0, 1);
      const col = (r, gg, bb) => `rgb(${Math.round(r * shade * (1 - fog * .55))},${Math.round(gg * shade * (1 - fog * .55))},${Math.round(bb * shade * (1 - fog * .55))})`;
      g.fillStyle = par ? col(52, 36, 20) : col(44, 30, 16); g.fillRect(0, c.y, W, a.y - c.y + 1);
      const quad = (x1, x2, x3, x4, f) => { g.fillStyle = f; g.beginPath(); g.moveTo(x1, a.y + .6); g.lineTo(x2, a.y + .6); g.lineTo(x3, c.y); g.lineTo(x4, c.y); g.closePath(); g.fill(); };
      const e1 = a.hw * 1.12, e2 = c.hw * 1.12;
      quad(a.cx - e1, a.cx + e1, c.cx + e2, c.cx - e2, col(217, 179, 106));
      quad(a.cx - a.hw, a.cx + a.hw, c.cx + c.hw, c.cx - c.hw, par ? col(154, 114, 64) : col(138, 99, 53));
      if (a.s >= this.L - 1 && a.s < this.L + 5) quad(a.cx - a.hw, a.cx + a.hw, c.cx + c.hw, c.cx - c.hw, Math.floor(a.s) % 2 ? '#f4f4f4' : '#1b1f33');
      if (Math.abs(a.gr) > .035 && k % 5 === 0 && a.s < this.L - 6) { // chevrons : montée (pointe en haut) ou descente (pointe en bas)
        const w2 = a.hw * .45, d = Math.max(3, (a.y - c.y) * 1.6), up = a.gr > 0; g.strokeStyle = '#f5d58acc'; g.lineWidth = Math.max(1, a.sc2 * .22); g.beginPath();
        g.moveTo(a.cx - w2, up ? a.y - 1 : a.y - d); g.lineTo(a.cx, up ? a.y - d : a.y - 1); g.lineTo(a.cx + w2, up ? a.y - 1 : a.y - d); g.stroke();
      }
    }
    // voile de brume à l'horizon
    const fg = g.createLinearGradient(0, HY - 6, 0, HY + 70); fg.addColorStop(0, '#4a3520'); fg.addColorStop(1, '#4a352000'); g.fillStyle = fg; g.fillRect(0, HY - 6, W, 76);
    // ligne d'arrivée : portique
    const fa = P.find(q => q && q.s >= this.L);
    if (fa && fa.y > HY + 2) { const pw = fa.hw * 1.25, ph = 60 * fa.sc2 / 10 * 2; g.fillStyle = '#8b6a3a'; g.fillRect(fa.cx - pw - 3, fa.y - ph, 5, ph); g.fillRect(fa.cx + pw - 2, fa.y - ph, 5, ph); g.fillStyle = '#2fbf71'; g.fillRect(fa.cx - pw, fa.y - ph, pw * 2, Math.max(6, ph * .28)); g.fillStyle = '#06241c'; g.font = 'bold ' + Math.max(7, Math.round(ph * .22)) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('ARRIVÉE', fa.cx, fa.y - ph + Math.max(5, ph * .22)); }
    // bille : ombre, puis bille qui roule
    const sb = F / CB, xb = W / 2 + (b.u - camX) * sb, yb = HY + HC * sb, R = .55 * sb, fl = this.fall > 0 ? clamp((2 - this.fall) / 1.2, 0, 1) : 0;
    g.fillStyle = '#0007'; g.beginPath(); g.ellipse(xb + 4, yb + 2, R * 1.05 * (1 - fl * .6), R * .38 * (1 - fl * .6), 0, 0, 7); g.fill();
    const by = yb - R + fl * R * 1.4, br = R * (1 - fl * .55);
    if (art) { g.save(); g.translate(xb, by); g.rotate(this.rot); sprC(g, 'n_mar2', 0, 0, br * 2.1); g.restore(); } else { g.fillStyle = '#27e0b3'; g.beginPath(); g.arc(xb, by, br, 0, 7); g.fill(); g.fillStyle = '#ffffff88'; g.beginPath(); g.arc(xb - br * .3, by - br * .35, br * .3, 0, 7); g.fill(); }
    if (b.v > 20) { g.strokeStyle = '#ffffff' + Math.round(clamp((b.v - 20) / 40, 0, .5) * 255).toString(16).padStart(2, '0'); g.lineWidth = 1.5; const tt = performance.now() / 90; for (let i = 0; i < 8; i++) { const a = i * .8 + 1, f = ((tt + i * 3) % 10) / 10, x0 = W / 2 + Math.cos(a) * (60 + f * 200), y0 = HY + 40 + Math.abs(Math.sin(a)) * (30 + f * 150); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * 14 * f, y0 + Math.abs(Math.sin(a)) * 14 * f); g.stroke(); } }
    if (this.fall > 0) { g.fillStyle = '#ff5470'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('Tombé ! Pause : ' + this.fall.toFixed(1).replace('.', ',') + ' s', W / 2, 118); g.font = '14px sans-serif'; g.fillStyle = '#fff'; g.fillText('Tu repars au même endroit', W / 2, 140); }
    this.stripe(g); this.endDraw();
  }
  /** Bandeau du haut : avancement de chacun (niveau parcouru et vitesse) ; le parcours de l'autre reste secret. */
  stripe(g) {
    g.fillStyle = '#000b'; g.fillRect(0, 0, W, 66); const x0 = 26, x1 = W - 26, y = 24, me = clamp(this.b.s / this.L, 0, 1), op = clamp(this.opp.p, 0, 1);
    g.fillStyle = '#ffffff22'; g.fillRect(x0, y - 3, x1 - x0, 6); g.fillStyle = '#2fbf71'; g.fillRect(x0, y - 3, (x1 - x0) * me, 6);
    g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('DÉPART', x0, 8); g.fillText('ARRIVÉE', x1, 8);
    const ball = (p, id, c, up) => { const x = x0 + (x1 - x0) * p; if (ready()) sprC(g, id, x, y, 20); else { g.fillStyle = c; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); } };
    ball(op, 'n_mar0', '#ff7a90'); ball(me, 'n_mar2', '#27e0b3');
    g.font = 'bold 12px sans-serif'; g.textAlign = 'left'; g.fillStyle = '#27e0b3'; g.fillText('Toi : ' + Math.round(me * 100) + ' %', 10, 52);
    g.textAlign = 'right'; g.fillStyle = '#ff7a90'; g.fillText(this.oppA.name + ' : ' + Math.round(op * 100) + ' %, vitesse ' + this.opp.v + ', chutes ' + this.opp.f, W - 10, 52);
  }
  finish(win, d) { super.finish(win, d); winBadge(this, win, win ? null : 'n_mar0'); }
}
export default { id: 'billes', name: 'Course de billes', short: 'Long parcours en bois : montées, descentes, virages.', how: ['Pose ton téléphone à plat, appuie sur Prêt : calibration, puis décompte 3-2-1 quand vous êtes prêts tous les deux.', 'Incline en avant pour rouler, en arrière pour freiner, de côté pour diriger. Pas de capteur ? Utilise les 4 boutons.', 'Les montées ralentissent, les descentes accélèrent, les virages poussent la bille vers l\'extérieur.', 'Si tu sors de la piste, tu repars au même endroit après une pause.', 'Chacun a son parcours ; en haut tu vois l\'avancement de l\'autre. Le premier à l\'arrivée gagne.'], create: ctx => new Billes(ctx) };
