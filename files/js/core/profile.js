// Personnage du joueur : avatar choisi parmi 10, nom modifiable, statistiques.
// Deux copies locales (anti-corruption) + une copie chez chaque ami rencontré (sauvegarde si le téléphone est perdu).
import { store } from './util.js';

export const AVATARS = [
  { id: 'pirate', label: 'Le pirate', color: '#4da3ff' }, { id: 'robot', label: 'Le robot', color: '#27e0b3' },
  { id: 'chat', label: 'Le chat ninja', color: '#ffb020' }, { id: 'renard', label: 'Le renard', color: '#ff7a3c' },
  { id: 'dino', label: 'Le dragon', color: '#2fbf71' }, { id: 'fantome', label: 'La pieuvre', color: '#cfd8ff' },
  { id: 'astro', label: 'L\'astronaute', color: '#7aa8ff' }, { id: 'ninja', label: 'Le chevalier', color: '#ff5470' },
  { id: 'sorcier', label: 'Le sorcier', color: '#b07cff' }, { id: 'lapin', label: 'La sirène', color: '#ff8aa0' },
];
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nums = o => { const r = {}; if (o && typeof o === 'object') for (const k of Object.keys(o).slice(0, 40)) { const v = +o[k]; if (isFinite(v) && v >= 0) r[String(k).slice(0, 20)] = Math.floor(v); } return r; };
const cleanStats = s => ({ played: nums(s && s.played), wins: nums(s && s.wins) });
const clean = p0 => { const p = p0 && typeof p0 === 'object' && p0.pid ? { ...p0, name: String(p0.name || 'Joueur').slice(0, 14), stats: cleanStats(p0.stats) } : null; return p && AVATARS.some(a => a.id === p.avatar) ? p : null; };

export const profile = {
  /** Pour les tests : deux « téléphones » dans le même navigateur gardent chacun leur personnage en mémoire. */
  testMode(p) { this._t = { p: { ...p, stats: { played: {}, wins: {} }, v: 1 }, friends: {} }; },
  get() {
    if (this._t) return this._t.p;
    if (this._m) return this._m;
    let p = clean(store.get('profile', null)) || clean(store.get('profile_bak', null));
    if (!p) { p = { pid: newId(), avatar: 'robot', name: 'Joueur', chosen: false, stats: { played: {}, wins: {} }, v: 1 }; this.set(p); }
    return p;
  },
  set(p) { if (this._t) { this._t.p = p; return p; } this._m = p; store.set('profile', p); store.set('profile_bak', p); return p; },
  update(f) { const p = this.get(); f(p); p.name = String(p.name || 'Joueur').trim().slice(0, 14) || 'Joueur'; return this.set(p); },
  record(gameId, win) { if (!gameId) return; this.update(p => { p.stats.played[gameId] = (p.stats.played[gameId] || 0) + 1; if (win) p.stats.wins[gameId] = (p.stats.wins[gameId] || 0) + 1; }); },
  /** Ce qui est envoyé aux amis pour la sauvegarde. */
  summary() { const p = this.get(); return { pid: p.pid, avatar: p.avatar, name: p.name, chosen: !!p.chosen, stats: p.stats, at: Date.now() }; },
  totals() { const p = this.get(); const sum = o => Object.values(o).reduce((a, b) => a + b, 0); return { played: sum(p.stats.played), wins: sum(p.stats.wins) }; },
  /** Reprendre un personnage rendu par un ami. */
  restore(av) { const p = clean({ ...av, chosen: true, v: 1 }); if (p) this.set(p); return !!p; },

  /* ----- personnages gardés pour les amis ----- */
  friends() { if (this._t) return this._t.friends; const f = store.get('friends', {}); return f && typeof f === 'object' ? f : {}; },
  keepFriend(av) {
    if (!av || !av.pid || !AVATARS.some(a => a.id === av.avatar) || av.pid === this.get().pid) return;
    const f = this.friends(); f[av.pid] = { pid: av.pid, avatar: av.avatar, name: String(av.name || '').slice(0, 14), stats: cleanStats(av.stats), saved: Date.now() };
    const keys = Object.keys(f); if (keys.length > 30) delete f[keys.sort((a, b) => f[a].saved - f[b].saved)[0]];
    if (!this._t) store.set('friends', f);
  },
  forgetFriend(pid) { const f = this.friends(); delete f[pid]; if (!this._t) store.set('friends', f); },
};
