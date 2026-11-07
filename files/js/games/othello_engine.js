// Othello 8x8. b[r*8+c] : -1 vide, 0 noir (commence), 1 blanc. Un coup {i} ; si on ne peut pas jouer : {pass:1}.
export const init = () => { const b = new Array(64).fill(-1); b[27] = 1; b[36] = 1; b[28] = 0; b[35] = 0; return { b, t: 0, passes: 0 }; };
export const turn = s => s.t;
export const key = m => m.pass ? 'pass' : 'i' + m.i;
const D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
export function flips(b, i, p) {
  if (b[i] >= 0) return []; const r0 = i >> 3, c0 = i & 7, out = [];
  for (const [dr, dc] of D) { const tmp = []; let r = r0 + dr, c = c0 + dc; while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === 1 - p) { tmp.push(r * 8 + c); r += dr; c += dc; } if (tmp.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === p) out.push(...tmp); }
  return out;
}
const rawMoves = (b, p) => { const o = []; for (let i = 0; i < 64; i++) if (b[i] < 0 && flips(b, i, p).length) o.push({ i }); return o; };
export const moves = s => { const o = rawMoves(s.b, s.t); return o.length ? o : (rawMoves(s.b, 1 - s.t).length ? [{ pass: 1 }] : []); };
export function apply(s, m) {
  if (m.pass) return { b: s.b, t: 1 - s.t, passes: s.passes + 1, flipped: [] };
  const b = s.b.slice(), f = flips(b, m.i, s.t); b[m.i] = s.t; f.forEach(x => { b[x] = s.t; }); return { b, t: 1 - s.t, passes: 0, flipped: f };
}
export const count = b => { let a = 0, c = 0; for (const v of b) { if (v === 0) a++; else if (v === 1) c++; } return [a, c]; };
export function result(s) {
  if (moves(s).length) return null; const [a, c] = count(s.b);
  return { w: a > c ? 0 : c > a ? 1 : 'd', why: 'full', score: [a, c] };
}
const W = [120, -20, 20, 5, 5, 20, -20, 120, -20, -40, -5, -5, -5, -5, -40, -20, 20, -5, 15, 3, 3, 15, -5, 20, 5, -5, 3, 3, 3, 3, -5, 5];
const wt = i => { const r = i >> 3, c = i & 7; const rr = r < 4 ? r : 7 - r; return W[rr * 8 + c]; };
function evalB(b, p, empties) {
  let sc = 0, mine = 0, his = 0; for (let i = 0; i < 64; i++) { const v = b[i]; if (v === p) { sc += wt(i); mine++; } else if (v >= 0) { sc -= wt(i); his++; } }
  const mob = rawMoves(b, p).length - rawMoves(b, 1 - p).length; sc += mob * 6;
  if (empties < 10) sc += (mine - his) * 8;
  return sc;
}
let stopAt = 0, over = false;
function nm(s, d, a, bt, empties) {
  if (performance.now() > stopAt) { over = true; return 0; }
  const mv = moves(s); if (!mv.length) { const [x, y] = count(s.b); const diff = s.t === 0 ? x - y : y - x; return diff * 1000; }
  if (d === 0) return evalB(s.b, s.t, empties);
  mv.sort((p, q) => (q.pass ? 0 : wt(q.i)) - (p.pass ? 0 : wt(p.i)));
  let best = -1e9; for (const m of mv) { const v = -nm(apply(s, m), d - 1, -bt, -a, empties - 1); if (v > best) best = v; if (best > a) a = best; if (a >= bt) break; }
  return best;
}
const DEPTH = [1, 2, 4, 5, 7], NOISE = [.45, .2, .05, 0, 0];
export function ai(s, lv, ms = 800) {
  const mv = moves(s); if (mv.length === 1) return mv[0];
  if (Math.random() < NOISE[lv - 1]) return mv[Math.floor(Math.random() * mv.length)];
  let best = mv[0]; const empties = s.b.filter(v => v < 0).length; stopAt = performance.now() + ms;
  for (let d = 1; d <= DEPTH[lv - 1] + (empties < 9 && lv >= 4 ? 4 : 0); d++) {
    over = false; let bm = null, bv = -1e9, a = -1e9;
    for (const m of mv) { const v = -nm(apply(s, m), d - 1, -1e9, -a, empties - 1); if (over) break; if (v > bv) { bv = v; bm = m; } if (bv > a) a = bv; }
    if (over) break; best = bm;
  }
  return best;
}
export const engine = { init, turn, moves, apply, result, ai, key };
