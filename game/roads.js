// Streets: marked asphalt with edge lines and dashed centre line, pavements, rounded junctions,
// street lamps, rails and a street-name lookup for the HUD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

const PAINT = '#e6dcc0';
const isMajor = (r) => r.w >= 5.5 && r.t !== 'service' && r.t !== 'track';
const hasPavement = (r) => r.w >= 4.5 && r.t !== 'service' && r.t !== 'track';

function asphalt(base, marks) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 500; i++) {                       // grit
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`;
    x.fillRect(Math.random() * 64, Math.random() * 128, 2, 2);
  }
  if (marks) {
    x.fillStyle = PAINT;
    x.fillRect(5, 0, 2, 128); x.fillRect(57, 0, 2, 128);                         // edge lines
    x.fillRect(31, 0, 2, 56); x.fillRect(31, 64, 2, 0);                          // dashed centre line
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
}

/** Ribbon along a polyline. uv.x across (0..1), uv.y = metres/8 along the line. */
function ribbon(lines, y, extra = 0) {
  const pos = [], uv = [];
  for (const l of lines) {
    const hw = l.w / 2 + extra; let s = 0;
    for (let i = 0; i < l.p.length - 1; i++) {
      const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = (-dz / len) * hw, nz = (dx / len) * hw, v0 = s / 8, v1 = (s + len) / 8; s += len;
      const q = [[ax + nx, az + nz, 0, v0], [ax - nx, az - nz, 1, v0], [bx - nx, bz - nz, 1, v1], [bx + nx, bz + nz, 0, v1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(q[k][0], y, q[k][1]); uv.push(q[k][2], q[k][3]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

function discs(points, y) {   // points: [x, z, radius]
  const pos = [];
  for (const [x, z, r] of points) {
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
      pos.push(x, y, z, x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0.5), 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

export function buildRoads(w, P) {
  const out = [], roads = w.roads || [];
  const major = roads.filter(isMajor), minor = roads.filter((r) => !isMajor(r) && r.t !== 'track' && r.t !== 'service');
  const dirt = roads.filter((r) => r.t === 'track' || r.t === 'service');
  const paveMat = new THREE.MeshLambertMaterial({ color: P.pave || '#a89c84', side: THREE.DoubleSide });
  const plain = asphalt(P.road, false), marked = asphalt(P.road, true);
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadow; out.push(m); return m; };

  // junction / bend fill: vertices shared by several roads, or sharp turns
  const seen = new Map();
  for (const r of roads) for (const [x, z] of r.p) { const k = x + ',' + z; seen.set(k, (seen.get(k) || 0) + 1); }
  const fill = [], fillPave = [];
  for (const r of roads) {
    if (r.t === 'track' || r.t === 'service') continue;
    for (let i = 0; i < r.p.length; i++) {
      const [x, z] = r.p[i], junction = seen.get(x + ',' + z) > 1;
      let sharp = false;
      if (i > 0 && i < r.p.length - 1) {
        const a = Math.atan2(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]), b = Math.atan2(r.p[i + 1][0] - x, r.p[i + 1][1] - z);
        sharp = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) > 0.25;
      }
      if (junction || sharp) { fill.push([x, z, r.w / 2]); if (hasPavement(r)) fillPave.push([x, z, r.w / 2 + 1.3]); }
    }
  }

  const pavRoads = roads.filter(hasPavement);
  if (pavRoads.length) add(ribbon(pavRoads, 0.05, 1.3), paveMat);
  if (fillPave.length) add(discs(fillPave, 0.052), paveMat);
  if (dirt.length) add(ribbon(dirt, 0.055), asphalt(P.track, false));
  if (minor.length) add(ribbon(minor, 0.06), plain);
  if (major.length) add(ribbon(major, 0.062), marked);
  if (fill.length) add(discs(fill, 0.064), plain);

  if (w.rails?.length) {
    add(ribbon(w.rails, 0.07), new THREE.MeshLambertMaterial({ color: P.rail, side: THREE.DoubleSide }), false);
  }

  // street lamps every ~45 m along major roads, alternating sides
  const spots = [];
  for (const r of major) {
    let acc = 30 * Math.random(), side = 1;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      for (let s = acc; s < len; s += 45) {
        const t = s / len, off = r.w / 2 + 1.6;
        spots.push([ax + dx * t + (-dz / len) * off * side, az + dz * t + (dx / len) * off * side, Math.atan2(side * dx / len, side * dz / len)]);
        side = -side;
      }
      acc = ((acc - len) % 45 + 45) % 45;
    }
  }
  if (spots.length) {
    const pole = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.1, 7, 6).translate(0, 3.5, 0), new THREE.BoxGeometry(1.6, 0.1, 0.1).translate(0.8, 7, 0)]);
    const head = new THREE.BoxGeometry(0.6, 0.12, 0.3).translate(1.5, 6.9, 0);
    const n = Math.min(spots.length, 700);
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: 0x2a2623 }), n);
    const heads = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const [x, z, a] = spots[i];
      q.setFromAxisAngle(up, a); // arm (+x) points toward the carriageway
      poles.setMatrixAt(i, m4.compose(ps.set(x, 0, z), q, one)); heads.setMatrixAt(i, m4.compose(ps.set(x, 0, z), q, one));
    }
    poles.castShadow = true; out.push(poles, heads);
  }
  return out;
}

/** Name of the street closest to (x,z), or '' when off-road. */
export function roadNameAt(w, x, z) {
  let best = 1e9, name = '';
  for (const r of w.roads || []) {
    if (!r.n) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const ax = r.p[i][0], az = r.p[i][1], dx = r.p[i + 1][0] - ax, dz = r.p[i + 1][1] - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; name = r.n; }
    }
  }
  return best < 8 ? name : '';
}
