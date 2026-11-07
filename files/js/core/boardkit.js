// Briques communes des jeux de plateau à tour par tour (échecs, dames, puissance 4, morpion, othello…).
// Un jeu fournit : un « moteur » pur (sans écran) + un dessin du plateau. Ce fichier s'occupe de tout le reste :
// départ commun avec options, tours, validation des coups de l'autre, rattrapage si un message se perd,
// Rémi (en local, avec 5 niveaux), pause, abandon, quitter avec confirmation, perte de connexion, fin et revanche.
import { h, modal, toast } from './util.js';
import { Duo } from './kit.js';
import { css } from './winfx.js';
import { level } from './level.js';
import { uiEl } from './uisprites.js';
import { avatarSvg } from './avatars.js';
import { saves, svCss, pidLink, oppOf, resumeProtocol, openSaves, hash, newId, commonPrefix } from './saves.js';
svCss(css);

css('boardkit', `
.bk-wrap{display:flex;flex-direction:column;flex:1;min-height:0;--bs:min(calc(100vw - 16px),calc(100dvh - 296px),560px)}
.bk-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 10px}
.bk-pl{display:flex;align-items:center;gap:8px;min-width:0;flex:1;padding:4px 8px;border-radius:16px;border:2px solid transparent;transition:background .2s,border-color .2s}
.bk-pl.on{background:#27e0b322;border-color:#27e0b3}
.bk-pl.r{flex-direction:row-reverse;text-align:right}
.bk-pl .nm{font-weight:800;font-size:.95em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-pl .st{color:var(--mut);font-size:.8em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-status{text-align:center;font-weight:800;font-size:1.1em;padding:4px 10px;min-height:1.6em;color:#27e0b3}
.bk-status.wait{color:#ffb020}.bk-status.bad{color:#ff5470}
.bk-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:flex-start;flex-direction:column;gap:8px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
.bk-stage>:first-child{margin-top:auto}.bk-stage>:last-child{margin-bottom:auto}.bk-stage>*{flex:0 0 auto}
.bk-bar{display:flex;gap:10px;padding:8px 10px 10px;background:var(--card);flex:0 0 auto;position:relative;z-index:2}
.bk-bar .btn{flex:1 1 0;min-width:0;min-height:56px;padding:8px 6px;display:flex;align-items:center;justify-content:center;gap:8px;overflow-wrap:anywhere}
.bk-bar.three{gap:6px}.bk-bar.three .btn{font-size:.82em;padding:6px 3px;overflow-wrap:normal;word-break:keep-all;gap:4px}.bk-bar.three .btn>:first-child{display:none}
.bk-frame{padding:8px;border-radius:14px;background:linear-gradient(145deg,#c9a227,#7a5a10 55%,#e8c85a);box-shadow:0 6px 18px #000a,inset 0 0 0 2px #fff3}
.bk-banner{position:absolute;left:8px;right:8px;top:8px;z-index:6;background:#2a1a05;border:2px solid #ffb020;border-radius:16px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;text-align:center;font-weight:700}
.bk-banner .row{gap:8px}.bk-banner .btn{min-height:48px;padding:6px 8px}
.bk-opt{display:flex;flex-direction:column;gap:6px;width:100%;max-width:340px}.bk-opt b{font-size:.95em}
.bk-opt .row{gap:6px}.bk-opt .btn{min-height:50px;padding:6px 8px;font-size:.95em}
@keyframes bkpop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes bkpulse{0%,100%{opacity:.55}50%{opacity:1}}
`);

export const pick = a => a[Math.floor(Math.random() * a.length)];
/** Petit utilitaire : mélange avec un tirage donné. */
export const shuffle = (a, r = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** Délai de réflexion de Rémi (budget en ms) selon le rang de difficulté 1..5. */
export const budgetFor = (lv, table = [150, 350, 700, 1300, 2200]) => table[Math.max(0, Math.min(4, lv - 1))];
/** Ne pas dépasser le budget : renvoie une fonction « c'est l'heure ? ». */
export const clock = ms => { const end = performance.now() + ms; let n = 0; return () => (++n & 255) === 0 && performance.now() > end; };

/**
 * cfg : {
 *  title, how:[...], sideNames:['Blancs','Noirs'], options:[{key,label,def,choices:[[valeur,libellé]]}],
 *  engine:{ init(opt), turn(s), moves(s), apply(s,m), result(s)->null|{w:0|1|'d',why}, ai(s,lvl,ms)->coup, key(m) }
 * }
 * Le jeu hérite de TurnGame et définit : buildBoard(stage), paint(), onApplied(prev,m,byMe).
 */
export class TurnGame extends Duo {
  constructor(ctx, cfg) {
    super(ctx); this.cfg = cfg; this.E = cfg.engine; this.state = null; this.hist = []; this.mySide = 0; this.paused = false; this.lastSeen = performance.now();
    this.keyOf = cfg.engine.key || (m => JSON.stringify(m)); this.thinking = false; this.opt = {};
    this.root.classList.add('bk-game');
    // On remplace l'en-tête de Duo par une ligne compacte : les deux joueurs, celui qui joue est entouré.
    this.pl.remove();
    this.top = h('div', { class: 'bk-top' }); this.statusEl = h('div', { class: 'bk-status' }); this.stage = h('div', { class: 'bk-stage' });
    this.pause = h('button', { class: 'btn sec', onclick: () => this.openPause() }, 'Pause');
    this.giveUp = h('button', { class: 'btn sec', onclick: () => this.askResign() }, uiEl('ic_flag', '', 26), 'Abandonner');
    this.undoBtn = h('button', { class: 'btn sec', 'data-act': 'undo', style: 'display:none', onclick: () => this.askUndo() }, 'Annuler le coup');
    this.bar = h('div', { class: 'bk-bar' }, this.pause, this.undoBtn, this.giveUp);
    this.wrap = h('div', { class: 'bk-wrap' }, this.top, this.statusEl, this.stage, this.bar); this.root.append(this.wrap);
    this.onNet('mv', m => this.recvMove(m)); this.onNet('need', m => this.resendFrom(m.n));
    this.onNet('rsg', () => { if (!this.over && this.state) this.endGame({ w: this.mySide, why: 'resign' }); });
    this.onNet('paus', m => { this.oppPaused = !!m.p; this.setStatus(); });
    this.onNet('hb', () => { this.seen(); });
    this.onNet('go2', m => { this.net.send('go2ack'); if (this.gone) return; this.gone = true; this.clearMessage(); this.begin(m.seed, m.opt || {}, m.gid); });
    this.onNet('go2ack', () => { this.acked = true; });
    if (!this.remi) {
      const iv = setInterval(() => this.net.send('hb'), 3000); this.sub(() => clearInterval(iv));
      const chk = setInterval(() => this.checkAlive(), 2000); this.sub(() => clearInterval(chk));
    }
    // Le bouton « Quitter » du haut de l'écran demande d'abord confirmation tant qu'une partie est en cours.
    try { const qb = this.ctx.root.parentNode && this.ctx.root.parentNode.querySelector('.bar button'); if (qb) qb.addEventListener('click', e => { if (this.state && !this.over && this.alive) { e.stopImmediatePropagation(); e.preventDefault(); this.askQuit(); } }, true); } catch {}
    this.gid = null; pidLink(this); this.initResume();
    this.onNet('uq', m => this.recvUndoAsk(m)); this.onNet('ua', m => this.recvUndoAns(m));
    this.paintPlayers(); this.startGate();
  }
  /* ---------- Sauvegarde et reprise ---------- */
  gameLabel() { return (this.hist ? this.hist.length : 0) + ' coups'; }
  /** Ce que ce téléphone garde de la partie (rien tant qu'aucun coup n'est joué). */
  saveNow() {
    if (!this.state || this.over || !this.gid || !this.hist || !this.hist.length) return;
    saves.put({ id: this.gid, game: this.ctx.gameId, kind: 'moves', opp: oppOf(this), mySide: this.mySide, seed: this.seed, opt: this.opt, hist: this.hist.slice(), n: this.hist.length, h: hash(this.hist.map(this.keyOf)),
      turn: this.E.turn(this.state) === this.mySide ? 'me' : 'opp', label: this.gameLabel(), created: this.created || Date.now() });
  }
  hasProgress() { return !!(this.hist && this.hist.length); }
  dropSave() { if (this.gid) saves.del(this.gid); }
  initResume() {
    const K = m => this.keyOf(m);
    this.rp = resumeProtocol(this, {
      mine: rec => ({ n: rec.hist.length, hist: rec.hist, side: rec.mySide, opt: rec.opt, seed: rec.seed }),
      decide: (rec, info) => {
        if (this.remi) return { ok: true, final: { hist: rec.hist, opt: rec.opt, seed: rec.seed } };
        if (info.side === rec.mySide) return { ok: false, why: 'side' };
        if (JSON.stringify(info.opt) !== JSON.stringify(rec.opt) || info.seed !== rec.seed) return { ok: false, why: 'diff' };
        const a = rec.hist, b = info.hist, cp = commonPrefix(a.map(K), b.map(K)); let hist, note = '';
        if (cp === a.length && cp === b.length) hist = a;
        else if (cp === Math.min(a.length, b.length)) { hist = a.length > b.length ? a : b; note = 'Un des deux téléphones avait un coup de retard : on reprend avec la partie la plus avancée (' + hist.length + ' coups).'; }
        else { hist = a.slice(0, cp); note = 'Les deux sauvegardes se séparaient au coup ' + (cp + 1) + ' : on reprend au dernier coup commun (' + cp + ' coups).'; }
        return { ok: true, final: { hist, opt: rec.opt, seed: rec.seed }, note };
      },
      load: (rec, final, note) => this.loadResume(rec, final, note),
    });
  }
  askResume(rec) { this.rp.ask(rec); }
  resumeFail(text) { modal('Reprise impossible', [h('p', {}, text)], [{ label: 'Compris' }]); }
  resumeAsked(rec) { if (!this.gone) toast(this.oppA.name + ' veut reprendre votre partie enregistrée.'); }
  /** Rejoue les coups depuis le début : s'arrête au premier coup illégal. */
  replay(opt, hist) {
    let s = this.E.init(opt); const ok = []; this.onReplayStart && this.onReplayStart(s);
    for (const m of hist) { const k = this.keyOf(m); const legal = this.E.moves(s).find(x => this.keyOf(x) === k); if (!legal) break; this.lastMove = legal; s = this.E.apply(s, legal); ok.push(legal); this.onReplayStep && this.onReplayStep(s); }
    return { state: s, hist: ok };
  }
  loadResume(rec, final, note) {
    if (this.gone) return; this.gone = true; this.clearMessage(); this.seen();
    this.opt = final.opt; this.seed = final.seed; this.mySide = rec.mySide; this.gid = rec.id; this.created = rec.created;
    this.resuming = true; const r = this.replay(final.opt, final.hist); this.state = r.state; this.hist = r.hist; this.lastMove = r.hist.length ? r.hist[r.hist.length - 1] : null;
    this.stage.replaceChildren(); this.buildBoard(this.stage); this.resuming = false; this.update(true); this.saveNow(); this.afterTurnChange();
    toast('Partie reprise au coup ' + this.hist.length + '.'); if (note) modal('Partie reprise', [h('p', {}, note)], [{ label: 'On continue' }]);
  }
  /* ---------- Annuler le dernier coup (si l'autre accepte) ---------- */
  undoCount() {
    if (!this.cfg.undo || !this.state || this.over || this.ending || !this.hist.length) return 0;
    const n = this.hist.length; const lastMine = (this.mySide === 0) === (n % 2 === 1) && this.E.turn(this.state) !== this.mySide;
    if (lastMine) return 1; return n >= 2 ? 2 : 0;
  }
  askUndo() {
    const k = this.undoCount(); if (!k || this.paused) return;
    if (this.remi) { this.tk++; this.thinking = false; this.doUndo(k); return; }
    this.undoWait = { n: this.hist.length, k }; this.net.send('uq', { n: this.hist.length, k }); this.s.sfx('tick'); toast('Demande envoyée à ' + this.oppA.name + '…');
    setTimeout(() => { if (this.undoWait && this.undoWait.n === this.hist.length) { this.undoWait = null; } }, 15000);
  }
  recvUndoAsk(m) {
    if (!this.state || this.over || !this.cfg.undo) return; const ok = (m.n | 0) === this.hist.length && (m.k === 1 || m.k === 2);
    if (!ok) { this.net.send('ua', { n: m.n, ok: false }); return; }
    const ans = v => { this.net.send('ua', { n: m.n, k: m.k, ok: v }); if (v) this.doUndo(m.k); };
    if (this.undoDlg) this.undoDlg.close();
    this.undoDlg = modal('Annuler un coup ?', [h('p', {}, this.oppA.name + ' demande à reprendre ' + (m.k === 1 ? 'son dernier coup' : 'son dernier coup et le tien') + '. Tu es d\'accord ?')],
      [{ label: 'Non', cls: 'sec', onclick: () => ans(false) }, { label: 'Oui, annuler', onclick: () => ans(true) }]);
  }
  recvUndoAns(m) {
    if (!this.undoWait || (m.n | 0) !== this.undoWait.n) return; const w = this.undoWait; this.undoWait = null;
    if (m.ok) this.doUndo(w.k); else modal('Refusé', [h('p', {}, this.oppA.name + ' préfère continuer comme ça.')], [{ label: 'OK' }]);
  }
  doUndo(k) {
    if (!this.state || this.over || this.hist.length < k) return; const hist = this.hist.slice(0, this.hist.length - k);
    const r = this.replay(this.opt, hist); this.state = r.state; this.hist = r.hist; this.lastMove = r.hist.length ? r.hist[r.hist.length - 1] : null; this.ending = false;
    this.sel = -1; this.targets = []; this.pfx = []; this.update(); this.saveNow(); this.s.sfx('ok'); toast('Coup annulé.'); this.afterTurnChange();
  }
  seen() { this.lastSeen = performance.now(); if (this.lostEl) { this.lostEl.remove(); this.lostEl = null; } }
  /** Pas de nouvelles de l'autre téléphone depuis longtemps : message clair, au choix attendre ou quitter. */
  checkAlive() {
    if (this.over || this.remi || !this.alive) return;
    if (performance.now() - this.lastSeen > 14000 && !this.lostEl) {
      this.lostEl = h('div', { class: 'bk-banner' }, h('div', {}, 'Je n\'entends plus l\'autre joueur. Sa connexion est peut-être coupée.'),
        h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: () => { this.lostEl.remove(); this.lostEl = null; this.lastSeen = performance.now(); } }, 'Attendre encore'),
          h('button', { class: 'btn warn', onclick: () => this.ctx.exit() }, 'Quitter la partie')));
      this.root.append(this.lostEl);
    }
  }

  /* ---------- Départ commun ---------- */
  startGate() {
    const c = this.cfg; this.opt = {}; (c.options || []).forEach(o => { this.opt[o.key] = o.def; });
    const text = c.how.join('\n');
    if (this.isHost) {
      this.message(c.title, text, [{ label: 'Commencer', onclick: () => this.hostGo() }]);
      const btnGo = this.msg.querySelector('button'); const p = this.msg.querySelector('p'); if (p) { p.style.whiteSpace = 'pre-line'; p.style.fontSize = '.95em'; }
      (c.options || []).forEach(o => {
        const row = h('div', { class: 'row' }); const draw = () => row.replaceChildren(...o.choices.map(([v, lab]) => h('button', { class: 'btn ' + (this.opt[o.key] === v ? '' : 'sec'), 'data-opt': o.key + '=' + v, onclick: () => { this.opt[o.key] = v; draw(); } }, lab)));
        draw(); this.msg.insertBefore(h('div', { class: 'bk-opt' }, h('b', {}, o.label), row), btnGo);
      });
    } else { this.message(c.title, text + '\nAttends que l\'autre lance.', []); const p = this.msg.querySelector('p'); if (p) { p.style.whiteSpace = 'pre-line'; p.style.fontSize = '.95em'; } }
    this.gateSaves();
  }
  gateSaves() {
    if (!this.msg) return; const n = saves.list(this.ctx.gameId).length;
    const b = h('button', { class: 'btn sec', 'data-gate': 'saves', onclick: () => openSaves(this, () => this.gateSaves()) }, n ? 'Parties en cours (' + n + ')' : 'Parties en cours et résultats');
    if (this.gateBtn) this.gateBtn.remove(); this.gateBtn = b; this.msg.append(b);
  }
  onOppPid() { if (this.msg && !this.state) this.gateSaves(); }
  hostGo() {
    if (this.gone) return; this.gone = true; const seed = (Math.random() * 1e9) | 0; const opt = { ...this.opt }; const gid = newId();
    this.net.send('go2', { seed, opt, gid }); this.clearMessage(); this.begin(seed, opt, gid);
    if (!this.remi) { let n = 0; const iv = setInterval(() => { if (this.acked || ++n > 10 || !this.alive) clearInterval(iv); else this.net.send('go2', { seed, opt, gid }); }, 1500); this.sub(() => clearInterval(iv)); }
  }
  begin(seed, opt, gid) {
    this.opt = opt; this.seed = seed; this.seen(); this.gid = gid || newId(); this.created = Date.now();
    this.mySide = (this.isHost === (seed % 2 === 0)) ? 0 : 1; // le tirage décide qui commence
    this.state = this.E.init(opt); this.hist = []; this.stage.replaceChildren(); this.buildBoard(this.stage); this.update(true);
    this.afterTurnChange();
  }

  /* ---------- Joueurs, état, affichage ---------- */
  sideName(s) { return (this.cfg.sideNames || ['Joueur 1', 'Joueur 2'])[s]; }
  paintPlayers() { this.paint(); }
  paint() {
    if (!this.top) return;
    const turn = this.state && !this.over ? this.E.turn(this.state) : -1;
    const one = (a, mine, side) => h('div', { class: 'bk-pl' + (mine ? '' : ' r') + (turn === side ? ' on' : ''), 'data-who': mine ? 'me' : 'opp' }, h('div', { html: avatarSvg(a.avatar, 40) }),
      h('div', { style: 'min-width:0' }, h('div', { class: 'nm' }, mine ? 'Toi' : a.name), h('div', { class: 'st' }, this.state ? this.sideName(side) + (this.extraStat ? this.extraStat(side) : '') : '')));
    this.top.replaceChildren(one(this.meA, true, this.mySide), one(this.oppA, false, 1 - this.mySide));
  }
  myTurn() { return !!this.state && !this.over && !this.ending && !this.paused && !this.thinking && this.E.turn(this.state) === this.mySide; }
  setStatus() {
    if (!this.state) return; let t, cls = '';
    if (this.over) t = ''; else if (this.paused) { t = 'Partie en pause'; cls = 'wait'; }
    else if (this.oppPaused && !this.remi) { t = this.oppA.name + ' est en pause…'; cls = 'wait'; }
    else if (this.E.turn(this.state) === this.mySide) t = this.turnText ? this.turnText() : 'À toi de jouer !';
    else { t = this.remi ? 'Rémi réfléchit…' : 'Au tour de ' + this.oppA.name + '…'; cls = 'wait'; }
    this.statusEl.textContent = t; this.statusEl.className = 'bk-status ' + cls;
  }
  update(first) { this.paint(); this.paintBoard(first); this.setStatus(); if (this.undoBtn) { const u = this.undoCount(); this.undoBtn.style.display = u ? '' : 'none'; this.bar.classList.toggle('three', !!u); } }

  /* ---------- Jouer un coup ---------- */
  /** Appelé par le dessin du plateau quand le joueur a choisi un coup. */
  tryMove(m) {
    if (!this.myTurn()) return false; const k = this.keyOf(m); const legal = this.E.moves(this.state).find(x => this.keyOf(x) === k); if (!legal) return false;
    this.net.send('mv', { m: legal, n: this.hist.length }); this.commit(legal, true); return true;
  }
  commit(m, byMe) {
    const prev = this.state; this.state = this.E.apply(prev, m); this.hist.push(m); this.lastMove = m;
    if (this.onApplied) this.onApplied(prev, m, byMe); this.update(); this.saveNow(); this.afterTurnChange();
  }
  recvMove(msg) {
    this.seen(); if (!this.state || this.over) return; const n = msg.n | 0;
    if (n < this.hist.length) return; // déjà reçu
    if (n > this.hist.length) { this.net.send('need', { n: this.hist.length }); return; } // il en manque : on les redemande
    if (this.E.turn(this.state) === this.mySide) return; // pas son tour : on ignore
    const k = this.keyOf(msg.m); const legal = this.E.moves(this.state).find(x => this.keyOf(x) === k);
    if (!legal) { this.net.send('need', { n: this.hist.length }); return; }
    this.commit(legal, false);
  }
  resendFrom(n) { for (let i = Math.max(0, n | 0); i < this.hist.length; i++) this.net.send('mv', { m: this.hist[i], n: i }); }
  afterTurnChange() {
    if (!this.state || this.over) return;
    const r = this.E.result(this.state); const x = this.extraResult && this.extraResult(this.state);
    if (r || x) { this.ending = true; setTimeout(() => this.alive && this.endGame(r || x), 650); return; }
    if (this.remi && this.E.turn(this.state) !== this.mySide) this.remiPlay();
  }
  remiPlay() {
    if (this.thinking || this.over) return; this.thinking = true; this.setStatus();
    const tok = ++this.tk || (this.tk = 1);
    setTimeout(() => setTimeout(() => {
      if (!this.alive || this.over || tok !== this.tk) { this.thinking = false; return; }
      let m; try { m = this.E.ai(this.state, level(), this.aiBudget ? this.aiBudget() : budgetFor(level())); } catch (e) { console.error(e); m = pick(this.E.moves(this.state)); }
      this.thinking = false; if (this.paused) { this.pendingAi = m; return; } this.commit(m, false);
    }, 30), 420);
  }

  /* ---------- Fin ---------- */
  endGame(r) {
    if (this.over) return; this.dropSave();
    { const res = r.w === 'd' ? 'd' : r.w === this.mySide ? 'w' : 'l'; saves.result(this.ctx.gameId, oppOf(this), res); }
    const why = this.whyText ? this.whyText(r) : ({ resign: 'Abandon.', mat: 'Échec et mat.', pat: 'Pat : plus aucun coup possible.', full: 'Plateau plein.', blocked: 'Plus aucun coup possible.' }[r.why] || '');
    if (r.w === 'd') {
      this.over = true; this.paint(); this.setStatus(); this.record(false); this.s.sfx('ok'); this.clearMessage();
      this.message('Égalité !', why, [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]); return;
    }
    const win = r.w === this.mySide; this.finish(win, why); this.paint(); this.setStatus();
  }

  /* ---------- Pause, abandon, quitter ---------- */
  openPause() {
    if (this.over || !this.state) return; this.paused = true; this.net.send('paus', { p: 1 }); this.setStatus();
    this.message('Pause', 'La partie est suspendue.', [
      { label: 'Reprendre', onclick: () => this.closePause() },
      { label: 'Règles du jeu', cls: 'sec', onclick: () => this.showRules() },
      { label: 'Recommencer', cls: 'sec', onclick: () => { this.closePause(); this.askRestart(); } },
      { label: 'Abandonner', cls: 'sec', onclick: () => { this.closePause(); this.askResign(); } },
      { label: 'Enregistrer et quitter', cls: 'sec', onclick: () => this.saveQuit() },
      { label: 'Quitter la partie', cls: 'warn', onclick: () => { this.askQuit(); } },
    ]);
    this.msg.querySelectorAll('button').forEach(b => { b.style.minHeight = '58px'; });
  }
  closePause() { this.paused = false; this.net.send('paus', { p: 0 }); this.clearMessage(); this.setStatus(); if (this.pendingAi) { const m = this.pendingAi; this.pendingAi = null; this.commit(m, false); } }
  showRules() { modal(this.cfg.title, [...this.cfg.how.map((t, i) => h('div', { class: 'stepline' }, h('span', { class: 'num' }, String(i + 1)), h('span', {}, t)))], [{ label: 'OK' }]); }
  askResign() {
    if (this.over || !this.state) return; modal('Abandonner ?', [h('p', {}, 'Tu perds la partie. ' + (this.remi ? 'Rémi' : this.oppA.name) + ' gagne.')],
      [{ label: 'Continuer à jouer' }, { label: 'Abandonner', cls: 'warn', onclick: () => { this.net.send('rsg'); this.endGame({ w: 1 - this.mySide, why: 'resign' }); } }]);
  }
  askRestart() {
    if (this.remi) { this.ctx.restart(); return; }
    modal('Recommencer ?', [h('p', {}, 'On demande à ' + this.oppA.name + ' s\'il est d\'accord.')], [{ label: 'Non' }, { label: 'Demander', onclick: () => { this.askReplay(); } }]);
  }
  saveQuit() {
    if (this.hasProgress()) { this.saveNow(); toast('Partie enregistrée : vous pourrez la reprendre plus tard.'); this.ctx.exit(); }
    else modal('Rien à enregistrer', [h('p', {}, 'Aucun coup n\'a encore été joué.')], [{ label: 'OK' }]);
  }
  askQuit() {
    const keep = this.hasProgress() && !this.over;
    modal('Quitter la partie ?', [h('p', {}, (this.remi ? 'On arrête de jouer avec Rémi.' : 'L\'autre joueur sera prévenu.') + (keep ? ' La partie reste enregistrée : vous pourrez la reprendre plus tard.' : ''))],
      [{ label: 'Rester' }, { label: keep ? 'Quitter (garder la partie)' : 'Quitter', cls: 'warn', onclick: () => this.ctx.exit() }, ...(keep ? [{ label: 'Quitter et supprimer', cls: 'sec', onclick: () => { this.dropSave(); this.ctx.exit(); } }] : [])]);
  }
  destroy() { this.tk = -1; super.destroy(); }
}

/** Anime une pièce qui glisse d'une case à l'autre (coordonnées en cases, plateau tourné ou non). */
export function slide(el, dx, dy, ms = 240) { try { el.animate([{ transform: `translate(${dx}px,${dy}px)`, zIndex: 3 }, { transform: 'none', zIndex: 3 }], { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)' }); } catch {} }

/** Case du plateau : renvoie le conteneur carré avec cadre doré. */
export function frame(inner, extra = '') { return h('div', { class: 'bk-frame', style: extra }, inner); }
