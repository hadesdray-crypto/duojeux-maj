// Logo « poignée de main dans un cercle » : plusieurs styles au choix (dessinés en SVG, marchent hors connexion).
const hands = (a, b, s1, s2, line, cuff = line) => `
  <clipPath id="cc"><circle cx="60" cy="60" r="50"/></clipPath>
  <g clip-path="url(#cc)" stroke="${line}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
    <rect x="-8" y="48" width="42" height="34" rx="4" fill="${a}"/><line x1="34" y1="48" x2="34" y2="82" stroke="${cuff}" stroke-width="5"/>
    <rect x="86" y="48" width="42" height="34" rx="4" fill="${b}"/><line x1="86" y1="48" x2="86" y2="82" stroke="${cuff}" stroke-width="5"/>
    <path d="M36 52 L58 48 Q72 46 84 52 L84 76 L70 82 L36 78Z" fill="${s2}"/>
    <path d="M38 54 L60 56 L74 50 L84 56 L84 72 L72 70 L38 76Z" fill="${s1}"/>
    <rect x="44" y="68" width="9" height="20" rx="4.5" fill="${s2}" transform="rotate(-12 48 78)"/>
    <rect x="53" y="70" width="9" height="21" rx="4.5" fill="${s2}" transform="rotate(-8 57 80)"/>
    <rect x="62" y="70" width="9" height="21" rx="4.5" fill="${s2}" transform="rotate(-4 66 80)"/>
    <rect x="71" y="68" width="9" height="19" rx="4.5" fill="${s2}"/>
    <path d="M40 56 Q56 38 76 48 L72 58 Q58 52 46 62Z" fill="${s1}"/>
  </g>`;
const V = {
  neon: (c = '#0b1020') => `<circle cx="60" cy="60" r="56" fill="${c}" stroke="#27e0b3" stroke-width="5"/>${hands('#4da3ff', '#ff7a90', '#f3c9a0', '#c98e63', '#0b1020')}`,
  soleil: () => `<circle cx="60" cy="60" r="56" fill="#ffd24d" stroke="#b8860b" stroke-width="5"/>${hands('#2f6fd6', '#d63a5a', '#ffe2c2', '#b9835a', '#5a3a1a')}`,
  badge: () => `<circle cx="60" cy="60" r="56" fill="#1b2a6b" stroke="#ffd24d" stroke-width="6"/><circle cx="60" cy="60" r="47" fill="none" stroke="#ffd24d" stroke-width="2" stroke-dasharray="3 5"/>${hands('#ffb020', '#27e0b3', '#f3c9a0', '#d4a07a', '#1b2a6b')}`,
  vert: () => `<circle cx="60" cy="60" r="56" fill="#2fbf71" stroke="#fff" stroke-width="5"/>${hands('#fff', '#0b1020', '#ffe2c2', '#8a5a3a', '#0b3d22')}`,
  violet: () => `<defs><linearGradient id="gv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b07cff"/><stop offset="1" stop-color="#ff5470"/></linearGradient></defs><circle cx="60" cy="60" r="56" fill="url(#gv)" stroke="#fff" stroke-width="4"/>${hands('#fff', '#fff', '#ffe2c2', '#d9a37a', '#3a1a5a')}`,
  contour: () => `<circle cx="60" cy="60" r="56" fill="#0b1020" stroke="#fff" stroke-width="3"/>${hands('none', 'none', '#0b1020', '#0b1020', '#fff')}`,
};
export const LOGOS = Object.keys(V);
const svgLogo = (name, size) => `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Duo Jeux">${(V[name] || V.neon)()}</svg>`;

if (typeof window !== 'undefined') window.__logoSvg = svgLogo;
const EMB = { neon: 'e4' };
// Emblème peint (img/logo/e4.webp) ; repli sur le dessin SVG.
export const logoSvg = (name = 'neon', size = 96) => EMB[name] ? `<img src="img/logo/${EMB[name]}.webp" width="${size}" height="${size}" alt="Duo Jeux" style="object-fit:contain;display:block" onerror="this.outerHTML=window.__logoSvg('${name}',${size})">` : svgLogo(name, size);
