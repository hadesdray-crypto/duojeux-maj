// Vrais bruits de canon et d'explosion, fabriqués avec WebAudio (aucun bip) : souffle de bruit filtré passe-bas à enveloppe rapide,
// grondement grave (40 à 90 Hz) qui décroît, léger écho et réverbération. Un compresseur et un filtre évitent la saturation.
// Usage : import { boom } from '../core/boom.js'; boom.shot(this.s) ; boom.big(this.s) ; boom.splash(this.s) ; boom.crack(this.s) ; boom.thud(this.s)
// Le paramètre est l'objet "sensors" (on réutilise son AudioContext) ; la coupure du son (réglage « sound ») est respectée.
import { store } from './util.js';

const chains = new WeakMap();
const ctxOf = s => {
  if (!store.get('sound', true)) return null;
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
    s.audio ||= new A(); const c = s.audio; if (c.state === 'suspended') c.resume();
    let ch = chains.get(c); if (ch) return ch;
    const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Réverbération : bruit qui décroît (1,8 s)
    const rl = Math.floor(c.sampleRate * 1.8), rb = c.createBuffer(2, rl, c.sampleRate);
    for (let k = 0; k < 2; k++) { const r = rb.getChannelData(k); for (let i = 0; i < rl; i++) r[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.6); }
    const out = c.createGain(); out.gain.value = .9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 8; comp.attack.value = .003; comp.release.value = .25;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    out.connect(comp); comp.connect(lp); lp.connect(c.destination);
    const verb = c.createConvolver(); verb.buffer = rb; const vg = c.createGain(); vg.gain.value = .5; verb.connect(vg); vg.connect(out);
    // Écho léger
    const dl = c.createDelay(.5); dl.delayTime.value = .13; const fb = c.createGain(); fb.gain.value = .28; const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 900;
    const eg = c.createGain(); eg.gain.value = .4; dl.connect(ef); ef.connect(fb); fb.connect(dl); ef.connect(eg); eg.connect(out);
    ch = { c, nb, out, verb, echo: dl }; chains.set(c, ch); return ch;
  } catch { return null; }
};
// Un souffle de bruit filtré : fréquence f0 -> f1 (passe-bas), enveloppe attaque courte / décroissance dur secondes.
const puff = (ch, t, { f0 = 1800, f1 = 300, dur = .3, vol = .8, type = 'lowpass', q = 1, rev = .15, echo = .2, off = 0 }) => {
  const { c } = ch, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = ch.nb; src.loop = true; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t + off); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + off + dur);
  g.gain.setValueAtTime(.0001, t + off); g.gain.exponentialRampToValueAtTime(vol, t + off + .006); g.gain.exponentialRampToValueAtTime(.0008, t + off + dur);
  src.connect(f); f.connect(g); g.connect(ch.out);
  if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r); r.connect(ch.verb); }
  if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e); e.connect(ch.echo); }
  src.start(t + off, Math.random()); src.stop(t + off + dur + .05);
};
// Un grondement grave : sinus qui descend de f0 à f1 Hz.
const rumble = (ch, t, { f0 = 90, f1 = 40, dur = .5, vol = .9, rev = .1, echo = .15, off = 0 }) => {
  const { c } = ch, o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t + off); o.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
  g.gain.setValueAtTime(.0001, t + off); g.gain.exponentialRampToValueAtTime(vol, t + off + .01); g.gain.exponentialRampToValueAtTime(.0008, t + off + dur);
  o.connect(g); g.connect(ch.out);
  if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r); r.connect(ch.verb); }
  if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e); e.connect(ch.echo); }
  o.start(t + off); o.stop(t + off + dur + .05);
};
const play = (s, fn) => { const ch = ctxOf(s); if (!ch) return; try { fn(ch, ch.c.currentTime + .005); } catch {} };

export const boom = {
  /** Tir normal : « bom » sec de canon. */
  shot(s) { play(s, (ch, t) => { puff(ch, t, { f0: 2200, f1: 260, dur: .28, vol: .8, rev: .2 }); rumble(ch, t, { f0: 95, f1: 42, dur: .42, vol: .95 }); puff(ch, t, { f0: 500, f1: 120, dur: .5, vol: .25, rev: .3, off: .04 }); }); },
  /** Boulet explosif : gros « BROUM » long avec réverbération. */
  big(s) { play(s, (ch, t) => {
    puff(ch, t, { f0: 2600, f1: 140, dur: 1.2, vol: 1, rev: .6, echo: .3 });
    rumble(ch, t, { f0: 90, f1: 34, dur: 1.5, vol: 1, rev: .35 }); rumble(ch, t, { f0: 62, f1: 30, dur: 1.9, vol: .8, rev: .4, off: .05 });
    puff(ch, t, { f0: 420, f1: 70, dur: 1.9, vol: .55, rev: .8, echo: .35, off: .12 }); }); },
  /** Impact sur l'eau : « ploc » sourd. */
  splash(s) { play(s, (ch, t) => { rumble(ch, t, { f0: 330, f1: 95, dur: .11, vol: .7, rev: .1, echo: .05 }); puff(ch, t, { f0: 900, f1: 220, dur: .16, vol: .35, type: 'bandpass', q: 1.2, rev: .25, echo: 0 }); }); },
  /** Rocher qui se fissure ou se brise : craquement. */
  crack(s) { play(s, (ch, t) => { for (let i = 0; i < 3; i++) puff(ch, t, { f0: 3200, f1: 900, dur: .05 + i * .02, vol: .55 - i * .1, type: 'bandpass', q: 4, rev: .1, echo: 0, off: i * .045 }); rumble(ch, t, { f0: 140, f1: 55, dur: .22, vol: .7, off: .02 }); }); },
  /** Choc d'un bateau contre une île ou un débris : coup sourd. */
  thud(s) { play(s, (ch, t) => { puff(ch, t, { f0: 700, f1: 120, dur: .25, vol: .7, rev: .2 }); rumble(ch, t, { f0: 85, f1: 40, dur: .35, vol: 1 }); }); },
};
