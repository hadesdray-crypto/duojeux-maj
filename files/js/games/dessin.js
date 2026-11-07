// Dessine et devine : l'un dessine un mot avec le doigt, l'autre devine parmi 4 choix. Puis on échange.
import { Duo, rng } from '../core/kit.js';
import { WORDS } from '../core/strokes.js';
import { h } from '../core/util.js';
import { sprEl, sprSet } from '../core/sprites.js';
import { css, winBadge } from '../core/winfx.js';
css('dessinfx', '.dframe{background:linear-gradient(#6b4a28,#4a3219);padding:9px;border-radius:16px;box-shadow:0 6px 14px #0009,inset 0 2px 0 #ffffff22;max-width:440px;margin:0 auto}.dframe canvas{border-radius:8px!important;box-shadow:inset 0 0 0 2px #0004}.dhead{display:flex;align-items:center;justify-content:center;gap:8px}');
const ROUNDS = 2, LIMIT = 45;
class Dessin extends Duo {
  constructor(ctx) {
    super(ctx); this.r = -1; this.strokes = []; this.score = 0; this.theirs = null; this.mine = null; this.locked = true;
    this.hud(h('span', {}, 'Manche 0 / ' + ROUNDS), h('span', {}, ''));
    this.note = this.big('');
    this.cv2 = h('canvas', { width: 360, height: 300, style: 'width:100%;max-width:420px;aspect-ratio:360/300;background:#fff;border-radius:14px;touch-action:none;display:block;margin:0 auto' });
    this.g2 = this.cv2.getContext('2d'); this.choices = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px' });
    this.ico = sprEl('n_brush', 52); this.root.append(h('div', { class: 'dhead' }, this.ico, this.note), h('div', { class: 'dframe' }, this.cv2), this.choices);
    const pt = e => { const b = this.cv2.getBoundingClientRect(); return [Math.round((e.clientX - b.left) / b.width * 1000) / 1000, Math.round((e.clientY - b.top) / b.height * 1000) / 1000]; };
    this.cv2.addEventListener('pointerdown', e => { if (!this.drawer || this.locked) return; e.preventDefault(); this.cv2.setPointerCapture(e.pointerId); const p = pt(e); this.strokes.push([p]); this.net.send('dp', { n: 1, x: p[0], y: p[1] }); this.down = true; this.paintCv(); });
    this.cv2.addEventListener('pointermove', e => { if (!this.down || !this.drawer || this.locked) return; const p = pt(e); this.strokes[this.strokes.length - 1].push(p); this.net.send('dp', { x: p[0], y: p[1] }); this.paintCv(); });
    const up = () => { this.down = false; }; this.cv2.addEventListener('pointerup', up); this.cv2.addEventListener('pointercancel', up);
    this.onNet('dp', m => { if (this.drawer) return; if (m.n || !this.strokes.length) this.strokes.push([[m.x, m.y]]); else this.strokes[this.strokes.length - 1].push([m.x, m.y]); this.paintCv(); });
    this.onNet('dg', m => { if (this.drawer && !this.locked) this.result(m.w); });
    this.onNet('res', m => { this.theirs = m.v; this.fin(); });
    this.gate('Dessine et devine', 'Chacun son tour : l\'un dessine le mot avec le doigt,\nl\'autre doit le deviner.', seed => { this.seed = seed; this.nextRound(); });
    this.loop(dt => { if (this.timeLeft != null && !this.locked && !this.drawer) { this.timeLeft -= dt; if (this.timeLeft <= 0) this.guess(-1); } });
  }
  wordIdx(r) { return (this.seed + r * 3) % WORDS.length; }
  nextRound() {
    this.r++; if (this.r >= ROUNDS) { this.mine = this.score; this.net.send('res', { v: this.mine }); this.choices.replaceChildren(); this.fin(); this.note.textContent = 'J\'attends ' + this.oppA.name + '…'; return; }
    this.hudEl.children[0].textContent = 'Manche ' + (this.r + 1) + ' / ' + ROUNDS; this.strokes = []; this.locked = false; this.paintCv();
    if ((this.r % 2 === 0) === this.isHost) { this.locked = true; setTimeout(() => { if (this.alive && this.r === this.curR) this.locked = false; }, 700); } this.curR = this.r;
    this.drawer = (this.r % 2 === 0) === this.isHost; const w = this.wordIdx(this.r);
    sprSet(this.ico, this.drawer ? 'n_brush' : 'n_ask', 52);
    if (this.drawer) { this.note.textContent = 'Dessine : ' + WORDS[w].w; this.note.style.color = '#ffb020'; this.choices.replaceChildren(); this.cv2.style.cursor = 'crosshair'; this.timeLeft = null; }
    else {
      this.note.textContent = 'Devine le dessin !'; this.note.style.color = '#27e0b3'; this.timeLeft = LIMIT;
      const q = rng(this.seed + this.r * 7); const opts = [w]; while (opts.length < 4) { const k = (q() * WORDS.length) | 0; if (!opts.includes(k)) opts.push(k); } opts.sort((a, b) => ((a * 7 + this.r) % 11) - ((b * 7 + this.r) % 11));
      this.choices.replaceChildren(...opts.map(k => h('button', { class: 'btn big', onclick: () => this.guess(k) }, WORDS[k].w)));
    }
  }
  guess(k) { if (this.locked) return; const ok = k === this.wordIdx(this.r); this.net.send('dg', { w: k }); this.after(ok, k); if (ok) this.score++; }
  result(k) { this.after(k === this.wordIdx(this.r), k); }
  after(ok, k) {
    this.locked = true; this.s.sfx(ok ? 'win' : 'hit'); this.note.textContent = (ok ? 'Bravo, c\'était bien ' : 'Raté, c\'était ') + WORDS[this.wordIdx(this.r)].w + ' !'; this.note.style.color = ok ? '#27e0b3' : '#ff5470';
    this.choices.replaceChildren(); sprSet(this.ico, ok ? 'n_conf' : 'n_ask', 52); setTimeout(() => this.alive && this.nextRound(), 2200);
  }
  finish(win, d) { super.finish(win, d); winBadge(this, win, null); }
  fin() { if (this.mine != null && this.theirs != null) this.compare(this.mine, this.theirs, v => v + ' bonne(s) réponse(s)'); }
  paintCv() {
    const g = this.g2; g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 300); g.strokeStyle = '#1b2250'; g.lineWidth = 5; g.lineCap = g.lineJoin = 'round';
    for (const s of this.strokes) { g.beginPath(); s.forEach((p, i) => i ? g.lineTo(p[0] * 360, p[1] * 300) : g.moveTo(p[0] * 360, p[1] * 300)); if (s.length === 1) g.lineTo(s[0][0] * 360 + .1, s[0][1] * 300); g.stroke(); }
  }
}
export default { id: 'dessin', name: 'Dessine et devine', short: 'Dessine avec le doigt, l\'autre devine.', how: ['Un mot s\'affiche : dessine-le avec le doigt.', 'L\'autre voit ton dessin et choisit la bonne réponse.', 'Puis on échange.', 'Le plus de bonnes réponses gagne.'], create: ctx => new Dessin(ctx) };
