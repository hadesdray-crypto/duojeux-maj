// Habillage peint : chargement des images d'interface, icônes bijoux, illustrations, fonds d'écran.
// Si une image manque, on garde l'ancien dessin (classe « ui » absente = repli).
import { uiEl, has } from './uisprites.js';
import { h } from './util.js';
export const uiOn = () => document.documentElement.classList.contains('ui');
export function preload(ms = 2500) {
  return new Promise(res => {
    let n = 2; const done = () => { if (--n === 0) { document.documentElement.classList.add('ui'); res(true); } };
    const t = setTimeout(() => res(false), ms);
    for (const u of ['img/ui.webp', 'img/ui/b_main.webp']) { const i = new Image(); i.onload = () => { done(); clearTimeout(t); }; i.onerror = () => { clearTimeout(t); res(false); }; i.src = u; }
  });
}
/** Icône bijou (ic_… ou j_…) à une hauteur donnée ; rien si le dessin manque. */
export const ico = (name, size = 40) => (uiOn() && has(name)) ? uiEl(name, 'ico', size) : document.createElement('span');
/** Bouton avec icône bijou et texte. */
export function btnI(icon, label, cls, onclick, extra = {}) {
  return h('button', { class: 'btn ' + (cls || ''), onclick, ...extra }, h('span', { class: 'bi' }, ico(icon, 40), h('span', {}, label)));
}
/** Illustration expliquée (img/sc/NN.webp), masquée si elle ne se charge pas. */
export const scene = n => h('img', { class: 'scene', src: 'img/sc/' + String(n).padStart(2, '0') + '.webp', alt: '', onerror: e => e.target.remove() });
/** Roue de barre qui tourne, pour les chargements. */
export const spinner = (s = 56) => { const i = h('img', { class: 'spin', src: 'img/ui/wheel0.webp', alt: '', width: s, height: s, onerror: e => e.target.remove() }); return i; };
/** Fond d'écran : accueil, menu, appairage, carte, cabine, sousmarin, porte, chateau (ou rien). */
export const setBg = n => { document.body.dataset.scr = n || ''; };
/** Rémi peint (poses r_p0.. ou niveaux r_l1..) ; si l'image d'interface manque, l'ancienne tête dessinée. */
import { art } from './art.js';
export function remiPose(name, height = 120) {
  if (uiOn() && has(name)) { const e = uiEl(name, 'rem', height); if (name.startsWith('r_p')) e.classList.add('bob'); return e; }
  const d = document.createElement('div'); d.className = 'bob'; d.innerHTML = art.remi(Math.round(height * .66)); return d;
}
