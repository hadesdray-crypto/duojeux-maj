// Zone de jeu dans la maison : on délimite une pièce (ou plusieurs), on l'enregistre sur le téléphone, et les jeux « avec pas » s'y limitent.
// Tout reste sur ce téléphone : rien n'est envoyé nulle part.
import { h, store, clamp, toast } from './util.js';

const KEY = 'places';
export const loadPlaces = () => { const a = store.get(KEY, []); return Array.isArray(a) ? a.filter(p => p && p.w > 0 && p.h > 0) : []; };
export const savePlaces = a => store.set(KEY, a);
export const fmtSize = p => (Math.round(p.w * 10) / 10) + ' × ' + (Math.round(p.h * 10) / 10) + ' m';

/** Un ou plusieurs rectangles (en mètres, origine = point de départ du joueur, x = est, y = nord). */
export class Zone {
  constructor(rooms, name) { this.rooms = rooms; this.name = name || ''; }
  /** Pièces posées côte à côte (grandes maisons) : la 1re est centrée sur le joueur. */
  static fromPlaces(list) {
    const rooms = []; let cur = -list[0].w / 2;
    list.forEach(p => { rooms.push({ x0: cur, x1: cur + p.w, y0: -p.h / 2, y1: p.h / 2, name: p.name }); cur += p.w; });
    return new Zone(rooms, list.map(p => p.name).join(' + '));
  }
  static from(o) { return o && Array.isArray(o.rooms) && o.rooms.length ? new Zone(o.rooms, o.name) : null; }
  toJSON() { return { rooms: this.rooms, name: this.name }; }
  contains(x, y, m = 0) { return this.rooms.some(r => x >= r.x0 - m && x <= r.x1 + m && y >= r.y0 - m && y <= r.y1 + m); }
  get bounds() { return { x0: Math.min(...this.rooms.map(r => r.x0)), x1: Math.max(...this.rooms.map(r => r.x1)), y0: Math.min(...this.rooms.map(r => r.y0)), y1: Math.max(...this.rooms.map(r => r.y1)) }; }
  /** Point au hasard dans la zone (pondéré par la surface), à au moins minD mètres de « from » si possible. */
  random(from, minD = 2.5, rnd = Math.random) {
    const area = r => (r.x1 - r.x0) * (r.y1 - r.y0), tot = this.rooms.reduce((a, r) => a + area(r), 0); let best = null, bd = -1;
    for (let i = 0; i < 12; i++) {
      let t = rnd() * tot, r = this.rooms[0]; for (const q of this.rooms) { t -= area(q); if (t <= 0) { r = q; break; } }
      const p = { x: r.x0 + .4 + rnd() * Math.max(.1, r.x1 - r.x0 - .8), y: r.y0 + .4 + rnd() * Math.max(.1, r.y1 - r.y0 - .8) };
      const d = from ? Math.hypot(p.x - from.x, p.y - from.y) : 99; if (d >= minD) return p; if (d > bd) { bd = d; best = p; }
    }
    return best;
  }
}

function css() {
  if (document.getElementById('zone-css')) return;
  const s = document.createElement('style'); s.id = 'zone-css';
  s.textContent = '.zn{position:absolute;inset:0;z-index:9;overflow:auto;background:#06141ff2;padding:12px;display:flex;flex-direction:column;gap:10px}.zn canvas,.game .zn canvas{flex:none;min-height:0;height:auto;width:100%;max-width:340px;align-self:center;background:#0b1e2b;border-radius:14px}.zn .row{display:flex;gap:8px;flex-wrap:wrap}.zn .row .btn{flex:1;min-width:120px}.zn .pl{display:flex;align-items:center;gap:8px;margin:4px 0;flex-wrap:wrap}.zn .pl label{flex:2;min-width:140px;display:flex;gap:8px;align-items:center}.zn input[type=checkbox]{width:26px;height:26px}.zn .zbar{position:sticky;bottom:-12px;margin:0 -12px -12px;padding:8px 12px 10px;background:#06141ffa;border-top:2px solid #27e0b3;display:flex;flex-direction:column;gap:6px;z-index:2;flex:none}.zn .zbar .btn{min-height:44px;padding:6px 10px;font-size:15px}.zn .zbar input{min-height:40px}.zn .zok{white-space:normal;line-height:1.15}.zn .zbar .row{flex-wrap:nowrap}.zn .zbar .row .btn{min-width:0}.zn input[type=text]{width:100%;min-height:44px;font-size:17px;padding:6px 10px;border-radius:10px}';
  document.head.append(s);
}

/**
 * Choix de la zone de jeu. root : élément où poser l'écran. cb(zone|null) ; null = « sans limite ». back() = retour au menu.
 */
export function pickZone(root, S, cb, back, opts = {}) {
  css(); const box = h('div', { class: 'zn', role: 'dialog', 'aria-label': 'Zone de jeu' }); root.append(box);
  const close = () => box.remove();
  const list = () => {
    const pl = loadPlaces(), sel = new Set(); box.replaceChildren();
    const ok = h('button', { class: 'btn big', disabled: true, onclick: () => { const z = Zone.fromPlaces(pl.filter(p => sel.has(p.id))); close(); cb(z); } }, 'Jouer ici');
    box.append(h('h2', {}, opts.title || 'Où joues-tu ?'), h('p', { class: 'mut' }, opts.intro || 'Choisis une pièce enregistrée (ou plusieurs pour une grande maison), ou délimite-en une nouvelle. Place-toi au milieu de la pièce.'));
    const groups = {}; pl.forEach(p => (groups[p.group || 'Ma maison'] ||= []).push(p));
    Object.entries(groups).forEach(([g, items]) => box.append(h('div', { class: 'card' }, h('h3', {}, g), items.map(p => {
      const c = h('input', { type: 'checkbox', 'aria-label': p.name, onchange: e => { e.target.checked ? sel.add(p.id) : sel.delete(p.id); ok.disabled = !sel.size; } });
      return h('div', { class: 'pl' }, h('label', {}, c, h('span', {}, p.name + ' (' + fmtSize(p) + ')')),
        h('button', { class: 'btn sec', onclick: () => ren(p) }, 'Renommer'),
        h('button', { class: 'btn sec', 'aria-label': 'Supprimer ' + p.name, onclick: () => { savePlaces(loadPlaces().filter(x => x.id !== p.id)); list(); } }, 'Supprimer'));
    }))));
    if (!pl.length) box.append(h('p', { class: 'bigtxt' }, 'Aucune pièce enregistrée pour l\'instant.'));
    box.append(...[pl.length ? ok : null, h('button', { class: 'btn big sec', onclick: () => assistant() }, 'Délimiter une pièce'),
      opts.noFree ? null : h('button', { class: 'btn sec', onclick: () => { close(); cb(null); } }, 'Sans limite (comme avant)'), h('button', { class: 'btn sec', onclick: () => { close(); back && back(); } }, 'Retour')].filter(Boolean));
  };
  const ren = p => {
    box.replaceChildren(); const n = h('input', { type: 'text', maxlength: 30, value: p.name, 'aria-label': 'Nom de la pièce' }), g = h('input', { type: 'text', maxlength: 30, value: p.group || 'Ma maison', 'aria-label': 'Nom de la maison' });
    box.append(h('h2', {}, 'Renommer'), h('p', { class: 'mut' }, 'Nom de la pièce'), n, h('p', { class: 'mut' }, 'Maison ou étage'), g,
      h('button', { class: 'btn big', onclick: () => { const a = loadPlaces(); const q = a.find(x => x.id === p.id); if (q) { q.name = n.value.trim() || q.name; q.group = g.value.trim() || 'Ma maison'; savePlaces(a); } list(); } }, 'Enregistrer'), h('button', { class: 'btn sec', onclick: list }, 'Retour'));
  };
  const assistant = () => {
    box.replaceChildren(); const E = { l: 1, r: 1, u: 1, d: 1 }, lock = { l: false, r: false, u: false, d: false }, SIDE = { l: 'à gauche', r: 'à droite', u: 'devant', d: 'derrière' };
    const cv = h('canvas', { width: 340, height: 170, 'aria-label': 'Plan de la pièce' }), info = h('p', { class: 'bigtxt', style: 'text-align:center;margin:0' });
    const g = cv.getContext('2d'); let raf = 0, growing = false, last = performance.now();
    const W = () => E.l + E.r, H = () => E.u + E.d, size = () => (Math.round(W() * 10) / 10) + ' × ' + (Math.round(H() * 10) / 10) + ' m';
    const draw = () => {
      if (!box.isConnected) return; raf = requestAnimationFrame(draw); const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
      if (growing) for (const k in E) if (!lock[k]) E[k] = Math.min(25, E[k] + dt * .6);
      g.clearRect(0, 0, 340, 170); const sc = Math.min(300 / Math.max(W(), 4), 150 / Math.max(H(), 4), 60), cx = 170, cy = 85;
      const rx = cx - (W() / 2) * sc, ry = cy - (H() / 2) * sc;
      g.fillStyle = '#123a52'; g.fillRect(rx, ry, W() * sc, H() * sc); g.lineWidth = 4;
      [['l', rx, ry, rx, ry + H() * sc], ['r', rx + W() * sc, ry, rx + W() * sc, ry + H() * sc], ['u', rx, ry, rx + W() * sc, ry], ['d', rx, ry + H() * sc, rx + W() * sc, ry + H() * sc]].forEach(([k, a, b, c, d]) => { g.strokeStyle = lock[k] ? '#27e0b3' : '#ffd24a'; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); });
      const px = rx + E.l * sc, py = ry + E.u * sc; g.fillStyle = '#ff5470'; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillText('toi', px, py - 11);
      const t = 'Environ ' + size(); if (info.textContent !== t) info.textContent = t;
    };
    const hold = h('button', { class: 'btn big', 'aria-label': 'Maintiens pour agrandir' }, 'Maintiens pour agrandir');
    const on = e => { e.preventDefault(); growing = true; }, offf = () => { growing = false; };
    hold.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => hold.addEventListener(t, offf));
    hold.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') growing = true; }); hold.addEventListener('keyup', offf);
    const fine = d => () => { for (const k in E) if (!lock[k]) E[k] = clamp(E[k] + d / 2, .8, 25); };
    const lk = k => { const b = h('button', { class: 'btn sec', onclick: () => { lock[k] = !lock[k]; b.textContent = 'Mur ' + SIDE[k] + (lock[k] ? ' : fixé' : ''); b.classList.toggle('on', lock[k]); } }, 'Mur ' + SIDE[k]); return b; };
    const nm = h('input', { type: 'text', maxlength: 30, placeholder: 'Nom de la pièce (Salon, Chambre…)', 'aria-label': 'Nom de la pièce' }), gr = h('input', { type: 'text', maxlength: 30, placeholder: 'Maison ou étage', value: 'Ma maison', 'aria-label': 'Nom de la maison' });
    const done = save => {
      cancelAnimationFrame(raf); const p = { id: 'p' + Date.now(), name: nm.value.trim() || 'Pièce ' + (loadPlaces().length + 1), group: gr.value.trim() || 'Ma maison', w: Math.round(W() * 10) / 10, h: Math.round(H() * 10) / 10 };
      if (save) { const a = loadPlaces(); a.push(p); if (!savePlaces(a)) toast('Mémoire pleine : supprime une pièce.'); else toast('Pièce « ' + p.name + ' » enregistrée sur ce téléphone.'); }
      close(); cb(Zone.fromPlaces([p]));
    };
    const reset = () => { for (const k in E) { E[k] = 1; lock[k] = false; } box.querySelectorAll('.lk .btn').forEach((b, i) => { b.textContent = 'Mur ' + SIDE['lrud'[i]]; b.classList.remove('on'); }); nm.value = ''; };
    const okBtn = h('button', { class: 'btn big zok', onclick: () => done(true) }, 'C\'est la bonne taille — Enregistrer la pièce');
    box.append(h('h2', { style: 'margin:0' }, 'Délimite ta pièce'), h('p', { class: 'mut', style: 'margin:0' }, 'Tiens-toi au milieu de la pièce. Maintiens le bouton « Maintiens pour agrandir » jusqu\'aux murs, donne un nom, puis valide en bas.'),
      cv, info, h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: fine(-1) }, '− 0,5 m'), h('button', { class: 'btn sec', onclick: fine(1) }, '+ 0,5 m')),
      h('p', { class: 'mut', style: 'margin:0' }, 'Un mur est déjà bon ? Touche-le pour l\'arrêter de ce côté :'), h('div', { class: 'row lk' }, lk('l'), lk('r'), lk('u'), lk('d')), h('p', { class: 'mut', style: 'margin:0' }, 'Maison ou étage'), gr,
      h('button', { class: 'btn sec', onclick: () => done(false) }, 'Jouer sans enregistrer cette pièce'),
      h('div', { class: 'zbar' }, hold, nm, okBtn, h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: reset }, 'Recommencer'), h('button', { class: 'btn sec', onclick: () => { cancelAnimationFrame(raf); list(); } }, 'Annuler'))));
    draw();
  };
  list(); return { close };
}
