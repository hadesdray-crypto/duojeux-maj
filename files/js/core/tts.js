// Voix de l'appli (lecture à voix haute des consignes). Repli propre : si aucune voix, on affiche seulement le texte.
import { store } from './util.js';

export const tts = {
  voices() { try { return (speechSynthesis.getVoices() || []).filter(v => /^fr/i.test(v.lang)); } catch { return []; } },
  available() { return typeof speechSynthesis !== 'undefined' && this.voices().length > 0; },
  pick() {
    const want = store.get('voice', null); const vs = this.voices();
    return vs.find(v => v.name === want) || vs[0] || null;
  },
  speak(text) {
    if (!store.get('talk', true)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); const v = this.pick();
      if (v) u.voice = v; u.lang = 'fr-FR'; u.rate = store.get('rate', 1); u.pitch = store.get('pitch', 1);
      speechSynthesis.speak(u);
    } catch {}
  },
};
try { speechSynthesis.onvoiceschanged = () => {}; } catch {}
