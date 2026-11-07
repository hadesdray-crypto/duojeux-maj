// Lot B : jeux de cartes à deux (bataille, memory, 7 familles, blackjack).
// Pour les brancher : dans games/index.js, importer ce fichier et ajouter « ...packB » à la liste GAMES.
// Ce fichier enregistre lui-même les cerveaux de Rémi, les besoins de capteurs, les couleurs et les couvertures de repli.
import bataille, { brain as bBrain } from './bataille.js';
import memory, { brain as mBrain } from './memory.js';
import familles, { brain as fBrain } from './familles.js';
import blackjack, { brain as jBrain } from './blackjack.js';
import { registerBrain } from '../core/remi.js';
import { GAME_NEEDS } from '../core/models.js';
import { GAME_COLORS, art } from '../core/art.js';
import { iconSvg } from './cards_icons.js';

registerBrain('bataille', bBrain); registerBrain('memory', mBrain); registerBrain('familles', fBrain); registerBrain('blackjack', jBrain);
for (const id of ['bataille', 'memory', 'familles', 'blackjack']) GAME_NEEDS[id] = GAME_NEEDS[id] || { needs: [], opt: ['vibrate'] };
Object.assign(GAME_COLORS, { bataille: '#ff7a90', memory: '#27e0b3', familles: '#ffb020', blackjack: '#b07cff' });

/* Couvertures de repli (dessinées en code, vues de face, même style que les cartes). */
const at = (svg, x, y) => svg.replace('<svg ', `<svg x="${x}" y="${y}" `);
const card = (x, y, rot, inner, back) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-20" y="-28" width="40" height="56" rx="5" fill="${back ? '#1a2a6c' : '#f6ecc8'}" stroke="#d9a441" stroke-width="2"/>${inner}</g>`;
const cover = body => size => `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
art.bataille = cover(card(36, 52, -12, at(iconSvg('crown', 28), -14, -14), false) + card(64, 50, 10, at(iconSvg('anchor', 26), -13, -13), true));
art.memory = cover([[20, 22], [54, 22], [20, 58], [54, 58]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="26" height="32" rx="4" fill="${i === 1 || i === 2 ? '#f6ecc8' : '#1a2a6c'}" stroke="#d9a441" stroke-width="2"/>` + (i === 1 || i === 2 ? at(iconSvg('chest', 20), x + 3, y + 6) : '')).join(''));
art.familles = cover(card(32, 52, -14, at(iconSvg('compass', 26), -13, -13), false) + card(50, 48, 0, at(iconSvg('shark', 26), -13, -13), false) + card(68, 52, 14, at(iconSvg('parrot', 26), -13, -13), false));
art.blackjack = cover(card(36, 52, -10, '<text x="0" y="8" text-anchor="middle" font-size="26" font-weight="800" font-family="Georgia,serif" fill="#1b2340">A</text>', false) + card(64, 50, 10, '<text x="0" y="8" text-anchor="middle" font-size="24" font-weight="800" font-family="Georgia,serif" fill="#c8302f">21</text>', false));

export default [bataille, memory, familles, blackjack];
export const packB = [bataille, memory, familles, blackjack];
