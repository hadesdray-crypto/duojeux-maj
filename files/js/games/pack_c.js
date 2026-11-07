// Pack C « Réflexe et réflexion » : 5 jeux à deux. Pour les ajouter à l'appli, dans games/index.js :
//   import { registerPackC } from './pack_c.js';  …  registerPackC(GAMES);   (après la définition de GAMES)
// registerPackC ajoute aussi les besoins (capteurs) et les couleurs de carte de chaque jeu.
import { GAME_NEEDS } from '../core/models.js';
import { GAME_COLORS } from '../core/art.js';
import couleurs from './couleurs.js';
import mastermind from './mastermind.js';
import pfc from './pfc.js';
import calcul from './calcul.js';
import sortie from './sortie.js';

export const PACK_C = [couleurs, mastermind, pfc, calcul, sortie];
const CARD_COLORS = { couleurs: '#ff7a90', mastermind: '#b07cff', pfc: '#ffb020', calcul: '#4da3ff', sortie: '#2fbf71' };

export function registerPackC(GAMES) {
  for (const g of PACK_C) {
    if (!GAMES.some(x => x.id === g.id)) GAMES.push(g);
    GAME_NEEDS[g.id] = GAME_NEEDS[g.id] || { needs: [], opt: [] };
    GAME_COLORS[g.id] = GAME_COLORS[g.id] || CARD_COLORS[g.id];
  }
  return GAMES;
}
