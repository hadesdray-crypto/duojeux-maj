// Bataille navale : flotte, tirs et cerveau de Rémi (5 niveaux). Grille 10x10, case = r*10+c.
export const N = 10;
export const SHIPS = [{ len: 5, name: 'Galion' }, { len: 4, name: 'Frégate' }, { len: 3, name: 'Brick' }, { len: 3, name: 'Goélette' }, { len: 2, name: 'Chaloupe' }];
export const cellsOf = (r, c, len, horiz) => Array.from({ length: len }, (_, k) => (horiz ? r * N + c + k : (r + k) * N + c));
export function canPlace(ships, len, r, c, horiz) {
  if (r < 0 || c < 0 || (horiz ? c + len > N : r + len > N)) return false;
  const used = new Set(ships.flatMap(s => s.cells)); return cellsOf(r, c, len, horiz).every(i => !used.has(i));
}
export function randomFleet(rnd = Math.random, lens = SHIPS.map(s => s.len)) {
  for (let tries = 0; tries < 200; tries++) {
    const ships = []; let ok = true;
    for (const len of lens) {
      let placed = false;
      for (let k = 0; k < 200 && !placed; k++) { const horiz = rnd() < .5, r = Math.floor(rnd() * N), c = Math.floor(rnd() * N); if (canPlace(ships, len, r, c, horiz)) { ships.push({ len, cells: cellsOf(r, c, len, horiz), horiz }); placed = true; } }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('flotte impossible');
}
/** Résout un tir sur une flotte. shots = Set des cases déjà visées (avant ce tir). */
export function resolve(fleet, shots, i) {
  const ship = fleet.find(s => s.cells.includes(i)); if (!ship) return { r: 'miss' };
  const after = new Set(shots); after.add(i);
  if (ship.cells.every(x => after.has(x))) return { r: 'sunk', cells: ship.cells.slice(), len: ship.len, all: fleet.every(s => s.cells.every(x => after.has(x))) };
  return { r: 'hit' };
}
export const fleetValid = f => f.length === SHIPS.length && [...f].map(s => s.len).sort().join() === SHIPS.map(s => s.len).sort().join() && new Set(f.flatMap(s => s.cells)).size === 17;

/** view : 0 inconnu, 1 raté, 2 touché (bateau pas coulé), 3 coulé. left : longueurs des bateaux adverses encore à flot. */
export function aiShot(view, left, lv, rnd = Math.random) {
  const free = []; for (let i = 0; i < 100; i++) if (!view[i]) free.push(i);
  const pickR = a => a[Math.floor(rnd() * a.length)];
  const hits = []; for (let i = 0; i < 100; i++) if (view[i] === 2) hits.push(i);
  const nb = i => { const r = (i / N) | 0, c = i % N, o = []; if (r > 0) o.push(i - N); if (r < N - 1) o.push(i + N); if (c > 0) o.push(i - 1); if (c < N - 1) o.push(i + 1); return o; };
  if (lv === 1) return pickR(free);
  if (hits.length) {
    if (lv === 2) { const t = hits.flatMap(nb).filter(i => !view[i]); if (t.length && rnd() < .3) return pickR(t); return pickR(free); }
    // prolonger une ligne de touches si possible
    const line = []; if (lv >= 4) {
    for (const h of hits) { const r = (h / N) | 0, c = h % N;
      for (const [dr, dc] of [[0, 1], [1, 0]]) { const r2 = r + dr, c2 = c + dc; if (r2 >= N || c2 >= N || view[r2 * N + c2] !== 2) continue;
        let ra = r, ca = c; while (ra - dr >= 0 && ca - dc >= 0 && view[(ra - dr) * N + ca - dc] === 2) { ra -= dr; ca -= dc; }
        let rb = r2, cb = c2; while (rb + dr < N && cb + dc < N && view[(rb + dr) * N + cb + dc] === 2) { rb += dr; cb += dc; }
        if (ra - dr >= 0 && ca - dc >= 0 && !view[(ra - dr) * N + ca - dc]) line.push((ra - dr) * N + ca - dc);
        if (rb + dr < N && cb + dc < N && !view[(rb + dr) * N + cb + dc]) line.push((rb + dr) * N + cb + dc); } }
    } if (line.length) return pickR(line);
    if (lv >= 5) return density(view, left, true, rnd);
    const t = hits.flatMap(nb).filter(i => !view[i]); if (t.length) return pickR(t);
  }
  if (lv === 3) return pickR(free);
  if (lv === 4) { const par = free.filter(i => (((i / N) | 0) + (i % N)) % 2 === 0); return pickR(par.length ? par : free); }
  return density(view, left, false, rnd);
}
function density(view, left, target, rnd) {
  const score = new Array(100).fill(0);
  for (const len of left) for (const horiz of [true, false]) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (horiz ? c + len > N : r + len > N) continue; const cells = cellsOf(r, c, len, horiz); let ok = true, h = 0;
    for (const i of cells) { if (view[i] === 1 || view[i] === 3) { ok = false; break; } if (view[i] === 2) h++; }
    if (!ok || (target && !h)) continue; const w = h ? 1 + h * 12 : 1; for (const i of cells) if (!view[i]) score[i] += w;
  }
  let best = -1, bi = []; for (let i = 0; i < 100; i++) if (!view[i]) { if (score[i] > best) { best = score[i]; bi = [i]; } else if (score[i] === best) bi.push(i); }
  return bi[Math.floor(rnd() * bi.length)];
}
