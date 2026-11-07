// Puissance 4 : plateau 7 colonnes x 6 lignes. b[r*7+c], r=0 en haut. Joueur 0 = rouge, 1 = or.
export const W = 7, H = 6;
export const init = () => ({ b: new Array(42).fill(-1), t: 0, n: 0 });
export const turn = s => s.t;
export const key = m => 'c' + m.c;
export const moves = s => { const o = []; for (const c of [3, 2, 4, 1, 5, 0, 6]) if (s.b[c] < 0) o.push({ c }); return o; };
export const dropRow = (s, c) => { for (let r = H - 1; r >= 0; r--) if (s.b[r * W + c] < 0) return r; return -1; };
export const apply = (s, m) => { const b = s.b.slice(), r = dropRow(s, m.c); b[r * W + m.c] = s.t; return { b, t: 1 - s.t, n: s.n + 1, last: r * W + m.c }; };
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
/** Renvoie les 4 cases alignées passant par la dernière pièce, ou null. */
export function lineAt(b, idx) {
  const p = b[idx]; if (p < 0) return null; const r0 = (idx / W) | 0, c0 = idx % W;
  for (const [dr, dc] of DIRS) {
    const cells = [idx];
    for (const sg of [1, -1]) { let r = r0 + dr * sg, c = c0 + dc * sg; while (r >= 0 && r < H && c >= 0 && c < W && b[r * W + c] === p) { cells.push(r * W + c); r += dr * sg; c += dc * sg; } }
    if (cells.length >= 4) return cells;
  }
  return null;
}
export function result(s) {
  if (s.last !== undefined) { const l = lineAt(s.b, s.last); if (l) return { w: s.b[s.last], why: 'four', line: l }; }
  if (s.n >= 42) return { w: 'd', why: 'full' };
  return null;
}
function winsNow(s, c) { const ns = apply(s, { c }); return !!(ns.last !== undefined && lineAt(ns.b, ns.last)); }
function evalB(b, me) {
  let sc = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const [dr, dc] of DIRS) {
    const er = r + 3 * dr, ec = c + 3 * dc; if (er < 0 || er >= H || ec < 0 || ec >= W) continue;
    let a = 0, o = 0; for (let k = 0; k < 4; k++) { const v = b[(r + dr * k) * W + c + dc * k]; if (v === me) a++; else if (v >= 0) o++; }
    if (a && o) continue; if (a) sc += [0, 1, 5, 25][a - 1] ?? 0; if (o) sc -= [0, 1, 5, 28][o - 1] ?? 0;
  }
  for (let r = 0; r < H; r++) { const v = b[r * W + 3]; if (v === me) sc += 3; else if (v >= 0) sc -= 3; }
  return sc;
}
function nm(s, d, a, bt, me) {
  const r = result(s); if (r) return r.w === 'd' ? 0 : (r.w === s.t ? 1e5 + d : -1e5 - d);
  if (d === 0) return evalB(s.b, s.t);
  let best = -1e9; for (const m of moves(s)) { const v = -nm(apply(s, m), d - 1, -bt, -a, me); if (v > best) best = v; if (best > a) a = best; if (a >= bt) break; }
  return best;
}
const DEPTH = [1, 3, 5, 7, 9], RAND = [.55, .22, .06, 0, 0];
export function ai(s, lv, ms = 800) {
  const mv = moves(s), me = s.t;
  const win = mv.find(m => winsNow(s, m.c)); if (win && Math.random() > (lv === 1 ? .25 : 0)) return win;
  const opp = { ...s, t: 1 - s.t }; const block = mv.find(m => winsNow(opp, m.c)); if (block && Math.random() > (lv === 1 ? .35 : lv === 2 ? .08 : 0)) return block;
  if (Math.random() < RAND[lv - 1]) { const safe = mv.filter(m => { const ns = apply(s, m); return !moves(ns).some(x => winsNow(ns, x.c)); }); const pool = safe.length ? safe : mv; return pool[Math.floor(Math.random() * pool.length)]; }
  const end = performance.now() + ms; let bestM = mv[0];
  for (let d = 1; d <= DEPTH[lv - 1]; d++) {
    let bm = null, bv = -1e9, a = -1e9;
    for (const m of mv) {
      if (performance.now() > end && d > 1) return bestM;
      const v = -nm(apply(s, m), d - 1, -1e9, -a, me); if (v > bv) { bv = v; bm = m; } if (bv > a) a = bv;
    }
    bestM = bm; if (bv > 9e4) break;
  }
  return bestM;
}
export const engine = { init, turn, moves, apply, result, ai, key };
