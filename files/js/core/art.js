// Dessins du jeu (SVG faits maison, aucun fichier à charger : ça marche hors connexion).
const wrap = (vb, inner, size = 64) => `<svg viewBox="${vb}" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;

import { R, SIZE } from './ui_rects.js';
function uiHtml(n, hh) { const r = R[n]; if (!r) return ''; const k = hh / r[3]; return `<span style="display:inline-block;width:${r[2] * k}px;height:${hh}px;background:url(img/ui.webp) -${r[0] * k}px -${r[1] * k}px/${SIZE[0] * k}px ${SIZE[1] * k}px no-repeat"></span>`; }
export const art = {
  /** Pixo, la mascotte : un petit robot rond et souriant. */
  mascot(size = 120) {
    return wrap('0 0 120 120', `
      <line x1="60" y1="14" x2="60" y2="28" stroke="#9aa6cf" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="11" r="7" fill="#ffb020"/>
      <rect x="22" y="28" width="76" height="62" rx="26" fill="#27e0b3"/><rect x="22" y="28" width="76" height="62" rx="26" fill="none" stroke="#0f9c7c" stroke-width="4"/>
      <circle cx="44" cy="56" r="11" fill="#fff"/><circle cx="76" cy="56" r="11" fill="#fff"/>
      <circle cx="46" cy="58" r="5" fill="#0b1020"/><circle cx="78" cy="58" r="5" fill="#0b1020"/>
      <path d="M44 74 Q60 88 76 74" stroke="#0b1020" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle cx="31" cy="72" r="5" fill="#ff8aa0" opacity=".8"/><circle cx="89" cy="72" r="5" fill="#ff8aa0" opacity=".8"/>
      <rect x="40" y="92" width="40" height="18" rx="8" fill="#4da3ff"/><rect x="12" y="52" width="10" height="22" rx="5" fill="#0f9c7c"/><rect x="98" y="52" width="10" height="22" rx="5" fill="#0f9c7c"/>`, size);
  },
  /** Rémi : un gars rigolo avec une casquette. */
  remi(size = 120) {
    if (document.documentElement.classList.contains('ui')) return uiHtml('r_h0', size * 1.1);
    return wrap('0 0 120 120', `<circle cx="60" cy="68" r="38" fill="#ffd2a6" stroke="#c98f5a" stroke-width="3"/>
      <path d="M22 56 Q60 8 98 56 Z" fill="#ff7a90"/><rect x="18" y="52" width="60" height="9" rx="4" fill="#d8556c"/>
      <circle cx="46" cy="70" r="6" fill="#fff"/><circle cx="76" cy="70" r="6" fill="#fff"/><circle cx="48" cy="71" r="3" fill="#0b1020"/><circle cx="78" cy="71" r="3" fill="#0b1020"/>
      <path d="M42 88 Q61 106 80 88" stroke="#0b1020" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M52 60 L64 57 M72 57 L84 60" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>`, size);
  },
  soleil(size = 64) {
    return wrap('0 0 64 64', `<circle cx="32" cy="32" r="14" fill="#ffd24d" stroke="#b8860b" stroke-width="3"/><path d="M32 6V14M32 50V58M6 32H14M50 32H58M14 14L20 20M44 44L50 50M50 14L44 20M14 50L20 44" stroke="#ffb020" stroke-width="4" stroke-linecap="round"/>`, size);
  },
  patate(size = 64) {
    return wrap('0 0 64 64', `<circle cx="30" cy="38" r="20" fill="#ff5470" stroke="#8e1f3a" stroke-width="3"/><rect x="25" y="10" width="10" height="9" rx="2" fill="#7d8499"/><path d="M33 10 Q40 2 48 6" stroke="#cfa56a" stroke-width="3" fill="none"/><circle cx="49" cy="6" r="4" fill="#ffb020"/>`, size);
  },
  billes(size = 64) {
    return wrap('0 0 64 64', `<circle cx="32" cy="32" r="26" fill="#10172e" stroke="#34407a" stroke-width="3"/><circle cx="20" cy="22" r="7" fill="#05070f"/><circle cx="44" cy="18" r="6" fill="#05070f"/><circle cx="36" cy="44" r="9" fill="#27e0b3"/>`, size);
  },
  cris(size = 64) {
    return wrap('0 0 64 64', `<path d="M8 24 H20 L36 10 V54 L20 40 H8Z" fill="#ff7a90" stroke="#a83c52" stroke-width="3" stroke-linejoin="round"/><path d="M44 22 Q52 32 44 42 M50 14 Q64 32 50 50" stroke="#ffb020" stroke-width="4" fill="none" stroke-linecap="round"/>`, size);
  },
  chirurgien(size = 64) {
    return wrap('0 0 64 64', `<circle cx="32" cy="32" r="22" fill="none" stroke="#2fbf71" stroke-width="5"/><circle cx="32" cy="32" r="8" fill="#27e0b3"/><path d="M32 4V14M32 50V60M4 32H14M50 32H60" stroke="#9aa6cf" stroke-width="3"/>`, size);
  },
  pas(size = 64) {
    return wrap('0 0 64 64', `<path d="M20 8 Q30 6 32 18 L30 30 H16 Q14 14 20 8Z" fill="#4da3ff"/><path d="M38 28 Q48 26 50 38 L48 52 H34 Q32 36 38 28Z" fill="#27e0b3"/>`, size);
  },
  simon(size = 64) {
    return wrap('0 0 64 64', `<rect x="6" y="6" width="25" height="25" rx="8" fill="#ff5470"/><rect x="33" y="6" width="25" height="25" rx="8" fill="#2fbf71"/><rect x="6" y="33" width="25" height="25" rx="8" fill="#4da3ff"/><rect x="33" y="33" width="25" height="25" rx="8" fill="#ffd24d"/>`, size);
  },
  dessin(size = 64) {
    return wrap('0 0 64 64', `<path d="M10 54 L14 42 L44 12 L52 20 L22 50Z" fill="#ffd24d" stroke="#b8860b" stroke-width="3" stroke-linejoin="round"/><path d="M10 54 L14 42 L22 50Z" fill="#f3c9a0"/><path d="M40 16 L48 24" stroke="#b8860b" stroke-width="3"/>`, size);
  },
  tresor(size = 64) {
    return wrap('0 0 64 64', `<rect x="8" y="28" width="48" height="28" rx="6" fill="#a0642d" stroke="#6b3f17" stroke-width="3"/><path d="M8 34 Q32 6 56 34 Z" fill="#c98446" stroke="#6b3f17" stroke-width="3"/><rect x="26" y="32" width="12" height="14" rx="3" fill="#ffd24d" stroke="#b8860b" stroke-width="2"/><circle cx="32" cy="39" r="2.5" fill="#6b3f17"/>`, size);
  },
  foret(size = 64) {
    return wrap('0 0 64 64', `<path d="M32 4 L50 34 H40 L54 56 H10 L24 34 H14 Z" fill="#2fbf71" stroke="#1b7f4b" stroke-width="3" stroke-linejoin="round"/><rect x="28" y="56" width="8" height="7" fill="#a0642d"/>`, size);
  },
  missiles(size = 64) {
    return wrap('0 0 64 64', `<path d="M32 6 L50 52 L32 42 L14 52 Z" fill="#27e0b3" stroke="#0f9c7c" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="32" cy="28" r="5" fill="#fff"/><path d="M26 50 L32 62 L38 50" fill="#ffb020"/>`, size);
  },
  epee(size = 64) {
    return wrap('0 0 64 64', `<g transform="rotate(35 32 32)"><rect x="29" y="4" width="6" height="38" rx="2" fill="#dfe6ff"/><path d="M29 4 L32 0 L35 4Z" fill="#dfe6ff"/>
      <rect x="20" y="42" width="24" height="6" rx="3" fill="#ffb020"/><rect x="29" y="48" width="6" height="12" rx="3" fill="#a0642d"/></g>
      <g transform="rotate(-35 32 32)"><rect x="29" y="4" width="6" height="38" rx="2" fill="#ff7a90"/><path d="M29 4 L32 0 L35 4Z" fill="#ff7a90"/>
      <rect x="20" y="42" width="24" height="6" rx="3" fill="#ffb020"/><rect x="29" y="48" width="6" height="12" rx="3" fill="#a0642d"/></g>`, size);
  },
  vaisseau(size = 64) {
    return wrap('0 0 64 64', `<ellipse cx="32" cy="34" rx="26" ry="12" fill="#4da3ff"/><ellipse cx="32" cy="28" rx="12" ry="12" fill="#bfe0ff"/>
      <circle cx="18" cy="38" r="3" fill="#fff"/><circle cx="32" cy="41" r="3" fill="#fff"/><circle cx="46" cy="38" r="3" fill="#fff"/>
      <path d="M22 48 L18 60 M42 48 L46 60" stroke="#ffb020" stroke-width="4" stroke-linecap="round"/>`, size);
  },
  radar(size = 64) {
    return wrap('0 0 64 64', `<circle cx="32" cy="32" r="26" fill="#0f2a3a" stroke="#27e0b3" stroke-width="3"/><circle cx="32" cy="32" r="16" fill="none" stroke="#27e0b3" stroke-width="2" opacity=".6"/>
      <path d="M32 32 L32 8 A24 24 0 0 1 52 20 Z" fill="#27e0b3" opacity=".35"/><circle cx="44" cy="22" r="4" fill="#ff5470"/><circle cx="32" cy="32" r="3" fill="#fff"/>`, size);
  },
};
export const GAME_COLORS = { missiles: '#27e0b3', epee: '#ff7a90', vaisseau: '#4da3ff', radar: '#ffb020', foret: '#2fbf71', tresor: '#ffd24d', soleil: '#ffb020', patate: '#ff5470', billes: '#27e0b3', cris: '#ff7a90', chirurgien: '#2fbf71', pas: '#4da3ff', simon: '#b07cff', dessin: '#ffd24d' };
