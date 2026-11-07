// Rémi : un partenaire virtuel pour jouer seul. Il se branche à la place de "l'autre téléphone".
// Il parle comme le vrai réseau (mêmes messages), donc les jeux ne voient aucune différence.
// Pour qu'un nouveau jeu marche avec Rémi : ajouter une fonction dans BRAINS avec le nom du jeu.
import { store, h } from './util.js';
import { geo } from './sensors.js';
import { art } from './art.js';
import { lerp } from './level.js';
import { WORDS } from './strokes.js';
import { CRIS } from '../games/cris.js';
import { buildWorld, mirror, firstBlock, fragTargets, DEB_V } from './mer_world.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const humor = () => store.get('remiHumor', false);

const LINES = {
  hello: [['Salut, c\'est moi, Rémi ! Prêt à te faire battre ? Je rigole, on s\'amuse !', 'Salut, c\'est Rémi ! On joue ensemble ?']],
  hit: [['Aïe ! Bien joué.', 'Même pas mal… bon, un peu.', 'Tu as de la chance, c\'est tout.'], ['Aïe ! Bien joué !', 'Touché, bravo !']],
  gotHim: [['Ha ! Touché !', 'Pas de chance, hein ?', 'Et un de plus pour moi !'], ['Touché !', 'Bien essayé !']],
  block: [['Paré ! Il faut s\'entraîner.', 'Raté, champion !'], ['Paré !', 'Raté !']],
  win: [['Je gagne ! Mais ne t\'inquiète pas, tu vas t\'améliorer.', 'Facile ! Allez, on refait une partie ?'], ['J\'ai gagné ! Revanche ?']],
  lose: [['Bravo, tu m\'as battu. Ne le dis à personne.', 'Bon… j\'ai laissé faire.'], ['Bravo, tu as gagné !']],
  cold: [['Même pas chaud !', 'Tu cherches où ? Là, c\'est pas moi.'], ['Pas encore, continue !']],
};
const say = key => { const v = LINES[key]; return pick(humor() ? v[0] : (v[1] || v[0])); };

export class BotNet {
  constructor(ctx) {
    this.h = {}; this.role = 'host'; this.connected = true; this.method = 'local'; this.latency = 12; this.code = 'REMI'; this.remi = true;
    this.ctx = ctx; this.timers = []; this.bubble = null;
  }
  on(t, f) { (this.h[t] ||= new Set()).add(f); return () => this.h[t].delete(f); }
  emit(t, d = {}) { const m = { t, ...d }; [...(this.h[t] || [])].forEach(f => { try { f(m); } catch (e) { console.error(e); } }); }
  /** Reçoit ce que le joueur envoie (comme si c'était l'autre téléphone). */
  send(t, d = {}) { const f = this.recv && this.recv[t]; if (f) f({ t, ...d }); if (t === 'replay') setTimeout(() => this.emit('replay'), 900); }
  close() { this.stop(); }
  every(ms, f) { let last = performance.now(); const id = setInterval(() => { const n = performance.now(); const dt = Math.min(.2, (n - last) / 1000); last = n; f(dt); }, ms); this.timers.push(id); }
  after(ms, f) { const id = setTimeout(f, ms); this.timers.push(id); }
  speak(key) { this.say(typeof key === 'string' && LINES[key] ? say(key) : key); }
  say(text) {
    if (this.bubble) this.bubble.remove();
    const b = this.bubble = h('div', { class: 'remi-bubble' }, h('span', { html: art.remi(34) }), h('span', {}, text));
    // La bulle se pose juste au-dessus des commandes du bas : elle ne cache plus l'en-tête ni le score du jeu.
    try { const c = [...document.querySelectorAll('.controls,.cg-act,.bk-bar,.bar-bottom')].find(e => e.offsetParent && e.getBoundingClientRect().height > 20); const top = c ? c.getBoundingClientRect().top : innerHeight - 90; b.style.top = 'auto'; b.style.bottom = Math.max(8, innerHeight - top + 8) + 'px'; } catch {}
    document.body.append(b); setTimeout(() => { if (this.bubble === b) { b.remove(); this.bubble = null; } }, 2600);
    if (this.ctx && this.ctx.tts && store.get('remiVoice', true)) this.ctx.tts.speak(text);
  }
  stop() { this.timers.forEach(i => { clearInterval(i); clearTimeout(i); }); this.timers = []; if (this.bubble) { this.bubble.remove(); this.bubble = null; } this.h = {}; }
}

/* ---------- Cerveaux, un par jeu ---------- */
const off = (p, dx, dy) => ({ lat: p.lat + dy / 111320, lon: p.lon + dx / (111320 * Math.cos(p.lat * Math.PI / 180)) });

const BRAINS = {
  missiles(b) {
    let X = 180, tx = 180, lives = 5, t = 0, fireT = 3, bombT = lerp(11, 7), posT = 0, wanderT = 0, px = 180, inv = 0, world = []; const inc = [];
    const blockedAt = nx => world.find(o => o.row && o.y > 300 && Math.abs(nx - o.x) < o.r + 26); // îles de ma rangée : je ne m'y cogne jamais
    b.recv = {
      seed: m => { world = mirror(buildWorld(m.seed, m.m || 0)); }, // même mer que le joueur, vue de mon côté
      rockhit: m => { const o = world.find(r => r.id === m.id); if (!o || o.hp <= 0) return; o.hp--; if (o.hp > 0) return; // rocher détruit par le joueur : ses débris viennent sur moi
        fragTargets(m.tx * 360, m.s).forEach((fx, i) => { const x = 360 - fx; inc.push({ x, at: t + .12 + i * .24 + Math.hypot(x - o.x, 500 - o.y) / DEB_V, d: true }); }); },
      fire: m => inc.push({ x: m.x * 360, at: t + ((m.y != null ? m.y * 560 : 500) - 102) / 360 }), bomb: m => inc.push({ x: m.x * 360, at: t + ((m.y != null ? m.y * 560 : 500) - 102) / 300, big: true }), pos: m => { px = m.x * 360; } };
    // (la suite du cerveau est inchangée sauf : îles évitées, débris esquivés, rochers visés)
    b.every(50, dt => {
      t += dt; wanderT -= dt; inv = Math.max(0, inv - dt);
      const bigN = inc.find(i => i.big && i.at - t < 1.1 && i.at - t > .15 && Math.abs(i.x - X) < 74);
      const near = bigN || inc.find(i => !i.big && i.at - t < .95 && i.at - t > .1 && Math.abs(i.x - X) < 38);
      if (bigN && (bigN.dodge ??= Math.random() < lerp(.2, .92))) tx = clamp2(bigN.x + (X >= bigN.x ? 95 : -95));
      else if (near && !near.big && Math.random() < lerp(.15, .9)) tx = clamp2(near.x + (X >= near.x ? 70 : -70)); else if (wanderT <= 0) { wanderT = rnd(.6, 1.6); tx = rnd(40, 320); }
      { const nx = X + Math.sign(tx - X) * Math.min(Math.abs(tx - X), (near ? lerp(120, 260) : lerp(70, 140)) * dt); if (blockedAt(nx) && !blockedAt(X)) { tx = X; wanderT = 0; } else X = nx; }
      for (let i = inc.length - 1; i >= 0; i--) if (inc[i].at <= t) { const m = inc.splice(i, 1)[0]; if (m.big) { const hit = Math.abs(m.x - X) < 60; if (hit) { lives = Math.max(0, lives - 3); b.speak('hit'); } b.emit('boom', { lives, x: 1 - X / 360, y: .893 }); } else if (Math.abs(m.x - X) < 26 && !(m.d && inv > 0)) { lives--; if (m.d) inv = .5; b.emit(m.d ? 'crash' : 'hit', m.d ? { lives, k: 'deb' } : { lives }); b.speak('hit'); } }
      posT += dt; if (posT > 1 / 15) { posT = 0; b.emit('pos', { x: 1 - X / 360, y: .893 }); }
      bombT -= dt; if (bombT <= 0) { bombT = rnd(lerp(11, 7), lerp(15, 9)); b.emit('bomb', { x: clamp01(1 - (px + rnd(-lerp(90, 10), lerp(90, 10))) / 360), y: .893 }); }
      fireT -= dt; if (fireT <= 0) {
        fireT = rnd(lerp(1.6, .6), lerp(2.6, 1.1)); const er = lerp(110, 8); let fx = 360 - (px + rnd(-er, er)), bl = world.length ? firstBlock(world, fx, 458, -1) : null;
        const rocks = world.filter(o => o.k === 'rock' && o.hp > 0);
        if (rocks.length && Math.random() < lerp(.04, .35)) { const o = rocks.find(r => r.hp === 1 && Math.random() < .7) || pick(rocks); fx = o.x + rnd(-5, 5); bl = firstBlock(world, fx, 458, -1); } // je vise un rocher : ses débris iront sur le joueur
        else for (let k = 0; k < 4 && bl && Math.random() < lerp(.3, .95); k++) { fx = 360 - (px + rnd(-er - 50, er + 50)); bl = firstBlock(world, fx, 458, -1); } // une île m'arrête : je change de couloir
        b.emit('fire', { x: clamp01(fx / 360), y: .893 });
        if (bl && bl.k === 'rock') b.after(Math.max(0, (458 - bl.y - bl.r * .8) / 360 * 1000), () => { if (bl.hp <= 0) return; bl.hp--; b.emit('rockhit', { id: bl.id, tx: (360 - px) / 360, s: (Math.random() * 1e9) | 0 }); });
      }
    });
  },

  // Combat à ondes : Rémi attaque à des moments variés, bloque plus ou moins bien selon le niveau (précision du timing), tape plus ou moins vite en duel.
  epee(b) {
    const DUR = 1700, HALF = 230; let hp = 3, rid = 5000, rc = null, off = false;
    const attackLater = ms => b.after(ms, () => {
      if (hp <= 0) return; const id = ++rid, p = lerp(.6, .92), a = Math.random() < p ? rnd(-9, 9) : (Math.random() < .5 ? -1 : 1) * rnd(32, 45);
      b.emit('wv', { id, dur: DUR, a: +a.toFixed(1) }); b.cur = id;
    });
    const nextAttack = () => attackLater(rnd(lerp(2300, 1500), lerp(4800, 3000)));
    b.recv = {
      wv: m => {
        // le joueur envoie une onde : Rémi appuie sur BLOQUER avec une erreur de timing qui diminue avec le niveau
        const miss = Math.abs(m.a || 0) > 22 && b.aim, err = rnd(-1, 1) * lerp(380, 140), ok = Math.abs(err) <= HALF - 15 && !miss;
        if (ok) b.after(Math.max(200, m.dur + err), () => { rc = { id: m.id, n: Math.round(lerp(9, 19) + rnd(-2, 2)) }; b.emit('rs', { id: m.id, r: 'block', lives: hp }); });
        else b.after(m.dur + HALF + 30, () => {
          if (miss) { b.emit('rs', { id: m.id, r: 'miss', lives: hp }); nextAttack(); return; }
          hp = Math.max(0, hp - 1); b.emit('rs', { id: m.id, r: 'hit', lives: hp }); if (hp > 0 && Math.random() < .5) b.speak('hit'); if (hp <= 0) b.after(900, () => b.speak('lose')); else nextAttack();
        });
      },
      dl: m => {
        if (!rc || rc.id !== m.id) return; const nd = rc.n, w = m.n > nd ? 'att' : 'def'; rc = null;
        if (w === 'att') { hp = Math.max(0, hp - 1); if (hp <= 0) b.after(900, () => b.speak('lose')); } else if (Math.random() < .5) b.speak('block');
        b.emit('dr', { id: m.id, w, lives: hp, na: m.n, nd }); if (hp > 0) nextAttack();
      },
      rs: m => {
        if (m.r === 'block') { b.after(DUEL() , () => b.emit('dl', { id: m.id, n: Math.round(lerp(9, 19) + rnd(-2, 2)) })); }
        else if (m.r === 'hit' && m.lives <= 0) b.speak('win'); else if (m.r === 'hit' && Math.random() < .4) b.speak('gotHim');
      },
      dr: m => { if (m.lives <= 0) b.speak('win'); },
    };
    const DUEL = () => 3000 + 150;
    b.aim = true;
    b.after(1200, () => b.speak('hello'));
  },

  vaisseau(b) {
    // Rémi prend l'autre rôle : tireur (si tu pilotes) ou pilote (si tu tires). Il agit vraiment, tu le vois dans les jauges.
    let role = 'gun', st = null, fireCd = 0, lastLv = 1, lastSay = 0, tm = 0, wasOv = false, wasSh = false, burst = 0, ptx = 180, ptT = 0;
    const talk = txt => { if (tm - lastSay > 9) { lastSay = tm; b.speak(txt); } };
    const orig = b.send.bind(b);
    b.send = (t, d = {}) => { if (t === 'st') st = d.s; if (t === 'roles') role = d.host === 'pilot' ? 'gun' : 'pilot'; orig(t, d); };
    b.recv = { roles: m => { role = m.host === 'pilot' ? 'gun' : 'pilot'; } };
    b.after(1000, () => b.speak('hello'));
    b.every(66, dt => {
      tm += dt; fireCd -= dt; ptT -= dt;
      const i = { dir: 0, fy: 0, fire: 0, sp: 0, shp: 0 };
      if (!st) { b.emit('in', { i }); return; }
      const cx = st.x - (st.th === 'pirate' ? 40 : 0), foes = (st.ast || []).filter(a => a[1] > -10 && a[1] < st.y - 20);
      if (st.lv > lastLv) { lastLv = st.lv; talk('Niveau ' + st.lv + ', ça se corse !'); }
      if (role === 'gun') {
        // tireur : tire quand un ennemi est dans l'axe, ménage la chauffe et les munitions, lâche le gros tir
        const wide = st.mul >= 3 ? 34 : 18, tgt = foes.filter(a => Math.abs(a[0] - st.x) < a[2] + wide).sort((p, q) => q[1] - p[1])[0];
        const calm = st.heat < lerp(52, 72) && st.ammo >= 2 && st.ov <= 0;
        if (tgt && calm && fireCd <= 0 && tgt[1] > 70) { i.fire = 1; fireCd = lerp(.5, .24); }
        if (st.spc >= 100 && st.ov <= 0 && foes.length >= 2 && Math.abs(foes[0][0] - st.x) < 60) { i.sp = 1; talk('Gros tir !'); }
        if (st.ov > 0 && !wasOv) talk('Aïe, ça chauffe trop !'); wasOv = st.ov > 0;
      } else {
        // pilote : s'aligne sur l'ennemi le plus proche pour que le tireur touche, esquive les tirs, bouclier quand le danger est là
        const danger = [...(st.ast || []).filter(a => a[1] > st.y - 100 && a[1] < st.y + 20 && Math.abs(a[0] - cx) < a[2] + 62), ...(st.eb || []).filter(e => e[1] > st.y - 110 && Math.abs(e[0] - cx) < 42)];
        const near = foes.sort((p, q) => q[1] - p[1])[0];
        let want = near ? near[0] + (st.th === 'pirate' ? 0 : 0) : 180;
        if (danger.length) { const d0 = danger[0], away = cx < d0[0] ? -1 : 1; want = st.x + away * 90; }
        want = Math.max(40, Math.min(330, want)); const d = want - st.x;
        i.dir = Math.abs(d) < 12 ? 0 : Math.sign(d) * lerp(.5, 1);
        i.fy = st.y > 420 ? -.4 : st.y < 395 ? .4 : 0;
        if (danger.length && !st.shOn && st.sh >= 30 && Math.random() < lerp(.12, .5)) { i.shp = 1; if (!wasSh) talk('Bouclier !'); }
        wasSh = !!st.shOn;
        const item = (st.it || []).sort((p, q) => q[1] - p[1])[0]; if (item && !danger.length && item[1] > 150) { const di = item[0] - (st.x - (st.th === 'pirate' ? 40 : 0)); i.dir = Math.abs(di) < 12 ? 0 : Math.sign(di) * .9; }
      }
      b.emit('in', { i });
    });
  },

  soleil(b) { raceBrain(b, true, 30); },
  pas(b) {
    let on = false, pos = 0, acc = 0;
    const goal = 50;
    b.recv = { go: () => { b.speak('hello'); b.after(3100, () => { on = true; }); }, win: () => { on = false; } };
    b.every(100, dt => {
      if (!on || pos >= goal) return;
      acc += dt * lerp(2.2, 5.2) * (.75 + Math.random() * .5); let ch = false; while (acc >= 1) { acc -= 1; pos++; ch = true; }
      if (ch || Math.random() < .1) b.emit('pg', { n: pos, c: +(lerp(2.2, 5.2) * (.85 + Math.random() * .3)).toFixed(1) });
      if (pos >= goal) { on = false; b.emit('win'); b.speak('win'); }
    });
  },
  patate(b) {
    let holder = null, started = false;
    const passSoon = () => b.after(rnd(lerp(1800, 600), lerp(3200, 1300)), () => { if (started && holder === 'guest') { holder = 'host'; b.emit('pass'); } });
    b.recv = {
      go: m => { started = true; holder = m.seed % 2 === 0 ? 'host' : 'guest'; b.speak('hello'); if (holder === 'guest') passSoon(); },
      pass: () => { holder = 'guest'; passSoon(); }, boom: m => { started = false; if (m.loser === 'host') b.speak('win'); else b.speak('lose'); },
    };
  },
  billes(b) {
    let p = 0, v = 0, on = false, pause = 0, falls = 0, t = 0;
    b.recv = { go: () => { b.speak('hello'); }, rdy: () => b.after(rnd(1200, 3000), () => b.emit('rdy')), cd: () => b.after(3000, () => { on = true; }), win: () => { on = false; } };
    b.every(200, dt => {
      if (!on) return; t += dt;
      if (pause > 0) { pause -= dt; v = 0; } else {
        const target = lerp(13, 24) * (.8 + .3 * Math.sin(t / 2.7) + Math.random() * .2); v += (target - v) * Math.min(1, dt * 1.2); p += v * dt / 1660;
        if (Math.random() < dt * lerp(.07, .012)) { pause = 2; falls++; b.speak('gotHim'); }
      }
      b.emit('bp', { p: +Math.min(1, p).toFixed(4), v: Math.round(v * 2), f: falls });
      if (p >= 1) { on = false; b.emit('win'); b.speak('win'); }
    });
  },
  cris(b) { b.recv = { go: () => b.after(500, () => b.speak('hello')), rd: m => b.after(5700, () => { if (m.c != null && CRIS[m.c]) b.say(CRIS[m.c].t); b.emit('cr', { r: m.r, v: Math.max(5, Math.min(100, Math.round(lerp(30, 78) + rnd(-18, 18)))) }); }) }; },
  chirurgien(b) {
    const T = 45; let on = false, t = 0, g = 100, out = 0, shake = 0, pushT = 0, stT = 0;
    b.recv = {
      go: () => b.speak('hello'), rdy: () => b.after(rnd(1200, 3000), () => b.emit('rdy')), cd: () => b.after(3000, () => { on = true; pushT = rnd(7, 11); }),
      push: m => { shake = .6 + (m.f || .5); if (Math.random() < .6) out = Math.max(out, rnd(.5, 1.1)); },
    };
    b.every(100, dt => {
      if (!on) return; t += dt; const prog = Math.min(1, t / T); shake = Math.max(0, shake - dt);
      const pOut = Math.min(.9, (1 - lerp(.65, .93)) + .22 * prog + (shake > 0 ? .25 : 0));
      if (out > 0) out -= dt; else if (Math.random() < pOut * .3) out = rnd(.4, 1.1);
      g = Math.max(0, Math.min(100, g + (out > 0 ? -(7 + 16 * prog) : 4) * dt));
      b.emit('st', { g: Math.round(g), dx: out > 0 ? 1.5 : +rnd(-.5, .5).toFixed(2), dy: out > 0 ? .4 : +rnd(-.5, .5).toFixed(2) });
      pushT -= dt; if (pushT <= 0) { pushT = rnd(lerp(9, 4), lerp(13, 7)); b.emit('push', { f: rnd(.4, 1) }); }
      if (g <= 0) { on = false; b.emit('out'); b.speak('lose'); } else if (t >= T) { on = false; b.emit('res', { v: Math.round(g * 10) }); }
    });
  },
  simon(b) { b.recv = { go: () => { b.speak('hello'); b.after(rnd(7000, 16000), () => b.emit('sd', { n: Math.max(1, Math.min(12, Math.round(lerp(2, 9) + rnd(-1.5, 1.5)))) })); } }; },
  dessin(b) {
    let seed = 0, r = -1, score = 0, guessed = false;
    const idx = k => (seed + k * 3) % WORDS.length;
    const draw = () => {
      const strokes = WORDS[idx(r)].s; let t = 0;
      strokes.forEach(st => st.forEach((p, i) => { t += 70; b.after(t, () => b.emit('dp', { n: i === 0 ? 1 : 0, x: p[0], y: p[1] })); }));
    };
    const nextRound = () => b.after(2200, () => { r++; if (r >= 2) { b.after(100, () => b.emit('res', { v: score })); return; } guessed = false; if (r % 2 === 1) draw(); else b.after(rnd(5000, 11000), () => { if (guessed) return; guessed = true; const ok = Math.random() < lerp(.35, .92); const w = ok ? idx(r) : (idx(r) + 1 + ((Math.random() * 3) | 0)) % WORDS.length; if (ok) score++; b.emit('dg', { w }); nextRound(); }); });
    b.recv = { go: m => { seed = m.seed; r = -1; score = 0; b.speak('hello'); nextRound(); }, dg: () => { if (r % 2 === 1 && !guessed) { guessed = true; nextRound(); } } };
  },

  radar(b) { hiderBrain(b, { flee: false }); },
  foret(b) { hiderBrain(b, { flee: true }); },
};

const clamp2 = v => Math.max(30, Math.min(330, v)), clamp01 = v => Math.max(0, Math.min(1, v));

/** Course (pas / soleil) : Rémi avance au hasard, et se fait parfois surprendre en bougeant au feu rouge. */
function raceBrain(b, light, goal) {
  let on = false, pos = 0, green = true, redSince = 0, acc = 0, spd = 1;
  b.recv = { lvl: m => { if (m.goal) goal = m.goal; spd = 1 + .12 * ((m.n || 1) - 1); }, go: () => { on = true; b.speak('hello'); }, lt: m => { green = m.g; redSince = 0; }, win: () => { on = false; } };
  b.every(100, dt => {
    if (!on || pos >= goal) return;
    if (!green) { redSince += dt; if (redSince > .5 && Math.random() < dt * lerp(.5, .03)) { pos = Math.max(0, pos - 6); b.emit('pg', { n: pos }); b.speak('gotHim'); } return; }
    acc += dt * lerp(1.0, 2.8) * spd * (.7 + Math.random() * .6); let ch = false; while (acc >= 1) { acc -= 1; pos++; ch = true; }
    if (ch) b.emit('pg', { n: pos });
    if (pos >= goal) { on = false; b.emit('win'); b.speak('win'); }
  });
}

/** Rémi se cache : il apparaît à 60–150 m du joueur, et sait dire « pas encore ». En mode forêt il s'enfuit quand on arrive. */
function hiderBrain(b, { flee }) {
  let me = null, pos = null, fled = 0, lastFlee = 0, mode = 'radar', t = 0, zone = null;
  const O = { lat: 48.85, lon: 2.35 };
  /** Dans une pièce délimitée : Rémi se cache à l'intérieur, jamais sur le joueur ni à moins de 0,4 m d'un mur de bord.
   *  Le niveau compte : rang 1 = cachette proche et facile (au milieu), rang 5 = loin, dans un coin, et dans une autre pièce s'il y en a plusieurs. */
  const zonePick = () => {
    const r = me ? geo.rel(O, me) : { x: 0, y: 0 }, rooms = zone, area = q => (q.x1 - q.x0) * (q.y1 - q.y0), tot = rooms.reduce((a, q) => a + area(q), 0);
    const B = { x0: Math.min(...rooms.map(q => q.x0)), x1: Math.max(...rooms.map(q => q.x1)), y0: Math.min(...rooms.map(q => q.y0)), y1: Math.max(...rooms.map(q => q.y1)) }, diag = Math.hypot(B.x1 - B.x0, B.y1 - B.y0);
    const minD = Math.min(2.5, Math.max(1, diag * .3)), inRoom = (q, x, y) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1, mine = rooms.find(q => inRoom(q, r.x, r.y));
    let best = null, bs = -1e9, far = null, fd = -1;
    for (let i = 0; i < 40; i++) {
      let tt = Math.random() * tot, q = rooms[0]; for (const w of rooms) { tt -= area(w); if (tt <= 0) { q = w; break; } }
      const p = { x: q.x0 + .4 + Math.random() * Math.max(.1, q.x1 - q.x0 - .8), y: q.y0 + .4 + Math.random() * Math.max(.1, q.y1 - q.y0 - .8) };
      const d = Math.hypot(p.x - r.x, p.y - r.y); if (d > fd) { fd = d; far = p; } if (d < minD) continue;
      const wall = Math.min(p.x - q.x0, q.x1 - p.x, p.y - q.y0, q.y1 - p.y), edge = 1 - Math.min(1, wall / (Math.min(q.x1 - q.x0, q.y1 - q.y0) / 2));
      const sc = lerp(-1, 1) * (d / Math.max(diag, 1)) + lerp(0, 1) * edge + (mine && q !== mine ? lerp(0, .8) : 0) + Math.random() * .15;
      if (sc > bs) { bs = sc; best = p; }
    }
    best = best || far; return off(O, best.x, best.y);
  };
  const maxFlee = Math.round(lerp(1, 5));
  const place = () => { if (zone) { pos = zonePick(); return; } const a = rnd(0, 6.283), d = rnd(lerp(40, 100), lerp(100, 220)); pos = off(me, Math.sin(a) * d, Math.cos(a) * d); };
  b.recv = {
    zone: m => { zone = m.rooms; pos = null; if (me) place(); },
    gp: m => { me = m.p; if (!pos) { place(); b.after(600, () => b.speak('hello')); } },
    setup: m => { mode = m.mode; },
    foundq: () => { const d = pos && me ? geo.rel(me, pos).dist : 1e9; if (d < (zone ? 3 : 14)) b.emit('foundok'); else { b.emit('foundno'); b.speak('cold'); } },
  };
  b.every(500, dt => {
    t += dt;
    if (!pos || !me) return;
    const d = geo.rel(me, pos).dist;
    if (mode === 'radar' && !flee && !zone) { pos = off(pos, rnd(-.5, .5), rnd(-.5, .5)); }
    if (flee && d < (zone ? 2.5 : 24) && fled < maxFlee && t - lastFlee > 4) {
      fled++; lastFlee = t; if (zone) pos = zonePick(); else { const a = rnd(0, 6.283), dd = rnd(70, 130); pos = off(me, Math.sin(a) * dd, Math.cos(a) * dd); }
      b.emit('fled', { n: fled }); b.say(pick(humor() ? FLEE : FLEE_SOFT));
    }
  });
  b.every(1500, () => { if (pos) b.emit('gp', { p: pos }); });
}
const FLEE = ['Haha ! Raté, je suis déjà reparti !', 'Tu me cherches ? Je suis là… enfin, plus maintenant.', 'Oups, j\'avais oublié que tu courais. Salut !', 'Cours, cours, tes calories vont fondre !'];
const FLEE_SOFT = ['Raté, je suis reparti !', 'Hop, je me cache ailleurs !', 'Tu y es presque, continue !'];

export const REMI_GAMES = Object.keys(BRAINS);
/** Permet à un lot de jeux (pack) d'enregistrer le cerveau de Rémi sans modifier cette liste. */
export function registerBrain(id, fn) { BRAINS[id] = fn; if (!REMI_GAMES.includes(id)) REMI_GAMES.push(id); }
export function createRemi(gameId, ctx) { const b = new BotNet(ctx); BRAINS[gameId] && BRAINS[gameId](b); return b; }
export const remiCaps = () => ({ motion: true, tilt: true, compass: true, volume: true, voice: true, vibrate: true, gps: true, mic: true, nearby: true, online: true });
