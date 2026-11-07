// Pack A « Plateau » : six jeux de plateau à deux (échecs, dames, puissance 4, morpion, bataille navale, Othello).
import { GAME_NEEDS } from '../core/models.js';
import echecs from './echecs.js';
import dames from './dames.js';
import puissance4 from './puissance4.js';
import morpion from './morpion.js';
import navale from './navale.js';
import othello from './othello.js';

// Ces jeux ne demandent aucun capteur : ils tournent sur tous les téléphones.
for (const id of ['echecs', 'dames', 'puissance4', 'morpion', 'navale', 'othello']) if (!(id in GAME_NEEDS)) GAME_NEEDS[id] = { needs: [], opt: [] };
export default [echecs, dames, puissance4, morpion, navale, othello];
