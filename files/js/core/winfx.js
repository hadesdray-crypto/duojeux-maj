// Petits outils visuels partagés par les mini-jeux : styles injectés depuis le JS, couronne/confettis de victoire.
import { sprEl } from './sprites.js';
export function css(id, text) { if (document.getElementById(id)) return; const s = document.createElement('style'); s.id = id; s.textContent = text; document.head.append(s); }
css('winfx', '@keyframes wfpop{0%{transform:scale(.2) rotate(-20deg);opacity:0}60%{transform:scale(1.15) rotate(6deg);opacity:1}100%{transform:scale(1) rotate(0)}}@keyframes wffloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}.wfwin{display:flex;align-items:center;justify-content:center;gap:6px;min-height:84px}.wfwin>*{animation:wfpop .5s ease-out both}.wfwin>:nth-child(2){animation:wfpop .5s ease-out both,wffloat 1.6s ease-in-out .5s infinite}');
/** Couronne + confettis en haut du message de fin, si c'est gagné. */
export function winBadge(game, win, lose) {
  const m = game.msg; if (!m) return; m.classList.remove('fin-win', 'fin-lose'); if (win) m.classList.add('fin-win'); else if (lose) m.classList.add('fin-lose'); const old = m.querySelector('.wfwin'); if (old) old.remove();
  const box = document.createElement('div'); box.className = 'wfwin';
  if (win) box.append(sprEl('n_conf', 70, 'transform:scaleX(-1)'), sprEl('n_crown', 84), sprEl('n_conf', 70));
  else if (lose) box.append(sprEl(lose, 84));
  else return; m.prepend(box);
}
