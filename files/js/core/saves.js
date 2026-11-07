// Parties enregistrées sur le téléphone + historique des victoires par adversaire et par jeu.
// Une partie est liée à UN adversaire (son identifiant de personnage, « pid ») : on ne peut la reprendre qu'avec lui.
// Chaque téléphone garde sa copie ; à la reprise les deux copies sont comparées (numéro de coup + empreinte) et, si elles
// diffèrent, on garde la plus avancée quand elles sont compatibles, sinon le dernier coup commun.
import { store, h, modal, toast } from './util.js';
import { profile } from './profile.js';

const MAX_SAVES = 40;
let T = null; // mode test : deux « téléphones » dans le même navigateur gardent chacun leurs parties en mémoire

const rd = () => (T ? T.s : (() => { const v = store.get('saves', {}); return v && typeof v === 'object' ? v : {}; })());
const wr = o => { if (T) T.s = o; else store.set('saves', o); };
const rdH = () => (T ? T.h : (() => { const v = store.get('hist', {}); return v && typeof v === 'object' ? v : {}; })());
const wrH = o => { if (T) T.h = o; else store.set('hist', o); };

/** Empreinte courte (FNV-1a) d'un texte ou d'une valeur JSON. */
export function hash(x) {
  const s = typeof x === 'string' ? x : JSON.stringify(x); let a = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 0x01000193) >>> 0; }
  return a.toString(36);
}
export const newId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/** Longueur du début commun de deux listes de coups (comparés par texte). */
export function commonPrefix(a, b) { let i = 0; const n = Math.min(a.length, b.length); while (i < n && JSON.stringify(a[i]) === JSON.stringify(b[i])) i++; return i; }
export const fmtDate = ts => { try { return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export const saves = {
  /** Tests : chaque téléphone a sa propre mémoire, comme profile.testMode. */
  testMode() { T = { s: {}, h: {} }; },
  list(game) { const o = rd(); return Object.values(o).filter(r => r && (!game || r.game === game)).sort((a, b) => (b.updated || 0) - (a.updated || 0)); },
  get(id) { return rd()[id] || null; },
  put(rec) {
    const o = rd(); rec.updated = Date.now(); o[rec.id] = rec;
    const ids = Object.keys(o); if (ids.length > MAX_SAVES) for (const k of ids.sort((x, y) => (o[x].updated || 0) - (o[y].updated || 0)).slice(0, ids.length - MAX_SAVES)) delete o[k];
    wr(o); return rec;
  },
  del(id) { const o = rd(); if (o[id]) { delete o[id]; wr(o); } },
  /** Garde en mémoire le résultat d'une partie terminée : res = 'w' | 'l' | 'd'. */
  result(game, opp, res) {
    if (!game || !opp || !opp.pid || !['w', 'l', 'd'].includes(res)) return;
    const o = rdH(); const e = o[opp.pid] || (o[opp.pid] = { name: '', g: {} });
    e.name = String(opp.name || e.name || '').slice(0, 14); e.at = Date.now();
    const g = e.g[game] || (e.g[game] = { w: 0, l: 0, d: 0 }); g[res]++;
    const ks = Object.keys(o); if (ks.length > 60) delete o[ks.sort((a, b) => (o[a].at || 0) - (o[b].at || 0))[0]];
    wrH(o);
  },
  history() { return rdH(); },
  /** Totaux contre un adversaire (pour un jeu, ou tous les jeux). */
  vs(pid, game) {
    const e = rdH()[pid]; const r = { w: 0, l: 0, d: 0 }; if (!e) return r;
    for (const [k, v] of Object.entries(e.g)) if (!game || k === game) { r.w += v.w; r.l += v.l; r.d += v.d; }
    return r;
  },
};

const plural = (n, a, b) => n + ' ' + (n > 1 ? b : a);
export const scoreText = r => plural(r.w, 'victoire', 'victoires') + ', ' + plural(r.l, 'défaite', 'défaites') + (r.d ? ', ' + plural(r.d, 'nul', 'nuls') : '');

/* ---------- Identification de l'adversaire ---------- */
/** Les deux téléphones s'échangent leur identifiant de personnage (pid). Rémi a l'identifiant « remi ». */
export function pidLink(g) {
  const me = profile.get(); g.oppPid = g.remi ? 'remi' : null;
  g.onNet('spid', m => {
    const first = !g.oppPid; g.oppPid = String(m.pid || '').slice(0, 40) || null;
    if (m.n && g.oppA && !g.remi) g.oppNameRaw = String(m.n).slice(0, 14);
    if (!m.re) g.net.send('spid', { pid: me.pid, n: me.name, re: true });
    if (first && g.onOppPid) g.onOppPid();
  });
  if (!g.remi) {
    const ask = () => { if (!g.oppPid && g.alive) g.net.send('spid', { pid: me.pid, n: me.name }); };
    ask(); const iv = setInterval(ask, 1200); g.sub(() => clearInterval(iv));
  }
}
/** Qui est l'adversaire (pour ranger la sauvegarde). */
export const oppOf = g => ({ pid: g.oppPid || (g.remi ? 'remi' : 'inconnu'), name: g.remi ? 'Rémi' : (g.oppNameRaw || g.oppA.name), avatar: g.oppA.avatar });

/* ---------- Reprise à deux ---------- */
/**
 * A = { mine(rec) -> info, decide(hostRec, info) -> {ok,why?,final,note?}, load(rec, final, note) }
 * Protocole : l'hôte demande (rs), l'invité répond avec ce qu'il a (rsa), l'hôte tranche et envoie le résultat (rgo).
 * Tout est répété tant qu'il n'y a pas de réponse (la liaison peut perdre un message).
 */
export function resumeProtocol(g, A) {
  let pend = null; let seenGo = null;
  const msgFail = why => ({ none: 'L\'autre téléphone n\'a pas cette partie enregistrée.', other: 'Cette partie a été commencée avec un autre adversaire : on ne peut la reprendre qu\'avec le même.', diff: 'Les deux sauvegardes ne correspondent pas (ce ne sont pas les mêmes parties).', side: 'Les deux sauvegardes donnent le même camp aux deux joueurs : impossible de reprendre.', far: 'Les deux sauvegardes se sont trop éloignées l\'une de l\'autre.' }[why] || 'Reprise impossible.');
  const fail = why => { pend = null; g.resumeFail ? g.resumeFail(msgFail(why), why) : toast(msgFail(why)); };
  g.onNet('rs', m => {
    const rec = saves.get(m.gid);
    if (!rec || rec.game !== g.ctx.gameId) { g.net.send('rsa', { gid: m.gid, ok: false, why: 'none' }); return; }
    if (rec.opp.pid !== g.oppPid || (m.pid && rec.opp.pid !== m.pid && m.pid !== profile.get().pid)) { g.net.send('rsa', { gid: m.gid, ok: false, why: 'other' }); return; }
    g.net.send('rsa', { gid: m.gid, ok: true, info: A.mine(rec) });
    if (g.resumeAsked) g.resumeAsked(rec);
  });
  g.onNet('rsa', m => {
    if (!pend || m.gid !== pend.gid || pend.decided) return;
    if (!m.ok) { fail(m.why); return; }
    const d = A.decide(pend.rec, m.info);
    if (!d.ok) { fail(d.why); return; }
    pend.decided = true; const gid = pend.gid, rec = pend.rec; pend = null;
    const send = () => g.net.send('rgo', { gid, final: d.final, note: d.note || '' }); send();
    if (!g.remi) { let n = 0; const iv = setInterval(() => { if (g.rgoAcked || ++n > 10 || !g.alive) clearInterval(iv); else send(); }, 1200); g.sub(() => clearInterval(iv)); }
    A.load(rec, d.final, d.note || '');
  });
  g.onNet('rgo', m => {
    g.net.send('rgoack', { gid: m.gid });
    if (seenGo === m.gid) return; const rec = saves.get(m.gid); if (!rec) return; seenGo = m.gid; A.load(rec, m.final, m.note || '');
  });
  g.onNet('rgoack', () => { g.rgoAcked = true; });
  return {
    /** Appelé par l'hôte : demande la reprise de la sauvegarde rec. */
    ask(rec) {
      if (g.gone) return;
      if (g.remi) { const d = A.decide(rec, A.mine(rec)); if (d.ok) A.load(rec, d.final, d.note || ''); else fail(d.why); return; }
      if (!g.oppPid) { g.resumeFail && g.resumeFail('Je ne sais pas encore qui est l\'autre joueur. Réessaie dans une seconde.', 'wait'); return; }
      if (rec.opp.pid !== g.oppPid) { fail('other'); return; }
      pend = { gid: rec.id, rec }; g.rgoAcked = false;
      const send = () => g.net.send('rs', { gid: rec.id, pid: profile.get().pid });
      send(); let n = 0; const iv = setInterval(() => { if (!pend || pend.gid !== rec.id || ++n > 6 || !g.alive) { clearInterval(iv); if (pend && n > 6) fail('none'); } else send(); }, 1500); g.sub(() => clearInterval(iv));
    },
  };
}

/* ---------- Fenêtre « Parties en cours » ---------- */
/** Liste des parties enregistrées pour ce jeu + historique. g = le jeu (pour Reprendre). */
export function openSaves(g, onChange) {
  const game = g.ctx.gameId; const box = h('div', { class: 'sv-list' });
  const title = 'Parties en cours';
  const draw = () => {
    const list = saves.list(game); box.replaceChildren();
    if (!list.length) box.append(h('p', { class: 'mut' }, 'Aucune partie enregistrée pour ce jeu. Pendant une partie, touche « Pause » puis « Enregistrer et quitter » : vous pourrez la reprendre plus tard, tous les deux.'));
    for (const r of list) {
      const same = r.opp && r.opp.pid === g.oppPid; const canGo = g.isHost && same && !g.gone;
      const turn = r.turn === 'me' ? 'À toi de jouer' : 'À ' + (r.opp.name || 'l\'autre') + ' de jouer';
      box.append(h('div', { class: 'sv-row' + (same ? '' : ' off'), 'data-gid': r.id },
        h('div', { class: 'sv-t' }, h('b', {}, 'Contre ' + (r.opp.name || 'l\'autre joueur')), h('span', { class: 'mut' }, fmtDate(r.updated))),
        h('div', { class: 'mut' }, (r.label || '') + (r.label ? ' · ' : '') + turn),
        !same ? h('div', { class: 'sv-warn' }, 'On ne peut la reprendre qu\'avec ' + (r.opp.name || 'le même adversaire') + '.') : (!g.isHost ? h('div', { class: 'mut' }, 'C\'est celui qui a créé la partie qui la relance.') : null),
        h('div', { class: 'row' },
          h('button', { class: 'btn', disabled: !canGo, 'data-act': 'resume', onclick: () => { dlg.close(); g.askResume(r); } }, 'Reprendre'),
          h('button', { class: 'btn sec', 'data-act': 'del', onclick: () => modal('Supprimer cette partie ?', [h('p', {}, 'La partie contre ' + (r.opp.name || 'l\'autre joueur') + ' sera effacée de CE téléphone. Elle ne pourra plus être reprise ici.')], [{ label: 'Garder' }, { label: 'Supprimer', cls: 'warn', onclick: () => { saves.del(r.id); draw(); onChange && onChange(); } }]) }, 'Supprimer'))));
    }
    if (g.oppPid) {
      const a = saves.vs(g.oppPid, game), t = saves.vs(g.oppPid);
      box.append(h('div', { class: 'sv-hist' }, h('b', {}, 'Résultats contre ' + (g.oppNameRaw || g.oppA.name)), h('div', {}, 'À ce jeu : ' + scoreText(a)), h('div', { class: 'mut' }, 'Tous les jeux : ' + scoreText(t))));
    }
  };
  draw();
  const dlg = modal(title, [box], [{ label: 'Fermer', cls: 'sec' }]);
  return dlg;
}

/** Fenêtre « Historique » : tous les adversaires et tous les jeux. */
export function openHistory(names = {}) {
  const o = saves.history(); const ks = Object.keys(o).sort((a, b) => (o[b].at || 0) - (o[a].at || 0));
  const body = ks.length ? ks.map(k => h('div', { class: 'sv-hist' }, h('b', {}, o[k].name || 'Joueur'),
    ...Object.entries(o[k].g).map(([gm, r]) => h('div', {}, (names[gm] || gm) + ' : ' + scoreText(r))))) : [h('p', { class: 'mut' }, 'Pas encore de partie terminée.')];
  return modal('Historique', body, [{ label: 'Fermer', cls: 'sec' }]);
}

/** Style des listes (injecté une fois). */
export function svCss(css) {
  css('saves', `
.sv-list{display:flex;flex-direction:column;gap:10px}
.sv-row{background:#ffffff12;border:2px solid #d9a44166;border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:6px;text-align:left}
.sv-row.off{opacity:.65}.sv-row .row{gap:8px}.sv-row .btn{min-height:48px;padding:6px 10px;flex:1}
.sv-t{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.sv-warn{color:#ffb020;font-weight:700;font-size:.92em}
.sv-hist{background:#27e0b314;border-radius:12px;padding:10px;text-align:left;display:flex;flex-direction:column;gap:3px}
`);
}
