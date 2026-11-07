// Petit lecteur d'atlas d'images (même principe que sprites.js) pour les planches mer.webp et duel.webp.
export function makeAtlas(url, R) {
  const IMG = new Image(); IMG.onload = () => { IMG.ok = true; }; IMG.onerror = () => { IMG.ok = false; }; IMG.src = url;
  const rect = n => R[n];
  const ready = () => !!IMG.ok;
  const spr = (g, n, x, y, w, h) => { const r = R[n]; if (!r || !IMG.ok) return false; if (w != null && h == null) h = w * r[3] / r[2]; g.drawImage(IMG, r[0], r[1], r[2], r[3], x, y, w == null ? r[2] : w, h == null ? r[3] : h); return true; };
  /** Centré en (cx,cy) ; `size` = plus grand côté. */
  const sprC = (g, n, cx, cy, size) => { const r = R[n]; if (!r) return false; const k = size / Math.max(r[2], r[3]); return spr(g, n, cx - r[2] * k / 2, cy - r[3] * k / 2, r[2] * k, r[3] * k); };
  /** Centré, largeur imposée `w` (hauteur proportionnelle). */
  const sprW = (g, n, cx, cy, w) => { const r = R[n]; if (!r) return false; const k = w / r[2]; return spr(g, n, cx - w / 2, cy - r[3] * k / 2, w, r[3] * k); };
  /** Centré, hauteur imposée `hh`. */
  const sprH = (g, n, cx, cy, hh) => { const r = R[n]; if (!r) return false; const k = hh / r[3]; return spr(g, n, cx - r[2] * k / 2, cy - hh / 2, r[2] * k, hh); };
  return { rect, ready, spr, sprC, sprW, sprH, img: IMG };
}
