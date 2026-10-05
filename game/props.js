// Street dressing: abandoned wrecks, oil barrels, jersey barriers. Returns circular obstacles
// for collision and a list of burning spots for the FX system.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

export function tinted(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}
export const noUV = (g) => { g.deleteAttribute('uv'); return g; };

export function buildProps(w, P, rand, blocked) {
  const meshes = [], obstacles = [], burning = [];
  const roads = (w.roads || []).filter((r) => r.w >= 4.5 && r.t !== 'track' && r.p.length > 1);
  if (!roads.length) return { meshes, obstacles, burning };
  const lens = roads.map((r) => r.p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - r.p[i - 1][0], q[1] - r.p[i - 1][1]) : 0), 0));
  const total = lens.reduce((a, b) => a + b, 0);
  const spot = (maxOff = 0.8) => {   // random point beside/on a road
    let t = rand() * total, ri = 0; while (ri < roads.length - 1 && t > lens[ri]) { t -= lens[ri]; ri++; }
    const r = roads[ri];
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1], l = Math.hypot(bx - ax, bz - az);
      if (t > l) { t -= l; continue; }
      const f = t / l, dx = (bx - ax) / l, dz = (bz - az) / l, off = (rand() * 2 - 1) * (r.w / 2 - maxOff);
      return { x: ax + (bx - ax) * f - dz * off, z: az + (bz - az) * f + dx * off, a: Math.atan2(dx, dz) };
    }
    return null;
  };

  // wrecks
  const wreckGeo = mergeGeometries([
    tinted(noUV(new THREE.BoxGeometry(1.9, 0.7, 4.2).translate(0, 0.65, 0)), '#4a3a30'),
    tinted(noUV(new THREE.BoxGeometry(1.6, 0.6, 2).translate(0, 1.25, -0.3)), '#2e2823'),
    tinted(noUV(new THREE.BoxGeometry(2.0, 0.25, 0.4).translate(0, 0.4, 2.1)), '#5b5148'),
    tinted(noUV(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8).rotateZ(Math.PI / 2).translate(1.0, 0.42, 1.4)), '#121110'),
    tinted(noUV(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8).rotateZ(Math.PI / 2).translate(-1.0, 0.42, -1.4)), '#121110'),
  ]);
  const nW = Math.min(80, Math.round(total / 110));
  const wm = new THREE.InstancedMesh(wreckGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), nW);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), tint = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < nW * 3 && placed < nW; i++) {
    const s = spot(2); if (!s || blocked(s.x, s.z)) continue;
    const yaw = s.a + (rand() < 0.3 ? rand() * 3 : 0) + (rand() < 0.5 ? Math.PI : 0), tilt = (rand() - 0.5) * 0.12;
    q.setFromAxisAngle(up, yaw); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    wm.setMatrixAt(placed, m4.compose(ps.set(s.x, 0, s.z), q, one)); wm.setColorAt(placed, tint.setScalar(0.7 + rand() * 0.6));
    obstacles.push({ x: s.x, z: s.z, r: 1.9 });
    if (rand() < 0.14) burning.push({ x: s.x, z: s.z });
    placed++;
  }
  wm.count = placed; wm.castShadow = true; meshes.push(wm);

  // oil barrels in clusters (some burn)
  const barrel = mergeGeometries([tinted(noUV(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 8).translate(0, 0.48, 0)), '#6a3a2a'), tinted(noUV(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 8).translate(0, 0.7, 0)), '#2c2a28')]);
  const bPos = [];
  for (let c = 0; c < Math.min(40, Math.round(total / 220)); c++) {
    const s = spot(1.2); if (!s || blocked(s.x, s.z)) continue;
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) { const x = s.x + (rand() - 0.5) * 1.8, z = s.z + (rand() - 0.5) * 1.8; if (!blocked(x, z)) { bPos.push([x, z]); obstacles.push({ x, z, r: 0.5 }); } }
    if (rand() < 0.35) burning.push({ x: s.x, z: s.z });
  }
  if (bPos.length) {
    const bm = new THREE.InstancedMesh(barrel, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), bPos.length);
    bPos.forEach(([x, z], i) => bm.setMatrixAt(i, m4.compose(ps.set(x, 0, z), q.identity(), one)));
    bm.castShadow = true; meshes.push(bm);
  }

  // jersey barriers across roads
  const jersey = tinted(noUV(new THREE.BoxGeometry(2.4, 0.85, 0.6).translate(0, 0.43, 0)), '#8c867c');
  const jPos = [];
  for (let c = 0; c < Math.min(28, Math.round(total / 300)); c++) {
    const s = spot(0.5); if (!s) continue;
    for (let k = -1; k <= 1; k++) {
      const x = s.x + Math.cos(s.a) * k * 2.5, z = s.z - Math.sin(s.a) * k * 2.5;
      if (!blocked(x, z)) { jPos.push([x, z, s.a + Math.PI / 2 + (rand() - 0.5) * 0.3]); obstacles.push({ x, z, r: 1.25 }); }
    }
  }
  if (jPos.length) {
    const jm = new THREE.InstancedMesh(jersey, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), jPos.length);
    jPos.forEach(([x, z, a], i) => jm.setMatrixAt(i, m4.compose(ps.set(x, 0, z), q.setFromAxisAngle(up, a), one)));
    jm.castShadow = true; meshes.push(jm);
  }
  return { meshes, obstacles, burning };
}
