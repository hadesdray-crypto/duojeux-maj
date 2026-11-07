// Petites illustrations pirates dessinées en code (SVG, 48x48). Servent de faces de cartes (memory, 7 familles).
const G = '#d9a441', GD = '#a8741c', INK = '#1b2340', RED = '#d94a4a', BLU = '#3b86d6', WOOD = '#8a5a2b', WOODD = '#5a3516', PARCH = '#f2e3b8';
const line = (d, c = G, w = 3.5) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circ = (x, y, r, f, s, w = 2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"${s ? ` stroke="${s}" stroke-width="${w}"` : ''}/>`;
const el = (x, y, rx, ry, f, s, w = 2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}"${s ? ` stroke="${s}" stroke-width="${w}"` : ''}/>`;
const poly = (p, f, s, w = 2) => `<path d="${p}" fill="${f}"${s && s !== 'none' ? ` stroke="${s}" stroke-width="${w}"` : ''} stroke-linejoin="round"/>`;
const rect = (x, y, w, h, f, s, r = 2, sw = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}"${s ? ` stroke="${s}" stroke-width="${sw}"` : ''}/>`;
const ship = (masts, hull) => {
  let s = poly('M6 32h36l-6 9H12z', hull, INK) + rect(8, 30, 32, 3, WOODD);
  const xs = masts === 1 ? [24] : masts === 2 ? [17, 31] : [12, 24, 36];
  xs.forEach(x => { s += rect(x - 1, 8, 2, 24, WOODD) + poly(`M${x + 1} 10q10 8 0 18z`, '#f6ecd2', '#8c7a55', 1.5); });
  return s;
};
const star = (cx, cy, R, r, f, s) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * q).toFixed(1) + ' ' + (cy + Math.sin(a) * q).toFixed(1); } return poly(d + 'z', f, s, 1.8); };
export const ICONS = {
  anchor: () => circ(24, 9, 4.5, 'none', G, 3.5) + line('M24 14v27M15 21h18M8 31c1 8 8 11 16 11s15-3 16-11M8 31l-3-5M40 31l3-5'),
  wheel: () => circ(24, 24, 13, 'none', WOOD, 4) + circ(24, 24, 4.5, G, GD) + [0, 45, 90, 135].map(a => `<g transform="rotate(${a} 24 24)">${rect(22.5, 3, 3, 42, WOOD, null, 1)}${circ(24, 4.5, 3, G)}${circ(24, 43.5, 3, G)}</g>`).join(''),
  skull: () => poly('M10 22c0-9 6-15 14-15s14 6 14 15c0 5-2 8-5 10v6H15v-6c-3-2-5-5-5-10z', '#f5f1e6', INK) + circ(18, 23, 4.5, INK) + circ(30, 23, 4.5, INK) + poly('M24 28l-2.5 4h5z', INK) + line('M19 38v-4M24 38v-4M29 38v-4', INK, 2),
  chest: () => poly('M7 21c0-8 7-13 17-13s17 5 17 13z', WOOD, INK) + rect(7, 21, 34, 18, '#a4692f', INK) + rect(7, 25, 34, 4, G, GD, 0, 1.2) + rect(20, 22, 8, 10, G, GD, 2, 1.5) + circ(24, 27, 1.8, INK),
  coin: () => circ(24, 24, 17, G, GD, 3) + circ(24, 24, 12, 'none', GD, 1.8) + star(24, 24, 8, 3.5, '#f7d774', GD),
  sword: () => poly('M36 6l6-1-1 6-18 19-5-5z', '#cfd6e2', INK) + poly('M15 27l6 6-3 3-6-6z', G, GD) + line('M17 35l-7 7', WOODD, 4.5) + circ(9, 43, 2.5, G, GD, 1.5),
  key: () => circ(15, 15, 9, 'none', G, 5) + line('M22 22l19 19M33 33l5-5M38 38l4-4', G, 4.5),
  compass: () => circ(24, 24, 18, '#f2e3b8', GD, 3) + poly('M24 8l5 16h-10z', RED, INK, 1.5) + poly('M24 40l5-16h-10z', '#f5f1e6', INK, 1.5) + circ(24, 24, 2, INK),
  flag: () => rect(10, 5, 3.5, 38, WOODD, null, 1) + poly('M14 8h26l-5 8 5 8H14z', '#1b2030', '#000', 1.5) + circ(26, 15, 3.5, '#f5f1e6') + line('M21 21l10-4M21 17l10 4', '#f5f1e6', 1.5),
  cannon: () => rect(8, 17, 30, 12, '#4b5163', INK, 5) + rect(35, 15, 6, 16, '#3a3f4e', INK, 2) + circ(18, 35, 7.5, WOOD, WOODD, 2.5) + circ(18, 35, 2.5, G),
  hook: () => line('M24 5v20c0 9 12 9 12 0v-4', '#cfd6e2', 5) + poly('M36 21l-4 5h8z', '#cfd6e2', INK, 1.5) + circ(24, 7, 3.5, 'none', G, 2.5),
  parrot: () => el(23, 28, 10, 15, '#3aa65a', INK) + circ(26, 12, 8, RED, INK) + poly('M31 11q8 1 5 8l-6-3z', '#f4b942', INK, 1.5) + circ(27, 10, 1.8, '#fff') + circ(27.5, 10, .8, INK) + poly('M18 38l-5 7 8-4zM25 41l-1 6 6-5z', BLU, INK, 1.5),
  starfish: () => star(24, 25, 20, 9, '#ff8a3d', '#a8420b') + circ(24, 25, 2, '#ffd9b0') + circ(24, 14, 1.4, '#ffd9b0') + circ(33, 22, 1.4, '#ffd9b0') + circ(15, 22, 1.4, '#ffd9b0'),
  shell: () => poly('M24 40C10 38 6 26 8 18c4-8 10-10 16-10s12 2 16 10c2 8-2 20-16 22z', '#f7c5c9', '#b86a74') + line('M24 40V10M24 40L12 14M24 40l-16-16M24 40L36 14M24 40l16-16', '#b86a74', 1.6),
  bottle: () => poly('M20 4h8v8l4 6v24H16V18l4-6z', '#59b98d', '#1f6a4c') + rect(20, 2, 8, 4, WOOD, WOODD, 1) + poly('M19 26h10v9H19z', PARCH, '#8c7a55', 1) + line('M21 29h6M21 32h6', '#8c7a55', 1),
  palm: () => poly('M22 44c1-12 1-20 6-30l3 1c-3 10-3 18-3 29z', WOOD, WOODD, 1.5) + ['M28 14q-12-9-23 0q12-3 23 0', 'M28 14q-6-12-18-10q10 3 18 10', 'M28 14q12-9 23 0q-12-3-23 0', 'M28 14q4-13 17-9q-10 3-17 9'].map(d => poly(d, '#3aa65a', '#1f6a3c', 1.5)).join('') + circ(27, 17, 2.5, WOODD) + circ(31, 17, 2.5, WOODD),
  palm2: () => ICONS.palm() + circ(26.5, 20, 3.2, '#6b4a1c', INK, 1) + circ(31.5, 19.5, 3.2, '#6b4a1c', INK, 1),
  ship1: () => ship(1, '#8a5a2b'), ship2: () => ship(2, '#6b4a8a'), ship3: () => ship(3, '#2f7f78'), ship1b: () => ship(1, '#a8421f'), ship2b: () => ship(2, '#2f5fa8'), ship3b: () => ship(3, '#1b2340'),
  telescope: () => `<g transform="rotate(-35 24 24)">${rect(4, 19, 14, 10, WOOD, WOODD, 2)}${rect(16, 17, 14, 14, G, GD, 2)}${rect(28, 14, 16, 20, '#cfd6e2', INK, 3)}${circ(44, 24, 3, '#8fd3ff', INK, 1.5)}</g>`,
  map: () => poly('M6 10l12-3 12 4 12-3v30l-12 3-12-4-12 3z', PARCH, '#8c7a55') + line('M18 7v30M30 11v30', '#c8b27a', 1.5) + line('M16 20l8 8M24 20l-8 8', RED, 3.5) + line('M31 33q4-3 8 0', '#8c7a55', 1.5),
  barrel: () => poly('M12 6h24q5 18 0 36H12q-5-18 0-36z', WOOD, WOODD) + rect(9, 12, 30, 3.5, '#6b7280', INK, 1, 1) + rect(9, 32.5, 30, 3.5, '#6b7280', INK, 1, 1) + line('M20 6q-2 18 0 36M28 6q2 18 0 36', WOODD, 1.5),
  fish: () => el(21, 24, 14, 9, BLU, INK) + poly('M33 24l10-9v18z', '#4aa0ff', INK) + circ(14, 22, 2.2, '#fff') + circ(14, 22, 1, INK) + line('M22 17q3 7 0 14', '#8fc3ff', 1.8),
  crab: () => el(24, 28, 13, 9, RED, INK) + line('M13 24l-6-7M35 24l6-7M13 30l-7 3M35 30l7 3', RED, 3) + circ(8, 14, 4.5, RED, INK) + circ(40, 14, 4.5, RED, INK) + circ(20, 20, 2.5, '#fff', INK, 1) + circ(28, 20, 2.5, '#fff', INK, 1),
  octopus: () => poly('M10 24c0-9 6-16 14-16s14 7 14 16c0 4-1 6-3 7l2 10-5-3-3 6-3-7-3 7-3-6-5 3 2-10c-2-1-3-3-3-7z', '#a56bd6', INK) + circ(19, 22, 3, '#fff') + circ(29, 22, 3, '#fff') + circ(19, 22, 1.3, INK) + circ(29, 22, 1.3, INK),
  whale: () => poly('M5 30c0-10 8-16 19-16 6 0 10 2 13 5l7-6-1 12c-2 8-10 14-20 14S5 38 5 30z', '#4f7fd6', INK) + circ(15, 26, 1.8, INK) + line('M22 14q-3-8-8-9M22 14q3-8 8-9', '#8fd3ff', 2.5),
  turtle: () => el(24, 26, 15, 11, '#3aa65a', INK) + [[17, 24], [24, 21], [31, 24], [20, 31], [28, 31]].map(p => poly(`M${p[0] - 4} ${p[1]}l4-3 4 3-4 4z`, '#7ad28f', INK, 1)).join('') + circ(41, 23, 4, '#7ad28f', INK) + circ(42.5, 22, .9, INK) + poly('M12 34l-4 5h6zM36 34l4 5h-6z', '#7ad28f', INK, 1.5),
  shark: () => poly('M4 30c8-12 22-16 34-10l6-8-1 14c-6 10-22 14-39 4z', '#7d8aa3', INK) + poly('M22 20l4-12 6 13z', '#7d8aa3', INK) + circ(34, 23, 1.6, INK) + line('M30 27l1 3M33 27l1 3M36 26l1 3', '#fff', 1.4),
  crown: () => poly('M6 36l3-20 9 10 6-14 6 14 9-10 3 20z', G, GD) + rect(6, 36, 36, 6, '#f7d774', GD, 1) + circ(9, 14, 2.5, RED) + circ(24, 10, 2.5, '#6bd0ff') + circ(39, 14, 2.5, RED),
  volcano: () => poly('M4 42l14-26h12l14 26z', '#6b5446', INK) + poly('M18 16h12l-3 4h-6z', '#ff7a2f', '#c43f00', 1.5) + line('M22 8q-3-4 1-6M28 9q4-4 0-7', '#a8a8b3', 2.5) + line('M22 20l-3 22M26 20l3 22', '#ff9a4f', 2),
  pistol: () => poly('M6 14h30v8H20l-4 4 4 18h-8L8 22H6z', '#4b5163', INK) + rect(34, 12, 8, 12, '#3a3f4e', INK, 2) + poly('M14 24l-3 14h6z', WOOD, WOODD, 1.5) + circ(26, 20, 2, G),
  ball: () => circ(24, 26, 15, '#2b303b', INK, 2.5) + el(19, 19, 5, 3.5, '#8a93a6', null) + line('M34 12q3-6 8-6', WOOD, 2.5) + star(43, 5, 4, 1.6, '#ffb020'),
  axe: () => line('M12 42l24-30', WOOD, 5) + poly('M26 8c10-3 15 2 14 9-4 1-9 0-12-3z', '#cfd6e2', INK, 2),
  sun: () => circ(24, 24, 10, '#ffd24d', '#e09a00', 2.5) + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<g transform="rotate(${a} 24 24)">${rect(22.5, 3, 3, 8, '#ffb020', null, 1.5)}</g>`).join(''),
  moon: () => poly('M30 5a19 19 0 1 0 13 28A16 16 0 0 1 30 5z', '#f7e9a7', '#c9b14a') + circ(18, 22, 2, '#e3d27c') + circ(24, 33, 2.4, '#e3d27c'),
  star: () => star(24, 25, 20, 9, '#ffd24d', '#c98b00'),
  cloud: () => poly('M12 36a8 8 0 0 1 1-16 11 11 0 0 1 21-3 9 9 0 0 1 3 19z', '#e8eef7', '#8fa0bb', 2.5),
  storm: () => poly('M12 28a8 8 0 0 1 1-15 11 11 0 0 1 21-3 9 9 0 0 1 3 18z', '#7d8aa3', INK, 2) + poly('M25 24l-8 12h6l-3 10 11-14h-6l4-8z', '#ffd24d', '#c98b00', 1.5),
  rainbow: () => ['#e8453c', '#ff9f2f', '#ffd24d', '#3aa65a', '#3b86d6'].map((c, i) => line(`M${5 + i * 3} 38a${19 - i * 3} ${19 - i * 3} 0 0 1 ${38 - i * 6} 0`, c, 3)).join('') + el(8, 40, 6, 3.5, '#e8eef7') + el(40, 40, 6, 3.5, '#e8eef7'),
  heart: () => poly('M24 41C8 30 5 21 5 15a9 9 0 0 1 19-2 9 9 0 0 1 19 2c0 6-3 15-19 26z', '#e8453c', '#8b1d18'),
  jewel: () => poly('M24 5l15 9-4 22-11 8-11-8-4-22z', '#4fd1d9', '#0b6f78') + poly('M24 5l-6 10 6 24 6-24z', '#9be8ee', 'none') + line('M9 14h30', '#0b6f78', 1.5),
  ring: () => circ(24, 30, 12, 'none', G, 5) + poly('M18 14l6-8 6 8-6 6z', '#7ad0ff', '#2a6f9c', 1.8),
};
export const iconSvg = (name, size = 44) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${(ICONS[name] || ICONS.star)()}</svg>`;
