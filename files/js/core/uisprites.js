// Sprites d'interface (atlas img/ui.webp) : même principe que sprites.js
import { R, SIZE } from './ui_rects.js';
export const URL = 'img/ui.webp';
export const has = (n) => !!R[n];
export function uiEl(n, cls = '', h = 0) {
  const r = R[n]; const e = document.createElement('span');
  if (!r) return e;
  const k = h ? h / r[3] : 1;
  e.className = 'uis ' + cls;
  e.style.cssText = `display:inline-block;width:${r[2] * k}px;height:${r[3] * k}px;background:url(${URL}) -${r[0] * k}px -${r[1] * k}px/${SIZE[0] * k}px ${SIZE[1] * k}px no-repeat`;
  return e;
}
