// Familles de téléphones et ce qu'elles permettent. Une seule source de vérité, facile à compléter.
// uwb = puce « ultra-large bande » (visée directionnelle précise). Données : listes publiques 2026,
// à confirmer sur le vrai appareil (l'autotest le fait).
export const MODELS = [
  { id: 'samsung_hi', label: 'Samsung Galaxy S Plus/Ultra, Z Fold', uwb: 'probable' },
  { id: 'samsung_mid', label: 'Samsung Galaxy A ou S de base', uwb: 'non' },
  { id: 'pixel_pro', label: 'Google Pixel Pro / Fold / Tablet', uwb: 'probable' },
  { id: 'pixel', label: 'Google Pixel (autre)', uwb: 'non' },
  { id: 'iphone', label: 'iPhone', uwb: 'probable' },
  { id: 'other', label: 'Xiaomi, Honor, autre Android', uwb: 'non' },
  { id: 'unknown', label: 'Je ne sais pas', uwb: 'non' },
];

/** Jeux : ce dont chacun a besoin. needs = capteurs obligatoires ; opt = améliorations facultatives. */
export const GAME_NEEDS = {
  hache: { needs: [], opt: ['motion', 'tilt', 'vibrate'], note: 'Sans capteur : glisse le doigt.' },
  pointeurs: { needs: [], opt: ['tilt', 'compass', 'vibrate'], note: 'Sans capteur de direction : vise au doigt.' },
  brasdefer: { needs: [], opt: ['motion', 'vibrate'], note: 'Sans secousse : bouton TIRE.' },
  missiles: { needs: [], opt: ['tilt', 'vibrate'] },
  epee: { needs: [], opt: ['motion', 'volume', 'voice'], note: 'Sans capteur de mouvement : on dessine un cercle au doigt ou on touche ATTAQUE, et BLOQUER est un bouton.' },
  vaisseau: { needs: [], opt: ['tilt'] },
  foret: { needs: [], opt: ['gps', 'compass'], note: 'Dedans : mode « Sans GPS » avec les pas.' },
  tresor: { needs: [], opt: ['gps', 'compass'], note: 'Dedans : mode « pas ». Les photos marchent partout.' },
  soleil: { needs: [], opt: ['motion'], note: 'Sans capteur de mouvement : gros bouton pour avancer.' },
  pas: { needs: [], opt: ['motion'], note: 'Sans capteur de mouvement : gros bouton pour avancer.' },
  patate: { needs: [], opt: ['motion', 'vibrate'], note: 'Sans secousse détectée : bouton « Passer ».' },
  billes: { needs: [], opt: ['tilt'], note: 'Sans inclinaison : 4 boutons.' },
  cris: { needs: [], opt: ['mic'], note: 'Sans micro : on tape très vite sur le bouton.' },
  chirurgien: { needs: [], opt: ['tilt'], note: 'Sans inclinaison : 4 boutons.' },
  simon: { needs: [], opt: [] },
  dessin: { needs: [], opt: [] },
  tour: { needs: [], opt: [], note: 'Aucun capteur : on glisse le doigt.' },
  radar: { needs: ['gps'], opt: ['compass'], note: 'Dehors uniquement (GPS). Dedans, il faudra la puce UWB : version suivante.' },
};

/** Détecte la famille probable depuis le navigateur (simple aide, l'utilisateur confirme). */
export function guessModel() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad/.test(ua)) return 'iphone';
  if (/Pixel/.test(ua)) return /Pro|Fold|Tablet/.test(ua) ? 'pixel_pro' : 'pixel';
  if (/SM-S9\d\d[BU]?|SM-F\d/.test(ua) || /SM-S\d{3}/.test(ua)) return 'samsung_hi';
  if (/SM-A|SAMSUNG/i.test(ua)) return 'samsung_mid';
  if (/Android/.test(ua)) return 'other';
  return 'unknown';
}

/** Verdict clair pour un jeu selon les capacités réelles des deux téléphones. */
export function gameVerdict(gameId, capsList) {
  const g = GAME_NEEDS[gameId]; const miss = []; const less = [];
  for (const need of g.needs) if (capsList.some(c => !c[need])) miss.push(need);
  for (const o of g.opt) if (capsList.some(c => !c[o])) less.push(o);
  return { ok: miss.length === 0, miss, less, note: g.note };
}

export const CAP_NAMES = {
  motion: 'détection des secousses', tilt: 'inclinaison', compass: 'boussole', volume: 'boutons de volume',
  voice: 'reconnaissance de la voix', mic: 'micro', vibrate: 'vibration', gps: 'GPS', nearby: 'liaison Bluetooth directe', online: 'internet',
};
