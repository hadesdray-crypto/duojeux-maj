// Briques communes aux jeux : canvas, boucle, écran de fin, aide courte, abonnements à nettoyer.
import { h } from '../core/util.js';
import { profile } from '../core/profile.js';

export class GameBase {
  constructor(ctx) {
    this.ctx = ctx; this.net = ctx.net; this.s = ctx.sensors; this.role = ctx.role; window.__game = this;
    this.subs = []; this.alive = true; this.over = false; this.raf = 0; this.last = performance.now();
    this.root = h('div', { class: 'game' });
    ctx.root.append(this.root);
  }
  /** Abonnement automatiquement retiré à la fin. */
  sub(off) { this.subs.push(off); return off; }
  onNet(type, fn) { this.sub(this.net.on(type, fn)); }
  onSense(type, fn) { this.sub(this.s.on(type, fn)); }

  makeCanvas(W = 360, H = 560) {
    this.W = W; this.H = H;
    this.cv = h('canvas'); this.root.append(this.cv);
    this.g = this.cv.getContext('2d');
    const fit = () => {
      const r = this.cv.getBoundingClientRect(); const d = Math.min(window.devicePixelRatio || 1, 2);
      this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d);
      this.sc = Math.min(this.cv.width / W, this.cv.height / H);
      this.ox = (this.cv.width - W * this.sc) / 2; this.oy = (this.cv.height - H * this.sc) / 2;
    };
    this.fit = fit; new ResizeObserver(fit).observe(this.cv); setTimeout(fit, 0);
  }
  begin() { const g = this.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height); g.setTransform(this.sc, 0, 0, this.sc, this.ox, this.oy); g.save(); g.beginPath(); g.rect(0, 0, this.W, this.H); g.clip(); }
  endDraw() { this.g.restore(); }

  loop(update) {
    const tick = now => {
      if (!this.alive) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      try { update(dt); } catch (e) { console.error(e); }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  hud(...nodes) { this.hudEl = h('div', { class: 'hud' }, ...nodes); this.root.prepend(this.hudEl); return this.hudEl; }

  /** Gros message plein écran (début, fin…). */
  message(title, text, buttons) {
    this.clearMessage();
    this.msg = h('div', { class: 'bigmsg' }, h('h2', {}, title), text ? h('p', {}, text) : null,
      ...(buttons || []).map(b => h('button', { class: 'btn big ' + (b.cls || ''), onclick: b.onclick }, b.label)));
    this.root.append(this.msg);
  }
  clearMessage() { if (this.msg) { this.msg.remove(); this.msg = null; } }

  /** Compte la partie dans les statistiques du personnage et en envoie une copie à l'ami (sauvegarde). */
  record(win) {
    try { profile.record(this.ctx.gameId, win); if (this.net && !this.net.remi) this.net.send('avsave', { av: profile.summary() }); } catch {}
  }
  finish(win, detail = '') {
    if (this.over) return; this.over = true; this.record(win);
    this.s.sfx(win ? 'win' : 'lose'); this.s.vibrate(win ? 60 : 250);
    this.message(win ? 'Bravo, tu as gagné !' : 'Perdu… ', detail, [
      { label: 'Rejouer', onclick: () => this.askReplay() },
      { label: 'Menu des jeux', cls: 'sec', onclick: () => this.ctx.exit() },
    ]);
    this.ctx.tts && this.ctx.tts.speak(win ? 'Bravo, tu as gagné !' : 'Perdu. On rejoue ?');
  }
  askReplay() { this.net.send('replay'); this.replayMine = true; this.message('On rejoue ?', 'J\'attends l\'autre joueur…', []); this.checkReplay(); }
  checkReplay() { if (this.replayMine && this.replayTheirs) { this.replayMine = this.replayTheirs = false; this.ctx.restart(); } }
  wireReplay() { this.onNet('replay', () => { this.replayTheirs = true; this.checkReplay(); }); }

  destroy() {
    this.alive = false; cancelAnimationFrame(this.raf);
    this.subs.forEach(f => { try { f(); } catch {} }); this.subs = [];
    this.root.remove();
  }
}

/** Bouton « maintenu » (appui long) fiable au toucher et à la souris. */
export function holdButton(label, cls, onChange) {
  const b = h('button', { class: 'btn ' + (cls || '') }, label);
  const set = v => { b.classList.toggle('held', v); onChange(v); };
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); set(true); });
  const up = e => { e.preventDefault(); set(false); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', () => set(false));
  b.addEventListener('contextmenu', e => e.preventDefault());
  return b;
}
