// Briques communes aux jeux de précision : écran de calibration (« Pose ton téléphone… Prêt »), départ commun 3-2-1 quand
// les DEUX joueurs sont prêts, et petit menu de jeu (reprendre / recommencer / options / quitter).
// Utilisation : keepCal(jeu) au début, calibPhase(jeu, {title, text, go}) quand le jeu a reçu le départ, gameMenu(jeu) pour le menu.
import { h, store, clamp } from './util.js';
import { css } from './winfx.js';

css('calibfx', '@keyframes cdpop{0%{transform:scale(2.2);opacity:0}30%{transform:scale(1);opacity:1}100%{transform:scale(.9);opacity:.2}}.cdown{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:7;font-size:150px;font-weight:900;color:#27e0b3;text-shadow:0 4px 18px #000c,0 0 4px #000}.cdown span{animation:cdpop .95s ease-out}.calbub{display:block;margin:4px auto;border-radius:50%;background:#0b1230;border:2px solid #ffffff44}.rulelist{display:flex;flex-direction:column;gap:6px;text-align:left;max-width:340px;margin:0 auto}.rulelist .stepline{margin:2px 0}');

/** Garde la calibration de l'utilisateur : on remet ce qu'il avait en quittant le jeu (la nôtre ne doit pas gêner les autres jeux). */
export function keepCal(g) {
  const s = g.s, prev = { zs: s.zeroSide, zf: s.zeroFwd };
  const d = g.destroy.bind(g);
  g.destroy = () => { try { s.zeroSide = prev.zs; s.zeroFwd = prev.zf; s._fs = {}; s._ff = {}; } catch {} d(); };
}

/** Remplace le paragraphe d'un message par une liste numérotée (écran de règles). */
export function rulesList(g, lines) {
  if (!g.msg) return; const p = g.msg.querySelector('p'); if (!p) return;
  const box = h('div', { class: 'rulelist' }, ...lines.map((t, i) => h('div', { class: 'stepline' }, h('span', { class: 'num' }, String(i + 1)), h('span', {}, t))));
  p.after(box);
}

/** Décompte 3-2-1 affiché au centre du jeu, puis cb(). */
export function countdown(g, cb) {
  let n = 3; const el = h('div', { class: 'cdown' }); g.root.append(el);
  const tick = () => {
    if (!g.alive) { el.remove(); return; }
    if (n > 0) { el.replaceChildren(h('span', {}, String(n))); g.s.sfx('tick'); n--; const id = setTimeout(tick, 1000); g.sub(() => clearTimeout(id)); }
    else { el.replaceChildren(h('span', { style: 'font-size:90px' }, 'Go !')); g.s.sfx('ok'); cb(); const id = setTimeout(() => el.remove(), 700); g.sub(() => clearTimeout(id)); }
  };
  tick();
}

/** Calibration puis départ commun : chacun pose son téléphone et appuie sur « Prêt » ; quand les DEUX sont prêts, 3-2-1 puis go(). */
export function calibPhase(g, o) {
  const s = g.s; let mine = false, theirs = false, begun = false, busy = false, timers = [];
  const later = (f, ms) => { const id = setTimeout(f, ms); timers.push(id); return id; };
  g.sub(() => timers.forEach(clearTimeout));
  g.phase = 'calib';
  const bub = h('canvas', { class: 'calbub', width: 120, height: 120, style: 'flex:none;width:120px;height:120px' });
  const live = h('p', { class: 'mut', style: 'min-height:2.6em' });
  const draw = () => {
    const c = bub.getContext('2d'); c.clearRect(0, 0, 120, 120);
    c.strokeStyle = '#2fbf71'; c.lineWidth = 3; c.beginPath(); c.arc(60, 60, 30, 0, 7); c.stroke();
    c.strokeStyle = '#ffffff33'; c.lineWidth = 1; c.beginPath(); c.moveTo(60, 4); c.lineTo(60, 116); c.moveTo(4, 60); c.lineTo(116, 60); c.stroke();
    const x = s.orientSeen ? clamp(s.tilt, -1, 1) * 50 : 0, y = s.orientSeen ? clamp(s.tiltY, -1, 1) * 50 : 0;
    c.fillStyle = '#27e0b3'; c.beginPath(); c.arc(60 + x, 60 + y, 9, 0, 7); c.fill();
  };
  const status = () => {
    if (begun) return;
    if (!s.orientSeen) live.textContent = 'Aucun capteur détecté : tu joueras avec les boutons à l\'écran.';
    else if (busy) live.textContent = 'Ne bouge plus… calibration en cours.';
    else if (mine) live.textContent = theirs ? 'Les deux sont prêts !' : 'Calibré. J\'attends ' + g.oppA.name + '…';
    else live.textContent = 'Capteur détecté. Le point vert doit être au milieu du rond une fois calibré.';
    draw();
  };
  const iv = setInterval(() => { if (!g.alive) return; if (g.msg && !g.msg.contains(live)) return; status(); }, 150); g.sub(() => clearInterval(iv));
  const show = () => {
    const btns = mine ? [{ label: 'Recalibrer', cls: 'sec', onclick: unready }] : busy ? [] : [{ label: 'Prêt', onclick: press }];
    g.message(o.title, o.text, btns); const p = g.msg.querySelector('p'); if (p) p.style.whiteSpace = 'pre-line';
    g.msg.insertBefore(bub, g.msg.querySelector('button')); g.msg.insertBefore(live, g.msg.querySelector('button')); status();
  };
  const ready = () => { mine = true; busy = false; g.net.send('rdy'); show(); check(); };
  const press = () => {
    if (mine || busy) return;
    if (!s.orientSeen) { ready(); return; }
    busy = true; show(); let still = 0, t0 = performance.now();
    const poll = () => {
      if (!g.alive || begun) return;
      still = (s.gyro || 0) < 12 ? still + 1 : 0;
      if ((still >= 5 && performance.now() - t0 > 700) || performance.now() - t0 > 3000) { s.calibrate(); g.cal = true; ready(); } else later(poll, 100);
    };
    poll();
  };
  const unready = () => { mine = false; g.cal = false; g.net.send('unrdy'); show(); };
  const check = () => {
    if (!(mine && theirs) || begun) return;
    if (g.isHost) { g.net.send('cd'); launch(); }
    else later(() => { if (!begun) launch(); }, 4000); // secours si le « 3-2-1 » de l'hôte se perd
  };
  const launch = () => {
    if (begun) return; begun = true; g.phase = 'count'; g.clearMessage(); clearInterval(iv);
    countdown(g, () => { g.phase = 'play'; o.go(); });
  };
  g.onNet('rdy', () => { theirs = true; status(); check(); });
  g.onNet('unrdy', () => { theirs = false; status(); });
  g.onNet('cd', () => { if (mine && !begun) launch(); });
  show();
}

/** Bouton « Menu » dans la barre du haut : reprendre, recommencer (avec l'accord de l'autre), options (sensibilité, remise à zéro), quitter. */
export function gameMenu(g) {
  const btn = h('button', { class: 'btn sec', style: 'min-height:34px;min-width:0;padding:2px 12px;font-size:.95em', onclick: () => open() }, 'Menu');
  g.hudEl.append(btn); g.menuBtn = btn;
  const watch = setInterval(() => { if (g.over) btn.style.display = 'none'; }, 300); g.sub(() => clearInterval(watch));
  const close = () => { if (g.menuEl) { g.menuEl.remove(); g.menuEl = null; } };
  const overlay = (...kids) => { close(); g.menuEl = h('div', { class: 'bigmsg', style: 'z-index:9' }, ...kids); g.root.append(g.menuEl); return g.menuEl; };
  function open(opts = false) {
    if (g.over) return;
    const sv = h('div', { style: 'font-weight:700' }, 'Sensibilité des capteurs : ' + Math.round(store.get('sens', 1) * 100) + ' %');
    const rg = h('input', { type: 'range', min: 40, max: 250, step: 10, value: Math.round(store.get('sens', 1) * 100), 'aria-label': 'Sensibilité des capteurs', style: 'width:100%', oninput: () => { store.set('sens', +rg.value / 100); sv.textContent = 'Sensibilité des capteurs : ' + rg.value + ' %'; } });
    const optBlock = h('div', { style: 'width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px' }, sv, rg,
      h('button', { class: 'btn sec', onclick: () => { close(); g.say && g.say('Tiens le téléphone comme pour jouer'); let n = 3; const t = h('div', { class: 'cdown' }, h('span', {}, '3')); g.root.append(t); const iv = setInterval(() => { n--; if (n <= 0) { clearInterval(iv); g.s.calibrate(); g.cal = true; t.replaceChildren(h('span', { style: 'font-size:70px' }, 'Remis à zéro')); setTimeout(() => t.remove(), 900); } else t.replaceChildren(h('span', {}, String(n))); }, 1000); g.sub(() => clearInterval(iv)); } }, 'Remettre à zéro dans 3 secondes'));
    overlay(h('h2', {}, opts ? 'Options' : 'Menu'),
      g.phase === 'play' ? h('p', { class: 'mut' }, 'La partie continue pendant que le menu est ouvert.') : null,
      opts ? optBlock : null,
      h('button', { class: 'btn', onclick: close }, 'Reprendre la partie'),
      h('button', { class: 'btn sec', onclick: () => { close(); g.askReplay(); } }, 'Recommencer'),
      opts ? null : h('button', { class: 'btn sec', onclick: () => open(true) }, 'Options'),
      h('button', { class: 'btn sec', onclick: () => { close(); g.ctx.exit(); } }, 'Quitter la partie'));
  }
  // Recommencer en cours de partie : attente de l'accord de l'autre joueur (avec bouton Annuler) ; l'autre voit la demande.
  g.askReplay = () => {
    g.replayMine = true; g.net.send('replay');
    overlay(h('h2', {}, 'On recommence ?'), h('p', {}, 'J\'attends ' + g.oppA.name + '…'), h('button', { class: 'btn sec', onclick: () => { g.replayMine = false; close(); } }, 'Annuler'));
    g.checkReplay();
  };
  g.onNet('replay', () => {
    if (g.over || g.replayMine || g.menuEl) return;
    overlay(h('h2', {}, g.oppA.name + ' veut recommencer'), h('button', { class: 'btn', onclick: () => { close(); g.askReplay(); } }, 'D\'accord'), h('button', { class: 'btn sec', onclick: () => { g.replayTheirs = false; close(); } }, 'Non, on continue'));
  });
}
