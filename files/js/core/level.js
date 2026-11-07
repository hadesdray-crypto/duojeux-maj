// Difficulté : 5 rangs. Chaque jeu lit le rang avec lerp(petit, grand) : rang 1 = première valeur, rang 5 = deuxième.
import { store } from './util.js';
export const LEVELS = [
  { n: 1, name: 'Tout doux', txt: 'Rémi est lent et maladroit. Toutes les aides sont là.' },
  { n: 2, name: 'Facile', txt: 'Rémi se trompe souvent. Flèche et distance visibles.' },
  { n: 3, name: 'Normal', txt: 'Rémi joue correctement. Quelques aides.' },
  { n: 4, name: 'Costaud', txt: 'Rémi est rapide et précis. Peu d\'aides.' },
  { n: 5, name: 'Champion', txt: 'Rémi est redoutable. Presque aucune aide.' },
];
export const level = () => Math.min(5, Math.max(1, +store.get('level', 3) || 3));
export const lerp = (a, b) => a + (b - a) * (level() - 1) / 4;
export const setLevel = n => store.set('level', n);
