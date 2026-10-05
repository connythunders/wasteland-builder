// Three battle cars (player and raiders share the models): Interceptor, Rust Hound, War Rig.
import * as THREE from 'three';

export const VEHICLES = {
  interceptor: { name: 'Interceptor', no: '07', hp: 100, acc: 31, max: 43, brake: 46, turn: 2.7, grip: 7.5, r: 1.6, ram: 1.0, color: '#b9541f', blurb: 'Snabb och vig. Bräcklig.' },
  hound: { name: 'Rust Hound', no: '13', hp: 150, acc: 26, max: 38, brake: 40, turn: 2.35, grip: 6.5, r: 1.8, ram: 1.4, color: '#7e4a2a', blurb: 'Balanserad bur-pickup med taggar.' },
  rig: { name: 'War Rig', no: '88', hp: 260, acc: 19, max: 31, brake: 32, turn: 1.7, grip: 5.5, r: 2.5, ram: 2.4, color: '#4b4741', blurb: 'Pansarlastbil. Krossar allt i vägen.' },
};

const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; return o; }
function cyl(r, h, m, x, y, z, rx = 0, rz = 0, seg = 8) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; return o; }

export function makeVehicle(kind, bodyColor) {
  const g = new THREE.Group(), wheels = [];
  const body = mat(bodyColor || VEHICLES[kind].color), rust = mat('#3a322c'), steel = mat('#6d655c'), dark = mat('#17140f'), glass = mat('#14181d', { flatShading: false }), lamp = new THREE.MeshBasicMaterial({ color: 0xffe3a0 }), tail = new THREE.MeshBasicMaterial({ color: 0xd03a1a });

  const wheel = (x, y, z, r, w) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z);
    const t = cyl(r, w, dark, 0, 0, 0, 0, Math.PI / 2, 12); const rim = cyl(r * 0.55, w + 0.04, steel, 0, 0, 0, 0, Math.PI / 2, 8);
    piv.add(t, rim); g.add(piv); wheels.push({ piv, r });
  };
  const spikes = (z, n, span, y, len = 0.6) => { for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.11, len, 4), steel); s.rotation.x = Math.PI / 2; s.position.set((i / (n - 1) - 0.5) * span, y, z); g.add(s); } };
  const gun = (x, y, z, len = 1.5) => { g.add(box(0.5, 0.35, 0.6, rust, x, y, z), cyl(0.06, len, dark, x - 0.12, y + 0.02, z + len / 2, Math.PI / 2), cyl(0.06, len, dark, x + 0.12, y + 0.02, z + len / 2, Math.PI / 2)); };

  if (kind === 'interceptor') {
    g.add(box(1.9, 0.55, 4.3, body, 0, 0.78, 0));
    g.add(box(1.8, 0.28, 1.7, body, 0, 1.12, 1.25));                      // hood
    g.add(box(1.55, 0.6, 1.7, body, 0, 1.38, -0.55));                     // cabin
    g.add(box(1.45, 0.4, 1.5, glass, 0, 1.42, -0.55));
    g.add(box(1.9, 0.12, 0.6, rust, 0, 1.55, -2.1)); g.add(box(0.1, 0.4, 0.1, rust, 0.8, 1.35, -2.0), box(0.1, 0.4, 0.1, rust, -0.8, 1.35, -2.0)); // spoiler
    g.add(box(0.9, 0.35, 0.8, steel, 0, 1.45, 1.35), cyl(0.28, 0.4, steel, 0, 1.7, 1.35));       // blower
    for (const sx of [-1, 1]) { g.add(cyl(0.07, 0.9, steel, sx * 1.05, 1.35, -0.2, 0, 0.35 * sx), box(0.4, 0.3, 0.1, lamp, sx * 0.65, 0.95, 2.18), box(0.4, 0.2, 0.1, tail, sx * 0.65, 1.0, -2.17)); }
    g.add(box(2.0, 0.3, 0.35, steel, 0, 0.55, 2.2)); spikes(2.45, 5, 1.8, 0.55);
    gun(0, 1.95, -0.6, 1.4);
    for (const sx of [-1, 1]) { wheel(sx * 1.0, 0.45, 1.35, 0.45, 0.4); wheel(sx * 1.02, 0.5, -1.4, 0.5, 0.55); }
  } else if (kind === 'hound') {
    g.add(box(2.1, 0.7, 4.7, body, 0, 0.95, 0));
    g.add(box(1.95, 0.85, 1.7, body, 0, 1.7, 1.15)); g.add(box(1.8, 0.45, 1.5, glass, 0, 1.85, 1.2));    // cab
    g.add(box(2.1, 0.5, 2.3, rust, 0, 1.4, -1.5));                                                         // bed
    for (const sx of [-1, 1]) { g.add(box(0.12, 1.1, 0.12, steel, sx * 1.0, 2.0, -0.4), box(0.12, 1.1, 0.12, steel, sx * 1.0, 2.0, -2.5), box(0.12, 0.12, 2.2, steel, sx * 1.0, 2.55, -1.45)); g.add(box(0.15, 0.7, 1.5, steel, sx * 1.12, 1.15, 0.2, 0.1)); g.add(box(0.5, 0.2, 0.1, lamp, sx * 0.7, 1.05, 2.37), box(0.4, 0.2, 0.1, tail, sx * 0.7, 1.2, -2.37)); } // cage + plates
    g.add(box(1.9, 0.12, 0.12, steel, 0, 2.55, -0.4), box(1.9, 0.12, 0.12, steel, 0, 2.55, -2.5));
    g.add(box(2.3, 0.45, 0.5, steel, 0, 0.75, 2.45)); spikes(2.75, 6, 2.1, 0.78, 0.7);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 4), steel); s.rotation.z = -Math.PI / 2 * sx; s.position.set(sx * 1.4, 1.0, 0.6 - i * 1.3); g.add(s); }
    g.add(cyl(0.45, 0.35, dark, 0, 1.55, -2.7, Math.PI / 2));                                              // spare
    gun(0, 2.75, -1.4, 1.6);
    for (const sx of [-1, 1]) { wheel(sx * 1.1, 0.55, 1.55, 0.55, 0.5); wheel(sx * 1.1, 0.55, -1.6, 0.55, 0.5); }
  } else {
    g.add(box(2.5, 1.5, 2.0, body, 0, 1.85, 2.0)); g.add(box(2.3, 0.7, 0.2, glass, 0, 2.25, 3.05));        // cab
    g.add(box(2.7, 0.5, 6.3, rust, 0, 1.0, -0.6));                                                         // chassis
    g.add(box(2.8, 2.1, 3.6, steel, 0, 2.3, -2.0)); for (let i = 0; i < 4; i++) g.add(box(2.85, 0.14, 3.7, rust, 0, 1.5 + i * 0.5, -2.0)); // armoured box
    g.add(box(3.4, 1.6, 0.45, rust, 0, 1.0, 3.55, -0.2)); for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 4), steel); s.rotation.x = Math.PI / 2; s.position.set((i - 3) * 0.5, 0.7, 4.1); g.add(s); } // plow
    for (const sx of [-1, 1]) { g.add(cyl(0.16, 2.6, steel, sx * 1.35, 3.3, 1.2)); g.add(box(0.7, 0.25, 0.1, lamp, sx * 0.9, 1.5, 3.05), box(0.5, 0.25, 0.1, tail, sx * 0.9, 1.0, -3.7)); }
    gun(0, 3.65, -1.2, 1.9); g.add(box(0.8, 0.5, 0.8, rust, 0, 3.5, -1.2));
    for (const sx of [-1, 1]) for (const z of [2.2, -0.2, -2.4]) wheel(sx * 1.4, 0.8, z, 0.8, 0.65);
  }
  g.userData.wheels = wheels;
  return g;
}
