// Module invité : une petite page (sans installation) qui ne contient AUCUN jeu.
// Les jeux arrivent du téléphone de l'ami qui a l'application, restent en mémoire, et disparaissent à la fermeture.
import { h, sleep, toast } from './core/util.js';
import { net } from './core/net.js';
import { sensors } from './core/sensors.js';
import { tts } from './core/tts.js';
import { art } from './core/art.js';

const app = document.getElementById('app');
const show = (...n) => app.replaceChildren(h('div', { class: 'screen' }, ...n));
const code = (location.hash || '').replace(/\D/g, '').slice(0, 4);
const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
const mods = {};   // id -> {def} ou {parts, n, promise}
let current = null;

function welcome() {
  show(h('div', { class: 'scroll' },
    h('div', { class: 'title', style: 'margin-top:6px' }, 'Duo Jeux'),
    h('div', { class: 'hero' }, h('div', { class: 'bob', html: art.mascot(110) }), h('div', { class: 'bubble' }, 'Un ami t\'invite à jouer !')),
    code ? h('div', { class: 'card' }, h('p', {}, 'Appuie sur le bouton. Les jeux se chargent tout seuls, sans rien installer.'), h('p', { class: 'mut' }, 'Partie ' + code))
         : h('div', { class: 'card' }, h('p', {}, 'Il manque le code de la partie. Demande à ton ami de t\'envoyer de nouveau le lien.')),
    h('button', { class: 'btn big', disabled: !code, onclick: join }, 'Accepter et jouer')));
  if (code && !(window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function')) setTimeout(join, 300);   // pas de permission à demander : on se connecte tout de suite (1 appui en moins)
}

let joining = false;
async function join() {
  if (joining) return; joining = true;
  sensors.start();
  await sensors.askMotionPermission();
  const msg = h('p', { class: 'bigtxt' }, 'Je cherche ton ami…');
  show(h('div', { class: 'scroll' }, h('div', { class: 'hero' }, h('div', { class: 'bob', html: art.mascot(90) })), msg,
    h('p', { class: 'mut' }, 'Garde cette page ouverte. Il faut internet.')));
  for (let i = 1; i <= 5; i++) {
    try { await net.connect('guest', code, { order: (new URLSearchParams(location.search).get('order') || 'peer').split(','), onStep: () => {} }); break; }
    catch { msg.textContent = 'Je cherche ton ami… essai ' + (i + 1) + ' sur 5'; if (i === 5) return fail(); await sleep(1500); }
  }
  net.send('hello', { model: 'web', caps: sensors.caps, web: true, base, v: 2 });
  preload();
  waiting();
}
// Pendant que l'ami choisit le jeu, on chauffe le cache avec les fichiers communs (sans les exécuter).
function preload() {
  ['util', 'winfx', 'kit', 'sprites', 'level', 'boardkit', 'ui', 'atlas', 'models', 'walk', 'strokes', 'uisprites'].forEach(f => { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = base + 'js/core/' + f + '.js'; document.head.appendChild(l); });
  ['base', 'c_base'].forEach(f => { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = base + 'js/games/' + f + '.js'; document.head.appendChild(l); });
}
function fail(why) {
  joining = false;
  show(h('div', { class: 'scroll' }, h('div', { class: 'card' }, h('h3', {}, 'Ça n\'a pas marché'),
    h('p', {}, why || (navigator.onLine === false ? 'Tu n\'as pas internet. Active le wifi ou les données, puis réessaie.' : 'La partie est introuvable : le lien a peut-être expiré, ou ton ami a quitté. Demande-lui de recréer la partie et de te renvoyer le lien.'))), h('button', { class: 'btn big', onclick: join }, 'Réessayer')));
}
function waiting() {
  show(h('div', { class: 'scroll' }, h('div', { class: 'hero' }, h('div', { class: 'bob', html: art.mascot(110) }), h('div', { class: 'bubble' }, 'Connecté ! Ton ami choisit le jeu.')),
    h('p', { class: 'mut', style: 'text-align:center' }, 'Garde cet écran ouvert.')));
}

/* ----- Réception des jeux (par petits morceaux, renvoyés tant que tout n'est pas arrivé) ----- */
const unz = async b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
  return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); };
net.on('mod', m => {
  const e = mods[m.id] ||= { parts: [], n: m.n };
  if (e.def || e.loading) { if (e.def) net.send('mod_ok', { id: m.id }); return; }
  e.parts[m.i] = m.d; e.n = m.n; e.z = m.z;
  clearTimeout(e.t);
  const have = e.parts.filter(x => x != null).length;
  if (have < m.n) {   // il manque des morceaux : on ne redemande que ceux-là
    e.t = setTimeout(() => { const miss = []; for (let k = 0; k < e.n; k++) if (e.parts[k] == null) miss.push(k); if (miss.length && !e.def) net.send('mod_need', { id: m.id, miss }); }, 500);
    return;
  }
  e.loading = true;
  (async () => {
    let text = e.parts.join('');
    if (e.z) text = await unz(text);
    const mod = await import(URL.createObjectURL(new Blob([text], { type: 'text/javascript' })));
    e.def = mod.default; e.loading = false; net.send('mod_ok', { id: m.id }); e.ready && e.ready();
  })().catch(() => { e.parts = []; e.loading = false; net.send('mod_fail', { id: m.id }); });
});
net.on('start', async m => {
  const e = mods[m.id] ||= { parts: [], n: 0 };
  for (let i = 0; i < 100 && !e.def; i++) await sleep(150);
  if (e.def) launch(e.def); else toast('Le jeu n\'est pas arrivé. Ton ami peut réessayer.');
});
net.on('hello', m => { if (!m.re) net.send('hello', { model: 'web', caps: sensors.caps, web: true, base, v: 2, re: true }); });
net.on('stecho', m => net.send('stecho_r', { n: m.n }));
net.on('exit', () => { if (current) { current.destroy(); current = null; toast('L\'ami a quitté la partie.'); } waiting(); });
net.on('lost', () => { if (current) { current.destroy(); current = null; } fail('La connexion avec ton ami est coupée. Appuie sur Réessayer pour revenir dans la partie.'); });

function launch(def) {
  if (current) { current.destroy(); current = null; }
  const mk = () => {
    const root = h('div', { class: 'screen' });
    const bar = h('div', { class: 'bar' }, h('button', { class: 'btn sec', style: 'min-height:44px;padding:6px 14px', onclick: () => quit() }, 'Quitter'), h('h1', {}, def.name));
    app.replaceChildren(h('div', { class: 'screen' }, bar, root));
    current = def.create({ root, net, sensors, role: 'guest', gameId: def.id, tts, exit: () => quit(), restart: () => { current && current.destroy(); current = null; mk(); } });
  };
  const quit = () => { if (current) { current.destroy(); current = null; } net.send('exit'); waiting(); };
  mk();
}
welcome();
