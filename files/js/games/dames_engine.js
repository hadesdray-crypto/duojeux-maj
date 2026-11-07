// Dames françaises : 10x10 (ou 8x8). Prise obligatoire ET maximale, pions qui prennent en arrière, dames volantes.
// b[r*n+c] : '' vide, 'w' pion blanc, 'W' dame blanche, 'b' pion noir, 'B' dame noire. Blancs (côté 0) en bas, ils montent.
export const init = (o = {}) => {
  const n = o.size === 8 ? 8 : 10, rows = n === 8 ? 3 : 4, b = new Array(n * n).fill('');
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if ((r + c) % 2 === 1) { if (r < rows) b[r * n + c] = 'b'; else if (r >= n - rows) b[r * n + c] = 'w'; }
  return { n, b, t: 0, quiet: 0 };
};
export const turn = s => s.t;
export const key = m => m.f + '>' + m.path.join('>');
const own = (p, t) => p && (t === 0 ? p === 'w' || p === 'W' : p === 'b' || p === 'B');
const foe = (p, t) => p && !own(p, t);
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function captures(s, from) {
  const { n, t } = s, b = s.b.slice(), king = b[from] === 'W' || b[from] === 'B', out = [];
  b[from] = ''; const taken = new Set();
  const inb = (r, c) => r >= 0 && r < n && c >= 0 && c < n;
  (function dfs(pos, path, caps) {
    let any = false; const r0 = (pos / n) | 0, c0 = pos % n;
    for (const [dr, dc] of DIRS) {
      let r = r0 + dr, c = c0 + dc;
      if (king) while (inb(r, c) && !b[r * n + c]) { r += dr; c += dc; }
      if (!inb(r, c)) continue; const v = r * n + c;
      if (!foe(b[v], t) || taken.has(v)) continue;
      let lr = r + dr, lc = c + dc; const lands = [];
      while (inb(lr, lc) && !b[lr * n + lc]) { lands.push(lr * n + lc); if (!king) break; lr += dr; lc += dc; }
      for (const L of lands) { any = true; taken.add(v); path.push(L); caps.push(v); dfs(L, path, caps); path.pop(); caps.pop(); taken.delete(v); }
    }
    if (!any && caps.length) out.push({ f: from, path: path.slice(), caps: caps.slice() });
  })(from, [], []);
  return out;
}
export function moves(s) {
  const { n, t, b } = s; let caps = [];
  for (let i = 0; i < b.length; i++) if (own(b[i], t)) caps.push(...captures(s, i));
  if (caps.length) { const mx = Math.max(...caps.map(m => m.caps.length)); return caps.filter(m => m.caps.length === mx); }
  const out = [];
  for (let i = 0; i < b.length; i++) {
    const p = b[i]; if (!own(p, t)) continue; const r0 = (i / n) | 0, c0 = i % n, king = p === 'W' || p === 'B';
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== (t === 0 ? -1 : 1)) continue;
      let r = r0 + dr, c = c0 + dc;
      while (r >= 0 && r < n && c >= 0 && c < n && !b[r * n + c]) { out.push({ f: i, path: [r * n + c], caps: [] }); if (!king) break; r += dr; c += dc; }
    }
  }
  return out;
}
export function apply(s, m) {
  const b = s.b.slice(), p = b[m.f], to = m.path[m.path.length - 1]; b[m.f] = ''; m.caps.forEach(x => { b[x] = ''; });
  let np = p; if (p === 'w' && ((to / s.n) | 0) === 0) np = 'W'; else if (p === 'b' && ((to / s.n) | 0) === s.n - 1) np = 'B';
  b[to] = np; const man = p === 'w' || p === 'b';
  return { n: s.n, b, t: 1 - s.t, quiet: (man || m.caps.length) ? 0 : s.quiet + 1, promoted: np !== p };
}
export function result(s) {
  if (!moves(s).length) return { w: 1 - s.t, why: 'blocked' };
  if (s.quiet >= 50) return { w: 'd', why: 'quiet' };
  return null;
}
function evalS(s, me) {
  const { n, b } = s; let sc = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i]; if (!p) continue; const r = (i / n) | 0, c = i % n, white = p === 'w' || p === 'W', king = p === 'W' || p === 'B';
    let v = king ? 330 : 100;
    if (!king) { const adv = white ? n - 1 - r : r; v += adv * 3 + (adv === 0 ? 8 : 0); }
    const cen = 3 - Math.abs(c - (n - 1) / 2) * .6 - Math.abs(r - (n - 1) / 2) * .3; v += cen * 2;
    sc += (white ? 1 : -1) * v;
  }
  return me === 0 ? sc : -sc;
}
let stopAt = 0, over = false;
function nm(s, d, a, bt, me) {
  if (performance.now() > stopAt) { over = true; return 0; }
  const mv = moves(s); if (!mv.length) return -5000 - d;
  if (d <= 0 && !(mv[0].caps.length && d > -3)) return evalS(s, s.t);
  mv.sort((x, y) => y.caps.length - x.caps.length);
  let best = -1e9; for (const m of mv) { const v = -nm(apply(s, m), d - 1, -bt, -a, me); if (over) return 0; if (v > best) best = v; if (best > a) a = best; if (a >= bt) break; }
  return best;
}
const DEPTH = [1, 2, 4, 6, 9], NOISE = [60, 30, 10, 0, 0], BLUN = [.4, .15, .02, 0, 0];
export function ai(s, lv, ms = 800) {
  const mv = moves(s); if (mv.length === 1) return mv[0];
  if (Math.random() < BLUN[lv - 1]) return mv[Math.floor(Math.random() * mv.length)];
  stopAt = performance.now() + ms; let best = mv[0];
  const maxD = DEPTH[lv - 1] - (s.n === 10 && lv === 5 ? 1 : 0);
  for (let d = 1; d <= maxD; d++) {
    over = false; let bm = null, bv = -1e9, a = -1e9; const noise = NOISE[lv - 1];
    for (const m of mv) { const v = -nm(apply(s, m), d - 1, noise ? -1e9 : -1e9, noise ? 1e9 : -a, s.t) + (noise ? (Math.random() - .5) * noise : 0); if (over) break; if (v > bv) { bv = v; bm = m; } if (!noise && bv > a) a = bv; }
    if (over) break; best = bm;
  }
  return best;
}
export const engine = { init, turn, moves, apply, result, ai, key };
