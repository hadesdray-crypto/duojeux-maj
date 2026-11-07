// Capteurs et entrées du téléphone, réunis ici pour que chaque jeu les demande de la même façon.
// Chaque entrée a des repli (cascade) : si le capteur manque, un bouton à l'écran le remplace.
import { clamp, store, duo } from './util.js';

const P = () => duo();

class Emitter { constructor() { this.h = {}; } on(t, f) { (this.h[t] ||= new Set()).add(f); return () => this.h[t].delete(f); } emit(t, d) { (this.h[t] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } }); } }

/* Détecteur de geste circulaire : on suit l'angle du vecteur (mouvement ou rotation) dans chacun des 3 plans ; un tour presque complet (≈ 230°) en moins de 1,4 s = cercle.
   Un va-et-vient en ligne droite (secousse) fait sauter l'angle de 180° d'un coup : il est ignoré. Seuils à valider sur un vrai téléphone. */
class CircleDet {
  constructor() { this.tr = [0, 1, 2].map(() => ({ last: null, sum: 0, t0: 0, tl: 0, n: 0 })); }
  feed(t, v, thr, need = 4.0) {
    const pairs = [[v[0], v[1]], [v[0], v[2]], [v[1], v[2]]]; let best = 0;
    pairs.forEach(([u, w], i) => {
      const k = this.tr[i], m = Math.hypot(u, w);
      if (m < thr * .6) { if (t - k.tl > 180) { k.last = null; k.sum = 0; k.n = 0; } return; }
      const ang = Math.atan2(w, u);
      if (k.last == null || t - k.t0 > 1400) { k.last = ang; k.sum = 0; k.t0 = t; k.n = 0; k.tl = t; return; }
      let d = ang - k.last; d = Math.atan2(Math.sin(d), Math.cos(d)); k.last = ang; k.tl = t;
      if (Math.abs(d) > 2.2) { k.sum = 0; k.t0 = t; k.n = 0; return; }
      k.sum += d; k.n++;
      if (Math.abs(k.sum) >= need && k.n >= 6 && m > thr * .6) best = Math.max(best, m);
    });
    return best;
  }
  reset() { this.tr.forEach(k => { k.last = null; k.sum = 0; k.n = 0; }); }
}

class Sensors extends Emitter {
  constructor() {
    super();
    this.tilt = 0;          // -1 (gauche) … +1 (droite)
    this.heading = null;    // cap boussole en degrés (0 = nord)
    this.accel = 0;         // intensité du mouvement
    this.lastShake = 0;
    this.motionSeen = false; this.orientSeen = false; this.compassSeen = false;
    this.started = false;
    this.speechOn = false;
    this.volDown = false;
    this.cdA = new CircleDet(); this.cdG = new CircleDet(); this.lastCircle = 0; this.grav = null;
    this.audio = null; this.tiltY = 0; this.rate = 0; this.stamp = 0; this.zeroSide = 0; this.zeroFwd = null; this.gyro = 0; this.beta = 0; this.gamma = 0; this.mic = false;
  }

  /* ----- Demande d'accès unique (iOS exige un geste ; Android non) ----- */
  async askMotionPermission() {
    let ok = true;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') ok = (await DeviceMotionEvent.requestPermission()) === 'granted';
      if (ok && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') ok = (await DeviceOrientationEvent.requestPermission()) === 'granted';
    } catch { ok = false; }
    return ok;
  }

  start() {
    if (this.started) return; this.started = true;
    addEventListener('deviceorientation', e => this._onOrient(e), true);
    addEventListener('deviceorientationabsolute', e => {
      if (e.alpha == null) return; const h = (360 - e.alpha + 360) % 360; this.compassSeen = true; this._head(h);
    }, true);
    addEventListener('devicemotion', e => this._onMotion(e), true);
    // Touches du clavier (tests ordinateur) et boutons de volume (natif)
    addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft') this.emit('key', { k: 'left', down: true });
      if (e.key === 'ArrowRight') this.emit('key', { k: 'right', down: true });
      if (e.key === ' ') this.emit('shake', { power: .6 });
      if (e.key === 'Shift') { this.volDown = true; this.emit('shield', { down: true }); }
      if (e.key === 's' || e.key === 'S') this.emit('voice', { text: 'special' });
    });
    addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft') this.emit('key', { k: 'left', down: false });
      if (e.key === 'ArrowRight') this.emit('key', { k: 'right', down: false });
      if (e.key === 'Shift') { this.volDown = false; this.emit('shield', { down: false }); }
    });
    const dp = P();
    if (dp) {
      dp.addListener('volumeKey', e => { this.volDown = !!e.down; this.volSeen = true; this.emit('shield', { down: !!e.down, key: e.key }); });
      dp.addListener('speech', e => this.emit('voice', { text: (e.text || '').toLowerCase() }));
    }
  }

  /* ----- Précision / latence : filtre adaptatif (très peu de retard quand ça bouge vite, stable quand on est immobile) ----- */
  _angle() { try { const a = (screen.orientation && screen.orientation.angle) || window.orientation || 0; return ((a % 360) + 360) % 360; } catch { return 0; } }
  /** Filtre « un euro » : coupure basse à l'arrêt, haute en mouvement → pas de lag perceptible. */
  _euro(f, x, dt) {
    const minC = 6, beta = .12, al = c => { const tau = 1 / (2 * Math.PI * c); return 1 / (1 + tau / dt); };
    if (f.x == null) { f.x = x; f.dx = 0; return x; }
    const dx = (x - f.x) / dt; f.dx += al(12) * (dx - f.dx);
    const c = minC + beta * Math.abs(f.dx); f.x += al(c) * (x - f.x); return f.x;
  }
  _onOrient(e) {
    if (e.gamma == null) return;
    const now = performance.now(); const dt = clamp((now - (this._tO || now - 16)) / 1000, .004, .1); this._tO = now;
    this.rate = this.rate ? this.rate * .9 + (1 / dt) * .1 : 1 / dt; this.stamp = now;
    this.orientSeen = true; this.beta = e.beta; this.gamma = e.gamma;
    // Compensation de l'orientation de l'écran : « gauche/droite » est toujours celui que le joueur voit.
    const ang = this._angle(); let side = e.gamma, fwd = e.beta;
    if (ang === 90) { side = e.beta; fwd = -e.gamma; } else if (ang === 270) { side = -e.beta; fwd = e.gamma; } else if (ang === 180) { side = -e.gamma; fwd = -e.beta; }
    this.sideRaw = side; this.fwdRaw = fwd;
    const sens = clamp(store.get('sens', 1), .4, 2.5), range = 35 / sens, dz = 1.2;
    const z = this.zeroSide || 0, zf = this.zeroFwd == null ? 0 : this.zeroFwd;
    let v = this._euro(this._fs ||= {}, side - z, dt);
    v = Math.abs(v) < dz ? 0 : v - Math.sign(v) * dz;
    this.tilt = clamp(v / (range - dz), -1, 1) * (store.get('invertTilt', false) ? -1 : 1);
    let w = this._euro(this._ff ||= {}, fwd - zf, dt); w = Math.abs(w) < dz ? 0 : w - Math.sign(w) * dz;
    this.tiltY = clamp(w / (range - dz), -1, 1);
    if (e.webkitCompassHeading != null) { this.compassSeen = true; this._head(e.webkitCompassHeading); }
  }
  /** Cap boussole lissé sans saut à 359° → 0°. */
  _head(hd) {
    if (this.heading == null) { this.heading = hd; this._hx = Math.sin(hd * Math.PI / 180); this._hy = Math.cos(hd * Math.PI / 180); return; }
    const r = hd * Math.PI / 180, k = .6; this._hx += (Math.sin(r) - this._hx) * k; this._hy += (Math.cos(r) - this._hy) * k;
    this.heading = (Math.atan2(this._hx, this._hy) * 180 / Math.PI + 360) % 360;
  }
  /** Remet l'inclinaison actuelle à zéro (téléphone tenu « droit » = neutre). */
  calibrate() { this.zeroSide = this.sideRaw || 0; this.zeroFwd = this.fwdRaw || 0; this._fs = {}; this._ff = {}; return true; }
  resetCalibration() { this.zeroSide = 0; this.zeroFwd = null; this._fs = {}; this._ff = {}; }
  _onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration; if (!a || a.x == null) return;
    this.motionSeen = true; const r = e.rotationRate; if (r && r.alpha != null) this.gyro = Math.hypot(r.alpha, r.beta, r.gamma);
    const lin = e.acceleration && e.acceleration.x != null ? e.acceleration : null, g = lin ? 0 : 9.81;
    const mag = Math.abs(Math.hypot(a.x, a.y, a.z) - g);
    this.accel = mag; this.stamp = performance.now(); const now = this.stamp;
    // Vecteur d'accélération (sans la pesanteur quand le téléphone la donne) pour la direction des coups.
    const v = this.vec ||= { x: 0, y: 0, z: 0 }; if (lin) { v.x = lin.x; v.y = lin.y; v.z = lin.z; } else { v.x = a.x; v.y = a.y; v.z = a.z - 0; }
    // geste circulaire : accélération sans pesanteur (ou filtrée) et vitesse de rotation
    let lc = e.acceleration && e.acceleration.x != null ? [e.acceleration.x, e.acceleration.y, e.acceleration.z] : null;
    if (!lc) { const gg = e.accelerationIncludingGravity, vv = [gg.x, gg.y, gg.z]; this.grav = this.grav ? this.grav.map((q, i) => q * .92 + vv[i] * .08) : vv.slice(); lc = vv.map((q, i) => q - this.grav[i]); }
    let cp = this.cdA.feed(now, lc, 3);
    if (r && r.alpha != null) cp = Math.max(cp, this.cdG.feed(now, [r.alpha, r.beta, r.gamma], 90) ? 6 : 0);
    if (cp > 0 && now - this.lastCircle > 800) { this.lastCircle = now; this.cdA.reset(); this.cdG.reset(); this.emit('circle', { power: clamp(cp / 14, .4, 1) }); }
    const thr = store.get('shakeThr', 16);
    if (mag > thr && now - this.lastShake > 450) { this.lastShake = now; this.emit('shake', { power: clamp((mag - thr) / 20, 0, 1) }); }
    // Coups : on suit le pic de chaque mouvement, puis on annonce sa vraie force dès que l'accélération redescend.
    const st = this._st ||= { on: false, peak: 0, t0: 0, last: 0, dx: 0, dy: 0, dz: 0 }, lo = Math.max(6, thr * .5);
    if (!st.on) { if (mag > lo && now - st.last > 120) { st.on = true; st.peak = mag; st.t0 = now; st.dx = v.x; st.dy = v.y; st.dz = v.z; } }
    else {
      if (mag > st.peak) { st.peak = mag; st.dx = v.x; st.dy = v.y; st.dz = v.z; }
      if (mag < st.peak * .7 || now - st.t0 > 260) {
        st.on = false; st.last = now; const n = Math.hypot(st.dx, st.dy, st.dz) || 1;
        this.emit('strike', { force: clamp((st.peak - lo) / (thr * 1.6), 0, 1.5), peak: st.peak, dur: now - st.t0, dir: { x: st.dx / n, y: st.dy / n, z: st.dz / n } });
      }
    }
  }
  /** Fréquence réelle des événements capteur (Hz) et âge du dernier. */
  probe() { return { rate: Math.round(this.rate || 0), age: Math.round(performance.now() - (this.stamp || 0)) }; }

  get caps() {
    return {
      motion: this.motionSeen, tilt: this.orientSeen, compass: this.compassSeen,
      volume: !!P(), // les boutons de volume ne sont lisibles que dans l'APK
      voice: !!P() || ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window),
      vibrate: !!P() || ('vibrate' in navigator),
      gps: 'geolocation' in navigator,
      nearby: !!P(),
      online: navigator.onLine !== false, mic: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), gyro: this.motionSeen,
    };
  }

  /* ----- Voix : mots-clés pour attaques spéciales ----- */
  async startVoice() {
    if (this.speechOn) return true;
    const dp = P();
    if (dp) { try { await dp.startListening(); this.speechOn = true; return true; } catch { return false; } }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    try {
      const r = this.rec = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true;
      r.onresult = ev => { const res = ev.results[ev.results.length - 1]; this.emit('voice', { text: res[0].transcript.toLowerCase() }); };
      r.onend = () => { if (this.speechOn) try { r.start(); } catch {} };
      r.start(); this.speechOn = true; return true;
    } catch { return false; }
  }
  stopVoice() { this.speechOn = false; const dp = P(); if (dp) dp.stopListening().catch(() => {}); try { this.rec && this.rec.stop(); } catch {} }

  /* ----- Micro : niveau sonore 0..1 (cris, souffle) ----- */
  async startMic() {
    if (this.mic) return true;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const A = window.AudioContext || window.webkitAudioContext; this.micCtx = new A({ latencyHint: 'interactive' }); const src = this.micCtx.createMediaStreamSource(st);
      this.an = this.micCtx.createAnalyser(); this.an.fftSize = 512; this.an.smoothingTimeConstant = 0; src.connect(this.an); this.micBuf = new Float32Array(this.an.fftSize); this.micStream = st; this.mic = true; return true;
    } catch { return false; }
  }
  micLevel() { if (!this.mic) return 0; this.an.getFloatTimeDomainData(this.micBuf); let t = 0; for (const v of this.micBuf) t += v * v; return Math.min(1, Math.sqrt(t / this.micBuf.length) * 5); }
  stopMic() { if (!this.micStream) return; try { this.micStream.getTracks().forEach(t => t.stop()); } catch {} try { const c = this.micCtx; c && c.state !== 'closed' && c.close().catch(() => {}); } catch {} this.micStream = null; this.mic = false; }

  /* ----- Sortie : vibration, sons ----- */
  vibrate(ms = 80) { if (!store.get('vib', true)) return; const dp = P(); if (dp) dp.vibrate({ ms }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate(ms); }
  beep(freq = 440, ms = 90, type = 'square', vol = .15) {
    if (!store.get('sound', true)) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      this.audio ||= new A({ latencyHint: 'interactive' }); if (this.audio.state === 'suspended') this.audio.resume();
      const o = this.audio.createOscillator(), g = this.audio.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(.001, this.audio.currentTime + ms / 1000);
      o.connect(g); g.connect(this.audio.destination); o.start(); o.stop(this.audio.currentTime + ms / 1000);
    } catch {}
  }
  /** Souffle : bruit filtré dont la fréquence monte ou descend (onde d'énergie qui part ou qui arrive). */
  whoosh(ms = 600, f0 = 400, f1 = 2400, vol = .22) {
    if (!store.get('sound', true)) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      this.audio ||= new A(); const c = this.audio; if (c.state === 'suspended') c.resume();
      const n = Math.floor(c.sampleRate * ms / 1000), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5; const g = c.createGain(), t = c.currentTime;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + ms / 1000);
      g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(vol, t + ms / 2000); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000);
      src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    } catch {}
  }
  sfx(name) {
    const S = { fire: [880, 70, 'square'], hit: [160, 160, 'sawtooth'], block: [520, 90, 'triangle'], warn: [740, 140, 'square'], atk: [300, 80, 'square'], win: [990, 300, 'triangle'], lose: [110, 400, 'sawtooth'], ok: [660, 80, 'triangle'], tick: [1200, 30, 'square'] }[name];
    if (S) this.beep(...S);
  }
}

export const sensors = new Sensors();

/* ----- Géolocalisation (avec simulateur pour les tests) ----- */
export const geo = {
  fake: null, watchId: null,
  start(cb) {
    if (this.fake) { this._t = setInterval(() => cb(this.fake()), 1000); return true; }
    if (!('geolocation' in navigator)) return false;
    try { this.watchId = navigator.geolocation.watchPosition(p => cb({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }), () => cb(null), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }); return true; } catch { return false; }
  },
  stop() { clearInterval(this._t); if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId); this.watchId = null; },
  /** Distance (m) et cap (° depuis le nord) de a vers b */
  rel(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const x = dLon * Math.cos(rad((a.lat + b.lat) / 2)) * R, y = dLat * R;
    return { dist: Math.hypot(x, y), bearing: (Math.atan2(x, y) * 180 / Math.PI + 360) % 360, x, y };
  },
};
