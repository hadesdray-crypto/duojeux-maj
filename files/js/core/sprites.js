// Planche d'images dessinées (img/art.webp) : on y prend un sprite par son nom (voir scripts/cut-art.py pour la liste).
import { R, SIZE } from './art_rects.js';
const IMG = new Image(); IMG.onload = () => { IMG.ok = true; }; IMG.onerror = () => { IMG.ok = false; }; IMG.src = 'img/art.webp';
export const sheetImg = IMG;
export const rect = n => R[n];
export const ready = () => !!IMG.ok;
/** Dessine le sprite `n` dans un canvas : (x,y) = coin haut-gauche ; w/h optionnels (sinon taille d'origine). Garde les proportions si seul w est donné. Renvoie false si pas prêt. */
export function spr(g, n, x, y, w, h) {
  const r = R[n]; if (!r || !IMG.ok) return false;
  if (w != null && h == null) h = w * r[3] / r[2];
  g.drawImage(IMG, r[0], r[1], r[2], r[3], x, y, w == null ? r[2] : w, h == null ? r[3] : h); return true;
}
/** Idem mais centré sur (cx,cy), taille maximale `size` (le plus grand côté). */
export function sprC(g, n, cx, cy, size) {
  const r = R[n]; if (!r) return false; const k = size / Math.max(r[2], r[3]); return spr(g, n, cx - r[2] * k / 2, cy - r[3] * k / 2, r[2] * k, r[3] * k);
}
/** Élément HTML (div) montrant le sprite `n`, dont le plus grand côté fait `size` px. Pour les jeux en HTML. */
export function sprEl(n, size, extra = '') {
  const r = R[n]; const d = document.createElement('div'); if (!r) return d;
  const k = size / Math.max(r[2], r[3]);
  d.style.cssText = `width:${r[2] * k}px;height:${r[3] * k}px;background:url(img/art.webp) -${r[0] * k}px -${r[1] * k}px/${SIZE[0] * k}px ${SIZE[1] * k}px no-repeat;flex:none;${extra}`; d.setAttribute('role', 'img'); return d;
}
/** Change le sprite d'un élément créé par sprEl (même taille max). */
export function sprSet(d, n, size) {
  const r = R[n]; if (!r) return; const k = size / Math.max(r[2], r[3]);
  d.style.width = r[2] * k + 'px'; d.style.height = r[3] * k + 'px'; d.style.backgroundPosition = `-${r[0] * k}px -${r[1] * k}px`; d.style.backgroundSize = `${SIZE[0] * k}px ${SIZE[1] * k}px`;
}
/** Décors : 'space' | 'deck' | 'storm' | 'radar' | 'forest' | 'island' (fichiers img/bg/NOM.webp). */
export const bgUrl = n => `img/bg/${n}.webp`;
