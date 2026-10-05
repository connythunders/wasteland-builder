// Streets: surface follows the OSM surface tag (asphalt / cobblestone / gravel), marked asphalt on
// main roads, pavements, rounded junctions, street lamps, piers, rails and a street-name lookup.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { asphaltTile, cobbles, paving, dirt, planks } from './textures.js';

const COBBLE = new Set(['cobblestone', 'sett', 'paving_stones', 'cobblestone:flattened', 'unhewn_cobblestone', 'paved_stones']);
const DIRT = new Set(['gravel', 'dirt', 'unpaved', 'ground', 'compacted', 'fine_gravel', 'sand', 'grass', 'earth', 'mud']);
function surface(r) {
  if (COBBLE.has(r.s)) return 'cobble';
  if (DIRT.has(r.s) || (!r.s && r.t === 'track')) return 'dirt';
  return 'asphalt';
}
const isMajor = (r) => r.w >= 5.5 && r.t !== 'service' && r.t !== 'track' && surface(r) === 'asphalt';
const hasPavement = (r) => r.w >= 4.5 && r.t !== 'service' && r.t !== 'track' && surface(r) !== 'dirt';

/** Ribbon along a polyline. mode 'marked': uv.x 0..1 across, uv.y metres/8. mode 'tile': 4 m tiles. */
function ribbon(lines, y, extra = 0, mode = 'tile') {
  const pos = [], uv = [];
  for (const l of lines) {
    const hw = l.w / 2 + extra; let s = 0;
    for (let i = 0; i < l.p.length - 1; i++) {
      const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = (-dz / len) * hw, nz = (dx / len) * hw;
      const ux = mode === 'marked' ? 1 : (hw * 2) / 4, vs = mode === 'marked' ? 8 : 4, v0 = s / vs, v1 = (s + len) / vs; s += len;
      const q = [[ax + nx, az + nz, 0, v0], [ax - nx, az - nz, ux, v0], [bx - nx, bz - nz, ux, v1], [bx + nx, bz + nz, 0, v1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(q[k][0], y, q[k][1]); uv.push(q[k][2], q[k][3]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

function discs(points, y, tile = 4) {   // points: [x, z, radius]
  const pos = [], uv = [];
  for (const [x, z, r] of points) {
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
      const v = [[x, z], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, z + Math.sin(a1) * r]];
      for (const [px, pz] of v) { pos.push(px, y, pz); uv.push(px / tile, pz / tile); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

export function buildRoads(w, P) {
  const out = [], roads = w.roads || [];
  const asph = new THREE.Color(P.road), tint = (c, tex) => new THREE.MeshLambertMaterial({ map: tex, color: c, side: THREE.DoubleSide });
  const mats = {
    marked: tint(0xb4aea6, asphaltTile(true)),
    asphalt: tint(0xb4aea6, asphaltTile(false)),
    cobble: tint(0xb8aa98, cobbles()),
    dirt: tint(new THREE.Color(P.track).multiplyScalar(1.15), dirt()),
    pave: tint(new THREE.Color(P.pave).multiplyScalar(1.1), paving()),
    planks: tint(0xd8c8aa, planks()),
  };
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadow; out.push(m); return m; };

  const groups = { marked: [], asphalt: [], cobble: [], dirt: [] };
  for (const r of roads) { const s = surface(r); (s === 'asphalt' ? (isMajor(r) ? groups.marked : groups.asphalt) : groups[s]).push(r); }

  // rounded fill where roads meet or bend sharply
  const seen = new Map();
  for (const r of roads) for (const [x, z] of r.p) { const k = x + ',' + z; seen.set(k, (seen.get(k) || 0) + 1); }
  const fill = { asphalt: [], cobble: [], dirt: [] }, fillPave = [];
  for (const r of roads) {
    const s = surface(r), key = s;
    for (let i = 0; i < r.p.length; i++) {
      const [x, z] = r.p[i], junction = seen.get(x + ',' + z) > 1;
      let sharp = false;
      if (i > 0 && i < r.p.length - 1) {
        const a = Math.atan2(x - r.p[i - 1][0], z - r.p[i - 1][1]), b = Math.atan2(r.p[i + 1][0] - x, r.p[i + 1][1] - z);
        sharp = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) > 0.25;
      }
      if (junction || sharp) { fill[key].push([x, z, r.w / 2]); if (hasPavement(r)) fillPave.push([x, z, r.w / 2 + 1.3]); }
    }
  }

  const pav = roads.filter(hasPavement);
  if (pav.length) add(ribbon(pav, 0.05, 1.3), mats.pave);
  if (fillPave.length) add(discs(fillPave, 0.052), mats.pave);
  if (groups.dirt.length) add(ribbon(groups.dirt, 0.055), mats.dirt);
  if (fill.dirt.length) add(discs(fill.dirt, 0.056), mats.dirt);
  if (groups.cobble.length) add(ribbon(groups.cobble, 0.06), mats.cobble);
  if (fill.cobble.length) add(discs(fill.cobble, 0.062), mats.cobble);
  if (groups.asphalt.length) add(ribbon(groups.asphalt, 0.06), mats.asphalt);
  if (groups.marked.length) add(ribbon(groups.marked, 0.062, 0, 'marked'), mats.marked);
  if (fill.asphalt.length) add(discs(fill.asphalt, 0.064), mats.asphalt);
  if (w.rails?.length) add(ribbon(w.rails, 0.07), new THREE.MeshLambertMaterial({ color: P.rail, side: THREE.DoubleSide }), false);
  if (w.piers?.length) add(ribbon(w.piers, 0.12), mats.planks);

  // street lamps every ~45 m along main roads, alternating sides
  const spots = [];
  for (const r of groups.marked) {
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
      q.setFromAxisAngle(up, a);
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
