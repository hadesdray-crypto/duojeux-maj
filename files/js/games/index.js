// Liste des jeux. Pour ajouter un jeu : créer un fichier dans js/games/, l'importer ici. C'est tout.
import missiles from './missiles.js';
import epee from './epee.js';
import vaisseau from './vaisseau.js';
import radar from './radar.js';
import foret from './foret.js';
import tresor from './tresor.js';

import soleil from './soleil.js';
import patate from './patate.js';
import billes from './billes.js';
import cris from './cris.js';
import chirurgien from './chirurgien.js';
import pas from './pas.js';
import simon from './simon.js';
import dessin from './dessin.js';
import packA from './pack_a.js';
import packB from './pack_b.js';
import { registerPackC } from './pack_c.js';
import packD from './pack_d.js';
export const GAMES = [missiles, epee, vaisseau, radar, foret, tresor, soleil, patate, billes, cris, chirurgien, pas, simon, dessin, ...packA, ...packB, ...packD];
export const gameById = id => GAMES.find(g => g.id === id);
registerPackC(GAMES);
import tour from './tour.js';
GAMES.push(tour);
