// Écran « Capteurs en direct » : niveau à bulle, boussole, jauge de secousse, sensibilité et mise à zéro. Sert à régler et à vérifier le téléphone.
import { h, store } from './util.js';

function css() {
  if (document.getElementById('sensorui-css')) return;
  const s = document.createElement('style'); s.id = 'sensorui-css';
  s.textContent = '.sx-row{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap}.sx-row canvas,.game .sx-row canvas{flex:none;height:auto;background:#0b1e2bcc;border-radius:14px;max-width:46%}.sx-gauge{height:22px;border-radius:11px;background:#0b1e2b;overflow:hidden;margin:6px 0}.sx-gauge i{display:block;height:100%;width:0;background:linear-gradient(90deg,#27e0b3,#ffd24a,#ff5470)}';
  document.head.append(s);
}

/** Construit le panneau. Renvoie { el, stop } : stop() arrête l'animation quand on quitte l'écran. */
export function sensorPanel(S) {
  css();
  const bub = h('canvas', { width: 160, height: 160, 'aria-label': 'Niveau à bulle' }), cmp = h('canvas', { width: 160, height: 160, 'aria-label': 'Boussole' });
  const gauge = h('i'), info = h('p', { class: 'mut', style: 'text-align:center' }, 'Bouge le téléphone : les instruments suivent en direct.');
  const peak = h('p', { class: 'bigtxt', style: 'text-align:center' }, 'Plus gros coup : 0');
  let best = 0;
  const sens = h('input', { type: 'range', min: 40, max: 250, value: Math.round(store.get('sens', 1) * 100), style: 'width:100%;height:40px', 'aria-label': 'Sensibilité', oninput: e => { store.set('sens', +e.target.value / 100); sv.textContent = e.target.value + ' %'; } });
  const sv = h('span', { class: 'mut' }, Math.round(store.get('sens', 1) * 100) + ' %');
  const off = S.on('strike', d => { best = Math.max(best, Math.round(d.force * 100)); peak.textContent = 'Plus gros coup : ' + best + ' (dernier : ' + Math.round(d.force * 100) + ')'; });
  const el = h('div', { class: 'card' },
    h('h3', {}, 'Capteurs en direct'), h('div', { class: 'sx-row' }, bub, cmp),
    h('p', { class: 'mut' }, 'Secousse'), h('div', { class: 'sx-gauge' }, gauge), peak, info,
    h('h3', {}, 'Sensibilité de l\'inclinaison'), h('p', { class: 'mut' }, 'À gauche : il faut pencher plus. À droite : le moindre mouvement compte.'), sens, sv,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { S.calibrate(); S.sfx('ok'); info.textContent = 'Téléphone remis à zéro : la position actuelle est le milieu.'; } }, 'Remettre à zéro'),
      h('button', { class: 'btn sec', onclick: () => { S.resetCalibration(); store.set('sens', 1); sens.value = 100; sv.textContent = '100 %'; best = 0; peak.textContent = 'Plus gros coup : 0'; } }, 'Valeurs de départ')));
  S.start(); let raf = 0, alive = true;
  const draw = () => {
    if (!alive) return; raf = requestAnimationFrame(draw);
    let g = bub.getContext('2d'); g.clearRect(0, 0, 160, 160); g.strokeStyle = '#7dffb8'; g.lineWidth = 2;
    g.beginPath(); g.arc(80, 80, 70, 0, 7); g.stroke(); g.beginPath(); g.arc(80, 80, 12, 0, 7); g.stroke(); g.beginPath(); g.moveTo(80, 10); g.lineTo(80, 150); g.moveTo(10, 80); g.lineTo(150, 80); g.globalAlpha = .3; g.stroke(); g.globalAlpha = 1;
    const bx = 80 + S.tilt * 60, by = 80 + (S.tiltY || 0) * 60, ok = Math.abs(S.tilt) < .06 && Math.abs(S.tiltY || 0) < .06;
    g.fillStyle = ok ? '#27e0b3' : '#ffd24a'; g.beginPath(); g.arc(bx, by, 11, 0, 7); g.fill();
    g = cmp.getContext('2d'); g.clearRect(0, 0, 160, 160); g.strokeStyle = '#9bd4ff'; g.lineWidth = 2; g.beginPath(); g.arc(80, 80, 70, 0, 7); g.stroke();
    g.fillStyle = '#9bd4ff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('N', 80, 24);
    if (S.heading != null) { const a = -S.heading * Math.PI / 180; g.save(); g.translate(80, 80); g.rotate(a); g.fillStyle = '#ff5470'; g.beginPath(); g.moveTo(0, -56); g.lineTo(9, 6); g.lineTo(-9, 6); g.fill(); g.fillStyle = '#cfe9d9'; g.beginPath(); g.moveTo(0, 56); g.lineTo(9, 6); g.lineTo(-9, 6); g.fill(); g.restore(); g.fillStyle = '#fff'; g.fillText(Math.round(S.heading) + '°', 80, 150); }
    else { g.fillStyle = '#cfe9d9'; g.fillText('Pas de boussole', 80, 84); }
    gauge.style.width = Math.min(100, (S.accel || 0) / 30 * 100) + '%';
    const p = S.probe(); if (S.orientSeen || S.motionSeen) info.textContent = 'Capteurs : ' + (p.rate || '?') + ' mesures par seconde. Inclinaison ' + Math.round(S.tilt * 100) + ' %.';
  };
  draw();
  return { el, stop() { alive = false; cancelAnimationFrame(raf); off(); } };
}
