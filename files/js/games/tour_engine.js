// Moteur physique 2D de « Tour à abattre » : rectangles et boules rigides, gravité, collisions, frottement, rupture selon le matériau.
// Aucun écran ici : le jeu (tour.js) et les tests le font tourner sans affichage. Unités : mètres, secondes, y vers le haut, sol en y = 0.
// Principe : impulsions séquentielles avec mémoire du pas précédent (comme « Box2D Lite »), pas fixe de 1/120 s, mise en veille des corps au repos.
// Le moteur est déterministe : mêmes entrées, mêmes résultats (l'hôte simule et envoie les positions, l'autre téléphone affiche).

export const DT = 1 / 120, ITER = 10, GRAV = -9.8;
export const WORLD_W = 16, SLING_Y = 2.1, SLING_X = [1.5, 14.5], DMAX = 1.8;

/** Matériaux : d densité, f frottement, e rebond, hp résistance (en « impulsion de choc » absorbable), nom pour l'affichage. */
export const MAT = {
  bois: { name: 'Bois', d: 1.0, f: 0.6, e: 0.05, hp: 30 },
  pierre: { name: 'Pierre', d: 3.0, f: 0.75, e: 0.02, hp: 90 },
  verre: { name: 'Verre', d: 1.4, f: 0.35, e: 0.05, hp: 6 },
  glace: { name: 'Glace', d: 1.2, f: 0.15, e: 0.05, hp: 16 },
  sol: { name: 'Sol', d: 0, f: 0.7, e: 0, hp: 1e9 },
};
/** Projectiles : r rayon, d densité, e rebond, k vitesse (m/s) par mètre d'étirement, dm force des dégâts. */
export const AMMO = {
  boulet: { name: 'Boulet lourd', r: 0.34, d: 3.6, e: 0.1, f: 0.5, k: 6.4, dm: 1.0, info: 'Très lourd : écrase tout ce qu\'il touche.' },
  rebond: { name: 'Balle rebondissante', r: 0.27, d: 1.5, e: 0.85, f: 0.4, k: 7.2, dm: 0.7, bounces: 6, info: 'Rebondit sur les pièces et sur le sol.' },
  bombe: { name: 'Bombe', r: 0.3, d: 2.2, e: 0.1, f: 0.5, k: 6.6, dm: 0.5, explode: true, info: 'Explose au premier choc et souffle ce qui est autour.' },
  fleche: { name: 'Harpon perforant', r: 0.13, d: 7, e: 0.05, f: 0.2, k: 9.4, dm: 1.5, pierce: 2, info: 'Traverse le bois, le verre et la glace qui cassent.' },
  caillou: { name: 'Caillou rapide', r: 0.17, d: 2.0, e: 0.2, f: 0.4, k: 10.5, dm: 1.0, info: 'Léger mais très rapide.' },
};
export const AMMO_KEYS = Object.keys(AMMO);

const IMPACT_V = 0.7, IMPACT_MIN = 0.9, BIAS = 0.2, SLOP = 0.01;

let NID = 1;
export function box(mat, x, y, w, h, a = 0, extra = {}) {
  const M = MAT[mat], m = extra.static ? 0 : M.d * w * h;
  return { id: NID++, k: 'box', mat, x, y, a, vx: 0, vy: 0, w: 0, hw: w / 2, hh: h / 2, m, im: m ? 1 / m : 0, i: m ? m * (w * w + h * h) / 12 : 0, ii: m ? 12 / (m * (w * w + h * h)) : 0,
    f: M.f, e: M.e, hp: M.hp * Math.sqrt(w * h) * (extra.hpk || 1), dmg: 0, st: !!extra.static, sleep: false, still: 0, c: 1, s: 0, ...extra };
}
export function ball(type, x, y, vx, vy, owner) {
  const T = AMMO[type], m = T.d * Math.PI * T.r * T.r;
  return { id: NID++, k: 'ball', type, x, y, a: 0, vx, vy, w: 0, r: T.r, hw: T.r, hh: T.r, m, im: 1 / m, i: 0.5 * m * T.r * T.r, ii: 1 / (0.5 * m * T.r * T.r), f: T.f, e: T.e, hp: 1e9, dmg: 0, st: false, sleep: false, still: 0, c: 1, s: 0,
    proj: true, owner, age: 0, bounces: T.bounces || 0, pierce: T.pierce || 0, hits: 0 };
}

/* ---------- Collisions ---------- */
const E1 = 1, E2 = 2, E3 = 3, E4 = 4;
const pack = (i1, o1, i2, o2) => i1 | (o1 << 3) | (i2 << 6) | (o2 << 9);
const flip = fp => { const i1 = fp & 7, o1 = (fp >> 3) & 7, i2 = (fp >> 6) & 7, o2 = (fp >> 9) & 7; return pack(i2, o2, i1, o1); };

function clipSeg(out, vin, nx, ny, off, edge) {
  let n = 0; const d0 = nx * vin[0].x + ny * vin[0].y - off, d1 = nx * vin[1].x + ny * vin[1].y - off;
  if (d0 <= 0) out[n++] = vin[0]; if (d1 <= 0) out[n++] = vin[1];
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1); const v = { x: vin[0].x + t * (vin[1].x - vin[0].x), y: vin[0].y + t * (vin[1].y - vin[0].y), fp: 0 };
    if (d0 > 0) { const f = vin[0].fp; v.fp = (f & ~7 & ~(7 << 6)) | edge; } else { const f = vin[1].fp; v.fp = (f & ~(7 << 3) & ~(7 << 9)) | (edge << 3); }
    out[n++] = v;
  }
  return n;
}
function incident(hx, hy, px, py, c, s, nx, ny) {
  // normale de la boîte de référence passée dans le repère de la boîte incidente, signe inversé
  let lx = -(c * nx + s * ny), ly = -(-s * nx + c * ny); const ax = Math.abs(lx), ay = Math.abs(ly); let v0, v1;
  if (ax > ay) {
    if (lx > 0) { v0 = { x: hx, y: -hy, fp: pack(E3, 0, E4, 0) }; v1 = { x: hx, y: hy, fp: pack(E4, 0, E1, 0) }; v0.fp = pack(E3, 0, 0, E4); v1.fp = pack(E4, 0, 0, E1); }
    else { v0 = { x: -hx, y: hy, fp: pack(E1, 0, 0, E2) }; v1 = { x: -hx, y: -hy, fp: pack(E2, 0, 0, E3) }; }
  } else if (ly > 0) { v0 = { x: hx, y: hy, fp: pack(E4, 0, 0, E1) }; v1 = { x: -hx, y: hy, fp: pack(E1, 0, 0, E2) }; }
  else { v0 = { x: -hx, y: -hy, fp: pack(E2, 0, 0, E3) }; v1 = { x: hx, y: -hy, fp: pack(E3, 0, 0, E4) }; }
  return [{ x: px + c * v0.x - s * v0.y, y: py + s * v0.x + c * v0.y, fp: v0.fp }, { x: px + c * v1.x - s * v1.y, y: py + s * v1.x + c * v1.y, fp: v1.fp }];
}
/** Contacts entre deux rectangles. Normale de A vers B. */
function boxBox(A, B, out) {
  const hAx = A.hw, hAy = A.hh, hBx = B.hw, hBy = B.hh, ca = A.c, sa = A.s, cb = B.c, sb = B.s;
  const dx = B.x - A.x, dy = B.y - A.y;
  const dAx = ca * dx + sa * dy, dAy = -sa * dx + ca * dy, dBx = cb * dx + sb * dy, dBy = -sb * dx + cb * dy;
  const cd = ca * cb + sa * sb, sd = ca * sb - sa * cb, a11 = Math.abs(cd), a12 = Math.abs(sd);
  const fAx = Math.abs(dAx) - hAx - (a11 * hBx + a12 * hBy), fAy = Math.abs(dAy) - hAy - (a12 * hBx + a11 * hBy);
  if (fAx > 0 || fAy > 0) return 0;
  const fBx = Math.abs(dBx) - (a11 * hAx + a12 * hAy) - hBx, fBy = Math.abs(dBy) - (a12 * hAx + a11 * hAy) - hBy;
  if (fBx > 0 || fBy > 0) return 0;
  let axis = 0, sep = fAx, nx = dAx > 0 ? ca : -ca, ny = dAx > 0 ? sa : -sa; const REL = 0.95, ABS = 0.01;
  if (fAy > REL * sep + ABS * hAy) { axis = 1; sep = fAy; nx = dAy > 0 ? -sa : sa; ny = dAy > 0 ? ca : -ca; }
  if (fBx > REL * sep + ABS * hBx) { axis = 2; sep = fBx; nx = dBx > 0 ? cb : -cb; ny = dBx > 0 ? sb : -sb; }
  if (fBy > REL * sep + ABS * hBy) { axis = 3; sep = fBy; nx = dBy > 0 ? -sb : sb; ny = dBy > 0 ? cb : -cb; }
  let fnx, fny, front, sdx, sdy, negSide, posSide, negEdge, posEdge, inc;
  if (axis === 0) { fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAx; sdx = -sa; sdy = ca; const sd0 = A.x * sdx + A.y * sdy; negSide = -sd0 + hAy; posSide = sd0 + hAy; negEdge = E3; posEdge = E1; inc = incident(hBx, hBy, B.x, B.y, cb, sb, fnx, fny); }
  else if (axis === 1) { fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAy; sdx = ca; sdy = sa; const sd0 = A.x * sdx + A.y * sdy; negSide = -sd0 + hAx; posSide = sd0 + hAx; negEdge = E2; posEdge = E4; inc = incident(hBx, hBy, B.x, B.y, cb, sb, fnx, fny); }
  else if (axis === 2) { fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBx; sdx = -sb; sdy = cb; const sd0 = B.x * sdx + B.y * sdy; negSide = -sd0 + hBy; posSide = sd0 + hBy; negEdge = E3; posEdge = E1; inc = incident(hAx, hAy, A.x, A.y, ca, sa, fnx, fny); }
  else { fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBy; sdx = cb; sdy = sb; const sd0 = B.x * sdx + B.y * sdy; negSide = -sd0 + hBx; posSide = sd0 + hBx; negEdge = E2; posEdge = E4; inc = incident(hAx, hAy, A.x, A.y, ca, sa, fnx, fny); }
  const p1 = [null, null, null], p2 = [null, null, null];
  if (clipSeg(p1, inc, -sdx, -sdy, negSide, negEdge) < 2) return 0;
  if (clipSeg(p2, p1, sdx, sdy, posSide, posEdge) < 2) return 0;
  let n = 0;
  for (let i = 0; i < 2; i++) {
    const sp = fnx * p2[i].x + fny * p2[i].y - front;
    if (sp <= 0) { out.push({ x: p2[i].x - sp * fnx, y: p2[i].y - sp * fny, nx, ny, sep: sp, fp: axis >= 2 ? flip(p2[i].fp) : p2[i].fp, Pn: 0, Pt: 0 }); n++; }
  }
  return n;
}
/** Boule contre rectangle : renvoie la normale de la boule vers le rectangle si A est la boule. */
function ballBox(Bl, Bx, ballIsA, out) {
  const dx = Bl.x - Bx.x, dy = Bl.y - Bx.y; const lx = Bx.c * dx + Bx.s * dy, ly = -Bx.s * dx + Bx.c * dy;
  const qx = Math.max(-Bx.hw, Math.min(Bx.hw, lx)), qy = Math.max(-Bx.hh, Math.min(Bx.hh, ly));
  let ex = lx - qx, ey = ly - qy, dist = Math.hypot(ex, ey), nlx, nly, sep, px, py;
  if (dist > 1e-7) { if (dist > Bl.r) return 0; nlx = ex / dist; nly = ey / dist; sep = dist - Bl.r; px = qx; py = qy; }
  else { // centre dans le rectangle : sortir par la face la plus proche
    const gx = Bx.hw - Math.abs(lx), gy = Bx.hh - Math.abs(ly);
    if (gx < gy) { nlx = lx >= 0 ? 1 : -1; nly = 0; px = nlx * Bx.hw; py = ly; sep = -gx - Bl.r; } else { nlx = 0; nly = ly >= 0 ? 1 : -1; px = lx; py = nly * Bx.hh; sep = -gy - Bl.r; }
  }
  const wx = Bx.c * nlx - Bx.s * nly, wy = Bx.s * nlx + Bx.c * nly; // normale du rectangle vers la boule
  const cx = Bx.x + Bx.c * px - Bx.s * py, cy = Bx.y + Bx.s * px + Bx.c * py;
  out.push({ x: cx, y: cy, nx: ballIsA ? -wx : wx, ny: ballIsA ? -wy : wy, sep, fp: 0, Pn: 0, Pt: 0 }); return 1;
}
function ballBall(A, B, out) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), rr = A.r + B.r; if (d > rr) return 0;
  const nx = d > 1e-7 ? dx / d : 1, ny = d > 1e-7 ? dy / d : 0;
  out.push({ x: A.x + nx * (A.r + (d - rr) / 2), y: A.y + ny * (A.r + (d - rr) / 2), nx, ny, sep: d - rr, fp: 0, Pn: 0, Pt: 0 }); return 1;
}
function collide(A, B, out) {
  if (A.k === 'box' && B.k === 'box') return boxBox(A, B, out);
  if (A.k === 'ball' && B.k === 'box') return ballBox(A, B, true, out);
  if (A.k === 'box' && B.k === 'ball') return ballBox(B, A, false, out);
  return ballBall(A, B, out);
}

/* ---------- Le monde ---------- */
export class World {
  constructor() { this.bodies = []; this.arb = new Map(); this.t = 0; this.events = []; this.lastHit = -1; this.credit = [0, 0]; this.latched = false; this.thr = 0.6; this.removed = []; }
  add(b) { this.bodies.push(b); return b; }
  byId(id) { return this.bodies.find(b => b.id === id); }
  /** Copie profonde (pour les simulations d'essai de Rémi et du calcul du nombre de projectiles). */
  clone() {
    const w = new World(); w.bodies = this.bodies.map(b => ({ ...b })); w.t = this.t; w.lastHit = this.lastHit; w.credit = this.credit.slice(); w.latched = this.latched; w.thr = this.thr;
    for (const [k, a] of this.arb) w.arb.set(k, { a: w.byId(a.a.id), b: w.byId(a.b.id), fr: a.fr, cs: a.cs.map(c => ({ ...c })) });
    return w;
  }
  wake(b) { if (!b || b.st || !b.sleep) { if (b) b.still = 0; return; } b.sleep = false; b.still = 0; for (const o of this.bodies) if (o.sleep && !o.st && near(b, o)) this.wake(o); }
  step(dt = DT) {
    const B = this.bodies; this.t += dt;
    for (const b of B) { b.c = Math.cos(b.a); b.s = Math.sin(b.a); if (b.proj) { b.age += dt; b.pv = b.pierce ? { vx: b.vx, vy: b.vy } : null; } b.imp = 0; }
    // paires proches -> contacts
    const seen = new Set();
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const A = B[i], C = B[j]; if (A.st && C.st) continue; if (A.sleep && C.sleep) { if (!A.st && !C.st) continue; }
      if ((A.sleep || A.st) && (C.sleep || C.st)) continue;
      if (!near(A, C, 0.05)) continue;
      const cs = []; collide(A, C, cs); const key = A.id < C.id ? A.id * 65536 + C.id : C.id * 65536 + A.id;
      if (!cs.length) { this.arb.delete(key); continue; }
      seen.add(key); if (A.sleep || C.sleep) { this.wake(A); this.wake(C); }
      let ar = this.arb.get(key);
      if (ar) { for (const n of cs) { const o = ar.cs.find(c => c.fp === n.fp); if (o) { n.Pn = o.Pn; n.Pt = o.Pt; } } ar.cs = cs; ar.a = A; ar.b = C; } else { ar = { a: A, b: C, fr: Math.sqrt(A.f * C.f), cs }; this.arb.set(key, ar); }
    }
    for (const k of [...this.arb.keys()]) if (!seen.has(k)) this.arb.delete(k);
    for (const b of B) if (!b.st && !b.sleep) { b.vy += GRAV * dt; }
    // pré-pas : masses effectives, biais, détection des chocs, impulsions mémorisées
    const impacts = [];
    for (const ar of this.arb.values()) {
      const a = ar.a, b = ar.b; if (a.sleep && b.sleep) continue;
      for (const c of ar.cs) {
        c.r1x = c.x - a.x; c.r1y = c.y - a.y; c.r2x = c.x - b.x; c.r2y = c.y - b.y;
        const rn1 = c.r1x * c.nx + c.r1y * c.ny, rn2 = c.r2x * c.nx + c.r2y * c.ny;
        c.mn = 1 / (a.im + b.im + a.ii * (c.r1x * c.r1x + c.r1y * c.r1y - rn1 * rn1) + b.ii * (c.r2x * c.r2x + c.r2y * c.r2y - rn2 * rn2));
        const tx = c.ny, ty = -c.nx, rt1 = c.r1x * tx + c.r1y * ty, rt2 = c.r2x * tx + c.r2y * ty;
        c.mt = 1 / (a.im + b.im + a.ii * (c.r1x * c.r1x + c.r1y * c.r1y - rt1 * rt1) + b.ii * (c.r2x * c.r2x + c.r2y * c.r2y - rt2 * rt2));
        c.bias = -BIAS / dt * Math.min(0, c.sep + SLOP);
        const dvx = b.vx - b.w * c.r2y - a.vx + a.w * c.r1y, dvy = b.vy + b.w * c.r2x - a.vy - a.w * c.r1x, vn = dvx * c.nx + dvy * c.ny;
        if (vn < -IMPACT_V) { impacts.push({ a, b, J: -vn / (a.im + b.im), vn }); c.Pn = 0; c.Pt = 0; }
        if (a.bias0 === undefined) a.bias0 = 0;
        const px = c.Pn * c.nx + c.Pt * tx, py = c.Pn * c.ny + c.Pt * ty;
        a.vx -= a.im * px; a.vy -= a.im * py; a.w -= a.ii * (c.r1x * py - c.r1y * px);
        b.vx += b.im * px; b.vy += b.im * py; b.w += b.ii * (c.r2x * py - c.r2y * px);
      }
    }
    for (let it = 0; it < ITER; it++) for (const ar of this.arb.values()) {
      const a = ar.a, b = ar.b; if (a.sleep && b.sleep) continue;
      for (const c of ar.cs) {
        let dvx = b.vx - b.w * c.r2y - a.vx + a.w * c.r1y, dvy = b.vy + b.w * c.r2x - a.vy - a.w * c.r1x;
        const vn = dvx * c.nx + dvy * c.ny; let dPn = c.mn * (-vn + c.bias);
        // rebond (restitution) : seulement sur les vrais chocs, pas sur les contacts au repos
        const P0 = c.Pn; c.Pn = Math.max(P0 + dPn, 0); dPn = c.Pn - P0;
        let px = dPn * c.nx, py = dPn * c.ny;
        a.vx -= a.im * px; a.vy -= a.im * py; a.w -= a.ii * (c.r1x * py - c.r1y * px); b.vx += b.im * px; b.vy += b.im * py; b.w += b.ii * (c.r2x * py - c.r2y * px);
        dvx = b.vx - b.w * c.r2y - a.vx + a.w * c.r1y; dvy = b.vy + b.w * c.r2x - a.vy - a.w * c.r1x;
        const tx = c.ny, ty = -c.nx, vt = dvx * tx + dvy * ty; let dPt = c.mt * (-vt); const maxPt = ar.fr * c.Pn, old = c.Pt; c.Pt = Math.max(-maxPt, Math.min(maxPt, old + dPt)); dPt = c.Pt - old;
        px = dPt * tx; py = dPt * ty;
        a.vx -= a.im * px; a.vy -= a.im * py; a.w -= a.ii * (c.r1x * py - c.r1y * px); b.vx += b.im * px; b.vy += b.im * py; b.w += b.ii * (c.r2x * py - c.r2y * px);
      }
    }
    // rebonds : on applique la restitution sur les chocs détectés (vitesse d'approche avant résolution)
    for (const im of impacts) {
      const e = Math.max(im.a.e, im.b.e); if (e < 0.15 && !(im.a.proj || im.b.proj)) continue;
      const ar = this.arb.get(im.a.id < im.b.id ? im.a.id * 65536 + im.b.id : im.b.id * 65536 + im.a.id); if (!ar) continue; const c = ar.cs[0]; if (!c) continue;
      const a = ar.a, b = ar.b; const dvx = b.vx - b.w * c.r2y - a.vx + a.w * c.r1y, dvy = b.vy + b.w * c.r2x - a.vy - a.w * c.r1x; const vn = dvx * c.nx + dvy * c.ny;
      const want = -e * im.vn * 0.9; if (vn < want && want > 0.5) { const j = (want - vn) / (a.im + b.im); a.vx -= a.im * j * c.nx; a.vy -= a.im * j * c.ny; b.vx += b.im * j * c.nx; b.vy += b.im * j * c.ny; }
    }
    for (const b of B) if (!b.st && !b.sleep) { b.vx *= 1 - 0.05 * dt; b.w *= 1 - 0.6 * dt; b.x += dt * b.vx; b.y += dt * b.vy; b.a += dt * b.w; }
    for (const im of impacts) this.impact(im);
    this.after();
  }
  /** Dégâts d'un choc, explosion de la bombe, perforation. */
  impact({ a, b, J }) {
    if (J > 1.5 && (a.proj || b.proj)) this.events.push({ t: 'hit', J: Math.round(J * 10) / 10, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    for (const [x, y] of [[a, b], [b, a]]) {
      if (x.st) continue;
      if (x.proj) { x.hits++; if (!y.proj) { this.lastHit = x.owner; } continue; }
      if (J < IMPACT_MIN) continue;
      const dm = y.proj ? AMMO[y.type].dm : 0.6; const dealt = (J - IMPACT_MIN * 0.6) * dm * (x.mat === 'verre' ? 1.0 : 1);
      if (y.proj) this.lastHit = y.owner; else if (x.hitBy !== undefined && y.hitBy !== undefined) { /* chaîne : le crédit suit le dernier tireur */ }
      x.dmg += dealt; this.wake(x);
    }
    for (const x of [a, b]) if (x.proj && AMMO[x.type].explode && !x.boomed && (x.hits > 0)) this.explode(x);
  }
  explode(bm) {
    bm.boomed = true; bm.dead = true; const R = 2.3; this.events.push({ t: 'boom', x: bm.x, y: bm.y, r: R });
    for (const o of this.bodies) {
      if (o === bm || o.st || o.dead) continue; const d = Math.hypot(o.x - bm.x, o.y - bm.y) - Math.max(o.hw, o.hh) * 0.5; if (d > R) continue;
      const f = Math.max(0, 1 - Math.max(0, d) / R), dx = (o.x - bm.x) || 0.01, dy = (o.y - bm.y) + 0.3, dl = Math.hypot(dx, dy);
      this.wake(o); o.vx += dx / dl * f * 5 / (1 + o.m * 0.5); o.vy += dy / dl * f * 5 / (1 + o.m * 0.5); o.w += (dx > 0 ? -1 : 1) * f * 2 / (1 + o.m);
      if (!o.proj) { o.dmg += f * 10; this.lastHit = bm.owner; }
    }
  }
  after() {
    // rupture, perforation, sortie de la scène, mise en veille
    for (const b of this.bodies) {
      if (b.st || b.dead) continue;
      if (b.proj) {
        if (b.type === 'bombe' && b.age > 3 && !b.boomed) this.explode(b);
        if (b.pierce && b.pv && b.hits > (b.hitsSeen || 0)) { b.hitsSeen = b.hits; b.piercing = b.pv; }
        if (b.y < -3 || b.x < -3 || b.x > WORLD_W + 3 || b.age > 9) b.dead = true;
        if (b.sleep && b.age > 1) b.dead = true;
      } else if (b.dmg >= b.hp) { b.broken = true; b.dead = true; this.events.push({ t: 'break', m: b.mat, x: b.x, y: b.y, w: b.hw * 2, h: b.hh * 2, id: b.id }); }
      else if (b.y < -3 || b.x < -3 || b.x > WORLD_W + 3) { b.gone = true; b.dead = true; }
      if (b.proj && b.age > 2.5 && Math.hypot(b.vx, b.vy) < 0.8) b.still = Math.max(b.still, 0.45);
      if (b.k === 'box' && b.str && b.y < -6) b.dead = true;
    }
    // la flèche traverse ce qui a cassé
    for (const b of this.bodies) if (b.proj && b.piercing && !b.dead) {
      const broke = this.bodies.some(o => o.broken && Math.hypot(o.x - b.x, o.y - b.y) < 1.4 + o.hw);
      if (broke && b.pierce > 0) { b.pierce--; b.vx = b.piercing.vx * 0.8; b.vy = b.piercing.vy * 0.8; }
      b.piercing = null;
    }
    const dead = this.bodies.filter(b => b.dead);
    if (dead.length) {
      for (const d of dead) { for (const o of this.bodies) if (!o.st && o !== d && near(d, o, 0.3)) this.wake(o); this.removed.push(d); }
      this.bodies = this.bodies.filter(b => !b.dead); const ids = new Set(dead.map(d => d.id));
      for (const [k, a] of [...this.arb]) if (ids.has(a.a.id) || ids.has(a.b.id)) this.arb.delete(k);
    }
    for (const b of this.bodies) {
      if (b.st || b.sleep) continue; const sp = b.vx * b.vx + b.vy * b.vy + (b.w * b.hh) * (b.w * b.hh);
      if (sp < 0.012) { b.still += DT; if (b.still > 0.5) { b.sleep = true; b.vx = b.vy = b.w = 0; } } else b.still = 0;
    }
    // chute finale ?
    if (!this.latched) { const p = this.progress(); if (p.frac >= this.thr) { this.latched = true; this.finalBy = this.lastHit; this.events.push({ t: 'fall', by: this.lastHit }); } }
  }
  structure() { return this.bodies.concat(this.removed).filter(b => b.str); }
  /** Pièces « tombées » : cassées, sorties, ou posées au sol alors qu'elles étaient en hauteur (ou renversées). */
  progress() {
    const all = this.structure(); let down = 0, dmgSum = 0;
    for (const b of all) {
      if (b.broken || b.gone) { down++; continue; }
      const hx = Math.abs(b.c) * b.hw + Math.abs(b.s) * b.hh, hy = Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hh, low = b.y - hy;
      const tilt = Math.abs(((b.a - b.a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI), sq = Math.abs(b.hw - b.hh) < 0.05;
      const moved = Math.hypot(b.x - b.x0, b.y - b.y0);
      if (low < 0.15 && (b.low0 > 0.3 || moved > 1.2 || (!sq && Math.min(tilt, Math.abs(Math.PI - tilt)) > 0.7 && tilt > 0.7 && tilt < Math.PI - 0.7))) down++;
      dmgSum += Math.min(1, b.dmg / b.hp);
    }
    return { down, total: all.length, frac: all.length ? down / all.length : 0, dmg: dmgSum };
  }
  /** Tout est calme : plus de projectile, rien ne bouge. */
  calm() { for (const b of this.bodies) if (!b.st && (b.proj || !b.sleep)) return false; return true; }
  speedMax() { let m = 0; for (const b of this.bodies) if (!b.st && !b.proj && !b.sleep) m = Math.max(m, Math.hypot(b.vx, b.vy)); return m; }
  /** Lance un projectile du lance-pierre du joueur `seat` (0 = gauche, 1 = droite). ang : angle au-dessus de l'horizontale vers la tour ; pow : 0..1. */
  shoot(seat, type, ang, pow) {
    const T = AMMO[type], v = T.k * DMAX * Math.max(0.15, Math.min(1, pow)), d = seat === 0 ? 1 : -1;
    const b = ball(type, SLING_X[seat], SLING_Y, d * Math.cos(ang) * v, Math.sin(ang) * v, seat); this.add(b); this.events.push({ t: 'shot', seat, type, x: b.x, y: b.y }); return b;
  }
}
function near(a, b, pad = 0) {
  const ra = Math.hypot(a.hw, a.hh), rb = Math.hypot(b.hw, b.hh); if (a.st && a.k === 'box' && a.hw > 8) return b.y - rb - pad <= a.y + a.hh && b.y - rb < a.y + a.hh + 0.5;
  if (b.st && b.k === 'box' && b.hw > 8) return a.y - ra - pad <= b.y + b.hh && a.y - ra < b.y + b.hh + 0.5;
  return Math.abs(a.x - b.x) < ra + rb + pad && Math.abs(a.y - b.y) < ra + rb + pad;
}

/* ---------- Niveaux ---------- */
/** Chaque pièce : [matériau, centre x, centre y, largeur, hauteur]. Le sol est en y = 0. */
export const LEVELS = [
  { id: 'fortin', name: 'Le petit fortin', thr: 0.85, ammo: 5, pieces: [
    ['bois', 7.0, 1.1, 0.5, 2.2], ['bois', 9.0, 1.1, 0.5, 2.2], ['bois', 8.0, 2.375, 2.9, 0.35], ['bois', 7.1, 3.3, 0.45, 1.5], ['bois', 8.9, 3.3, 0.45, 1.5], ['bois', 8.0, 4.2, 2.6, 0.3],
    ['pierre', 8.0, 4.75, 1.0, 0.8], ['verre', 8.0, 5.45, 0.6, 0.6]] },
  { id: 'verre', name: 'La tour de verre', thr: 0.85, ammo: 5, pieces: [
    ['pierre', 8.0, 0.3, 2.6, 0.6], ['glace', 7.1, 1.4, 0.5, 1.6], ['glace', 8.9, 1.4, 0.5, 1.6], ['verre', 8.0, 2.35, 2.4, 0.3], ['verre', 7.4, 3.1, 0.35, 1.2], ['verre', 8.6, 3.1, 0.35, 1.2],
    ['glace', 8.0, 3.85, 1.8, 0.3], ['verre', 7.5, 4.5, 0.4, 1.0], ['verre', 8.5, 4.5, 0.4, 1.0], ['pierre', 8.0, 5.3, 1.6, 0.6]] },
  { id: 'pont', name: 'Le pont de pierre', thr: 0.8, ammo: 5, pieces: [
    ['pierre', 6.6, 1.2, 0.7, 2.4], ['pierre', 9.4, 1.2, 0.7, 2.4], ['bois', 8.0, 2.6, 4.0, 0.4], ['glace', 7.2, 3.2, 0.8, 0.8], ['glace', 8.8, 3.2, 0.8, 0.8], ['bois', 8.0, 3.75, 2.4, 0.3],
    ['pierre', 7.4, 4.3, 0.9, 0.8], ['pierre', 8.6, 4.3, 0.9, 0.8], ['bois', 8.0, 4.85, 2.4, 0.3], ['verre', 8.0, 5.6, 0.5, 1.2]] },
  { id: 'forteresse', name: 'La forteresse', thr: 0.6, ammo: 7, pieces: [
    ['pierre', 6.5, 0.5, 1.0, 1.0], ['pierre', 7.5, 0.5, 1.0, 1.0], ['pierre', 8.5, 0.5, 1.0, 1.0], ['pierre', 9.5, 0.5, 1.0, 1.0], ['bois', 8.0, 1.15, 4.2, 0.3],
    ['glace', 6.9, 2.0, 0.7, 1.4], ['bois', 8.0, 2.0, 0.5, 1.4], ['glace', 9.1, 2.0, 0.7, 1.4], ['bois', 8.0, 2.85, 3.4, 0.3], ['verre', 7.2, 3.6, 0.5, 1.2], ['verre', 8.8, 3.6, 0.5, 1.2],
    ['pierre', 8.0, 4.4, 2.2, 0.5], ['bois', 7.4, 5.0, 0.5, 0.7], ['bois', 8.6, 5.0, 0.5, 0.7]] },
];

/** Construit un monde à partir d'un niveau. */
export function buildWorld(lv) {
  const L = typeof lv === 'number' ? LEVELS[lv] : lv; const w = new World(); w.thr = L.thr; NID = 1;
  w.add(box('sol', WORLD_W / 2, -2, 60, 4, 0, { static: true, ground: true }));
  for (const [mat, x, y, bw, bh] of L.pieces) { const b = box(mat, x, y, bw, bh, 0, { str: true }); b.x0 = x; b.y0 = y; b.a0 = 0; b.low0 = y - bh / 2; w.add(b); }
  return w;
}
/** Fait tourner le monde jusqu'au calme (ou la durée max). Renvoie le temps simulé. */
export function settle(w, maxT = 6, minT = 0.2) { let t = 0; while (t < maxT) { w.step(); t += DT; if (t > minT && w.calm()) break; } return t; }
/** Score d'un monde pour choisir le meilleur tir (plus grand = plus proche de l'effondrement). */
export const score = w => { const p = w.progress(); return p.down + 0.35 * p.dmg + (w.latched ? 50 : 0); };
/** Essaie un tir sur une copie du monde ; renvoie le score obtenu. */
export function tryShot(w, seat, type, ang, pow, maxT = 4.5) { const c = w.clone(); c.shoot(seat, type, ang, pow); settle(c, maxT, 0.3); return { score: score(c), latched: c.latched, w: c }; }
