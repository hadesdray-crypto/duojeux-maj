// Test du téléphone : vérifie chaque élément et dit clairement ce qui marche, ce qui ne marche pas, et pourquoi.
import { h, sleep, store } from './core/util.js';
import { ico } from './core/ui.js';
import { sensorPanel } from './core/sensorui.js';
const IC = [['tactile', 'ic_pad'], ['Son', 'ic_speaker'], ['Vibration', 'ic_vibrate'], ['Secousse', 'ic_shake'], ['volume', 'ic_sidebtn'], ['Voix', 'ic_voice'], ['GPS', 'ic_gps'], ['Boussole', 'ic_gps'], ['avant', 'ic_tilt'], ['Inclinaison', 'ic_tilt'], ['Micro', 'ic_mic'], ['Liaison', 'ic_link']];
const icOf = n => { const k = IC.find(x => n.includes(x[0])); return k ? ico(k[1], 32) : null; };

const wait = (cond, ms) => new Promise(res => { const t0 = performance.now(); const i = setInterval(() => { if (cond()) { clearInterval(i); res(true); } else if (performance.now() - t0 > ms) { clearInterval(i); res(false); } }, 100); });

export function runSelfTest(env) {
  const { show, topbar, home, net, sensors: S, geo, linkTest } = env;
  const results = []; let skipFlag = false;
  const list = h('div', { class: 'card' }); const prompt = h('div', { class: 'card' }, h('p', {}, 'Appuie sur « Tout tester ». Quand on te le demande, fais le geste.'));
  const skipBtn = h('button', { class: 'btn sec', style: 'display:none', onclick: () => skipFlag = true }, 'Passer ce test');
  const go = h('button', { class: 'btn big', onclick: () => runAll() }, 'Tout tester');
  const live = h('button', { class: 'btn sec', onclick: () => { S.askMotionPermission(); const p = sensorPanel(S); const back = () => { p.stop(); runSelfTest(env); }; show(topbar('Capteurs en direct', back), h('div', { class: 'scroll' }, p.el, h('button', { class: 'btn sec', onclick: back }, 'Retour'))); } }, 'Voir les capteurs en direct');
  show(topbar('Test du téléphone', home), h('div', { class: 'scroll' }, prompt, list, skipBtn, go, live));

  const add = (name) => { const b = h('span', { class: 'badge run', style: 'flex:1;text-align:center' }, 'En cours'); const m = h('p', { class: 'mut', style: 'flex-basis:100%' }); const row = h('div', { class: 'row', style: 'align-items:center;flex-wrap:wrap' }, h('span', { style: 'flex:2;display:flex;align-items:center;gap:8px' }, icOf(name), name), b, m); list.append(row); return (st, msg) => { b.className = 'badge ' + st; b.textContent = { ok: 'OK', ko: 'À revoir', skip: 'Passé' }[st] || st; m.textContent = msg || ''; results.push({ name, st, msg }); }; };
  const say = t => { prompt.replaceChildren(h('p', { class: 'bigtxt' }, t)); };
  const ask = (q) => new Promise(res => { prompt.replaceChildren(h('p', { class: 'bigtxt' }, q), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => res(true) }, 'Oui'), h('button', { class: 'btn bad', onclick: () => res(false) }, 'Non'))); });
  const interactive = async (cond, ms, text) => { skipFlag = false; skipBtn.style.display = 'block'; say(text); const ok = await wait(() => cond() || skipFlag, ms); skipBtn.style.display = 'none'; return skipFlag && !cond() ? 'skip' : ok ? 'ok' : 'ko'; };

  async function runAll() {
    go.disabled = true; list.replaceChildren(); results.length = 0; const caps = S.caps;
    let r;
    // 1. Écran tactile
    r = add('Écran tactile'); { let tapped = false; const tgt = h('button', { class: 'btn big', onclick: () => tapped = true }, 'Touche ici'); prompt.replaceChildren(h('p', { class: 'bigtxt' }, 'Touche le bouton'), tgt); const ok = await wait(() => tapped, 8000); r(ok ? 'ok' : 'ko', ok ? '' : 'Aucun toucher reçu en 8 secondes.'); }
    // 2. Son
    r = add('Son'); S.beep(660, 250, 'triangle', .3); await sleep(300); { const ok = await ask('As-tu entendu un bip ?'); r(ok ? 'ok' : 'ko', ok ? '' : 'Monte le volume, retire le mode silencieux.'); }
    // 3. Vibration
    r = add('Vibration'); if (!caps.vibrate) r('skip', 'Ce téléphone ne vibre pas depuis l\'appli.'); else { S.vibrate(400); await sleep(500); const ok = await ask('As-tu senti une vibration ?'); r(ok ? 'ok' : 'ko', ok ? '' : 'Active la vibration dans les réglages du téléphone.'); }
    // 4. Inclinaison
    r = add('Inclinaison'); { const st = await interactive(() => Math.abs(S.tilt) > .6, 10000, 'Incline le téléphone à gauche puis à droite'); r(st, st === 'ok' ? '' : st === 'ko' ? 'Capteur non détecté : le jeu utilisera les boutons GAUCHE / DROITE.' : ''); }
    // 5. Secousse
    r = add('Secousse (épée)'); { let shook = false; const off = S.on('shake', () => shook = true); const st = await interactive(() => shook, 10000, 'Secoue le téléphone'); off(); r(st, st === 'ko' ? 'Secousse non détectée : le bouton ATTAQUE la remplace. Tu peux baisser la force dans Réglages.' : ''); }
    // 6. Boutons de volume
    r = add('Boutons de volume (bouclier)'); if (!caps.volume) r('skip', 'Lisibles seulement dans l\'application installée : sinon bouton BOUCLIER à l\'écran.'); else { let pressed = false; const off = S.on('shield', () => pressed = true); const st = await interactive(() => pressed, 10000, 'Appuie sur un bouton de volume du côté'); off(); r(st, st === 'ko' ? 'Non détecté : le bouton BOUCLIER à l\'écran sera utilisé.' : ''); }
    // 7. Voix
    r = add('Voix (attaque spéciale)'); if (!caps.voice) r('skip', 'Pas de reconnaissance vocale : bouton SPÉCIAL à l\'écran.'); else { let heard = false; const off = S.on('voice', () => heard = true); const started = await S.startVoice(); if (!started) { off(); r('ko', 'Micro non autorisé ou non disponible : bouton SPÉCIAL à l\'écran.'); } else { const st = await interactive(() => heard, 10000, 'Dis « éclair » à voix haute'); off(); S.stopVoice(); r(st, st === 'ko' ? 'Rien entendu : bouton SPÉCIAL à l\'écran.' : ''); } }
    // 8. GPS
    r = add('GPS (radar, cache-cache)'); if (!caps.gps) r('skip', 'Pas de GPS.'); else { let fix = null; const started = geo.start(p => { if (p) fix = p; }); say('Je cherche le GPS… (mieux dehors)'); await wait(() => fix, 15000); geo.stop(); r(fix ? 'ok' : 'ko', fix ? 'Précision environ ' + Math.round(fix.acc || 0) + ' m' : 'Pas de position : active la localisation et va dehors.'); void started; }
    // 9. Boussole
    r = add('Boussole (radar)'); { const ok = await wait(() => S.compassSeen, 2500); r(ok ? 'ok' : 'skip', ok ? '' : 'Pas de boussole : le radar gardera le nord en haut.'); }
    r = add('Inclinaison avant/arrière (billes)'); { const b0 = S.beta; const st = await interactive(() => Math.abs((S.beta || 0) - (b0 || 0)) > 25, 10000, 'Penche le téléphone vers l\'avant puis vers toi'); r(st, st === 'ok' ? '' : 'Non détecté : le jeu des billes utilisera les 4 boutons.'); }
    r = add('Micro (bataille de cris)'); { const ok = await S.startMic(); if (!ok) r('skip', 'Micro non autorisé : on tapera sur le bouton à la place.'); else { say('Dis « Ahhh » fort'); const st = await interactive(() => S.micLevel() > .15, 8000, 'Fais un bruit ou crie un peu'); S.stopMic(); r(st, st === 'ko' ? 'Rien entendu : on tapera sur le bouton à la place.' : ''); } }
    // 10. Liaison
    r = add('Liaison avec l\'autre téléphone'); if (!net.connected) r('skip', 'Pas connecté. Crée ou rejoins une partie, puis relance ce test pour mesurer la liaison.'); else { say('Je mesure la liaison…'); const t = await linkTest(); r(t.latency != null && t.latency < 150 && t.loss <= 10 ? 'ok' : 'ko', t.latency == null ? 'Aucune réponse de l\'autre téléphone.' : 'Vitesse ' + t.latency + ' ms, ' + t.loss + ' % de messages perdus.'); }
    const bad = results.filter(x => x.st === 'ko').length;
    store.set('lastSelfTest', { ts: Date.now(), bad });
    prompt.replaceChildren(h('p', { class: 'bigtxt' }, bad === 0 ? 'Tout est bon !' : bad + ' point(s) à revoir'), h('p', { class: 'mut' }, 'Les points « Passé » ne sont pas des pannes : un autre moyen est prévu dans le jeu.'));
    go.disabled = false; go.textContent = 'Refaire le test';
  }
}
