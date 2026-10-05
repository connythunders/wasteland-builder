// Sprite particles: smoke, fire, sparks, dust, debris, explosions and burning wrecks.
import * as THREE from 'three';
import { sprite } from './textures.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene) {
    this.scene = scene; this.list = []; this.emitters = [];
    this.debrisGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    this.debrisMat = new THREE.MeshLambertMaterial({ color: 0x3a342f });
    this.maxParticles = 450;
  }

  clear() {
    for (const p of this.list) { this.scene.remove(p.o); if (!p.debris) p.o.material.dispose(); }
    this.list.length = 0; this.emitters.length = 0;
  }

  puff(kind, x, y, z, o = {}) {
    if (this.list.length > this.maxParticles) return;
    const additive = kind === 'fire' || kind === 'spark';
    const m = new THREE.SpriteMaterial({ map: sprite(kind), transparent: true, depthWrite: false, opacity: o.opacity ?? 1, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, rotation: rnd(0, 6.3) });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(o.size ?? 1); this.scene.add(s);
    this.list.push({ o: s, vx: o.vx ?? rnd(-1, 1), vy: o.vy ?? 1, vz: o.vz ?? rnd(-1, 1), life: o.life ?? 1, max: o.life ?? 1, size: o.size ?? 1, grow: o.grow ?? 1.5, op: o.opacity ?? 1, drag: o.drag ?? 0.4, spin: rnd(-1, 1) });
  }
  smoke(x, y, z, size = 2, life = 2.2, vy = 2.5) { this.puff('smoke', x, y, z, { size, life, vy, grow: 2.2, opacity: 0.7, vx: rnd(-0.6, 0.6), vz: rnd(-0.6, 0.6) }); }
  fire(x, y, z, size = 1.6, life = 0.6, v = {}) { this.puff('fire', x, y, z, { size, life, vy: 2, grow: 0.6, opacity: 1, ...v }); }
  spark(x, y, z, v = 6) { this.puff('spark', x, y, z, { size: 0.45, life: 0.3, vx: rnd(-v, v), vy: rnd(1, v), vz: rnd(-v, v), grow: 0.3, drag: 1 }); }
  dust(x, z, size = 2.4, vx = 0, vz = 0) { this.puff('dust', x, 0.4, z, { size, life: 0.9, vy: 0.8, grow: 2.4, opacity: 0.55, vx: vx * 0.2 + rnd(-1, 1), vz: vz * 0.2 + rnd(-1, 1) }); }
  debris(x, y, z, v = 9) {
    if (this.list.length > this.maxParticles) return;
    const m = new THREE.Mesh(this.debrisGeo, this.debrisMat); m.position.set(x, y, z); m.scale.setScalar(rnd(0.6, 1.8)); this.scene.add(m);
    this.list.push({ o: m, debris: true, vx: rnd(-v, v), vy: rnd(4, 11), vz: rnd(-v, v), life: rnd(1.2, 2), max: 2, size: 1, grow: 0, op: 1, drag: 0, spin: rnd(2, 8) });
  }
  explosion(x, z, big = 1) {
    for (let i = 0; i < 10 * big; i++) this.fire(x + rnd(-1, 1) * big, 1.2 + rnd(0, 1.5), z + rnd(-1, 1) * big, rnd(2.5, 5) * big, rnd(0.4, 0.9), { vx: rnd(-5, 5) * big, vz: rnd(-5, 5) * big, vy: rnd(2, 7) });
    for (let i = 0; i < 9 * big; i++) this.smoke(x + rnd(-1, 1), 1.5, z + rnd(-1, 1), rnd(3, 6) * big, rnd(1.6, 3), rnd(3, 6));
    for (let i = 0; i < 12 * big; i++) this.spark(x, 1.2, z, 12);
    for (let i = 0; i < 8 * big; i++) this.debris(x, 1, z);
  }
  /** Burning wreck: emits fire + a smoke column for `life` seconds. */
  burn(x, z, life = 14) { this.emitters.push({ x, z, life, t: 0 }); }

  update(dt) {
    for (const e of this.emitters) {
      e.life -= dt; e.t -= dt;
      if (e.t <= 0) { e.t = 0.09; this.fire(e.x + rnd(-0.5, 0.5), 0.8, e.z + rnd(-0.5, 0.5), rnd(1.2, 2), 0.5, { vy: 2.5 }); if (Math.random() < 0.7) this.smoke(e.x, 2.2, e.z, rnd(2, 3.5), rnd(2.5, 4), rnd(2.5, 4)); }
    }
    this.emitters = this.emitters.filter((e) => e.life > 0);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.o); if (!p.debris) p.o.material.dispose(); this.list.splice(i, 1); continue; }
      const k = 1 - p.life / p.max, damp = Math.exp(-p.drag * dt);
      if (p.debris) { p.vy -= 24 * dt; p.o.rotation.x += p.spin * dt; p.o.rotation.z += p.spin * dt * 0.7; }
      else { p.vx *= damp; p.vz *= damp; p.o.scale.setScalar(p.size * (1 + k * p.grow)); p.o.material.opacity = p.op * (1 - k) * (k < 0.1 ? k * 10 : 1); p.o.material.rotation += p.spin * dt * 0.4; }
      p.o.position.x += p.vx * dt; p.o.position.y = Math.max(p.debris ? 0.2 : 0.1, p.o.position.y + p.vy * dt); p.o.position.z += p.vz * dt;
    }
  }
}
