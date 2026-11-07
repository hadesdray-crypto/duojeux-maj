// Mer du Duel de bateaux : îles solides et rochers fissurés, tirés d'une graine commune aux deux téléphones.
// Les positions sont données dans le repère de l'HÔTE (son bateau en bas) ; l'invité les retourne avec mirror().
// Même générateur que core/kit.js (copié ici pour ne pas lier ce fichier au kit : Rémi l'utilise aussi).
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

export const FRAG = 3, DEB_V = 270; // débris par rocher détruit, vitesse des débris (px/s)

// Limites de jeu (repère de l'HÔTE, 360 x 560) : mon bateau évolue entre BOAT_YMIN et BOAT_YMAX, les obstacles restent dans la bande du milieu OBS_Y0..OBS_Y1
// (symétrique : l'autre bateau, vu en miroir, a exactement la même zone libre). Aucun obstacle dans la zone du bas : on peut toujours se déplacer et tirer.
export const BOAT_YMIN = 380, BOAT_YMAX = 520, OBS_Y0 = 215, OBS_Y1 = 345, CORRIDOR = 48, BOAT_HX = 18, BOAT_HY = 34;
/** Nombre d'obstacles selon la manche (0 = première) : très peu au début, +1 ou +2 par manche, plafonné. */
export const obstacleCount = manche => Math.min(7, 2 + Math.floor(Math.max(0, manche | 0) * 1.5));

export function buildWorld(seed, manche = 0) {
  const r = rng(seed), obs = []; let id = 0, n = obstacleCount(manche);
  // Un couloir vertical libre (largeur 2 x CORRIDOR) traverse toute la mer : les boulets et les bateaux ont toujours un passage.
  const cx = 90 + r() * 180;
  const kinds = ['isle', 'rock']; while (kinds.length < n) kinds.push(r() < .55 ? 'rock' : 'isle');
  kinds.length = n; kinds.sort(() => r() - .5);
  for (const kd of kinds) {
    const rock = kd === 'rock';
    for (let t = 0; t < 250; t++) {
      const rr = rock ? 23 + r() * 5 : 29 + r() * 5, x = rr + 10 + r() * (340 - 2 * rr), y = OBS_Y0 + r() * (OBS_Y1 - OBS_Y0);
      if (Math.abs(x - cx) < rr + CORRIDOR) continue;
      if (obs.some(o => Math.hypot(o.x - x, o.y - y) < o.r + rr + 10)) continue;
      obs.push(rock ? { id: id++, k: 'rock', x, y, r: rr, hp: 2 + (r() < .5 ? 1 : 0), max: 0, v: r() < .5 ? 1 : 2, a: r() * 6.28 } : { id: id++, k: 'isle', x, y, r: rr, v: 0 });
      break;
    }
  }
  for (const o of obs) if (o.k === 'rock') o.max = o.hp;
  return obs;
}
/** Même mer vue de l'autre bateau (rotation d'un demi-tour). */
export const mirror = obs => obs.map(o => ({ ...o, x: 360 - o.x, y: 560 - o.y }));
export const alive = o => o.k !== 'rock' || o.hp > 0;
/** Premier obstacle rencontré par un boulet de rayon 6 qui part de (x, y0) vers le haut (dir=-1) ou vers le bas (dir=+1). */
export function firstBlock(obs, x, y0, dir) {
  let best = null, bd = 1e9;
  for (const o of obs) { if (!alive(o) || Math.abs(x - o.x) >= o.r + 6) continue; const d = (o.y - y0) * dir; if (d > -o.r && d < bd) { bd = d; best = o; } }
  return best;
}
/** Où tombent les débris d'un rocher détruit : autour de la position tx du bateau visé (repère de celui qui a détruit), décalage tiré de la graine s. */
export function fragTargets(tx, s) {
  const r = rng(s); return Array.from({ length: FRAG }, (_, i) => Math.max(24, Math.min(336, tx + (i - 1) * 62 + (r() - .5) * 30)));
}
