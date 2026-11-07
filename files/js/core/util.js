// Outils communs : création d'éléments, stockage sûr, fenêtres, messages.
export const $ = (s, r = document) => r.querySelector(s);

/** Crée un élément : h('div', {class:'card', onclick:fn}, 'texte', autreElement) */
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('duo.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('duo.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('duo.' + k); } catch {} },
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Fenêtre qui défile et garde toujours ses boutons visibles. buttons: [{label, cls, onclick}] */
export const modalStack = [];
export function modal(title, bodyNodes, buttons = [{ label: 'OK' }]) {
  const close = () => { ov.remove(); const i = modalStack.indexOf(api); if (i >= 0) modalStack.splice(i, 1); };
  const api = { close };
  const ov = h('div', { class: 'modal' },
    h('div', { class: 'box', role: 'dialog' },
      h('h2', {}, title),
      h('div', { class: 'body' }, ...[].concat(bodyNodes)),
      h('div', { class: 'row' }, ...buttons.map(b => h('button', {
        class: 'btn ' + (b.cls || ''), onclick: async () => { const r = b.onclick ? await b.onclick() : null; if (r !== false) close(); },
      }, b.label)))));
  document.body.append(ov); api.el = ov; modalStack.push(api);
  return api;
}

/** Code à 4 chiffres pour appairer les deux téléphones. */
export const newCode = () => String(Math.floor(1000 + Math.random() * 9000));

/** Plugin natif Android « Duo » (null dans un navigateur). */
export function duo() {
  const C = window.Capacitor; if (!C) return null;
  if (C.Plugins && C.Plugins.Duo) return C.Plugins.Duo;
  try { if (C.isNativePlatform && C.isNativePlatform() && C.registerPlugin) { C.Plugins = C.Plugins || {}; return (C.Plugins.Duo = C.registerPlugin('Duo')); } } catch {}
  return null;
}

/** Plugin natif Capacitor par son nom (null dans un navigateur). */
export function nativePlugin(name) {
  const C = window.Capacitor; if (!C) return null;
  if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
  try { if (C.isNativePlatform && C.isNativePlatform() && C.registerPlugin) { C.Plugins = C.Plugins || {}; return (C.Plugins[name] = C.registerPlugin(name)); } } catch {}
  return null;
}
