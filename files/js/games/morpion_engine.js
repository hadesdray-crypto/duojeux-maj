// Morpion : 3x3 (3 alignés) ou 9x9 (5 alignés). b[i], -1 vide, 0 = croix, 1 = rond.
export const init = (o = {}) => { const n = o.size === 9 ? 9 : 3; return { n, k: n === 9 ? 5 : 3, b: new Array(n * n).fill(-1), t: 0, cnt: 0 }; };
export const turn = s => s.t;
export const key = m => 'i' + m.i;
export const moves = s => { const o = []; for (let i = 0; i < s.b.length; i++) if (s.b[i] < 0) o.push({ i }); return o; };
export const apply = (s, m) => { const b = s.b.slice(); b[m.i] = s.t; return { ...s, b, t: 1 - s.t, cnt: s.cnt + 1, last: m.i }; };
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
export function lineAt(s, idx) {
  const { n, k, b } = s, p = b[idx]; if (p < 0) return null; const r0 = (idx / n) | 0, c0 = idx % n;
  for (const [dr, dc] of DIRS) {
    const cells = [idx];
    for (const sg of [1, -1]) { let r = r0 + dr * sg, c = c0 + dc * sg; while (r >= 0 && r < n && c >= 0 && c < n && b[r * n + c] === p) { cells.push(r * n + c); r += dr * sg; c += dc * sg; } }
    if (cells.length >= k) return cells;
  }
  return null;
}
export function result(s) {
  if (s.last !== undefined) { const l = lineAt(s, s.last); if (l) return { w: s.b[s.last], why: 'line', line: l }; }
  if (s.cnt >= s.b.length) return { w: 'd', why: 'full' };
  return null;
}
const wins = (s, i, p) => { const b = s.b.slice(); b[i] = p; return !!lineAt({ ...s, b }, i); };
// score d'une case pour le joueur p : somme des fenêtres de k cases contenant la case
function heur(s, i, p) {
  const { n, k, b } = s; const r0 = (i / n) | 0, c0 = i % n; let sc = 0;
  for (const [dr, dc] of DIRS) for (let off = -(k - 1); off <= 0; off++) {
    let mine = 0, his = 0, ok = true;
    for (let j = 0; j < k; j++) { const r = r0 + dr * (off + j), c = c0 + dc * (off + j); if (r < 0 || r >= n || c < 0 || c >= n) { ok = false; break; } const v = (r === r0 && c === c0) ? p : b[r * n + c]; if (v === p) mine++; else if (v >= 0) his++; }
    if (!ok || his) continue; sc += [0, 1, 6, 40, 300, 5000][mine] || 5000;
  }
  return sc;
}
function nm(s, d, a, bt) {
  const r = result(s); if (r) return r.w === 'd' ? 0 : -1000 - d;
  if (d === 0) return 0;
  let best = -1e9; for (const m of moves(s)) { const v = -nm(apply(s, m), d - 1, -bt, -a); if (v > best) best = v; if (best > a) a = best; if (a >= bt) break; }
  return best;
}
export function ai(s, lv, ms = 800) {
  const mv = moves(s), me = s.t, other = 1 - me, rnd = a => a[Math.floor(Math.random() * a.length)];
  if (s.cnt === 0) return { i: s.n === 3 ? rnd([0, 2, 4, 6, 8]) : 40 };
  const win = mv.find(m => wins(s, m.i, me)); if (win && Math.random() > [.3, .1, 0, 0, 0][lv - 1]) return win;
  const blk = mv.find(m => wins(s, m.i, other)); if (blk && Math.random() > [.5, .25, .05, 0, 0][lv - 1]) return blk;
  if (Math.random() < [.7, .35, .1, 0, 0][lv - 1]) return rnd(mv);
  if (s.n === 3) { // petit plateau : recherche complète
    let best = [], bv = -1e9; for (const m of mv) { const v = -nm(apply(s, m), lv >= 3 ? 9 : 2, -1e9, 1e9); if (v > bv) { bv = v; best = [m]; } else if (v === bv) best.push(m); } return rnd(best);
  }
  // grand plateau : heuristique attaque/défense autour des pièces
  const near = mv.filter(m => { const r = (m.i / s.n) | 0, c = m.i % s.n; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < s.n && cc >= 0 && cc < s.n && s.b[rr * s.n + cc] >= 0) return true; } return false; });
  const pool = near.length ? near : mv; const dw = [.6, .8, 1, 1.15, 1.3][lv - 1];
  let best = [], bv = -1e9; for (const m of pool) {
    let v = heur(s, m.i, me) + heur(s, m.i, other) * dw;
    if (lv >= 4) { const ns = apply(s, m); let worst = 0; for (const x of pool) if (ns.b[x.i] < 0) worst = Math.max(worst, heur(ns, x.i, other)); v -= worst * .35; }
    v += Math.random() * (lv >= 4 ? .5 : 8); if (v > bv) { bv = v; best = [m]; }
  }
  return best[0];
}
export const engine = { init, turn, moves, apply, result, ai, key };
