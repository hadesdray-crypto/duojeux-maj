// Position du joueur : vrai GPS dehors, ou « pas » comptés par le téléphone dans la maison.
import { geo } from './sensors.js';

export class Walker {
  constructor(sensors) { this.s = sensors; this.me = null; this.step = false; this.sim = null; this.lastStep = 0; this.walked = 0; this.prev = null; }
  /** stepMode=true : on avance en marchant sur place (ou avec le bouton « Faire un pas »). */
  start(stepMode, from) {
    this.stop(); this.step = !!stepMode;
    if (this.step) { const o = from || { lat: 48.85, lon: 2.35 }; this.sim = { lat: o.lat, lon: o.lon, head: 0 }; this.me = { lat: o.lat, lon: o.lon, acc: 3 }; return true; }
    return geo.start(p => { if (p) this.me = p; });
  }
  stop() { geo.stop(); }
  stepOnce() {
    if (!this.sim) return; const a = this.sim.head * Math.PI / 180, d = .8;
    this.sim.lat += Math.cos(a) * d / 111320; this.sim.lon += Math.sin(a) * d / (111320 * Math.cos(this.sim.lat * Math.PI / 180));
    this.me = { lat: this.sim.lat, lon: this.sim.lon, acc: 3 }; this.walked += d; this.s.sfx('tick');
  }
  turn(deg) { if (this.sim) this.sim.head = (this.sim.head + deg + 360) % 360; }
  /** Direction où regarde le joueur (boussole du téléphone, ou cap simulé), null si inconnue. */
  get heading() { return this.step ? this.sim.head : this.s.heading; }
  tick() {
    if (this.step) { const now = performance.now(); if (this.s.motionSeen && this.s.accel > 2.6 && now - this.lastStep > 380) { this.lastStep = now; this.stepOnce(); } }
    else if (this.me) { if (this.prev) { const mv = geo.rel(this.prev, this.me).dist; if (mv > 3 && mv < 60) { this.walked += mv; this.prev = this.me; } } else this.prev = this.me; }
  }
}
