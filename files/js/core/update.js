// Mise à jour sur place, sans réinstaller l'APK : on télécharge la nouvelle version dans le téléphone, puis on redémarre.
// Cascade : (1) mise à jour sur place ; (2) si impossible, lien vers la nouvelle installation.
import { store } from './util.js';
import { BUILD } from '../version.js';

export const DEFAULT_URL = 'https://raw.githubusercontent.com/hadesdray-crypto/duojeux-maj/main/';
const base = () => { const u = store.get('updUrl', DEFAULT_URL); return u.endsWith('/') ? u : u + '/'; };
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', mp3: 'audio/mpeg', txt: 'text/plain' };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export const canUpdateInPlace = () => !!(navigator.serviceWorker && navigator.serviceWorker.controller && window.caches);

/** Cherche une version plus récente. Renvoie { build, version, notes[], files[], minNative } ou null. Lève une erreur si pas de réseau. */
export async function check() {
  const r = await fetch(base() + 'manifest.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('manifest ' + r.status);
  const m = await r.json();
  return m && m.build > BUILD ? m : null;
}

/** Télécharge et vérifie chaque fichier, puis active la nouvelle version (au prochain démarrage de la page). */
export async function apply(m, onProgress = () => {}) {
  const name = 'duo-live-' + m.build; await caches.delete(name); const c = await caches.open(name); let i = 0;
  for (const f of m.files) {
    const r = await fetch(base() + 'files/' + f.p + '?t=' + m.build, { cache: 'no-store' }); if (!r.ok) throw new Error('fichier ' + f.p);
    const buf = await r.arrayBuffer();
    if (buf.byteLength !== f.size) throw new Error('taille ' + f.p);
    if (crypto.subtle) { const d = hex(await crypto.subtle.digest('SHA-256', buf)); if (d !== f.sha) throw new Error('contrôle ' + f.p); }
    await c.put('/' + f.p, new Response(buf, { headers: { 'Content-Type': TYPES[f.p.split('.').pop()] || 'application/octet-stream' } }));
    onProgress(++i / m.files.length);
  }
  const meta = await caches.open('duo-meta'); await meta.put('/__active', new Response(name));
  for (const k of await caches.keys()) if (k.startsWith('duo-live-') && k !== name) await caches.delete(k);
  store.set('upd_try', m.build); localStorage.setItem('duo.upd_tries', '0');
}

/** À appeler quand l'appli a bien démarré : valide la nouvelle version (sinon elle est retirée automatiquement). */
export const confirmBoot = () => { store.set('upd_ok', BUILD); localStorage.setItem('duo.upd_tries', '0'); };
export const registerWorker = () => { try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {} };
