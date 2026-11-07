// Moteur d'échecs pur (aucun écran) : toutes les règles + intelligence artificielle à 5 niveaux.
// Case = r*8+c ; r=0 en haut (rangée 8 des blancs), c=0 colonne a. Pièces : PNBRQK (blancs) pnbrqk (noirs), '' = vide.
// Roque : bits 1=K 2=Q (blancs) 4=k 8=q (noirs). Coup : {f,t,p?} (p = promotion 'q','r','b','n'), le roque et la prise en passant se déduisent.
export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const isW = p => p !== '' && p === p.toUpperCase();
const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], OR = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const sqName = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));

export function fromFEN(fen) {
  const [pl, tr, ca, ep, hm, fm] = fen.split(' '); const b = [];
  for (const ch of pl) { if (ch === '/') continue; if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) b.push(''); else b.push(ch); }
  let c = 0; if (ca.includes('K')) c |= 1; if (ca.includes('Q')) c |= 2; if (ca.includes('k')) c |= 4; if (ca.includes('q')) c |= 8;
  const e = ep === '-' || !ep ? -1 : (ep.charCodeAt(0) - 97) + (8 - +ep[1]) * 8;
  return { b, t: tr === 'w' ? 0 : 1, c, ep: e, hm: +hm || 0, fm: +fm || 1 };
}
export const init = () => fromFEN(START);
export const turn = s => s.t;
export const key = m => m.f + '-' + m.t + (m.p || '');
export const posKey = s => s.b.join('|') + s.t + s.c + (epUseful(s) ? s.ep : '');
function epUseful(s) { return s.ep >= 0; }

function attacked(b, sq, by) { // la case sq est-elle attaquée par le camp « by » (0 blancs, 1 noirs) ?
  const r = sq >> 3, c = sq & 7, W = by === 0;
  const pr = W ? r + 1 : r - 1; // un pion blanc attaque vers le haut : il se trouve plus bas (r+1)
  if (pr >= 0 && pr < 8) for (const dc of [-1, 1]) { const cc = c + dc; if (cc >= 0 && cc < 8 && b[pr * 8 + cc] === (W ? 'P' : 'p')) return true; }
  const N = W ? 'N' : 'n', K = W ? 'K' : 'k', B = W ? 'B' : 'b', Rk = W ? 'R' : 'r', Q = W ? 'Q' : 'q';
  for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === N) return true; }
  for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === K) return true; }
  for (const [dr, dc] of DG) { let rr = r + dr, cc = c + dc; while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const p = b[rr * 8 + cc]; if (p) { if (p === B || p === Q) return true; break; } rr += dr; cc += dc; } }
  for (const [dr, dc] of OR) { let rr = r + dr, cc = c + dc; while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const p = b[rr * 8 + cc]; if (p) { if (p === Rk || p === Q) return true; break; } rr += dr; cc += dc; } }
  return false;
}
const kingSq = (b, side) => b.indexOf(side === 0 ? 'K' : 'k');
export const inCheck = (s, side = s.t) => { const k = kingSq(s.b, side); return k >= 0 && attacked(s.b, k, 1 - side); };

function pseudo(s) {
  const out = [], b = s.b, side = s.t, W = side === 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p || isW(p) !== W) continue; const r = i >> 3, c = i & 7, u = p.toLowerCase();
    if (u === 'p') {
      const d = W ? -1 : 1, start = W ? 6 : 1, last = W ? 0 : 7, r1 = r + d;
      if (r1 < 0 || r1 > 7) continue;
      const push = (t, cap) => { if ((t >> 3) === last) for (const q of ['q', 'r', 'b', 'n']) out.push({ f: i, t, p: q }); else out.push({ f: i, t }); };
      if (!b[r1 * 8 + c]) { push(r1 * 8 + c); if (r === start && !b[(r + 2 * d) * 8 + c]) out.push({ f: i, t: (r + 2 * d) * 8 + c }); }
      for (const dc of [-1, 1]) { const cc = c + dc; if (cc < 0 || cc > 7) continue; const t = r1 * 8 + cc; if (b[t] && isW(b[t]) !== W) push(t, true); else if (!b[t] && t === s.ep) out.push({ f: i, t }); }
    } else if (u === 'n' || u === 'k') {
      for (const [dr, dc] of (u === 'n' ? KN : KG)) { const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue; const t = rr * 8 + cc; if (!b[t] || isW(b[t]) !== W) out.push({ f: i, t }); }
      if (u === 'k') { // roque : pas de pièce entre, ni échec, ni case traversée attaquée
        const home = W ? 60 : 4; if (i === home && !attacked(b, i, 1 - side)) {
          const ks = W ? 1 : 4, qs = W ? 2 : 8, rk = W ? 'R' : 'r';
          if ((s.c & ks) && b[home + 3] === rk && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, 1 - side) && !attacked(b, home + 2, 1 - side)) out.push({ f: i, t: home + 2 });
          if ((s.c & qs) && b[home - 4] === rk && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, 1 - side) && !attacked(b, home - 2, 1 - side)) out.push({ f: i, t: home - 2 });
        }
      }
    } else {
      const dirs = u === 'b' ? DG : u === 'r' ? OR : DG.concat(OR);
      for (const [dr, dc] of dirs) { let rr = r + dr, cc = c + dc; while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const t = rr * 8 + cc; if (!b[t]) out.push({ f: i, t }); else { if (isW(b[t]) !== W) out.push({ f: i, t }); break; } rr += dr; cc += dc; } }
    }
  }
  return out;
}

/** Applique un coup sans vérifier sa légalité. */
export function apply(s, m) {
  const b = s.b.slice(), p = b[m.f], W = isW(p), u = p.toLowerCase(); let c = s.c, ep = -1, hm = s.hm + 1; const cap = b[m.t];
  b[m.t] = p; b[m.f] = '';
  if (u === 'p') {
    hm = 0; if (m.t === s.ep && !cap && (m.f & 7) !== (m.t & 7)) b[(m.f >> 3) * 8 + (m.t & 7)] = ''; // prise en passant
    if (Math.abs((m.t >> 3) - (m.f >> 3)) === 2) ep = (m.f + m.t) >> 1;
    if (m.p) b[m.t] = W ? m.p.toUpperCase() : m.p;
  }
  if (cap) hm = 0;
  if (u === 'k') {
    c &= W ? ~3 : ~12;
    if (Math.abs(m.t - m.f) === 2) { if (m.t > m.f) { b[m.f + 1] = b[m.f + 3]; b[m.f + 3] = ''; } else { b[m.f - 1] = b[m.f - 4]; b[m.f - 4] = ''; } }
  }
  const lose = sq => { if (sq === 63) c &= ~1; else if (sq === 56) c &= ~2; else if (sq === 7) c &= ~4; else if (sq === 0) c &= ~8; };
  lose(m.f); lose(m.t);
  return { b, t: 1 - s.t, c, ep, hm, fm: s.fm + (s.t === 1 ? 1 : 0) };
}

export function moves(s) {
  const out = [], side = s.t;
  for (const m of pseudo(s)) { const n = apply(s, m); const k = kingSq(n.b, side); if (k >= 0 && !attacked(n.b, k, 1 - side)) out.push(m); }
  return out;
}

function insufficient(b) {
  const rest = []; for (let i = 0; i < 64; i++) { const p = b[i]; if (p && p.toLowerCase() !== 'k') rest.push([p.toLowerCase(), i]); }
  if (!rest.length) return true; if (rest.length === 1 && (rest[0][0] === 'n' || rest[0][0] === 'b')) return true;
  if (rest.every(x => x[0] === 'b')) { return rest.every(x => ((x[1] & 7) + (x[1] >> 3)) % 2 === ((rest[0][1] & 7) + (rest[0][1] >> 3)) % 2); }
  return false;
}
export function result(s) {
  const mv = moves(s);
  if (!mv.length) return inCheck(s) ? { w: 1 - s.t, why: 'mat' } : { w: 'd', why: 'pat' };
  if (insufficient(s.b)) return { w: 'd', why: 'mat_insuf' };
  if (s.hm >= 100) return { w: 'd', why: '50' };
  return null;
}

/* ---------------- Intelligence artificielle ---------------- */
const VAL = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
function evalPos(s) { // du point de vue du camp qui doit jouer
  let v = 0, mat = 0;
  for (let i = 0; i < 64; i++) { const p = s.b[i]; if (!p) continue; const u = p.toLowerCase(); const w = isW(p); const x = VAL[u] + PST[u][w ? i : (7 - (i >> 3)) * 8 + (i & 7)]; v += w ? x : -x; if (u !== 'k' && u !== 'p') mat += VAL[u]; }
  return s.t === 0 ? v : -v;
}
const ORDER = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function order(s, mv, hash) {
  return mv.map(m => { let sc = 0; const cap = s.b[m.t]; if (hash && hash === key(m)) sc += 1e6; if (cap) sc += 10 * (ORDER[cap.toLowerCase()] || 0) - (ORDER[s.b[m.f].toLowerCase()] || 0) + 100; if (m.p) sc += 80; return [sc, m]; }).sort((a, b) => b[0] - a[0]).map(x => x[1]);
}
class Timeout extends Error {}
export function ai(s, lvl, ms) {
  const mvs = moves(s); if (mvs.length <= 1) return mvs[0];
  const maxD = [1, 2, 3, 4, 6][lvl - 1], noise = [60, 28, 8, 0, 0][lvl - 1], blunder = [.35, .12, 0, 0, 0][lvl - 1];
  if (Math.random() < blunder) { // niveaux bas : parfois un coup au hasard (mais pas une bêtise énorme à chaque fois)
    const caps = mvs.filter(m => s.b[m.t]); return Math.random() < .4 && caps.length ? caps[(Math.random() * caps.length) | 0] : mvs[(Math.random() * mvs.length) | 0];
  }
  const end = performance.now() + ms; let nodes = 0;
  const q = (st, a, b, d) => {
    const stand = evalPos(st); if (stand >= b) return b; if (stand > a) a = stand; if (d <= 0) return a;
    const caps = order(st, moves(st).filter(m => st.b[m.t] || m.p || (st.b[m.f].toLowerCase() === 'p' && m.t === st.ep)), null);
    for (const m of caps) { const sc = -q(apply(st, m), -b, -a, d - 1); if (sc >= b) return b; if (sc > a) a = sc; }
    return a;
  };
  const nm = (st, d, a, b, ply) => {
    if ((++nodes & 1023) === 0 && performance.now() > end) throw new Timeout();
    if (st.hm >= 100) return 0;
    const mv = moves(st); if (!mv.length) return inCheck(st) ? -30000 + ply : 0;
    if (d <= 0) return q(st, a, b, 4);
    for (const m of order(st, mv, null)) { const sc = -nm(apply(st, m), d - 1, -b, -a, ply + 1); if (sc >= b) return b; if (sc > a) a = sc; }
    return a;
  };
  let best = mvs[0], bestSc = -1e9;
  for (let d = 1; d <= maxD; d++) {
    let cur = null, curSc = -1e9, a = -1e9; const ordered = order(s, mvs, key(best));
    try {
      for (const m of ordered) { const sc = -nm(apply(s, m), d - 1, -1e9, noise ? 1e9 : -a, 1) + (noise ? (Math.random() - .5) * noise : 0); if (sc > curSc) { curSc = sc; cur = m; } if (sc > a) a = sc; }
      best = cur; bestSc = curSc; if (curSc > 29000) break;
    } catch (e) { if (e instanceof Timeout) break; throw e; }
  }
  return best;
}
export function perft(s, d) { if (d === 0) return 1; let n = 0; for (const m of moves(s)) n += d === 1 ? 1 : perft(apply(s, m), d - 1); return n; }
export const engine = { init, turn, moves, apply, result, ai, key };
