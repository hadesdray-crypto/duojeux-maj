// Briques communes aux jeux de cartes à deux : cartes dessinées en code (dos pirate, faces), jeu piloté par l'hôte, pause, fin, Rémi.
// Principe : l'HÔTE possède le moteur (paquet, mains cachées). Il envoie à l'autre joueur une « vue » faite pour lui (jamais les cartes cachées).
// L'invité envoie ses actions. Rémi se branche comme l'invité (il ne voit que sa vue, comme un vrai joueur).
import { h, modal, toast } from '../core/util.js';
import { Duo } from '../core/kit.js';
import { css } from '../core/winfx.js';
import { level, lerp } from '../core/level.js';
import { iconSvg } from './cards_icons.js';
import { winBadge } from '../core/winfx.js';
import { saves, svCss, pidLink, oppOf, resumeProtocol, openSaves, hash, newId } from '../core/saves.js';
svCss(css);

export { lerp, level, iconSvg };
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];

/** Mélange déterministe (graine). */
export function shuffled(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

css('cardkit', `
.cg{display:flex;flex-direction:column;flex:1;min-height:0;position:relative;overflow:hidden}
.cg-top{display:flex;gap:8px;padding:4px 8px;align-items:center}
.cg-top .btn{min-height:44px;padding:4px 14px;font-size:.95em}
.cg-top .grow{flex:1;text-align:center;font-weight:700;opacity:.9}
.cg-board{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:4px 6px;position:relative}
.cg-log{min-height:2.6em;text-align:center;font-weight:700;padding:2px 10px;color:#ffd98a;font-size:1.02em;line-height:1.25}
.cg-act{display:flex;gap:8px;padding:8px;background:var(--card,#16224f);flex-wrap:wrap;justify-content:center}
.cg-act .btn{flex:1 1 40%;min-height:64px;touch-action:manipulation}
.pc{width:var(--cw,64px);height:calc(var(--cw,64px) * 1.4);perspective:700px;flex:none;position:relative;user-select:none;-webkit-user-select:none}
.pcin{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .45s cubic-bezier(.3,.7,.3,1)}
.pc.down .pcin{transform:rotateY(180deg)}
.pcf,.pcb{position:absolute;inset:0;border-radius:calc(var(--cw,64px) * .12);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;box-shadow:0 2px 6px #0008}
.pcf{background:linear-gradient(160deg,#fbf3dc,#efe0b6);border:2px solid #b68a2e;color:#1b2340}
.pcb{transform:rotateY(180deg);border:2px solid #d9a441;background:repeating-linear-gradient(45deg,#ffffff0d 0 4px,transparent 4px 9px),linear-gradient(145deg,#22337c,#0c1130)}
.pcb::before{content:"";position:absolute;inset:calc(var(--cw,64px) * .06);border:1.5px solid #d9a44199;border-radius:calc(var(--cw,64px) * .08)}
.pcb .em{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.pc.deal{animation:cgdeal .38s ease-out both}
.pc.ok .pcin{filter:saturate(.8) brightness(.85)}
.pc.ok{outline:2px solid #27e0b3;outline-offset:1px;border-radius:calc(var(--cw,64px) * .12)}
.pc.sel{transform:translateY(-12px);outline:3px solid #ffd24d;outline-offset:1px;border-radius:calc(var(--cw,64px) * .12)}
.pc.dis{opacity:.4}
.pc.tap{cursor:pointer;touch-action:manipulation}
.pc.glow{box-shadow:0 0 14px 3px #ffd24daa;border-radius:calc(var(--cw,64px) * .12)}
@keyframes cgdeal{from{transform:translateY(-40px) scale(.6);opacity:0}to{transform:none;opacity:1}}
@keyframes cgpop{0%{transform:scale(.7);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.sf{position:absolute;inset:0;font-weight:800;font-family:Georgia,serif}
.sf .tl{position:absolute;left:8%;top:5%;line-height:1;text-align:center;font-size:calc(var(--cw,64px) * .26)}
.sf .tl svg{display:block;margin:1px auto 0;width:.8em;height:.8em}
.sf .br{position:absolute;right:8%;bottom:5%;line-height:1;text-align:center;font-size:calc(var(--cw,64px) * .26);transform:rotate(180deg)}
.sf .br svg{display:block;margin:1px auto 0;width:.8em;height:.8em}
.sf .mid{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:2%}
.fam{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;font-family:system-ui,sans-serif}
.fam .hd{width:100%;text-align:center;color:#fff;font-weight:800;font-size:calc(var(--cw,64px) * .125);line-height:1.15;padding:calc(var(--cw,64px) * .04) 2px;min-height:2.3em;display:flex;align-items:center;justify-content:center}
.fam .ic{flex:1;display:flex;align-items:center;justify-content:center}
.fam .nm{width:100%;text-align:center;font-weight:800;font-size:calc(var(--cw,64px) * .15);line-height:1.1;padding:2px 2px calc(var(--cw,64px) * .06);min-height:2.3em;display:flex;align-items:center;justify-content:center;color:#1b2340}
.memf{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#fff6dc,#ecd9a4)}
.cg-pause{position:absolute;inset:0;background:#050a1cdd;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
.cg-pause .btn{width:100%;max-width:300px}
.cg-chip{display:inline-flex;align-items:center;justify-content:center;min-width:2.4em;border-radius:50px;background:#16224f;border:2px solid #d9a441;padding:2px 10px;font-weight:800}
`);

export const SUITS = ['pique', 'cœur', 'carreau', 'trèfle'];
const SUIT_PATH = [
  'M12 2C9 7 3 9.5 3 14.5a4.5 4.5 0 0 0 7.5 3.2C10.2 19.5 9.5 21 8 22h8c-1.5-1-2.2-2.5-2.5-4.3A4.5 4.5 0 0 0 21 14.5C21 9.5 15 7 12 2z',
  'M12 21C5 15 2 11.5 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 3.5-3 7-10 13z',
  'M12 2l8 10-8 10-8-10z',
  'M12 3a4 4 0 0 0-3.5 6A4.5 4.5 0 1 0 11 15.2C10.8 18.5 10 20.5 8.5 22h7c-1.5-1.5-2.3-3.5-2.5-6.8A4.5 4.5 0 1 0 15.5 9 4 4 0 0 0 12 3z'];
export const suitColor = s => (s === 1 || s === 2) ? '#c8302f' : '#1b2340';
export const suitSvg = (s, size = '1em') => `<svg viewBox="0 0 24 24" style="width:${size};height:${size};flex:none" fill="${suitColor(s)}"><path d="${SUIT_PATH[s]}"/></svg>`;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
export const rankName = r => ['As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi'][r];
export const cardName = id => rankName(id % 13) + ' de ' + SUITS[Math.floor(id / 13)];

const PIPS = { 2: [1, 1], 3: [1, 1, 1], 4: [2, 2], 5: [2, 1, 2], 6: [2, 2, 2], 7: [2, 1, 2, 2], 8: [2, 2, 2, 2], 9: [3, 3, 3], 10: [3, 2, 2, 3] };
/** Face d'une carte ordinaire (id 0..51 : rang = id % 13, couleur = id / 13). */
export function stdFace(id) {
  const r = id % 13, s = Math.floor(id / 13), col = suitColor(s);
  const corner = `<div style="color:${col}">${RANKS[r]}${suitSvg(s, '.7em')}</div>`;
  let mid;
  if (r >= 10) mid = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${iconSvg(['sword', 'heart', 'crown'][r - 10], 'calc(var(--cw,64px) * .52)')}${suitSvg(s, 'calc(var(--cw,64px) * .24)')}</div>`;
  else if (r === 0) mid = suitSvg(s, 'calc(var(--cw,64px) * .62)');
  else { const rows = PIPS[r + 1]; mid = `<div style="display:flex;flex-direction:column;justify-content:space-around;height:100%;width:100%;align-items:center">${rows.map(k => `<div style="display:flex;justify-content:center;gap:calc(var(--cw,64px) * .03)">${Array.from({ length: k }, () => suitSvg(s, 'calc(var(--cw,64px) * .135)')).join('')}</div>`).join('')}</div>`; }
  return `<div class="sf"><div class="tl">${corner}</div><div class="mid" style="${r >= 1 && r < 10 ? 'inset:10% 27%' : ''}">${mid}</div><div class="br">${corner}</div></div>`;
}
const backHtml = () => `<div class="em">${iconSvg('anchor', 'calc(var(--cw,64px) * .55)')}</div>`;

/** Élément carte. face = html de la face ; down = dos visible. */
export function cardEl(face, down, cls = '') {
  const e = h('div', { class: 'pc ' + (down ? 'down ' : '') + cls });
  e.innerHTML = `<div class="pcin"><div class="pcf">${face || ''}</div><div class="pcb">${backHtml()}</div></div>`;
  return e;
}
/** Met à jour une carte déjà dans le DOM (retournement animé). */
export function setCard(e, face, down) {
  const f = e.querySelector('.pcf'); if (face != null && f.dataset.k !== String(face)) { f.innerHTML = face; f.dataset.k = String(face); }
  e.classList.toggle('down', !!down);
}
/** Règle --cw pour qu'une grille cols x rows tienne dans l'espace du plateau. */
export function fitGrid(board, cols, rows, gap = 8, maxW = 92) {
  const f = () => { const W = board.clientWidth - gap * (cols + 1), H = board.clientHeight - gap * (rows + 1); if (W <= 0 || H <= 0) return; board.style.setProperty('--cw', Math.max(34, Math.min(maxW, W / cols, H / rows / 1.4)) + 'px'); };
  f(); const ro = new ResizeObserver(f); ro.observe(board); return () => ro.disconnect();
}

export class CardGame extends Duo {
  /** cfg : { title, how, options?: { label, choices:[{label,val}] } } */
  constructor(ctx, cfg) {
    super(ctx); this.cfg = cfg; this.root.classList.add('cg'); this.view = null; this.eng = null; this.paused = false; this.endShown = false;
    this.tbar = h('div', { class: 'cg-top' }, h('button', { class: 'btn sec', onclick: () => this.pause(true) }, 'Pause'), h('div', { class: 'grow' }, ''), h('button', { class: 'btn sec', onclick: () => this.rules() }, 'Règles'));
    this.board = h('div', { class: 'cg-board' }); this.logEl = h('div', { class: 'cg-log' }); this.actEl = h('div', { class: 'cg-act' });
    this.root.append(this.tbar, this.board, this.logEl, this.actEl);
    this.hs = 0; this.log = []; this.lh = ''; this.gid = null;
    this.onNet('st', m => { this.gotView = true; if (m.gid) this.gid = m.gid; this.apply(m.v); if (!this.isHost && m.gid) this.saveGuest(m); });
    this.onNet('act', m => { if (this.eng) this.doAct(1 - this.hs, m.a); });
    this.onNet('sync', () => { if (this.eng) this.broadcast(true); });
    this.onNet('pz', m => { if (m.on) this.pause(true, true); else this.resume(true); });
    pidLink(this); this.initResume();
    this.startGate();
  }
  rules() { modal(this.cfg.title, [h('p', { style: 'white-space:pre-line;text-align:left' }, this.cfg.how)], [{ label: 'Compris' }]); }
  /** Départ commun : l'hôte choisit (taille…) puis lance ; l'autre attend. */
  startGate() {
    this.onNet('go', m => { this.net.send('goack'); if (this.gone) return; this.gone = true; this.clearMessage(); this.begin2(m.seed, m.opt, m.gid); });
    this.onNet('goack', () => { this.acked = true; });
    const o = this.cfg.options;
    const go = opt => () => { if (this.gone) return; this.gone = true; const seed = (Math.random() * 1e9) | 0; const gid = newId(); this.net.send('go', { seed, opt, gid }); this.clearMessage(); this.begin2(seed, opt, gid);
      if (!this.remi) { let n = 0; const iv = setInterval(() => { if (this.acked || ++n > 10 || !this.alive) clearInterval(iv); else this.net.send('go', { seed, opt, gid }); }, 1500); this.sub(() => clearInterval(iv)); } };
    if (this.isHost) this.message(this.cfg.title, this.cfg.how + (o ? '\n\n' + o.label : ''), o ? o.choices.map(c => ({ label: c.label, onclick: go(c.val) })) : [{ label: 'Commencer', onclick: go(null) }]);
    else this.message(this.cfg.title, this.cfg.how + '\nAttends que l\'autre lance.', []);
    if (this.msg) { const p = this.msg.querySelector('p'); if (p) p.style.cssText = 'white-space:pre-line;max-height:45vh;overflow:auto'; }
    this.gateSaves();
  }
  gateSaves() {
    if (!this.msg) return; const n = saves.list(this.ctx.gameId).length;
    const b = h('button', { class: 'btn sec', 'data-gate': 'saves', onclick: () => openSaves(this, () => this.gateSaves()) }, n ? 'Parties en cours (' + n + ')' : 'Parties en cours et résultats');
    if (this.gateBtn) this.gateBtn.remove(); this.gateBtn = b; this.msg.append(b);
  }
  onOppPid() { if (this.msg && !this.eng && !this.gone) this.gateSaves(); }
  /* ---------- Sauvegarde et reprise : l'hôte garde la partie complète (graine + actions), l'invité garde son numéro d'action et son empreinte ---------- */
  logOp(op) { this.log.push(op); this.lh = hash(this.lh + JSON.stringify(op)); }
  prefixHash(log, k) { let x = ''; for (let i = 0; i < k; i++) x = hash(x + JSON.stringify(log[i])); return x; }
  saveHost() {
    if (!this.eng || !this.gid || this.over || !this.log.length) return; const v = this.view;
    saves.put({ id: this.gid, game: this.ctx.gameId, kind: 'log', opp: oppOf(this), seat: this.hs, seed: this.seed, opt: this.opt, log: this.log.slice(), n: this.log.length, h: this.lh,
      turn: v && v.turn === 'opp' ? 'opp' : 'me', label: this.log.filter(o => o[0] === 'a').length + ' actions', created: this.created || Date.now() });
  }
  saveGuest(m) {
    if (this.over || !m.v || m.v.over) return; if (!(m.n > 0)) return;
    saves.put({ id: this.gid, game: this.ctx.gameId, kind: 'view', opp: oppOf(this), seat: m.seat, n: m.n, h: m.lh, view: null, turn: m.v.turn === 'opp' ? 'opp' : 'me', label: m.n + ' étapes', created: this.created || Date.now() });
  }
  dropSave() { if (this.gid) saves.del(this.gid); }
  initResume() {
    this.rp = resumeProtocol(this, {
      mine: rec => ({ n: rec.n, h: rec.h, seat: rec.seat }),
      decide: (rec, info) => {
        if (this.remi) return { ok: true, final: {} };
        if (info.seat === rec.seat) return { ok: false, why: 'side' };
        if (info.n > rec.n) return { ok: false, why: 'far' };
        if (this.prefixHash(rec.log, info.n) !== info.h) return { ok: false, why: 'diff' };
        return { ok: true, final: {}, note: info.n < rec.n ? 'L\'autre téléphone avait ' + (rec.n - info.n) + ' étape(s) de retard : il est remis à jour.' : '' };
      },
      load: (rec, final, note) => this.loadResume(rec, note),
    });
  }
  askResume(rec) { this.rp.ask(rec); }
  resumeFail(text) { modal('Reprise impossible', [h('p', {}, text)], [{ label: 'Compris' }]); }
  loadResume(rec, note) {
    if (this.gone) return; this.gone = true; this.clearMessage(); this.gid = rec.id; this.created = rec.created;
    if (this.isHost) {
      this.hs = rec.seat; this.seed = rec.seed; this.opt = rec.opt; this.eng = this.makeEngine(rec.seed, rec.opt);
      for (const op of rec.log) { if (op[0] === 'a') this.eng.act(op[1], op[2]); else this.eng.autoStep(); }
      this.log = rec.log.slice(); this.lh = rec.h; this.broadcast();
    } else {
      this.hs = 1 - rec.seat; this.net.send('sync'); const iv = setInterval(() => { if (this.gotView || !this.alive) clearInterval(iv); else this.net.send('sync'); }, 1500); this.sub(() => clearInterval(iv));
    }
    toast('Partie reprise.'); if (note) modal('Partie reprise', [h('p', {}, note)], [{ label: 'On continue' }]);
  }
  saveQuit() { if (this.log.length || this.view) { if (this.isHost) this.saveHost(); toast('Partie enregistrée : vous pourrez la reprendre plus tard.'); this.ctx.exit(); } }
  begin2(seed, opt, gid) {
    this.opt = opt; this.seed = seed; this.gid = gid || newId(); this.created = Date.now();
    if (this.isHost) { this.hs = 0; this.eng = this.makeEngine(seed, opt); this.broadcast(); }
    else { this.net.send('sync'); const iv = setInterval(() => { if (this.gotView || !this.alive) clearInterval(iv); else this.net.send('sync'); }, 1500); this.sub(() => clearInterval(iv)); }
  }
  doAct(p, a) { if (this.paused || !this.eng) return; if (this.eng.act(p, a)) { this.logOp(['a', p, a]); this.broadcast(); } }
  /** Action du joueur local. */
  act(a) { if (this.paused || this.over) return; if (this.isHost) this.doAct(this.hs, a); else this.net.send('act', { a }); }
  broadcast(resendOnly) {
    const v0 = this.eng.view(this.hs); this.apply(v0); this.saveHost(); this.net.send('st', { v: this.eng.view(1 - this.hs), n: this.log.length, lh: this.lh, seat: 1 - this.hs, gid: this.gid });
    if (resendOnly || !this.eng.auto) return;
    clearTimeout(this.autoT); const d = this.eng.auto(); if (d) this.autoT = setTimeout(() => { if (!this.alive) return; const wait = () => { if (!this.alive) return; if (this.paused) { this.autoT = setTimeout(wait, 300); return; } this.eng.autoStep(); this.logOp(['s']); this.broadcast(); }; wait(); }, d);
  }
  apply(v) {
    this.view = v; this.stat = { me: v.sm || '', opp: v.so || '' }; this.paint(); this.render(v);
    if (v.over && !this.endShown) { this.endShown = true; setTimeout(() => this.endGame(v.over), v.overDelay || 900); }
  }
  endGame(o) {
    if (!this.alive || this.over) return; this.dropSave(); saves.result(this.ctx.gameId, oppOf(this), o.w === 'draw' ? 'd' : o.w === 'me' ? 'w' : 'l');
    if (o.w === 'draw') { this.over = true; this.record(false); this.s.sfx('ok'); this.message('Égalité !', o.t, [{ label: 'Rejouer', onclick: () => this.askReplay() }, { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() }]); }
    else { this.finish(o.w === 'me', o.t); winBadge(this, o.w === 'me', null); }
    const p = this.msg && this.msg.querySelector('p'); if (p) p.style.whiteSpace = 'pre-line';
  }
  pause(on, remote) {
    if (this.paused || this.over || this.msg) return; this.paused = true; if (!remote) this.net.send('pz', { on: true });
    this.pz = h('div', { class: 'cg-pause' }, h('h2', {}, 'Partie en pause'), h('p', {}, remote ? this.oppA.name + ' a mis la partie en pause.' : 'Reprends quand tu veux.'),
      h('button', { class: 'btn big', onclick: () => this.resume() }, 'Reprendre'), h('button', { class: 'btn sec', onclick: () => this.rules() }, 'Règles'),
      h('button', { class: 'btn sec', 'data-act': 'savequit', onclick: () => this.saveQuit() }, 'Enregistrer et quitter'),
      h('button', { class: 'btn warn', onclick: () => modal('Quitter la partie ?', [h('p', {}, this.remi ? 'On arrête de jouer avec Rémi.' : 'L\'autre joueur sera prévenu.')], [{ label: 'Rester' }, { label: 'Quitter', cls: 'warn', onclick: () => this.ctx.exit() }]) }, 'Quitter la partie'),
      h('button', { class: 'btn sec', onclick: () => modal('Retour au menu ?', [h('p', {}, 'La partie en cours sera arrêtée.')], [{ label: 'Rester' }, { label: 'Menu des jeux', cls: 'warn', onclick: () => this.ctx.exit() }]) }, 'Retour au menu des jeux'));
    this.root.append(this.pz);
  }
  resume(remote) { if (!this.paused) return; this.paused = false; if (this.pz) { this.pz.remove(); this.pz = null; } if (!remote) this.net.send('pz', { on: false }); }
  destroy() { clearTimeout(this.autoT); super.destroy(); }
  /* à définir par les jeux : makeEngine(seed, opt) et render(view) */
}

/** Rémi : se comporte comme l'invité. think(view, mem, level) -> { ms, a } ou null. */
export function cardBrain(think, newMem = () => ({})) {
  return b => {
    let tok = 0; const mem = newMem(); let over = false;
    b.recv = {
      st: m => {
        const t = ++tok; if (m.v.over) { over = true; return; }
        let r = null; try { r = think(m.v, mem); } catch (e) { console.error(e); }
        if (r) setTimeout(() => { if (t === tok && !over) b.emit('act', { a: r.a }); }, r.ms);
      },
      sync: () => {}, pz: () => {}, act: () => {},
    };
  };
}
/** Délai de réflexion de Rémi selon le niveau (rang 1 lent, rang 5 vif). */
export const thinkMs = (slow = 1900, fast = 650) => lerp(slow, fast) + rnd(0, 500);
