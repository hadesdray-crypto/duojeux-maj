// Liaison entre les deux téléphones, en CASCADE :
//   1) « nearby »  : Bluetooth + Wi-Fi direct (plugin natif Android) — hors connexion, à courte distance
//   2) « peer »    : internet (WebRTC via PeerJS) avec le même code à 4 chiffres — longue distance
//   3) « local »   : même appareil / même navigateur (BroadcastChannel) — sert aux tests
// Même code à 4 chiffres pour tous : l'enfant n'a qu'une chose à comprendre.
import { sleep, duo } from './util.js';

const nativeDuo = () => duo();

class Emitter {
  constructor() { this.h = {}; }
  on(t, f) { (this.h[t] ||= new Set()).add(f); return () => this.h[t].delete(f); }
  emit(t, d) { (this.h[t] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } }); }
}

/* ---------- Transport local (tests, ou deux onglets) ---------- */
class LocalTransport extends Emitter {
  constructor() { super(); this.name = 'local'; }
  static available() { return typeof BroadcastChannel !== 'undefined'; }
  async open(role, code, timeoutMs = 40000) {
    this.id = Math.random().toString(36).slice(2);
    this.ch = new BroadcastChannel('duo-' + code);
    this.role = role; this.peerSeen = false;
    this.ch.onmessage = ev => {
      const m = ev.data; if (!m || m.from === this.id) return;
      if (m.k === 'hello') { if (!this.peerSeen) { this.peerSeen = true; this.ch.postMessage({ k: 'hello', from: this.id }); this.emit('connected'); } return; }
      if (m.k === 'bye') { this.peerSeen = false; this.emit('disconnected'); return; }
      if (m.k === 'msg') this.emit('message', m.d);
    };
    // Annonce répétée jusqu'à ce que l'autre réponde.
    for (let i = 0; i < timeoutMs / 100 && !this.peerSeen; i++) { this.ch.postMessage({ k: 'hello', from: this.id }); await sleep(100); if (this.closed) return; }
    if (!this.peerSeen) throw new Error('Personne n\'a répondu.');
  }
  send(d) { this.ch && this.ch.postMessage({ k: 'msg', from: this.id, d }); }
  close() { this.closed = true; try { this.ch && this.ch.postMessage({ k: 'bye', from: this.id }); this.ch && this.ch.close(); } catch {} }
}

/* ---------- Transport Nearby (plugin natif) ---------- */
class NearbyTransport extends Emitter {
  constructor() { super(); this.name = 'nearby'; this.subs = []; }
  static available() { return !!nativeDuo(); }
  async open(role, code, timeoutMs = 15000) {
    const P = nativeDuo();
    let done;
    const ready = new Promise((res, rej) => { done = { res, rej }; });
    const L = async (evt, fn) => { this.subs.push(await P.addListener(evt, fn)); };
    await L('duoConnected', () => { this.connected = true; this.emit('connected'); done.res(); });
    await L('duoDisconnected', () => { this.connected = false; this.emit('disconnected'); });
    await L('duoMessage', e => { try { this.emit('message', JSON.parse(e.data)); } catch {} });
    await L('duoError', e => done.rej(new Error(e.message || 'Erreur Bluetooth')));
    if (role === 'host') await P.startHosting({ code }); else await P.startJoining({ code });
    const to = setTimeout(() => done.rej(new Error('Délai dépassé : l\'autre téléphone n\'a pas été trouvé.')), timeoutMs);
    try { await ready; } finally { clearTimeout(to); }
  }
  send(d) { const P = nativeDuo(); P && P.sendMessage({ data: JSON.stringify(d) }).catch(() => {}); }
  close() { const P = nativeDuo(); this.subs.forEach(s => { try { s.remove(); } catch {} }); P && P.disconnect().catch(() => {}); }
}

/* ---------- Transport internet (PeerJS) ---------- */
class PeerTransport extends Emitter {
  constructor() { super(); this.name = 'peer'; }
  static available() { return typeof window.Peer === 'function' && navigator.onLine !== false; }
  async open(role, code, timeoutMs = 20000) {
    const base = 'duojeux-' + code;
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Délai internet dépassé.')), timeoutMs);
      const wire = c => {
        this.conn = c;
        c.on('open', () => { clearTimeout(to); this.emit('connected'); resolve(); });
        c.on('data', d => this.emit('message', d));
        c.on('close', () => this.emit('disconnected'));
        c.on('error', e => { clearTimeout(to); reject(e); });
      };
      if (role === 'host') {
        this.peer = new window.Peer(base);
        this.peer.on('connection', wire);
      } else {
        this.peer = new window.Peer();
        this.peer.on('open', () => wire(this.peer.connect(base, { reliable: false })));
      }
      this.peer.on('error', e => { clearTimeout(to); reject(new Error(e.type || 'Erreur internet')); });
    });
  }
  send(d) { try { this.conn && this.conn.open && this.conn.send(d); } catch {} }
  close() { try { this.conn && this.conn.close(); this.peer && this.peer.destroy(); } catch {} }
}

/* ---------- Le « réseau » vu par les jeux ---------- */
export class Net extends Emitter {
  constructor() { super(); this.t = null; this.role = null; this.code = null; this.latency = null; this.pingTimer = null; this.lastRx = 0; }

  /** Celui qui REJOINT essaie chaque méthode dans l'ordre. Celui qui CRÉE les ouvre toutes en même temps et garde la première qui répond. */
  async connect(role, code, { order = ['nearby', 'peer', 'local'], onStep = () => {} } = {}) {
    this.close();
    this.role = role; this.code = code;
    const map = { nearby: NearbyTransport, peer: PeerTransport, local: LocalTransport };
    const errors = [];
    const make = name => {
      const t = new map[name]();
      t.on('message', d => this._rx(d));
      t.on('disconnected', () => { if (this.t === t) this.emit('lost'); });
      return t;
    };
    const adopt = (name, t) => { this.t = t; this.method = name; onStep(name, 'ok'); this._startPing(); this.emit('ready', name); return name; };

    if (role === 'host') {
      const list = [];
      for (const n of order) { if (map[n] && map[n].available()) { onStep(n, 'essai'); list.push({ n, t: make(n) }); } else onStep(n, 'absent'); }
      const attempts = list.map(x => x.t.open(role, code, 180000).then(() => x, e => { errors.push(x.n + ': ' + (e.message || e)); onStep(x.n, 'echec'); throw e; }));
      let win = null;
      try { win = await Promise.any(attempts); } catch { win = null; }
      list.forEach(x => { if (x !== win) { x.t.on('disconnected', () => {}); try { x.t.close(); } catch {} } });
      if (win) return adopt(win.n, win.t);
      throw new Error('Aucune liaison possible. ' + errors.join(' | '));
    }

    for (const name of order) {
      const T = map[name];
      if (!T || !T.available()) { onStep(name, 'absent'); continue; }
      onStep(name, 'essai');
      const t = make(name);
      try { await t.open(role, code); return adopt(name, t); }
      catch (e) { errors.push(name + ': ' + (e.message || e)); onStep(name, 'echec'); try { t.close(); } catch {} }
    }
    throw new Error('Aucune liaison possible. ' + errors.join(' | '));
  }

  _rx(d) {
    this.lastRx = performance.now();
    if (d && d._p === 'ping') { this.t && this.t.send({ _p: 'pong', ts: d.ts }); return; }
    if (d && d._p === 'pong') { this.latency = Math.round((performance.now() - d.ts) / 2); this.emit('latency', this.latency); return; }
    if (d && d.t) this.emit(d.t, d);
    this.emit('*', d);
  }
  _startPing() {
    clearInterval(this.pingTimer); this.lastRx = performance.now();
    this.pingTimer = setInterval(() => {
      if (!this.t) return;
      this.t.send({ _p: 'ping', ts: performance.now() });
      if (performance.now() - this.lastRx > 9000) { this.lastRx = performance.now(); this.emit('lost'); }
    }, 2000);
  }

  send(t, data = {}) { if (this.t) this.t.send({ t, ...data }); }
  get connected() { return !!this.t; }
  close() { clearInterval(this.pingTimer); try { this.t && this.t.close(); } catch {} this.t = null; this.method = null; }
}

export const net = new Net();
export const nativeAvailable = () => !!nativeDuo();
