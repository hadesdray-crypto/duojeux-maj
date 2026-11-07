// Duo Jeux — écrans et enchaînement. Les jeux sont dans js/games, les capteurs dans js/core.
import { h, store, toast, modal, modalStack, nativePlugin, newCode, sleep, duo } from './core/util.js';
import { profile, AVATARS } from './core/profile.js';
import { avatarSvg } from './core/avatars.js';
import { logoSvg } from './core/logo.js';
import { BUILD, VERSION } from './version.js';
import * as upd from './core/update.js';
import { net, nativeAvailable } from './core/net.js';
import { sensors, geo } from './core/sensors.js';
import { MODELS, guessModel, gameVerdict, CAP_NAMES } from './core/models.js';
import { tts } from './core/tts.js';
import { GAMES, gameById } from './games/index.js';
import { runSelfTest } from './selftest.js';
import { sensorPanel } from './core/sensorui.js';
import { art, GAME_COLORS } from './core/art.js';
import { createRemi, remiCaps } from './core/remi.js';
import { LEVELS, level, setLevel } from './core/level.js';
import { preload, ico, btnI, scene, spinner, setBg, remiPose } from './core/ui.js';

// Adresse de la petite page d'invitation (sans installation). Un seul endroit à changer.
const INVITE_URL = 'https://hadesdray-crypto.github.io/JeuxA2/invite.html';
const app = document.getElementById('app');
const state = { partner: null, game: null, current: null, role: null };

/* Tests sur ordinateur : ?order=local et ?fakegps=1 */
const Q = new URLSearchParams(location.search);
if (Q.get('fakegps')) geo.fake = () => { const k = (window.__fakeGps && window.__fakeGps()) || { lat: 48.85, lon: 2.35 }; return { ...k, acc: 5 }; };

let backFn = null, nextBack = null;
function show(...nodes) { backFn = nextBack; nextBack = null; app.replaceChildren(h('div', { class: 'screen' }, ...nodes)); }
function topbar(title, back) { nextBack = back || null; return h('div', { class: 'bar' }, back ? h('button', { class: 'btn sec', style: 'min-height:44px;padding:6px 14px', onclick: back }, h('span', { class: 'bi' }, ico('j_back', 30), h('span', {}, 'Retour'))) : null, h('h1', {}, title)); }
const myCaps = () => sensors.caps;
const myModel = () => store.get('model', guessModel());
const modelLabel = id => (MODELS.find(m => m.id === id) || {}).label || 'Inconnu';


/* ============ Bouton « ? » : signaler un problème (rien ne part : le texte reste sur l'appareil) ============ */
function reportProblem() {
  if (modalStack.some(m => m.report)) return;
  const screenName = ((document.querySelector('.screen .bar h1') || {}).textContent || 'Accueil').trim();
  const gameName = state.current && gameById(state.game) ? gameById(state.game).name : '—';
  const area = h('textarea', { class: 'reportbox', placeholder: 'Écris ici ce qui ne va pas (facultatif)', 'aria-label': 'Description du problème' });
  const build = () => 'Duo Jeux version ' + VERSION + ' (build ' + BUILD + ')\nÉcran : ' + screenName + '\nJeu : ' + gameName + '\nTéléphone : ' + modelLabel(myModel()) + '\nProblème : ' + (area.value.trim() || '(non décrit)');
  const m = modal('Signaler un problème', [
    h('p', {}, 'Tu es ici : ' + screenName + (gameName !== '—' ? ' (jeu : ' + gameName + ')' : '') + '.'), area,
    h('div', { class: 'tocomplete' }, h('p', { class: 'mut' }, 'Adresse pour envoyer le signalement :'), h('p', {}, '____________________ (à compléter)')),
    h('p', { class: 'mut' }, 'Rien n\'est envoyé automatiquement : copie le texte puis envoie-le toi-même.')],
    [{ label: 'Fermer', cls: 'sec' }, { label: 'Copier le texte', onclick: async () => {
      const t = build();
      try { await navigator.clipboard.writeText(t); toast('Texte copié.'); }
      catch { try { area.value = t; area.select(); document.execCommand('copy'); toast('Texte copié.'); } catch { toast('Copie impossible : sélectionne le texte à la main.'); } }
      return false; } }]);
  m.report = true;
}
function addHelpButton() {
  if (document.querySelector('.qhelp')) return;
  document.body.append(h('button', { class: 'qhelp', 'aria-label': 'Signaler un problème', title: 'Signaler un problème', onclick: reportProblem }, '?'));
}

/* ============ Démarrage ============ */
function boot() {
  sensors.start(); wireBack(); addHelpButton();
  net.on('lost', () => recover());
  net.on('avsave', m => profile.keepFriend(m.av));
  net.on('avreq', () => {
    const ask = modal('Ton ami veut retrouver son personnage', [h('p', {}, 'Il a perdu le sien. Veux-tu lui montrer les personnages que tu gardes pour tes amis ?')], [{ label: 'Non' }, { label: 'Oui, l\'aider', onclick: () => net.send('avlist', { list: Object.values(profile.friends()).map(f => ({ pid: f.pid, avatar: f.avatar, name: f.name })) }) }]);
  });
  net.on('avget', m => { const f = profile.friends()[m.pid]; if (f) net.send('avrestore', { av: f }); });
  net.on('hello', m => { try { net.send('avsave', { av: profile.summary() }); } catch {} state.partner = { model: m.model, caps: m.caps, web: !!m.web, base: m.base, build: m.build, v: m.v || 1 }; if (!m.re) net.send('hello', { model: myModel(), caps: myCaps(), build: BUILD, v: 2, re: true }); });
  net.on('stecho', m => net.send('stecho_r', { n: m.n }));
  net.on('start', m => { if (net.role === 'guest') launch(m.id); });
  net.on('exit', () => { if (state.current) { state.current.destroy(); state.current = null; toast('L\'autre a quitté la partie.'); lobby(); } });
  if (!store.get('onboarded', false)) onboarding(0); else home();
  upd.registerWorker(); setTimeout(() => { upd.confirmBoot(); }, 1500);
  setTimeout(() => { if (navigator.onLine !== false && !state.current && !modalStack.length && document.querySelector('.hero')) lookForUpdate(false); }, 4000);
}

/* ============ Liaison coupée : on réessaie tout seul ============ */
let recovering = false;
async function recover() {
  if (recovering || !net.code) return; recovering = true;
  const { role, code } = net;
  if (state.current) { state.current.destroy(); state.current = null; }
  const msg = h('p', { class: 'bigtxt' }, 'La liaison est coupée. Je réessaie…');
  const ov = h('div', { class: 'overlay-lost' }, scene(13), spinner(52), msg, h('button', { class: 'btn sec', onclick: () => { stop = true; ov.remove(); net.close(); state.partner = null; recovering = false; home(); } }, 'Abandonner'));
  document.body.append(ov); let stop = false;
  for (let i = 1; i <= 6 && !stop; i++) {
    msg.textContent = 'La liaison est coupée. Nouvel essai ' + i + ' sur 6…';
    try { await net.connect(role, code, { order: order(), onStep: () => {} }); net.send('hello', { model: myModel(), caps: myCaps(), build: BUILD, v: 2 }); ov.remove(); recovering = false; toast('C\'est reconnecté !'); lobby(); return; }
    catch { await sleep(1500); }
  }
  if (!stop) { ov.remove(); recovering = false; net.close(); state.partner = null; toast('Impossible de se reconnecter. Recrée la partie.'); home(); }
}

/* ============ Donner l'appli à un ami, sans internet ============ */
function giveApp() {
  const d = nativePlugin('Duo');
  const st = h('p', { style: 'color:#ffd36b;font-weight:700;text-align:center;display:none' }); // message DANS la fenêtre : un toast cacherait le texte et les boutons
  const say = t => { st.textContent = t; st.style.display = 'block'; try { st.scrollIntoView({ block: 'nearest' }); } catch {} };
  modal('Donner l\'appli à un ami', [
    scene(12),
    h('p', {}, 'Sans internet, de téléphone à téléphone (ami sur Android) :'),
    h('div', { class: 'stepline' }, h('span', { class: 'num' }, '1'), h('span', {}, 'Appuie sur « Envoyer le fichier ».')),
    h('div', { class: 'stepline' }, h('span', { class: 'num' }, '2'), h('span', {}, 'Choisis « Partage à proximité » (Quick Share) ou « Bluetooth », puis le téléphone de ton ami.')),
    h('div', { class: 'stepline' }, h('span', { class: 'num' }, '3'), h('span', {}, 'Ton ami accepte, ouvre le fichier reçu et autorise l\'installation une seule fois.')),
    h('p', { class: 'mut' }, 'Un iPhone ne peut pas recevoir l\'appli de cette façon (Apple l\'interdit).'), st],
    [{ label: 'Fermer', cls: 'sec' }, { label: 'Envoyer le fichier', onclick: async () => {
      if (!d || !d.shareApk) { say(d ? 'Mets d\'abord la dernière appli (test-22), puis réessaie.' : 'Disponible seulement dans l\'appli installée.'); return false; }
      try { await d.shareApk(); } catch (e) { say('Impossible de préparer le fichier.'); } return false; } }]);
}

/* ============ Mise à jour sur place ============ */
async function offerUpdate(m) {
  if (modalStack.some(x => x.upd)) return;
  /* la barre et le texte sont EN HAUT de la fenêtre (avant la liste des changements) : toujours visibles pendant le chargement */
  const spin = spinner(40); const bar = h('div', { class: 'meter', style: 'height:24px;margin:4px 0;width:100%;flex:none' }, h('i')); const st = h('p', { class: 'mut', style: 'text-align:center;margin:0' }, '');
  const prog = h('div', { class: 'updprog', style: 'display:none;flex-direction:column;align-items:center;gap:6px' }, spin, bar, st);
  const notes = (m.notes || []).map(t => h('div', { class: 'stepline' }, h('span', { class: 'num' }, '+'), h('span', {}, t)));
  const mo = modal('Nouvelle version disponible', [prog, scene(11), h('p', {}, 'Version ' + m.version + ' — voici ce qui change :'), ...notes], [
    { label: 'Plus tard', cls: 'sec' },
    { label: 'Mettre à jour', onclick: async () => {
      const title = mo.el.querySelector('h2'), body = mo.el.querySelector('.body'), btns = [...mo.el.querySelectorAll('.row button')];
      const [later, go] = btns; if (go.disabled) return false;
      /* tout de suite : titre, boutons, défilement vers la barre */
      title.textContent = 'Mise à jour en cours…'; later.style.display = 'none'; go.disabled = true; go.textContent = 'En cours…'; go.style.flex = '1';
      prog.style.display = 'flex'; bar.style.display = ''; bar.firstChild.style.width = '0%'; st.textContent = 'Téléchargement…'; spin.style.display = ''; body.scrollTo({ top: 0 });
      try { await upd.apply(m, p => { bar.firstChild.style.width = Math.round(p * 100) + '%'; st.textContent = 'Téléchargement : ' + Math.round(p * 100) + ' %'; });
        title.textContent = 'C\'est prêt'; st.textContent = 'C\'est prêt, je redémarre'; bar.firstChild.style.width = '100%'; spin.style.display = 'none'; go.textContent = 'Redémarrage…'; setTimeout(() => location.reload(), 900); }
      catch (e) { title.textContent = 'Nouvelle version disponible'; st.textContent = 'Le téléchargement n\'a pas marché. Rien n\'a changé, tu peux réessayer plus tard.'; bar.style.display = 'none'; spin.style.display = 'none'; later.style.display = ''; go.disabled = false; go.textContent = 'Réessayer'; }
      return false; } }]);
  mo.upd = true; mo.el.classList.add('carte');
}
async function lookForUpdate(manual) {
  try {
    const m = await upd.check();
    if (!m) { if (manual) toast('Tu as déjà la dernière version.'); return; }
    const nb = nativePlugin('App'); let nat = 0; try { nat = nb && nb.getInfo ? +(await nb.getInfo()).build || 0 : 0; } catch {}
    if (m.minNative && nat && nat < m.minNative) { modal('Nouvelle installation nécessaire', [h('p', {}, 'Cette version change des choses profondes du téléphone. Il faut installer le nouveau fichier une fois (il remplace l\'ancien, tes personnages restent).')], [{ label: 'OK' }]); return; }
    if (!upd.canUpdateInPlace()) { if (manual) toast('Redémarre l\'appli une fois puis réessaie.'); return; }
    offerUpdate(m);
  } catch { if (manual) toast('Pas de connexion : impossible de chercher une mise à jour.'); }
}

/* ============ Mon personnage ============ */
function myCharacter(back = home) {
  setBg('cabine');
  const p = profile.get(); let pick = p.avatar;
  const nameIn = h('input', { class: 'input', maxlength: 14, value: p.name, 'aria-label': 'Nom du personnage', style: 'width:100%;font-size:20px;padding:12px;border-radius:12px;border:2px solid #34407a;background:#141a33;color:#fff' });
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:8px' });
  const draw = () => { grid.replaceChildren(...AVATARS.map(a => h('button', { class: 'avbtn', 'aria-label': a.label, style: (a.id === pick ? 'outline:4px solid ' + a.color : ''), onclick: () => { pick = a.id; draw(); big.innerHTML = avatarSvg(pick, 110); } }, h('span', { html: avatarSvg(a.id, 58) })))); };
  const big = h('div', { style: 'display:flex;justify-content:center', html: avatarSvg(pick, 110) });
  draw();
  const t = profile.totals();
  const save = () => { profile.update(q => { q.avatar = pick; q.name = nameIn.value; q.chosen = true; }); if (net.connected && !state.remi) { try { net.send('avsave', { av: profile.summary() }); } catch {} } toast('Personnage enregistré !'); back(); };
  show(h('div', { class: 'scroll' }, topbar('Mon personnage', () => back()), big, nameIn, grid,
    h('div', { class: 'card' }, h('p', {}, 'Parties jouées : ' + t.played + ' — gagnées : ' + t.wins), h('p', { class: 'mut' }, 'Une copie est gardée sur le téléphone de tes amis. Si tu perds le tien, ils te la rendent.')),
    h('button', { class: 'btn big', onclick: save }, 'Enregistrer'),
    h('button', { class: 'btn sec', onclick: () => retrieve(back) }, 'Retrouver mon personnage chez un ami'),
    ...(Object.keys(profile.friends()).length ? [h('div', { class: 'card' }, h('h3', {}, 'Amis que je garde'), ...Object.values(profile.friends()).map(f => h('div', { style: 'display:flex;align-items:center;gap:10px' }, h('span', { html: avatarSvg(f.avatar, 36) }), f.name)))] : [])));
}
function retrieve(back = home) {
  if (!(net.connected && !state.remi)) { modal('Retrouver mon personnage', [scene(15), h('p', {}, 'Connecte-toi d\'abord au téléphone de ton ami (Jouer à deux), puis reviens ici.')], [{ label: 'OK' }]); return; }
  retrieve.back = back; retrieve.asked = true;
  if (!retrieve.on2) { retrieve.on2 = true; net.on('avrestore', m => { if (profile.restore(m.av)) { toast('Personnage retrouvé !'); myCharacter(retrieve.back); } }); }
  if (!retrieve.on) { retrieve.on = true; net.on('avlist', m => {
    if (!retrieve.asked) return; const list = (m.list || []).filter(a => a && a.pid);
    modal('Lequel est à toi ?', list.length ? [scene(15), ...list.map(a => h('button', { class: 'btn sec', style: 'display:flex;align-items:center;gap:10px', onclick: () => { retrieve.asked = false; net.send('avget', { pid: a.pid }); toast('Je le demande à ton ami…'); } }, h('span', { html: avatarSvg(a.avatar, 40) }), a.name))] : [h('p', {}, 'Ton ami n\'a gardé aucun personnage.')], [{ label: 'Fermer' }]);
  }); }
  net.send('avreq');
}

/* ============ Accueil ============ */
function home() {
  setBg('accueil');
  show(h('div', { class: 'scroll' },
    h('div', { class: 'bob', style: 'display:flex;justify-content:center;margin-top:2px', html: logoSvg(store.get('logo', 'neon'), 104) }),
    h('div', { class: 'title' }, 'Duo Jeux'),
    h('button', { class: 'btn sec', style: 'display:flex;align-items:center;gap:12px;justify-content:center', onclick: () => myCharacter() }, h('span', { html: avatarSvg(profile.get().avatar, 40) }), 'Mon personnage : ' + profile.get().name),
    h('div', { class: 'hero' }, remiPose('r_p1', 132), h('div', { class: 'bubble' }, 'Salut ! Tu veux jouer avec un ami ?')),
    btnI('ic_handshake', 'Jouer à deux', 'big', () => pairing()),
    btnI('ic_robot', 'Jouer seul avec Rémi', 'sec big', () => remiLobby()),
    btnI('ic_gauge', 'Test du téléphone', 'sec', () => selftest()),
    h('div', { class: 'row' }, btnI('j_help', 'Comment ça marche ?', 'sec', () => help()), btnI('j_gear', 'Réglages', 'sec', () => settings())),
    h('div', { class: 'card' }, h('h3', {}, 'Règle d\'or'), h('p', {}, 'On ne touche jamais le téléphone de l\'autre. On reste à un mètre.')),
    btnI('ic_close', 'Quitter l\'application', 'sec', () => askQuitApp()),
    h('p', { class: 'mut', style: 'text-align:center' }, 'Version ' + VERSION + ' (' + BUILD + ')')));
}

/* ============ Retour et sortie : toujours possibles, partout ============ */
function exitApp() {
  const A = nativePlugin('App');
  if (A && A.exitApp) { A.exitApp(); return; }
  try { window.close(); } catch {}
  toast('Tu peux fermer cette page.');
}
function askQuitApp() {
  if (modalStack.some(m => m.quitApp)) return;
  const m = modal('Quitter Duo Jeux ?', [h('p', {}, 'La partie en cours sera arrêtée.')], [{ label: 'Rester' }, { label: 'Quitter', cls: 'warn', onclick: () => { exitApp(); } }]); m.quitApp = true;
}
function askQuitGame() {
  if (modalStack.some(m => m.quitGame)) return;
  const m = modal('Quitter la partie ?', [h('p', {}, state.remi ? 'On arrête de jouer avec Rémi.' : 'L\'autre joueur sera prévenu.')], [{ label: 'Rester' }, { label: 'Quitter', cls: 'warn', onclick: () => { state.quitGame && state.quitGame(); } }]); m.quitGame = true;
}
/** Flèche de retour d'Android (et retour du navigateur) : ferme, remonte d'un écran, ou propose de quitter. */
function handleBack() {
  const ov = document.querySelector('.overlay-lost'); if (ov) { ov.querySelector('button').click(); return; }
  if (modalStack.length) { modalStack[modalStack.length - 1].close(); return; }
  if (state.current) { if (state.current.over && state.quitGame) { state.quitGame(); return; } askQuitGame(); return; }
  if (backFn) { backFn(); return; }
  askQuitApp();
}
window.__duoBack = handleBack;
function wireBack() {
  const A = nativePlugin('App');
  if (A && A.addListener) { try { A.addListener('backButton', () => handleBack()); } catch {} }
  try { history.pushState({ duo: 1 }, ''); addEventListener('popstate', () => { handleBack(); try { history.pushState({ duo: 1 }, ''); } catch {} }); } catch {}
}

/* ============ Première ouverture : on règle tout, une seule fois ============ */
function dots(i, n) { return h('div', { class: 'step' }, ...Array.from({ length: n }, (_, k) => h('i', { class: k === i ? 'on' : '' }))); }

function onboarding(step) {
  setBg('porte');
  const N = 4;
  if (step === 0) {
    show(topbar('Bienvenue'), h('div', { class: 'scroll' }, dots(0, N), scene(16),
      h('h2', {}, 'Bienvenue dans Duo Jeux !'),
      h('p', {}, 'On va tout régler maintenant, une seule fois. Ensuite, tu pourras jouer tout de suite.'),
      h('div', { class: 'card' }, h('h3', {}, 'Règle d\'or'), h('p', {}, 'On ne touche JAMAIS le téléphone de l\'autre. On reste à un mètre.')),
      h('button', { class: 'btn big', onclick: () => { tts.speak('Bienvenue ! On va tout régler une seule fois.'); onboarding(1); } }, 'C\'est parti')));
  } else if (step === 1) {
    const sel = h('select', { onchange: e => store.set('model', e.target.value) }, ...MODELS.map(m => h('option', { value: m.id, selected: m.id === myModel() }, m.label)));
    store.set('model', myModel());
    show(topbar('Ton téléphone', () => onboarding(0)), h('div', { class: 'scroll' }, dots(1, N), scene(1),
      h('h2', {}, 'Quel est ton téléphone ?'),
      h('p', { class: 'mut' }, 'Choisis le plus proche. Ça sert à te dire quels jeux marchent le mieux. Le test final vérifie vraiment.'),
      sel,
      h('div', { class: 'card' }, h('h3', {}, 'Ce qui change'), h('p', {}, 'Tous les téléphones : duel, épée, vaisseau en équipe.'),
        h('p', {}, 'Plus tard, les téléphones avec la puce UWB (par exemple Pixel Pro, Galaxy S Plus ou Ultra, iPhone) pourront viser l\'autre avec précision.')),
      h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: () => onboarding(0) }, 'Retour'), h('button', { class: 'btn', onclick: () => onboarding(2) }, 'Suivant'))));
  } else if (step === 2) {
    const list = h('div', { class: 'card' }, h('p', { class: 'mut' }, 'Rien n\'a été demandé pour l\'instant.'));
    const btn = h('button', { class: 'btn big', onclick: async () => { btn.disabled = true; await askAllPermissions(list); btn.disabled = false; btn.textContent = 'Terminé, suivant'; btn.onclick = () => onboarding(3); next.style.display = 'none'; } }, 'Tout autoriser');
    const next = h('button', { class: 'btn sec', onclick: () => onboarding(3) }, 'Passer');
    show(topbar('Autorisations', () => onboarding(1)), h('div', { class: 'scroll' }, dots(2, N), scene(2),
      h('h2', {}, 'Les autorisations'),
      h('p', {}, 'Appuie sur « Tout autoriser » puis réponds OUI à toutes les questions du téléphone. On ne te les redemandera plus jamais.'),
      list, btn, next));
  } else {
    const code = newCode();
    show(topbar('Liaison et réglages', () => onboarding(2)), h('div', { class: 'scroll' }, dots(3, N), scene(3),
      h('h2', {}, 'Dernière étape : les deux téléphones'),
      h('p', {}, 'Il faut les deux téléphones pour régler la liaison. Un téléphone crée la partie, l\'autre la rejoint avec le code. On fait les petits tests ensemble.'),
      h('button', { class: 'btn big', onclick: () => pairing(true) }, 'Faire la liaison maintenant'),
      h('button', { class: 'btn sec', onclick: () => { store.set('onboarded', true); toast('Tu pourras faire la liaison plus tard.'); home(); } }, 'Plus tard, j\'ai un seul téléphone')));
    void code;
  }
}

/** Demande tous les accès d'un coup. Chaque ligne dit clairement ce qui s'est passé. */
async function askAllPermissions(listEl) {
  listEl.replaceChildren();
  const row = (name, st, msg) => { const el = h('div', { class: 'row', style: 'align-items:center;flex-wrap:wrap;gap:4px 8px;position:static' }, h('span', { style: 'flex:2 1 150px;min-width:0' }, name), h('span', { class: 'badge ' + st, style: 'flex:1;text-align:center' }, st === 'ok' ? 'OK' : st === 'ko' ? 'Refusé' : 'Absent')); if (msg) el.append(h('p', { class: 'mut', style: 'flex:1 0 100%;margin:0;position:static' }, msg)); listEl.append(el); };
  const dp = duo();
  let native = {};
  if (dp) { try { native = await dp.requestAll(); } catch (e) { native = {}; } }
  const mo = await sensors.askMotionPermission(); sensors.start();
  row('Mouvements (secousses, inclinaison)', mo ? 'ok' : 'ko', mo ? '' : 'Sans ça, utilise les boutons à l\'écran.');
  let mic = native.mic;
  if (mic == null) { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); mic = true; } catch { mic = false; } }
  row('Micro (attaques à la voix)', mic ? 'ok' : 'ko', mic ? '' : 'Sans micro, les attaques spéciales se font au bouton.');
  let loc = native.location;
  if (loc == null) loc = await new Promise(r => { if (!navigator.geolocation) return r(false); navigator.geolocation.getCurrentPosition(() => r(true), () => r(false), { timeout: 8000 }); });
  row('Position (radar, cache-cache)', loc ? 'ok' : 'ko', loc ? '' : 'Sans position, le radar ne marche pas.');
  if (dp) row('Bluetooth et appareils proches', native.nearby ? 'ok' : 'ko', native.nearby ? '' : 'Sans ça, la liaison directe sera remplacée par internet.');
  else row('Bluetooth direct', 'skip', 'Disponible dans l\'application installée (APK).');
  row('Vibration', myCaps().vibrate ? 'ok' : 'skip', '');
  store.set('perms', { mo, mic: !!mic, loc: !!loc, ts: Date.now() });
}

/* ============ Liaison : créer / rejoindre ============ */
function pairing(fromOnboarding = false) {
  setBg('appairage');
  state.remi = false; stopBot();
  const back = () => fromOnboarding ? onboarding(3) : home();
  show(topbar('Jouer à deux', back), h('div', { class: 'scroll' },
    h('p', {}, 'Un téléphone CRÉE la partie et donne le code à 4 chiffres. L\'autre REJOINT avec ce code.'),
    h('button', { class: 'btn big', onclick: () => doCreate(fromOnboarding) }, 'Créer la partie'),
    h('button', { class: 'btn sec big', onclick: () => giveApp() }, 'Donner l\'appli à un ami (sans internet)'),
    h('button', { class: 'btn sec big', onclick: () => doCreate(fromOnboarding, true) }, 'Inviter un ami par internet (lien)'),
    h('div', { class: 'card' }, h('h3', {}, 'Rejoindre'), codeInput(code => doJoin(code, fromOnboarding)))));
}
function codeInput(onGo) {
  const inp = h('input', { type: 'tel', inputmode: 'numeric', maxlength: 4, class: 'codeinput', placeholder: '0000', 'aria-label': 'Code à 4 chiffres' });
  return h('div', { class: 'card', style: 'padding:0;background:none' }, inp, h('button', { class: 'btn', onclick: () => { if (!/^\d{4}$/.test(inp.value)) { toast('Écris les 4 chiffres du code.'); return; } onGo(inp.value); } }, 'Rejoindre'));
}
function order() {
  const o = Q.get('order'); if (o) return o.split(',');
  return nativeAvailable() ? ['nearby', 'peer'] : (typeof window.Peer === 'function' ? ['peer', 'local'] : ['local']);
}
const STEP_TXT = { nearby: 'Liaison directe (Bluetooth)', peer: 'Liaison par internet', local: 'Liaison sur cet appareil' };
async function doCreate(fromOnboarding, invite = false) { await connecting('host', newCode(), fromOnboarding, invite); }
async function doJoin(code, fromOnboarding) { await connecting('guest', code, fromOnboarding); }

async function connecting(role, code, fromOnboarding, invite = false) {
  setBg('appairage');
  const steps = h('div', { class: 'card' });
  const status = {};
  const draw = () => steps.replaceChildren(...Object.entries(status).map(([n, s]) => h('div', { class: 'row', style: 'align-items:center;flex-wrap:wrap;gap:4px 8px;position:static' }, h('span', { style: 'flex:2 1 150px;min-width:0' }, STEP_TXT[n] || n), h('span', { class: 'badge ' + (s === 'ok' ? 'ok' : s === 'essai' ? 'run' : s === 'echec' ? 'ko' : 'skip'), style: 'flex:1;text-align:center' }, { ok: 'OK', essai: 'Essai…', echec: 'Échec', absent: 'Absent' }[s]))));
  show(topbar(role === 'host' ? 'Partie créée' : 'Connexion…', () => { net.close(); pairing(fromOnboarding); }), h('div', { class: 'scroll' },
    spinner(48), role === 'host' ? h('div', {}, invite ? h('div', {}, h('p', {}, 'Envoie ce lien à ton ami. Il n\'a rien à installer.'),
        h('button', { class: 'btn big', onclick: () => shareInvite(code) }, 'Envoyer l\'invitation'), h('p', { class: 'mut' }, 'Code : ' + code)) : h('div', {}, h('p', {}, 'Dis ce code à l\'autre joueur :'), h('div', { class: 'code' }, code))) : h('p', {}, 'Je cherche la partie ' + code + '…'),
    h('p', { class: 'mut' }, 'Les deux téléphones doivent être près l\'un de l\'autre (ou connectés à internet).'), steps));
  try {
    await net.connect(role, code, { order: order(), onStep: (n, s) => { status[n] = s; draw(); } });
  } catch (e) {
    show(topbar('Liaison impossible', () => pairing(fromOnboarding)), h('div', { class: 'scroll' },
      h('div', { class: 'card' }, scene(13), h('h3', {}, 'Ça n\'a pas marché'), h('p', {}, 'Vérifie : Bluetooth et localisation allumés sur les deux, le même code, et les deux téléphones proches. Sinon, mets internet sur les deux.'), h('p', { class: 'mut' }, String(e.message || e))),
      h('button', { class: 'btn big', onclick: () => pairing(fromOnboarding) }, 'Réessayer')));
    return;
  }
  net.send('hello', { model: myModel(), caps: myCaps(), build: BUILD, v: 2 });
  await sleep(400);
  if (fromOnboarding) calibration(); else lobby();
}

async function shareInvite(code) {
  const url = INVITE_URL + '#' + code, text = 'Viens jouer avec moi à Duo Jeux ! Ouvre ce lien (rien à installer) :';
  try { if (navigator.share) { await navigator.share({ title: 'Duo Jeux', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Lien copié. Colle-le dans un message.'); }
  catch { modal('Ton lien', [h('p', { style: 'word-break:break-all' }, url)], [{ label: 'OK' }]); }
}

/* Envoi des jeux à un invité sans application : en mémoire chez lui, jamais enregistrés. */
const modCache = {};
async function gzip64(str) {
  try {
    if (!window.CompressionStream) return null;
    const buf = new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch { return null; }
}
// Un seul aller-retour dans le cas courant : le jeu part compressé en 1 à 3 morceaux, l'invité redemande seulement ceux qui manquent.
async function pushModule(id) {
  const p = state.partner; if (!p || !p.web) return true;
  const b = p.base || '', key = id + '|' + b + '|' + (p.v || 1);
  if (!modCache[key]) {
    let src = await (await fetch('js/games/' + id + '.js')).text();
    src = src.replace(/from\s+'\.\/([\w-]+\.js)'/g, (_, f) => `from '${b}js/games/${f}'`).replace(/from\s+'\.\.\/core\/([\w-]+\.js)'/g, (_, f) => `from '${b}js/core/${f}'`);
    const zz = (p.v || 1) >= 2 ? await gzip64(src) : null;
    const data = zz || src, size = zz ? 9000 : 3000;
    modCache[key] = { z: zz ? 1 : 0, parts: data.match(new RegExp('[\\s\\S]{1,' + size + '}', 'g')) || [] };
  }
  const { z, parts } = modCache[key];
  let ok = false, bad = false;
  const send = i => net.send('mod', { id, i, n: parts.length, d: parts[i], z });
  const offs = [net.on('mod_ok', m => { if (m.id === id) ok = true; }), net.on('mod_fail', m => { if (m.id === id) bad = true; }),
    net.on('mod_need', m => { if (m.id === id) (m.miss || []).forEach(send); })];
  parts.forEach((_, i) => send(i));
  for (let t = 0; t < 80 && !ok && !bad; t++) { await sleep(250); if (t % 16 === 15) parts.forEach((_, i) => send(i)); }
  offs.forEach(f => f()); return ok;
}

async function calibration() {
  setBg('appairage');
  const out = h('div', { class: 'card' }); const bar = h('div', { class: 'meter' }, h('i'));
  show(topbar('Réglage à deux', () => { net.close(); pairing(true); }), h('div', { class: 'scroll' }, scene(14), h('h2', {}, 'Petit test des deux téléphones'), h('p', {}, 'Ne bouge pas, ça prend quelques secondes.'), bar, out));
  const line = (t, st, msg) => out.append(h('div', { class: 'row', style: 'align-items:center;flex-wrap:wrap;gap:4px 8px;position:static' }, h('span', { style: 'flex:2 1 150px;min-width:0' }, t), h('span', { class: 'badge ' + st, style: 'flex:1;text-align:center' }, st === 'ok' ? 'OK' : st === 'ko' ? 'À revoir' : 'Passé'), msg ? h('p', { class: 'mut', style: 'flex:1 0 100%;margin:0;position:static' }, msg) : null));
  const r = await linkTest(p => bar.firstChild.style.width = p + '%');
  line('Vitesse de liaison', r.latency != null && r.latency < 150 ? 'ok' : 'ko', r.latency == null ? 'Aucune réponse.' : r.latency + ' ms en moyenne (moins c\'est mieux)');
  line('Messages perdus', r.loss <= 10 ? 'ok' : 'ko', r.loss + ' % perdus sur 30 envois');
  line('Les deux téléphones se comprennent', state.partner ? 'ok' : 'ko', state.partner ? 'Autre téléphone : ' + modelLabel(state.partner.model) : 'Pas de réponse.');
  store.set('onboarded', true);
  out.append(h('button', { class: 'btn big', style: 'margin-top:10px', onclick: () => lobby() }, 'Aller aux jeux'));
}

/** Mesure latence et pertes avec l'autre téléphone. */
async function linkTest(onProgress = () => {}) {
  const N = 30; let got = 0; const lat = [];
  const sent = {}; const off = net.on('stecho_r', m => { got++; if (sent[m.n] != null) lat.push(performance.now() - sent[m.n]); });
  for (let i = 0; i < N; i++) { sent[i] = performance.now(); net.send('stecho', { n: i }); onProgress(Math.round((i + 1) / N * 100)); await sleep(40); }
  await sleep(1200); off();
  return { latency: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length / 2) : null, loss: Math.round((N - got) / N * 100) };
}


/* Catégories du menu des jeux */
const CATS = [['all', 'Tous'], ['action', 'Action'], ['plateau', 'Plateau'], ['cartes', 'Cartes'], ['reflexe', 'Réflexe'], ['capteurs', 'Capteurs'], ['aventure', 'Aventure']];
const GAME_CAT = { missiles: 'action', tour: 'action', epee: 'action', vaisseau: 'action', radar: 'aventure', foret: 'aventure', tresor: 'aventure', soleil: 'aventure', pas: 'aventure', patate: 'reflexe', billes: 'reflexe', cris: 'reflexe', chirurgien: 'reflexe', simon: 'reflexe', dessin: 'reflexe', couleurs: 'reflexe', mastermind: 'reflexe', pfc: 'reflexe', calcul: 'reflexe', sortie: 'reflexe', echecs: 'plateau', dames: 'plateau', puissance4: 'plateau', morpion: 'plateau', navale: 'plateau', othello: 'plateau', bataille: 'cartes', memory: 'cartes', familles: 'cartes', blackjack: 'cartes', hache: 'capteurs', pointeurs: 'capteurs', brasdefer: 'capteurs' };
const catOf = id => GAME_CAT[id] || 'reflexe';

/* ============ Salle de jeux ============ */
function versionWarn() {
  const p = state.partner;
  if (state.remi || !p || p.web || !p.build || !BUILD || p.build === BUILD) return null;
  const behind = p.build > BUILD;
  return h('div', { class: 'card' }, h('h3', {}, 'Versions différentes'),
    h('p', {}, behind ? 'L\'autre téléphone a une version plus récente (' + p.build + ') que la tienne (' + BUILD + '). Certains jeux pourraient mal marcher.' : 'L\'autre téléphone a une version plus ancienne (' + p.build + ') que la tienne (' + BUILD + '). Dis-lui de mettre à jour (Réglages).'),
    behind ? h('button', { class: 'btn', onclick: () => lookForUpdate(true) }, 'Mettre à jour') : null);
}
function lobby() {
  setBg('menu');
  if (!state.remi && !net.connected) { pairing(); return; }
  const mine = myCaps(), theirs = state.partner ? state.partner.caps : null;
  const capsList = theirs ? [mine, theirs] : [mine];
  const isHost = state.remi || net.role === 'host';
  const cards = GAMES.map(g => {
    const v = gameVerdict(g.id, capsList);
    return h('div', { class: 'card gamecard', style: '--gc:' + (GAME_COLORS[g.id] || '#27e0b3') }, h('div', { class: 'ico' }, h('img', { class: 'cov', src: 'img/cov/' + g.id + '.webp', alt: '', onerror: e => { const d = e.target.parentNode; d.innerHTML = art[g.id] ? art[g.id](64) : ''; } })),
      h('div', { class: 'txt' }, h('h3', {}, g.name), h('p', { class: 'mut' }, g.short),
        v.ok ? (v.less.length ? h('p', { class: 'mut' }, 'Marche, avec moins d\'options : il manque ' + v.less.map(c => CAP_NAMES[c]).join(', ') + '. ' + (v.note || '')) : h('span', { class: 'badge ok' }, 'Marche sur vos deux téléphones'))
          : h('p', {}, h('span', { class: 'badge ko' }, 'Impossible ici'), ' Il manque : ' + v.miss.map(c => CAP_NAMES[c]).join(', ') + '.'),
        h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: () => howTo(g) }, 'Règles'),
          isHost ? h('button', { class: 'btn', disabled: !v.ok, onclick: async () => { toast('Je prépare le jeu…'); if (!state.remi) { if (!(await pushModule(g.id))) { toast('Le jeu n\'est pas arrivé chez ton ami (connexion trop faible ?). Réessaie, ou choisis un autre jeu.'); return; } net.send('start', { id: g.id }); } launch(g.id); } }, 'Jouer') : h('span', { class: 'mut', style: 'align-self:center' }, 'L\'autre lance'))));
  });
  state.cat = state.cat || 'all';
  const list = h('div', { class: 'glist' });
  const tabs = h('div', { class: 'cats', role: 'tablist' });
  const paint = () => {
    tabs.replaceChildren(...CATS.map(([id, label]) => { const n = id === 'all' ? GAMES.length : GAMES.filter(g => catOf(g.id) === id).length; if (!n) return null;
      return h('button', { class: 'btn sec cat' + (state.cat === id ? ' on' : ''), role: 'tab', 'aria-selected': String(state.cat === id), onclick: () => { state.cat = id; paint(); try { tabs.scrollIntoView({ block: 'start' }); } catch {} } }, label + ' (' + n + ')'); }).filter(Boolean));
    list.replaceChildren(...cards.filter((_, i) => state.cat === 'all' || catOf(GAMES[i].id) === state.cat));
  };
  paint();
  show(topbar(state.remi ? 'Jouer avec Rémi' : 'Choisis un jeu', () => { stopBot(); state.remi = false; net.close(); state.partner = null; home(); }), h('div', { class: 'scroll' },
    state.remi ? levelPicker() : null,
    versionWarn(),
    state.remi ? h('div', { class: 'card hero' }, remiPose('r_p1', 120), h('div', { class: 'bubble' }, 'Salut, c\'est Rémi ! À quoi on joue ?')) : h('div', { class: 'card' }, h('p', {}, 'Liaison : ' + ({ nearby: 'directe (Bluetooth)', peer: 'par internet', local: 'sur cet appareil' }[net.method] || '…')), h('p', { class: 'mut' }, state.partner ? 'Autre téléphone : ' + modelLabel(state.partner.model) : 'L\'autre téléphone se présente…'),
      h('p', { class: 'mut', id: 'lat' }, net.latency != null ? 'Vitesse : ' + net.latency + ' ms' : '')),
    h('button', { class: 'btn sec', style: 'display:flex;align-items:center;gap:12px;justify-content:center', onclick: () => myCharacter(lobby) }, h('span', { html: avatarSvg(profile.get().avatar, 36) }), 'Mon personnage : ' + profile.get().name),
    !isHost ? h('p', { class: 'bigtxt' }, 'Attends : celui qui a créé la partie choisit le jeu.') : null, tabs, list));
}
function levelPicker(after) {
  const draw = () => box.replaceChildren(h('h3', { class: 'bi', style: 'justify-content:flex-start' }, ico('ic_sliders', 34), 'Difficulté'), h('div', { class: 'row', style: 'flex-wrap:wrap' }, ...LEVELS.map(l => h('button', { class: 'btn ' + (l.n === level() ? '' : 'sec'), style: 'min-width:30%;min-height:52px', onclick: () => { setLevel(l.n); draw(); after && after(); } }, h('span', { class: 'bi', style: 'flex-direction:column;gap:2px' }, remiPose('r_l' + l.n, 62), h('span', {}, l.n + ' ' + l.name))))), h('p', { class: 'mut' }, LEVELS[level() - 1].txt));
  const box = h('div', { class: 'card' }); draw(); return box;
}
function howTo(g) {
  modal(g.name, [h('div', { class: 'hero', html: art[g.id] ? art[g.id](96) : '' }), ...g.how.map((t, i) => h('div', { class: 'stepline' }, h('span', { class: 'num' }, String(i + 1)), h('span', {}, t)))], [{ label: 'OK' }]);
}

let bot = null;
function stopBot() { if (bot) { bot.stop(); bot = null; } }
function remiLobby() { stopBot(); state.remi = true; state.partner = { model: 'remi', caps: remiCaps() }; lobby(); }
function launch(id) {
  const def = gameById(id); if (!def) return;
  if (state.current) { state.current.destroy(); state.current = null; }
  state.game = id;
  const mk = () => {
    const root = h('div', { class: 'screen' }); const bar = h('div', { class: 'bar' }, h('button', { class: 'btn sec', style: 'min-height:44px;padding:6px 14px', onclick: () => (state.current && !state.current.over ? askQuitGame() : quit()) }, 'Quitter'), h('h1', {}, def.name));
    setBg(''); app.replaceChildren(h('div', { class: 'screen' }, bar, root)); backFn = null;
    stopBot(); if (state.remi) bot = createRemi(id, { tts });
    const gnet = state.remi ? bot : net;
    state.current = def.create({ root, net: gnet, sensors, role: gnet.role, gameId: id, tts, exit: () => quit(), restart: () => { state.current && state.current.destroy(); state.current = null; mk(); } });
  };
  const quit = () => { if (state.current) { state.current.destroy(); state.current = null; } stopBot(); if (!state.remi) net.send('exit'); lobby(); };
  state.quitGame = quit;
  tts.speak(def.name);
  mk();
}

function sensorScreen() {
  setBg('cabine'); sensors.askMotionPermission(); const p = sensorPanel(sensors); const back = () => { p.stop(); settings(); };
  show(topbar('Capteurs', back), h('div', { class: 'scroll' }, p.el, h('button', { class: 'btn sec', onclick: back }, 'Retour')));
}
/* ============ Test du téléphone ============ */
function selftest() { setBg('sousmarin'); runSelfTest({ show, topbar, home, net, sensors, geo, state, linkTest, nativeAvailable }); }

/* ============ Aide ============ */
function help() {
  setBg('porte');
  const SC = { 1: 1, 2: 3, 3: 4, 4: 5, 5: 8, 6: 9 };
  const step = (n, t) => h('div', { class: 'card' }, scene(SC[n]), h('h3', {}, n + '. ' + t[0]), h('p', {}, t[1]));
  show(topbar('Comment ça marche ?', home), h('div', { class: 'scroll' },
    step(1, ['Deux téléphones', 'Chacun a l\'application. Vous restez à un mètre : on ne touche jamais l\'autre téléphone.']),
    step(2, ['Un code', 'Un joueur appuie sur « Créer la partie » et lit le code à 4 chiffres. L\'autre l\'écrit dans « Rejoindre ».']),
    step(3, ['Un jeu', 'Celui qui a créé la partie choisit le jeu. Le jeu s\'ouvre sur les deux téléphones.']),
    step(4, ['Les commandes', 'Incline le téléphone pour bouger, secoue pour attaquer, bouton de volume du côté pour te protéger.']),
    step(5, ['Pas d\'ami sous la main ?', 'Touche « Jouer seul avec Rémi » : Rémi joue à ta place, à tous les jeux.']),
    step(6, ['Sans internet ?', 'Oui ! La liaison directe (Bluetooth) marche sans internet. Internet sert seulement pour jouer de loin.']),
    h('div', { class: 'card' }, scene(10), h('h3', {}, 'Si l\'installation est bloquée'), h('p', {}, 'Samsung : Paramètres, Sécurité et confidentialité, Auto Blocker, désactiver. Google : Play Protect, puis « Installer quand même ».'))));
}

/* ============ Réglages ============ */
function settings() {
  setBg('cabine');
  const tog = (key, label, def = true) => { const c = h('input', { type: 'checkbox', checked: store.get(key, def), style: 'width:28px;height:28px', onchange: e => store.set(key, e.target.checked) }); return h('label', { class: 'row', style: 'align-items:center' }, h('span', { style: 'flex:3' }, label), c); };
  const vs = tts.voices();
  const voice = h('select', { onchange: e => { store.set('voice', e.target.value); tts.speak('Bonjour, voici ma voix.'); } }, vs.length ? vs.map(v => h('option', { value: v.name, selected: v.name === store.get('voice') }, v.name)) : [h('option', {}, 'Aucune voix française trouvée')]);
  const thr = h('input', { type: 'range', min: 8, max: 30, value: store.get('shakeThr', 16), style: 'width:100%;height:40px', oninput: e => store.set('shakeThr', +e.target.value) });
  show(topbar('Réglages', home), h('div', { class: 'scroll' },
    h('div', { class: 'card' }, h('h3', { class: 'bi', style: 'justify-content:flex-start' }, ico('ic_voice', 34), 'Voix'), tog('talk', 'Voix qui lit les consignes'), voice, h('button', { class: 'btn sec', onclick: () => tts.speak('Bonjour, je suis la voix de Duo Jeux.') }, 'Écouter la voix'), vs.length ? null : h('p', { class: 'mut' }, 'Installe une voix française dans les réglages « Synthèse vocale » du téléphone.')),
    h('div', { class: 'card' }, h('h3', { class: 'bi', style: 'justify-content:flex-start' }, ico('ic_refresh', 34), 'Mise à jour'), h('p', { class: 'mut' }, 'Version ' + VERSION + ' (' + BUILD + ')'), h('button', { class: 'btn', onclick: () => lookForUpdate(true) }, 'Chercher une mise à jour')),
    levelPicker(),
    h('div', { class: 'card' }, h('h3', { class: 'bi', style: 'justify-content:flex-start' }, ico('ic_robot', 34), 'Rémi'), tog('remiHumor', 'Rémi fait des blagues', false), tog('remiVoice', 'Rémi parle à voix haute')),
    h('div', { class: 'card' }, h('h3', { class: 'bi', style: 'justify-content:flex-start' }, ico('ic_speaker', 34), 'Sons et vibrations'), tog('sound', 'Sons du jeu'), tog('vib', 'Vibrations'), tog('invertTilt', 'Inverser l\'inclinaison', false)),
    h('div', { class: 'card' }, scene(6), h('h3', { class: 'bi', style: 'justify-content:flex-start' }, ico('ic_shake', 34), 'Force de la secousse'), h('p', { class: 'mut' }, 'À gauche : une petite secousse suffit. À droite : il faut secouer fort.'), thr),
    h('div', { class: 'card' }, h('h3', {}, 'Capteurs'), h('p', { class: 'mut' }, 'Règle la sensibilité de l\'inclinaison, remets le téléphone à zéro et vois les capteurs en direct.'), h('button', { class: 'btn', onclick: () => sensorScreen() }, 'Sensibilité des capteurs')),
    h('button', { class: 'btn sec', onclick: () => { store.del('onboarded'); onboarding(0); } }, 'Refaire la configuration de départ')));
}

preload().then(boot, boot);
