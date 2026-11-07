// Chasse au trésor : un parent cache un trésor, l'enfant le retrouve. 3 façons :
//  1. POINT GPS : une flèche (boussole) et la distance mènent au trésor.
//  2. PARCOURS : un chemin tracé sur une carte, à suivre. Le bouton « Vérifier » dit si on s'éloigne et de quel côté.
//  3. PHOTOS : une série de photos montre le chemin, de l'une à l'autre, jusqu'au trésor.
// Les chasses sont gardées dans le téléphone (hors connexion). On peut jouer à deux : la chasse est envoyée à l'autre téléphone.
import { GameBase } from './base.js';
import { h, store, toast, clamp } from '../core/util.js';
import { geo } from '../core/sensors.js';
import { Walker } from '../core/walk.js';
import { level, lerp, LEVELS } from '../core/level.js';
import { spr, sprC, sprEl, ready, bgUrl } from '../core/sprites.js';
const loadBg = n => { const i = new Image(); i.onload = () => { i.ok = true; }; i.src = bgUrl(n); return i; };
const ISLAND = loadBg('island');

const TYPES = { point: 'Point GPS (flèche)', route: 'Parcours tracé', photo: 'Photos pas à pas' };
const loadHunts = () => store.get('hunts', []);
const saveHunts = a => store.set('hunts', a);
const off = (p, dx, dy) => ({ lat: p.lat + dy / 111320, lon: p.lon + dx / (111320 * Math.cos(p.lat * Math.PI / 180)) });
const fmtD = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';

/** Photo -> petite image JPEG (légère pour rester dans la mémoire et passer d'un téléphone à l'autre). */
function shrink(file, max = 440) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = h('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', .6)); };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('photo')); }; img.src = url;
  });
}

class Tresor extends GameBase {
  constructor(ctx) {
    super(ctx);
    this.isHost = this.role === 'host'; this.remi = !!(ctx.net && ctx.net.remi);
    window.__tresor = this; this.w = new Walker(this.s); this.hunt = null; this.mode = 'menu'; this.verifs = 0; this.recRoute = null; this.parts = {};
    this.hud(h('span', {}, 'Chasse au trésor'), h('span', {}, ''));
    this.panel = h('div', { class: 'scroll', style: 'flex:1' }); this.root.append(this.panel);
    this.makeCanvas(360, 360); this.cv.style.display = 'none';
    this.ctl = h('div', { class: 'controls', style: 'flex-direction:column;display:none' }); this.root.append(this.ctl);
    this.note = h('div', { class: 'bigtxt', style: 'padding:4px;min-height:2.2em' }); this.ctl.append(this.note);
    this.btns = h('div', { class: 'row', style: 'flex-wrap:wrap' }); this.ctl.append(this.btns);
    this.onNet('th', m => this.gotPart(m));
    this.onNet('tfound', () => { if (!this.over) this.end(true, 'L\'autre a trouvé le trésor !'); });
    this.wireReplay();
    this.sub(() => this.w.stop());
    if (!this.isHost && !this.remi) this.panelShow(h('div', { class: 'bigmsg-lite' }, h('h2', {}, 'Chasse au trésor'), h('p', {}, 'Attends : l\'autre choisit la chasse. Elle arrivera sur ton téléphone.')));
    else this.menu();
    this.loop(dt => this.update(dt));
  }

  /* ---------- écrans ---------- */
  panelShow(...n) { this.panel.style.display = ''; this.cv.style.display = 'none'; this.ctl.style.display = 'none'; this.panel.replaceChildren(...n); this.panel.scrollTop = 0; }
  playShow() { this.panel.style.display = 'none'; this.cv.style.display = ''; this.ctl.style.display = ''; this.fit && this.fit(); }
  back(f) { return h('button', { class: 'btn sec', onclick: f }, 'Retour'); }
  menu() {
    this.mode = 'menu'; this.w.stop(); this.hudEl.children[1].textContent = '';
    const hunts = loadHunts();
    const lv = LEVELS[level() - 1];
    this.panelShow(
      h('div', { class: 'card', style: 'display:flex;flex-direction:row;gap:12px;align-items:center' }, sprEl('k_chestOpen', 72), h('div', {}, h('h3', {}, 'Chasse au trésor'), h('p', {}, 'Un parent cache un trésor. L\'enfant le retrouve avec son téléphone.'), h('p', { class: 'mut' }, 'Difficulté : ' + lv.name + ' (change-la dans Réglages)'))),
      this.remi ? h('button', { class: 'btn big', onclick: () => this.walkChoice(m => this.remiHunt(m)) }, 'Le trésor de Rémi') : null,
      h('div', { class: 'card' }, h('h3', {}, 'Mes chasses'), hunts.length ? hunts.map(x => h('div', { class: 'row', style: 'align-items:center;margin:6px 0' },
        h('span', { style: 'flex:2' }, x.name + ' (' + TYPES[x.type] + ')'),
        h('button', { class: 'btn', onclick: () => this.pick(x) }, 'Jouer'),
        h('button', { class: 'btn sec', 'aria-label': 'Supprimer ' + x.name, onclick: () => { saveHunts(loadHunts().filter(y => y.id !== x.id)); this.menu(); } }, 'Supprimer'))) : h('p', { class: 'mut' }, 'Aucune chasse pour l\'instant. Crée la première !')),
      h('button', { class: 'btn big', onclick: () => this.createMenu() }, 'Créer une chasse (parent)'),
      h('button', { class: 'btn sec', onclick: () => this.ctx.exit() }, 'Menu des jeux'));
  }
  walkChoice(next) {
    this.panelShow(h('div', { class: 'card' }, h('h3', {}, 'Où es-tu ?'), h('p', {}, 'Dehors : le GPS te guide. Dans la maison : le téléphone compte tes pas.')),
      h('button', { class: 'btn big', onclick: () => next(false) }, 'Dehors (GPS)'), h('button', { class: 'btn sec big', onclick: () => next(true) }, 'Dans la maison (pas)'), this.back(() => this.menu()));
  }

  /* ---------- création (parent) ---------- */
  createMenu() {
    this.panelShow(h('div', { class: 'card' }, h('h3', {}, 'Créer une chasse'), h('p', {}, 'Choisis comment l\'enfant va chercher :')),
      h('button', { class: 'btn big', onclick: () => this.walkChoice(m => this.createPoint(m)) }, 'Un point GPS (flèche)'),
      h('button', { class: 'btn big', onclick: () => this.walkChoice(m => this.createRoute(m)) }, 'Un parcours à suivre'),
      h('button', { class: 'btn big', onclick: () => this.createPhoto() }, 'Des photos pas à pas'), this.back(() => this.menu()));
  }
  nameStep(data) {
    const inp = h('input', { type: 'text', maxlength: 30, placeholder: 'Nom de la chasse', 'aria-label': 'Nom de la chasse', value: 'Chasse ' + (loadHunts().length + 1) });
    const tip = h('input', { type: 'text', maxlength: 80, placeholder: 'Petit mot pour l\'enfant (facultatif)', 'aria-label': 'Petit mot' });
    this.panelShow(h('div', { class: 'card' }, h('h3', {}, 'Dernière étape'), inp, tip),
      h('button', { class: 'btn big', onclick: () => {
        const hunt = { id: 'h' + Date.now(), name: inp.value.trim() || 'Chasse', note: tip.value.trim(), ...data };
        const all = loadHunts(); all.push(hunt);
        if (!saveHunts(all)) { toast('Mémoire pleine : supprime une vieille chasse.'); return; }
        toast('Chasse enregistrée !'); this.menu();
      } }, 'Enregistrer'), this.back(() => this.menu()));
  }
  createPoint(stepMode) {
    this.mode = 'create'; this.w.start(stepMode); this.sims = stepMode; this.samples = [];
    const msg = h('p', { class: 'bigtxt' }, 'Cherche ta position…');
    const ok = h('button', { class: 'btn big', disabled: true, onclick: () => this.nameStep({ type: 'point', point: { lat: this.me.lat, lon: this.me.lon }, sim: !!stepMode }) }, 'Le trésor est ici : enregistrer');
    this.panelShow(h('div', { class: 'card' }, h('h3', {}, 'Point GPS'), h('p', {}, 'Va à l\'endroit où tu caches le trésor, puis touche le bouton.'), msg), ...(stepMode ? [this.stepRow()] : []), ok, this.back(() => { this.w.stop(); this.menu(); }));
    this.creating = () => { const m = this.w.me; msg.textContent = m ? 'Position trouvée (précision ' + Math.round(m.acc || 0) + ' m).' : 'Cherche ta position…'; ok.disabled = !m; };
  }
  stepRow() {
    return h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: () => this.w.turn(-15) }, 'Tourner à gauche'), h('button', { class: 'btn', onclick: () => this.w.stepOnce() }, 'Faire un pas'), h('button', { class: 'btn sec', onclick: () => this.w.turn(15) }, 'Tourner à droite'));
  }
  createRoute(stepMode) {
    this.mode = 'create'; this.w.start(stepMode); this.rec = null;
    const msg = h('p', { class: 'bigtxt' }, 'Cherche ta position…');
    const go = h('button', { class: 'btn big', disabled: true, onclick: () => { this.rec = [{ lat: this.w.me.lat, lon: this.w.me.lon }]; go.style.display = 'none'; stop.style.display = ''; } }, 'Départ : commencer le trajet');
    const stop = h('button', { class: 'btn big', style: 'display:none', onclick: () => {
      if (!this.rec || this.rec.length < 3) { toast('Marche un peu plus avant de terminer.'); return; }
      const r = this.rec; this.rec = null; this.nameStep({ type: 'route', route: r, sim: !!stepMode });
    } }, 'Arrivé au trésor : terminer');
    this.panelShow(h('div', { class: 'card' }, h('h3', {}, 'Parcours'), h('p', {}, 'Touche « commencer », marche jusqu\'au trésor, puis touche « terminer ». Le chemin est enregistré tout seul.'), msg), ...(stepMode ? [this.stepRow()] : []), go, stop, this.back(() => { this.rec = null; this.w.stop(); this.menu(); }));
    this.creating = () => {
      const m = this.w.me; go.disabled = !m;
      if (this.rec && m) { const last = this.rec[this.rec.length - 1]; if (geo.rel(last, m).dist >= 6) this.rec.push({ lat: m.lat, lon: m.lon }); }
      msg.textContent = this.rec ? 'Trajet : ' + this.rec.length + ' points, ' + fmtD(this.pathLen(this.rec)) : (m ? 'Prêt. Position trouvée.' : 'Cherche ta position…');
    };
  }
  pathLen(r) { let d = 0; for (let i = 1; i < r.length; i++) d += geo.rel(r[i - 1], r[i]).dist; return d; }
  createPhoto() {
    this.mode = 'create'; const photos = [];
    const list = h('div', { class: 'row', style: 'flex-wrap:wrap' }), txt = h('input', { type: 'text', maxlength: 60, placeholder: 'Indice pour cette photo (facultatif)', 'aria-label': 'Indice' });
    const draw = () => { list.replaceChildren(...photos.map((p, i) => h('div', { style: 'width:30%' }, h('img', { src: p.img, style: 'width:100%;border-radius:12px' }), h('div', { class: 'mut' }, (i === photos.length - 1 && photos.length > 1 ? 'Trésor' : 'Photo ' + (i + 1)))))); done.disabled = photos.length < 2; };
    const add = async f => { if (!f) return; try { photos.push({ img: await shrink(f), txt: txt.value.trim() }); txt.value = ''; draw(); } catch { toast('Photo impossible à lire. Réessaie.'); } };
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none', onchange: e => { add(e.target.files[0]); e.target.value = ''; } });
    const gal = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: e => { add(e.target.files[0]); e.target.value = ''; } });
    const done = h('button', { class: 'btn big', disabled: true, onclick: () => this.nameStep({ type: 'photo', photos }) }, 'Terminer (la dernière photo = le trésor)');
    this.panelShow(h('div', { class: 'card' }, h('h3', {}, 'Photos pas à pas'), h('p', {}, 'Prends une photo de chaque étape du chemin. La dernière photo montre le trésor. Il faut au moins 2 photos (jusqu\'à 8).'), txt),
      h('button', { class: 'btn big', onclick: () => { if (photos.length >= 8) { toast('8 photos au maximum.'); return; } cam.click(); } }, 'Prendre une photo'),
      h('button', { class: 'btn sec', onclick: () => gal.click() }, 'Choisir dans la galerie'), cam, gal, list,
      h('button', { class: 'btn sec', onclick: () => { photos.pop(); draw(); } }, 'Enlever la dernière photo'), done, this.back(() => this.menu()));
  }

  /* ---------- jouer ---------- */
  pick(hunt) {
    if (!this.remi && this.isHost) this.sendHunt(hunt);
    this.play(hunt);
  }
  remiHunt(stepMode) {
    this.w.start(stepMode); const o = { lat: 48.85, lon: 2.35 };
    const wait = () => { if (!this.w.me) { setTimeout(wait, 400); return; } const a = Math.random() * 6.283, d = stepMode ? 20 + Math.random() * 15 : lerp(60, 250) + Math.random() * 60;
      this.play({ id: 'remi', name: 'Le trésor de Rémi', type: 'point', point: off(this.w.me, Math.sin(a) * d, Math.cos(a) * d), sim: stepMode, remi: true }, stepMode); this.say(stepMode ? 'J\'ai caché mon trésor pas loin. Indice : ce n\'est pas dans ma poche.' : 'J\'ai caché mon trésor quelque part dehors. Bonne chance !'); };
    wait();
  }
  say(t) { this.net.say && this.net.say(t); }
  play(hunt, started = false) {
    this.hunt = hunt; this.mode = 'play'; this.verifs = 0; this.startedAt = performance.now(); this.over = false; this.near = false;
    this.hudEl.children[0].textContent = hunt.name;
    if (hunt.type === 'photo') { this.stage = 0; this.playShowPhoto(); return; }
    const begin = stepMode => {
      if (!started) this.w.start(stepMode, hunt.sim ? (hunt.type === 'route' ? hunt.route[0] : { lat: 48.85, lon: 2.35 }) : undefined);
      this.playShow(); this.buildPlayButtons(); this.stage = hunt.type === 'route' ? 'goStart' : 'seek';
    };
    if (started) begin(this.w.step); else if (hunt.sim) begin(true); else this.walkChoice(m => begin(m));
  }
  buildPlayButtons() {
    const t = this.hunt.type, bb = [];
    if (this.w.step) bb.push(h('button', { class: 'btn sec', style: 'flex:1 1 30%', onclick: () => this.w.turn(-15) }, 'Gauche'), h('button', { class: 'btn', style: 'flex:1 1 30%', onclick: () => this.w.stepOnce() }, 'Pas'), h('button', { class: 'btn sec', style: 'flex:1 1 30%', onclick: () => this.w.turn(15) }, 'Droite'));
    if (t === 'route') bb.push(h('button', { class: 'btn warn', style: 'flex:1 1 40%', onclick: () => this.verify() }, 'Vérifier'));
    bb.push(h('button', { class: 'btn sec', style: 'flex:1 1 40%', onclick: () => { this.hunt = null; this.w.stop(); this.menu(); } }, 'Arrêter'));
    this.btns.replaceChildren(...bb);
  }
  get me() { return this.w.me; }

  /* ----- photos ----- */
  playShowPhoto() {
    const hunt = this.hunt, i = this.stage, p = hunt.photos[i], last = i === hunt.photos.length - 1;
    const showTxt = level() <= 3 && p.txt;
    this.panelShow(h('div', { class: 'card' }, h('h3', {}, last ? 'Photo du trésor' : 'Étape ' + (i + 1) + ' sur ' + hunt.photos.length), h('img', { src: p.img, style: 'width:100%;border-radius:14px', alt: 'Photo de l\'étape' }), showTxt ? h('p', {}, p.txt) : null, hunt.note && i === 0 ? h('p', { class: 'mut' }, hunt.note) : null),
      h('button', { class: 'btn big', onclick: () => { if (last) this.found(); else { this.stage++; this.playShowPhoto(); } } }, last ? 'J\'ai trouvé le trésor !' : 'Je suis arrivé ici'),
      i > 0 ? h('button', { class: 'btn sec', onclick: () => { this.stage--; this.playShowPhoto(); } }, 'Revoir la photo d\'avant') : null,
      h('button', { class: 'btn sec', onclick: () => { this.hunt = null; this.menu(); } }, 'Arrêter'));
  }

  /* ----- vérification du parcours ----- */
  nearestOnRoute(p) {
    const R = this.hunt.route; let best = { d: 1e9, i: 0, t: 0, side: 0 };
    const q = geo.rel(R[0], p); // repère en mètres autour du départ
    const P = R.map(r => geo.rel(R[0], r)); const px = q.x, py = q.y;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i].x, ay = P[i].y, bx = P[i + 1].x, by = P[i + 1].y, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1), cx = ax + dx * t, cy = ay + dy * t, d = Math.hypot(px - cx, py - cy);
      if (d < best.d) best = { d, i, t, side: dx * (py - ay) - dy * (px - ax) };
    }
    return best;
  }
  verify() {
    if (!this.me) { this.note.textContent = 'Je n\'ai pas encore ta position.'; return; }
    if (this.stage === 'goStart') { this.note.textContent = 'Va d\'abord au départ (flèche).'; return; }
    const max = level() >= 5 ? 4 : level() >= 4 ? 8 : 99; if (this.verifs >= max) { this.note.textContent = 'Plus de vérifications à ce rang.'; return; } this.verifs++;
    const n = this.nearestOnRoute(this.me), tol = lerp(18, 8);
    const left = level() >= 5 ? ' (' + (max - this.verifs) + ' vérif. restantes)' : '';
    if (n.d <= tol) this.note.textContent = 'Tu es sur le chemin. Continue !' + left;
    else this.note.textContent = 'Tu t\'éloignes du chemin (' + Math.round(n.d) + ' m). Va un peu plus à ' + (n.side > 0 ? 'droite' : 'gauche') + '.' + left;
    this.s.sfx(n.d <= tol ? 'ok' : 'block');
  }

  /* ----- fin ----- */
  found() {
    if (this.over) return; if (!this.remi) this.net.send('tfound');
    const r = this.hunt && this.hunt.remi;
    if (r) this.say('Zut… tu l\'as trouvé. C\'était mon goûter !');
    this.end(true, 'Bravo, tu as trouvé le trésor !');
  }
  end(win, text) {
    if (this.over) return; this.over = true; this.s.sfx('win'); this.s.vibrate(200); this.w.stop();
    const mins = Math.max(1, Math.round((performance.now() - (this.startedAt || performance.now())) / 60000));
    this.panel.style.display = 'none'; this.cv.style.display = 'none'; this.ctl.style.display = 'none';
    this.message('Trésor trouvé !', text + '\nTemps : ' + mins + ' min' + (this.w.walked ? '\nDistance : ' + fmtD(this.w.walked) : ''), [{ label: 'Une autre chasse', onclick: () => { this.clearMessage(); this.over = false; this.menu(); } }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]);
    this.msg.querySelector('p').style.whiteSpace = 'pre-line';
  }

  /* ----- envoi de la chasse à l'autre téléphone (par morceaux, renvoyés tant que ce n'est pas confirmé) ----- */
  async sendHunt(hunt) {
    const s = JSON.stringify(hunt), parts = s.match(/[\s\S]{1,2500}/g) || [], id = hunt.id; let ok = false;
    const off2 = this.net.on('th_ok', m => { if (m.id === id) ok = true; });
    for (let t = 0; t < 25 && !ok && this.alive; t++) { parts.forEach((d, i) => this.net.send('th', { id, i, n: parts.length, d })); await new Promise(r => setTimeout(r, 1200)); }
    off2();
  }
  gotPart(m) {
    const e = this.parts[m.id] ||= { a: [], n: m.n, done: false };
    if (e.done) { this.net.send('th_ok', { id: m.id }); return; }
    e.a[m.i] = m.d; if (e.a.filter(x => x != null).length < m.n) return;
    e.done = true; this.net.send('th_ok', { id: m.id });
    try { this.play(JSON.parse(e.a.join(''))); } catch { toast('La chasse n\'est pas bien arrivée.'); }
  }

  /* ---------- boucle ---------- */
  update(dt) {
    if (this.mode === 'create' && this.creating) { this.w.tick(); this.creating(); }
    if (this.mode === 'play' && this.hunt && !this.over && this.hunt.type !== 'photo') this.playTick(dt);
  }
  playTick(dt) {
    const hunt = this.hunt; this.w.tick();
    const sp = this.hudEl.children; sp[1].textContent = Math.round((performance.now() - this.startedAt) / 1000) + ' s';
    let target = hunt.type === 'route' ? (this.stage === 'goStart' ? hunt.route[0] : hunt.route[hunt.route.length - 1]) : hunt.point;
    let d = null;
    if (this.me) {
      d = geo.rel(this.me, target).dist;
      if (hunt.type === 'route' && this.stage === 'goStart' && d < 25) { this.stage = 'follow'; this.note.textContent = 'Tu es au départ. Suis le chemin de la carte !'; this.s.sfx('ok'); if (this.hunt.remi) this.say('Allez, suis le chemin !'); target = hunt.route[hunt.route.length - 1]; d = geo.rel(this.me, target).dist; }
      const rad = lerp(25, 8);
      if (this.stage !== 'goStart' && d < rad) { this.found(); return; }
      if (hunt.type === 'point') this.pointHints(d);
      else if (this.stage === 'goStart') this.note.textContent = 'Va au départ du parcours : ' + fmtD(d) + '.';
    } else this.note.textContent = 'Je cherche ta position…';
    this.drawPlay(target, d);
  }
  pointHints(d) {
    const l = level();
    if (l <= 2) this.note.textContent = 'Le trésor est à ' + fmtD(d) + '.';
    else if (l === 3) this.note.textContent = 'Le trésor est à environ ' + (d < 100 ? Math.round(d / 10) * 10 : Math.round(d / 50) * 50) + ' m.';
    else this.note.textContent = d < 20 ? 'BRÛLANT !' : d < 50 ? 'Chaud' : d < 120 ? 'Tiède' : 'Froid';
    if (this.hunt.remi && d < 50 && !this.near) { this.near = true; this.say('Ça sent le trésor par ici…'); }
    if (l >= 4) { this.bT = (this.bT || 0) - .05; if (this.bT <= 0) { this.bT = clamp(d / 120, .2, 2); this.s.beep(300 + (1 - clamp(d / 150, 0, 1)) * 700, 40, 'triangle'); } }
  }

  /* ---------- dessin ---------- */
  drawPlay(target, d) {
    if (!this.cv.width) return; this.begin(); const g = this.g, hunt = this.hunt, l = level();
    g.fillStyle = '#0d2a1c'; g.fillRect(0, 0, 360, 360);
    if (ISLAND.ok) { g.drawImage(ISLAND, 0, 0, ISLAND.naturalWidth, ISLAND.naturalHeight, 0, 0, 360, 360); g.fillStyle = '#04140c99'; g.fillRect(0, 0, 360, 360); }
    if (ready()) { sprC(g, 'k_shovel', 36, 322, 54); sprC(g, 'k_chest', 322, 322, 58); for (let i = 0; i < 3; i++) sprC(g, 'k_coin' + (Math.floor(performance.now() / 120 + i * 2) % 6), 300 + i * 18, 288 - i * 6, 20); }
    const head = this.w.heading;
    if (hunt.type === 'route' && this.stage !== 'goStart') this.drawMap(g, head, l);
    else this.drawArrow(g, target, d, head, l);
    this.endDraw();
  }
  drawArrow(g, target, d, head, l) {
    const cx = 180, cy = 175;
    if (d == null) return;
    if (l >= 4) { const hot = 1 - clamp(d / 150, 0, 1); g.fillStyle = `rgba(${Math.round(20 + hot * 220)},${Math.round(40 + (1 - Math.abs(hot - .5) * 2) * 40)},${Math.round(150 - hot * 130)},${ready() ? .72 : 1})`; g.fillRect(0, 0, 360, 360); if (ready()) { const th = d < 50 ? 'k_th2' : d < 120 ? 'k_th1' : 'k_th0'; sprC(g, th, cx, cy - 70, 150); sprC(g, 'k_compass', 60, 300, 56); } g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText(d < 20 ? 'BRÛLANT' : d < 50 ? 'CHAUD' : d < 120 ? 'TIÈDE' : 'FROID', cx, cy); g.textAlign = 'left'; return; }
    const r = geo.rel(this.me, target), a = (r.bearing - (head == null ? 0 : head)) * Math.PI / 180;
    if (ready()) { sprC(g, 'k_compass', cx, cy, 250); }
    g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = '#ffd24d'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -120); g.lineTo(60, 20); g.lineTo(20, 20); g.lineTo(20, 100); g.lineTo(-20, 100); g.lineTo(-20, 20); g.lineTo(-60, 20); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.fillStyle = '#cfe9d9'; g.font = '13px sans-serif'; g.fillText(head == null ? 'Pas de boussole : le haut = le nord' : 'Marche vers où pointe la flèche', 70, 350);
  }
  drawMap(g, head, l) {
    const R = this.hunt.route, P = R.map(r => geo.rel(R[0], r));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; if (this.me && l <= 2) { const q = geo.rel(R[0], this.me); P.push(q); }
    P.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    if (ready()) { spr(g, 'k_map', 4, 4, 352, 352 * 0.78); g.fillStyle = '#0006'; }
    const k = Math.min(300 / Math.max(20, x1 - x0), 300 / Math.max(20, y1 - y0)), ox = 180 - (x0 + x1) / 2 * k, oy = 180 + (y0 + y1) / 2 * k, X = p => ox + p.x * k, Y = p => oy - p.y * k;
    g.strokeStyle = '#ffd24d'; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); P.slice(0, R.length).forEach((p, i) => i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))); g.stroke();
    const s = P[0], e = P[R.length - 1];
    g.fillStyle = '#27e0b3'; g.beginPath(); g.arc(X(s), Y(s), 9, 0, 7); g.fill(); g.fillStyle = '#06241c'; g.font = 'bold 11px sans-serif'; g.fillText('D', X(s) - 4, Y(s) + 4);
    if (ready()) sprC(g, 'k_chest', X(e), Y(e) - 8, 36); else { g.fillStyle = '#ff5470'; g.beginPath(); g.arc(X(e), Y(e), 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText('?', X(e) - 3, Y(e) + 4); }
    if (this.me && l <= 2) { const q = geo.rel(R[0], this.me); if (ready()) sprC(g, 'k_stand', X(q), Y(q) - 12, 34); else { g.fillStyle = '#4da3ff'; g.beginPath(); g.arc(X(q), Y(q), 8, 0, 7); g.fill(); } }
    // boussole : le haut de la carte est le nord
    g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText('N', 336, 22); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(341, 28); g.lineTo(341, 48); g.stroke();
    if (head != null) { g.save(); g.translate(330, 330); g.rotate(head * Math.PI / 180); g.fillStyle = '#ff5470'; g.beginPath(); g.moveTo(0, -16); g.lineTo(8, 8); g.lineTo(-8, 8); g.fill(); g.restore(); g.fillStyle = '#cfe9d9'; g.font = '11px sans-serif'; g.fillText('toi', 318, 352); }
  }
}
export default { id: 'tresor', name: 'Chasse au trésor', short: 'Un parent cache un trésor : flèche GPS, parcours à suivre ou photos.', how: ['Un parent crée la chasse et cache le trésor.', 'L\'enfant la joue : flèche GPS, parcours sur carte, ou photos.', 'Sur le parcours, « Vérifier » dit si tu t\'éloignes.', 'Dedans : mode « pas ». À deux, la chasse est envoyée à l\'autre téléphone.'], create: ctx => new Tresor(ctx) };
