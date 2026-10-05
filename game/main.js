import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { generateWorld, slugify } from './osm.js';
import { Sfx } from './audio.js';
import { buildBuildings } from './buildings.js';
import { buildRoads, roadNameAt } from './roads.js';
import { buildProps, tinted, noUV } from './props.js';
import { FX } from './fx.js';
import { VEHICLES, makeVehicle } from './vehicles.js';
import { dirt, sprite } from './textures.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pip = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};

// ---------------------------------------------------------------- palette (override in world.config.json)
const DEFAULT_PALETTE = {
  sky: '#6c6866', skyLow: '#b58d62', fog: '#977f66', ground: '#8f7e58', road: '#3d3935', track: '#8a7150', pave: '#9b9486', rail: '#2a2623',
  water: '#34505a', forest: '#33402a', field: '#7f7c46', scrub: '#6f6c3e', park: '#6d7a45', sand: '#b8a374',
  building: '#b39068', roof: '#4a403c',
  walls: ['#c9a15a', '#d8c79a', '#d9d3c2', '#d4b04a', '#c99a8a', '#b8b09a', '#cdbd94'],
  houseWalls: ['#8e3524', '#8e3524', '#7d2e20', '#9b4a2c', '#8e3524', '#c9a24a', '#d8d2c0', '#a8782f'],
  roofs: ['#2f2f31', '#3b3837', '#4a403c', '#6b3a2c', '#58524b', '#2f2f31'],
  ruinShare: 0.2,
  raider: '#a8892f', hound: '#7e4a2a', rig: '#4b4741',
};
let CFG = { palette: {} };
let P = DEFAULT_PALETTE;
async function loadJSON(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }

// ---------------------------------------------------------------- renderer / scene
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 1500);
const hemi = new THREE.HemisphereLight(0xd8bc98, 0x5a4632, 2.6);
const sun = new THREE.DirectionalLight(0xffd2a0, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 420 });
sun.shadow.bias = -0.0008;
scene.add(hemi, sun, sun.target);
const SUN_DIR = new THREE.Vector3(0.75, 0.42, 0.5).normalize();
const fx = new FX(scene);
const sfx = new Sfx();

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let skyDome = null, sunGlow = null, motes = null;
function buildSky() {
  if (skyDome) { scene.remove(skyDome, sunGlow, motes); }
  const g = new THREE.SphereGeometry(1000, 24, 14), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(P.sky), low = new THREE.Color(P.skyLow), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(low).lerp(top, clamp(Math.pow(Math.max(pos.getY(i) / 1000, 0), 0.55) * 1.25, 0, 1)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  skyDome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  skyDome.renderOrder = -2;
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite('spark'), color: 0xffc27a, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true, opacity: 0.8 }));
  sunGlow.scale.setScalar(520); sunGlow.renderOrder = -1;
  const n = 280, mp = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) mp[i] = (Math.random() - 0.5) * 90;
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: sprite('dust'), size: 3.2, transparent: true, opacity: 0.4, depthWrite: false, color: 0xe0c49a }));
  motes.frustumCulled = false;
  scene.add(skyDome, sunGlow, motes);
}
function followCamera() {
  skyDome.position.copy(camera.position);
  sunGlow.position.copy(camera.position).addScaledVector(SUN_DIR, 900);
  motes.position.set(Math.round(camera.position.x / 90) * 90, camera.position.y * 0 + 20, Math.round(camera.position.z / 90) * 90);
  const t = performance.now() / 1000, a = motes.geometry.attributes.position;
  for (let i = 0; i < a.count; i++) { a.setX(i, a.getX(i) + 0.05); if (a.getX(i) > 45) a.setX(i, -45); a.setY(i, ((a.getY(i) + 45 + 0.01 * Math.sin(t + i)) % 90) - 45 + 0); }
  a.needsUpdate = true;
}

// ---------------------------------------------------------------- world
let world = null, worldGroup = null, grid = null, roadGrid = null, miniBase = null, obstacles = [];
const CELL = 40, miniS = 1.5;

const shapeOf = (p, holes) => {
  const s = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes || []) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
};
function flat(p, holes, y, color) {
  const g = new THREE.ShapeGeometry(shapeOf(p, holes));
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function ribbonGeo(lines, y) {
  const pos = [];
  for (const l of lines) {
    const hw = l.w / 2;
    for (let i = 0; i < l.p.length - 1; i++) {
      const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); if (len < 0.01) continue;
      const nx = (-dz / len) * hw, nz = (dx / len) * hw;
      const q = [[ax + nx, az + nz], [ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz]];
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k][0], y, q[k][1]);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); return g;
}

function nearBuildings(x, z, r) {
  const out = new Set();
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
    for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) { const l = grid.get(cx + ',' + cz); if (l) for (const i of l) out.add(i); }
  return out;
}
function inBuilding(x, z) {
  for (const i of nearBuildings(x, z, 0.1)) { const b = world.buildings[i]; if (x >= b.bb[0] && x <= b.bb[1] && z >= b.bb[2] && z <= b.bb[3] && pip(x, z, b.p)) return true; }
  return false;
}
function nearRoad(x, z, margin = 0) {
  for (let cx = Math.floor((x - 12) / CELL); cx <= Math.floor((x + 12) / CELL); cx++)
    for (let cz = Math.floor((z - 12) / CELL); cz <= Math.floor((z + 12) / CELL); cz++) {
      const l = roadGrid.get(cx + ',' + cz); if (!l) continue;
      for (const [ax, az, bx, bz, hw] of l) {
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) < hw + margin) return true;
      }
    }
  return false;
}
function onPier(x, z) {
  for (const r of world.piers || []) for (let i = 0; i < r.p.length - 1; i++) {
    const ax = r.p[i][0], az = r.p[i][1], dx = r.p[i + 1][0] - ax, dz = r.p[i + 1][1] - az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r.w / 2 + 0.3) return true;
  }
  return false;
}
function inWater(x, z) {
  for (const a of world.water || []) if (pip(x, z, a.p) && !(a.holes || []).some((h) => pip(x, z, h)) && !onPier(x, z) && !nearRoad(x, z, 0)) return true;
  return false;
}
const blocked = (x, z) => inBuilding(x, z) || inWater(x, z);

function treeGeos() {
  const trunk = (r, h, c) => tinted(noUV(new THREE.CylinderGeometry(r * 0.8, r, h, 5).translate(0, h / 2, 0)), c);
  const cone = (r, h, y, c) => tinted(noUV(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0)), c);
  const pine = mergeGeometries([trunk(0.22, 2.4, '#4a3828'), cone(2.3, 3.4, 1.8, '#3f5236'), cone(1.8, 3.2, 3.9, '#476040'), cone(1.2, 3, 6.0, '#4f6b45')]);
  const birch = mergeGeometries([trunk(0.16, 4, '#d9d4c6'), tinted(noUV(new THREE.IcosahedronGeometry(2, 0).translate(0, 5, 0)), '#8d9a45'), tinted(noUV(new THREE.IcosahedronGeometry(1.4, 0).translate(0.8, 6.3, 0.4)), '#9aa650')]);
  return { pine, birch };
}

function buildWorld(w) {
  if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse((o) => o.geometry?.dispose()); }
  fx.clear();
  const g = new THREE.Group(); worldGroup = g;
  const r = mulberry(7), rand = Math.random;
  scene.fog = new THREE.Fog(P.fog, 28, 360);
  buildSky();

  // collision grids first (props/trees use them)
  grid = new Map(); roadGrid = new Map();
  const reg = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const rbuild = buildBuildings(w, P, mulberry);     // also fills b.bb / b.ruin
  w.buildings.forEach((b, i) => {
    for (let cx = Math.floor(b.bb[0] / CELL); cx <= Math.floor(b.bb[1] / CELL); cx++)
      for (let cz = Math.floor(b.bb[2] / CELL); cz <= Math.floor(b.bb[3] / CELL); cz++) reg(grid, cx + ',' + cz, i);
  });
  for (const rd of w.roads || []) for (let i = 0; i < rd.p.length - 1; i++) {
    const [ax, az] = rd.p[i], [bx, bz] = rd.p[i + 1], seg = [ax, az, bx, bz, rd.w / 2];
    for (let cx = Math.floor((Math.min(ax, bx) - 12) / CELL); cx <= Math.floor((Math.max(ax, bx) + 12) / CELL); cx++)
      for (let cz = Math.floor((Math.min(az, bz) - 12) / CELL); cz <= Math.floor((Math.max(az, bz) + 12) / CELL); cz++) reg(roadGrid, cx + ',' + cz, seg);
  }

  // ground + land cover (dirt-textured, tinted by the palette)
  const gt = dirt().clone(); gt.needsUpdate = true; gt.repeat.set(8000 / 14, 8000 / 14);
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gt, color: P.ground }));
  gm.receiveShadow = true; g.add(gm);
  const lt = dirt().clone(); lt.needsUpdate = true; lt.repeat.set(1 / 14, 1 / 14);
  const kindCol = (k) => new THREE.Color(P[k] || P.field);
  const gg = (w.green || []).map((a) => flat(a.p, a.holes, 0.02 + (a.k === 'forest' ? 0.004 : 0), kindCol(a.k)));
  if (gg.length) { const m = new THREE.Mesh(mergeGeometries(gg), new THREE.MeshLambertMaterial({ map: lt, vertexColors: true, side: THREE.DoubleSide })); m.receiveShadow = true; g.add(m); }
  const wg = (w.water || []).map((a) => flat(a.p, a.holes, 0.04, new THREE.Color(P.water)));
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.2 });
  if (wg.length) g.add(new THREE.Mesh(mergeGeometries(wg), waterMat));
  if (w.rivers?.length) g.add(new THREE.Mesh(ribbonGeo(w.rivers, 0.045), new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.35, side: THREE.DoubleSide })));

  g.add(...buildRoads(w, P));
  g.add(...rbuild);

  // street dressing
  const pr = buildProps(w, P, rand, (x, z) => blocked(x, z));
  obstacles = pr.obstacles; g.add(...pr.meshes); pr.burning.forEach((b) => fx.burn(b.x, b.z, 1e9));

  // trees: pines in forest/scrub, birches in parks and from OSM tree nodes
  const { pine, birch } = treeGeos(), pines = [], birches = [];
  const scatter = (a, per, cap, into, chance = 1) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of a.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const want = Math.min(cap, ((x1 - x0) * (z1 - z0)) / per);
    for (let t = 0; t < want * 3 && pines.length + birches.length < 5000; t++) {
      const x = rnd(x0, x1), z = rnd(z0, z1);
      if (pip(x, z, a.p) && !(a.holes || []).some((h) => pip(x, z, h)) && !inBuilding(x, z) && !nearRoad(x, z, 3) && Math.random() < chance) (Math.random() < 0.14 ? birches : into).push([x, z]);
    }
  };
  for (const a of w.green || []) { if (a.k === 'forest') scatter(a, 150, 900, pines); else if (a.k === 'scrub') scatter(a, 600, 200, pines); else if (a.k === 'park') scatter(a, 500, 120, birches); }
  for (const [x, z] of w.trees || []) if (!inBuilding(x, z) && !nearRoad(x, z, 1.5)) birches.push([x, z]);
  const inst = (geo, list, scale) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
    list.forEach(([x, z], i) => {
      const s = scale * (0.7 + r() * 0.8); sc.set(s * (0.85 + r() * 0.3), s * (0.85 + r() * 0.5), s * (0.85 + r() * 0.3));
      im.setMatrixAt(i, m4.compose(ps.set(x, 0, z), q.setFromAxisAngle(up, r() * 6.3), sc)); im.setColorAt(i, tint.setScalar(0.75 + r() * 0.5));
    });
    im.castShadow = true; g.add(im);
  };
  inst(pine, pines, 1.25); inst(birch, birches, 1.1);

  scene.add(g);
  buildMini(w);
}

function buildMini(w) {
  const S = miniS, E = w.extent, size = Math.ceil(2 * E * S);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.fillStyle = P.ground; x.fillRect(0, 0, size, size);
  const tx = (p) => [(p[0] + E) * S, (p[1] + E) * S];
  const poly = (a, col) => {
    x.beginPath();
    for (const ring of [a.p, ...(a.holes || [])]) { ring.forEach((p, i) => { const [px, py] = tx(p); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); }
    x.fillStyle = col; x.fill('evenodd');
  };
  (w.green || []).forEach((a) => poly(a, P[a.k] || P.field));
  (w.water || []).forEach((a) => poly(a, '#4d7480'));
  const line = (l, col, wd) => { x.beginPath(); l.p.forEach((p, i) => { const [px, py] = tx(p); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = col; x.lineWidth = wd; x.stroke(); };
  (w.rivers || []).forEach((l) => line(l, '#4d7480', l.w * S));
  (w.roads || []).forEach((l) => line(l, '#e8c58a', Math.max(2, l.w * S * 0.8)));
  (w.piers || []).forEach((l) => line(l, '#c9b48a', l.w * S));
  (w.buildings || []).forEach((b) => poly(b, '#2b1d14'));
  miniBase = c;
}

// ---------------------------------------------------------------- collisions
/** Push circle out of buildings/props/map edge. Returns the averaged push normal or null. */
function collide(e, r) {
  const ox = e.x, oz = e.z;
  for (const i of nearBuildings(e.x, e.z, r)) {
    const b = world.buildings[i];
    if (e.x < b.bb[0] - r || e.x > b.bb[1] + r || e.z < b.bb[2] - r || e.z > b.bb[3] + r) continue;
    const p = b.p; let bd = 1e9, cx = 0, cz = 0;
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const ax = p[j][0], az = p[j][1], dx = p[k][0] - ax, dz = p[k][1] - az, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((e.x - ax) * dx + (e.z - az) * dz) / l2, 0, 1), qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(e.x - qx, e.z - qz);
      if (d < bd) { bd = d; cx = qx; cz = qz; }
    }
    if (pip(e.x, e.z, p)) { const d = Math.hypot(cx - e.x, cz - e.z) || 1; e.x = cx + ((cx - e.x) / d) * r; e.z = cz + ((cz - e.z) / d) * r; }
    else if (bd < r) { e.x = cx + ((e.x - cx) / (bd || 1)) * r; e.z = cz + ((e.z - cz) / (bd || 1)) * r; }
  }
  for (const o of obstacles) {
    const dx = e.x - o.x; if (dx > r + o.r || dx < -r - o.r) continue;
    const dz = e.z - o.z, d = Math.hypot(dx, dz), m = r + o.r;
    if (d < m) { const k = d || 1; e.x = o.x + (dx / k) * m; e.z = o.z + (dz / k) * m; }
  }
  const L = world.extent * 0.97; e.x = clamp(e.x, -L, L); e.z = clamp(e.z, -L, L);
  const mx = e.x - ox, mz = e.z - oz, l = Math.hypot(mx, mz);
  return l > 1e-4 ? { nx: mx / l, nz: mz / l } : null;
}
function freeSpot(cx, cz, minD, maxD) {
  for (let t = 0; t < 50; t++) {
    const a = rnd(0, Math.PI * 2), d = rnd(minD, maxD), x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    if (Math.abs(x) < world.extent * 0.92 && Math.abs(z) < world.extent * 0.92 && !blocked(x, z) && !obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 3)) return [x, z];
  }
  return null;
}
function roadSpot(cx, cz, minD, maxD) {   // prefer a spot on a drivable road
  for (let t = 0; t < 60; t++) {
    const rd = world.roads[Math.floor(Math.random() * world.roads.length)];
    if (!rd || rd.w < 4.5 || rd.t === 'track') continue;
    const i = Math.floor(Math.random() * (rd.p.length - 1)), [x, z] = rd.p[i], d = Math.hypot(x - cx, z - cz);
    if (d >= minD && d <= maxD && !blocked(x, z)) return { x, z, a: Math.atan2(rd.p[i + 1][0] - x, rd.p[i + 1][1] - z) };
  }
  const s = freeSpot(cx, cz, minD, maxD); return s ? { x: s[0], z: s[1], a: rnd(0, 6.3) } : null;
}

// ---------------------------------------------------------------- vehicles
const ENEMY = {
  raider: { name: 'Raider', model: 'interceptor', hp: 34, acc: 27, max: 34, brake: 40, turn: 2.6, grip: 7, r: 1.6, ram: 8, score: 100, gun: 1 },
  hound: { name: 'Rust Hound', model: 'hound', hp: 78, acc: 23, max: 30, brake: 36, turn: 2.3, grip: 6.5, r: 1.8, ram: 13, score: 200, gun: 1 },
  rig: { name: 'War Rig', model: 'rig', hp: 210, acc: 16, max: 24, brake: 28, turn: 1.55, grip: 5, r: 2.5, ram: 24, score: 450, cannon: 1 },
};
const WEAPONS = ['GUNS', 'ROCKETS', 'FLAME', 'MINES'];

function spawnCar(spec, model, color, x, z, a) {
  const mesh = makeVehicle(model, color); scene.add(mesh);
  return { spec, mesh, x, z, a, vx: 0, vz: 0, hp: spec.hp, max: spec.hp, r: spec.r, flash: 0, burn: 0, stuck: 0, back: 0, speed: 0, fwd: 0, cd: 0, shootT: rnd(1, 3), burst: 0 };
}

/** One shared driving model: forward accel, lateral grip (drift), speed-scaled steering. */
function driveCar(c, inp, dt) {
  const s = c.spec, fxv = Math.sin(c.a), fzv = Math.cos(c.a), sx = Math.cos(c.a), sz = -Math.sin(c.a);
  let vf = c.vx * fxv + c.vz * fzv, vl = c.vx * sx + c.vz * sz;
  const max = s.max * (inp.boost ? 1.4 : 1);
  if (inp.thr > 0) vf += inp.thr * s.acc * (inp.boost ? 1.8 : 1) * dt * (1 - clamp(vf / max, 0, 1) * 0.75);
  else if (inp.thr < 0) vf += inp.thr * (vf > 1 ? s.brake : s.acc * 0.55) * dt;
  else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5 * dt);
  vf *= Math.exp(-0.035 * dt); if (vf > max) vf -= (vf - max) * 2 * dt; vf = Math.max(vf, -11);
  vl *= Math.exp(-(inp.drift ? 1.3 : s.grip) * dt); if (inp.drift) vf *= Math.exp(-0.35 * dt);
  c.a += inp.steer * s.turn * (inp.drift ? 1.35 : 1) * dt * clamp(Math.abs(vf) / 8, 0, 1) * Math.sign(vf || 1) * (1 - 0.35 * clamp(Math.abs(vf) / s.max, 0, 1));
  c.vx = fxv * vf + sx * vl; c.vz = fzv * vf + sz * vl;
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.fwd = vf; c.slip = Math.abs(vl);
  if (inWater(c.x, c.z)) { c.vx *= Math.exp(-1.2 * dt); c.vz *= Math.exp(-1.2 * dt); c.inWater = true; } else c.inWater = false;
  const n = collide(c, c.r);
  if (n) {
    const vn = c.vx * n.nx + c.vz * n.nz;
    if (vn < 0) { c.vx -= 1.3 * vn * n.nx; c.vz -= 1.3 * vn * n.nz; c.impact = -vn; } else c.impact = 0;
  } else c.impact = 0;
  c.speed = Math.hypot(c.vx, c.vz);
}

// ---------------------------------------------------------------- game state
const G = { mode: 'war', state: 'menu', vehicle: localStorage.getItem('wb-vehicle') || 'interceptor', cam: 0, waves: 3 };
let player = null, enemies = [], pickups = [], bullets = [], rockets = [], mines = [];
let scrap = 0, wave = 0, queue = [], waveTimer = 0, spawnT = 0, fireT = 0, side = 1, shake = 0, bannerT = 0, hitFlash = 0, camPos = new THREE.Vector3(), camInit = false, streetT = 0;
const keys = new Set(); let mouseDown = false;

const bulletGeo = new THREE.BoxGeometry(0.12, 0.12, 1.8), bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe08a }), ebulletMat = new THREE.MeshBasicMaterial({ color: 0xff6a3a });
const rocketGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.5, 6).rotateX(Math.PI / 2), rocketMat = new THREE.MeshLambertMaterial({ color: 0xa8a39a, emissive: 0x331a08 });
const mineGeo = new THREE.CylinderGeometry(0.7, 0.8, 0.22, 10), mineMat = new THREE.MeshLambertMaterial({ color: 0x2e2a25 }), mineLed = new THREE.MeshBasicMaterial({ color: 0xff2a1a });

function banner(t, secs = 2.2) { const b = $('#banner'); b.textContent = t; b.classList.add('on'); bannerT = secs; }
const two = (n) => String(n).padStart(2, '0');

function clearEntities() {
  for (const e of enemies) scene.remove(e.mesh); enemies = [];
  for (const p of pickups) scene.remove(p.mesh); pickups = [];
  for (const b of bullets) scene.remove(b.m); bullets = [];
  for (const b of rockets) scene.remove(b.m); rockets = [];
  for (const b of mines) scene.remove(b.m); mines = [];
  if (player) scene.remove(player.mesh);
  fx.emitters = fx.emitters.filter((e) => e.life > 1e8);   // keep the permanent street fires
}

function resetGame() {
  clearEntities();
  const spec = VEHICLES[G.vehicle], s = world.spawn;
  player = spawnCar(spec, G.vehicle, null, s.x, s.z, s.a);
  player.w = { slot: 0, heat: 0, over: false, rockets: 8, fuel: 100, mines: 6, rcd: 0, mcd: 0 }; player.nitro = 100; player.dead = false;
  collide(player, player.r);
  scrap = 0; wave = 0; queue = []; waveTimer = 1.8; spawnT = 0; shake = 0; camInit = false; G.cam = 0;
  for (let i = 0; i < 5; i++) spawnPickup();
  G.state = 'playing'; $('#over').hidden = true; $('#win').hidden = true; $('#pause').hidden = true;
  $('#h-vehicle').textContent = `${spec.name} / ${spec.no}`;
  banner(G.mode === 'war' ? 'RÄTTVIK ÄR DITT ATT FÖRSVARA' : 'FRI KÖRNING', 2.4);
  $('#h-wave').textContent = G.mode === 'war' ? `VÅG 00 / ${two(G.waves)}` : 'UTFORSKA STADEN';
  $('#h-remain').textContent = G.mode === 'war' ? 'Förbered dig' : 'Inga raiders';
  document.querySelector('.wavebox small').textContent = G.mode === 'war' ? 'GATUKRIG' : 'FRI KÖRNING';
}

function spawnPickup(at) {
  const spot = at || freeSpot(player.x, player.z, 25, 140); if (!spot) return;
  const type = pick(['armor', 'ammo', 'nitro']), col = { armor: '#e8e8e8', ammo: '#ffb62e', nitro: '#38a8ff' }[type];
  const m = new THREE.Group(), mm = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.4, flatShading: true });
  m.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), mm));
  if (type === 'armor') { const red = new THREE.MeshLambertMaterial({ color: '#d12020' }); m.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 1.5), red), new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.3), red)); }
  m.position.set(spot[0], 1.2, spot[1]); scene.add(m);
  pickups.push({ mesh: m, x: spot[0], z: spot[1], type, t: Math.random() * 6 });
}

function startWave() {
  wave++;
  const comp = [{ raider: 4 }, { raider: 5, hound: 2 }, { raider: 5, hound: 3, rig: 1 }][wave - 1] || { raider: 6, hound: 4, rig: 2 };
  queue = []; for (const [k, n] of Object.entries(comp)) for (let i = 0; i < n; i++) queue.push(k);
  queue.sort(() => Math.random() - 0.5);
  banner(`VÅG ${two(wave)} — RENSA GATORNA`, 2.6);
  $('#h-wave').textContent = `VÅG ${two(wave)} / ${two(G.waves)}`;
}
function spawnEnemy() {
  const kind = queue.shift(), spec = ENEMY[kind], s = roadSpot(player.x, player.z, 75, 150); if (!s) { queue.unshift(kind); return; }
  const e = spawnCar(spec, spec.model, P[kind], s.x, s.z, Math.atan2(player.x - s.x, player.z - s.z)); e.kind = kind; e.vx = Math.sin(e.a) * 8; e.vz = Math.cos(e.a) * 8;
  enemies.push(e);
}

// damage ------------------------------------------------------------
function hurtPlayer(d) {
  if (player.dead || G.state !== 'playing') return;
  player.hp -= d / (player.spec.armor || 1); hitFlash = 0.25; shake = Math.max(shake, clamp(d / 14, 0.2, 1)); sfx.hit();
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; fx.explosion(player.x, player.z, 1.8); fx.burn(player.x, player.z, 10); player.mesh.visible = false; G.state = 'dead';
    const key = 'wb-best-' + world.slug, best = Math.max(+localStorage.getItem(key) || 0, scrap); localStorage.setItem(key, best);
    $('#o-text').textContent = `Skrot ${scrap} · Våg ${wave} · Rekord ${best}`; $('#over').hidden = false;
  }
}
function hurtEnemy(e, d) { e.hp -= d; e.flash = 0.1; if (e.hp <= 0 && !e.dead) killEnemy(e); }
function killEnemy(e) {
  e.dead = true; const big = e.spec.r > 2 ? 1.6 : e.spec.r > 1.7 ? 1.2 : 1;
  fx.explosion(e.x, e.z, big); fx.burn(e.x, e.z, 12); sfx.explosion(); scrap += e.spec.score; scene.remove(e.mesh);
  enemies.splice(enemies.indexOf(e), 1);
  if (Math.random() < 0.4) spawnPickup([e.x, e.z]);
}
function blast(x, z, radius, dmg, fromPlayer = true) {
  fx.explosion(x, z, radius / 6); sfx.explosion();
  for (const e of [...enemies]) { const d = Math.hypot(e.x - x, e.z - z); if (d < radius + e.r) hurtEnemy(e, dmg * (1 - clamp(d / (radius + e.r), 0, 1) * 0.65)); }
  const dp = Math.hypot(player.x - x, player.z - z);
  if (!fromPlayer && dp < radius + player.r) hurtPlayer(dmg * (1 - clamp(dp / (radius + player.r), 0, 1) * 0.65));
  shake = Math.max(shake, clamp(1 - Math.hypot(player.x - x, player.z - z) / 60, 0, 1) * 0.9);
}

// player ------------------------------------------------------------
function fireWeapon(dt) {
  const p = player, w = p.w, fxv = Math.sin(p.a), fzv = Math.cos(p.a), firing = keys.has('KeyF') || mouseDown;
  fireT -= dt; w.rcd -= dt; w.mcd -= dt;
  w.heat = Math.max(0, w.heat - 0.55 * dt); if (w.over && w.heat < 0.35) w.over = false;
  if (!firing) return;
  if (w.slot === 0 && fireT <= 0 && !w.over) {
    fireT = 0.07; w.heat += 0.045; if (w.heat >= 1) { w.over = true; w.heat = 1; }
    side *= -1; sfx.shoot();
    const a = p.a + rnd(-0.02, 0.02), m = new THREE.Mesh(bulletGeo, bulletMat), ox = side * 0.45;
    const x = p.x + fxv * 2.8 + fzv * ox, z = p.z + fzv * 2.8 - fxv * ox;
    m.position.set(x, 1.6, z); m.rotation.y = a; scene.add(m);
    bullets.push({ m, x, z, vx: Math.sin(a) * (135 + Math.max(0, p.fwd)), vz: Math.cos(a) * (135 + Math.max(0, p.fwd)), life: 1.1, dmg: 11, own: 'p' });
    fx.puff('spark', x, 1.6, z, { size: 0.9, life: 0.08, vy: 0, vx: 0, vz: 0, grow: 0.2 });
  } else if (w.slot === 1 && w.rcd <= 0 && w.rockets > 0) {
    w.rcd = 0.7; w.rockets--; sfx.shoot();
    const m = new THREE.Mesh(rocketGeo, rocketMat); m.rotation.y = p.a; scene.add(m);
    const x = p.x + fxv * 2.5, z = p.z + fzv * 2.5; m.position.set(x, 1.5, z);
    const sp = 78 + Math.max(0, p.fwd); rockets.push({ m, x, z, vx: fxv * sp, vz: fzv * sp, life: 2.4, t: 0 }); shake = Math.max(shake, 0.25);
  } else if (w.slot === 2 && w.fuel > 0) {
    w.fuel = Math.max(0, w.fuel - 26 * dt);
    for (let k = 0; k < 2; k++) fx.fire(p.x + fxv * 3 + rnd(-0.3, 0.3), 1.1, p.z + fzv * 3 + rnd(-0.3, 0.3), rnd(1.2, 2.3), 0.38, { vx: fxv * (22 + p.fwd * 0.4) + rnd(-2.5, 2.5), vz: fzv * (22 + p.fwd * 0.4) + rnd(-2.5, 2.5), vy: rnd(0.2, 1.6), grow: 1.2 });
    for (const e of enemies) {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
      if (d < 17 + e.r && (dx * fxv + dz * fzv) / (d || 1) > 0.86) { hurtEnemy(e, 58 * dt); e.burn = 2.5; }
    }
  } else if (w.slot === 3 && w.mcd <= 0 && w.mines > 0) {
    w.mcd = 0.8; w.mines--; sfx.pickup();
    const m = new THREE.Group(); m.add(new THREE.Mesh(mineGeo, mineMat)); const led = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mineLed); led.position.y = 0.2; m.add(led);
    const x = p.x - fxv * 3.2, z = p.z - fzv * 3.2; m.position.set(x, 0.15, z); scene.add(m); mines.push({ m, led, x, z, arm: 1, life: 90 });
  }
}

function updatePlayer(dt) {
  const p = player, k = (c) => keys.has(c);
  const up = k('KeyW') || k('ArrowUp'), dn = k('KeyS') || k('ArrowDown'), lf = k('KeyA') || k('ArrowLeft'), rt = k('KeyD') || k('ArrowRight');
  const boost = (k('ShiftLeft') || k('ShiftRight')) && p.nitro > 0 && up;
  p.nitro = clamp(p.nitro + (boost ? -34 : 4) * dt, 0, 100);
  driveCar(p, { thr: up ? 1 : dn ? -1 : 0, steer: (lf ? 1 : 0) - (rt ? 1 : 0), boost, drift: k('Space') }, dt);
  if (p.inWater) { p.hp -= 3 * dt; if (p.hp <= 0) hurtPlayer(1); }
  if (p.impact > 8) { hurtPlayer((p.impact - 7) * 0.8); fx.spark(p.x, 1, p.z, 8); fx.dust(p.x, p.z, 3); }
  fireWeapon(dt);
  if (boost) { fx.fire(p.x - Math.sin(p.a) * 2.6, 0.8, p.z - Math.cos(p.a) * 2.6, 1.4, 0.3, { vx: -Math.sin(p.a) * 8, vz: -Math.cos(p.a) * 8, vy: 0.3 }); }
  if ((p.speed > 10 && Math.random() < 0.5) || (p.slip > 4 && Math.random() < 0.9)) fx.dust(p.x - Math.sin(p.a) * 2, p.z - Math.cos(p.a) * 2, p.slip > 4 ? 3.2 : 2.2, p.vx, p.vz);
  if (p.hp < p.max * 0.3 && Math.random() < 0.3) fx.smoke(p.x, 1.6, p.z, 1.6, 1.4, 2);
  sfx.engine(clamp(p.speed / p.spec.max, 0, 1.4) * 0.8, up ? 1 : 0);
}

function updateEnemies(dt) {
  for (const e of [...enemies]) {
    if (e.dead) continue;
    const s = e.spec, dx = player.x - e.x, dz = player.z - e.z, dist = Math.hypot(dx, dz);
    e.cd -= dt; e.flash = Math.max(0, e.flash - dt);
    if (e.burn > 0) { e.burn -= dt; hurtEnemy(e, 6 * dt); if (Math.random() < 0.4) fx.fire(e.x + rnd(-1, 1), 1.4, e.z + rnd(-1, 1), 1.2, 0.5); }
    let want = Math.atan2(dx + player.vx * 0.35, dz + player.vz * 0.35), thr = 1;
    if (e.back > 0) { e.back -= dt; thr = -1; want = e.a + 2.2; }
    const diff = wrapAngle(want - e.a);
    if (Math.abs(diff) > 1.3 && e.back <= 0) thr = 0.45;
    if (player.dead) thr = 0.3;
    driveCar(e, { thr, steer: clamp(diff * 2.4, -1, 1), boost: false, drift: false }, dt);
    if (e.impact > 0.5) e.stuck += dt * 2; else e.stuck = Math.max(0, e.stuck - dt);
    if (e.stuck > 1.3) { e.back = 1.0; e.stuck = 0; }
    for (const o of enemies) if (o !== e) { const ox = e.x - o.x, oz = e.z - o.z, d = Math.hypot(ox, oz), m = e.r + o.r; if (d < m && d > 0.01) { e.x += (ox / d) * (m - d) * 0.5; e.z += (oz / d) * (m - d) * 0.5; } }
    if (e.inWater) hurtEnemy(e, 4 * dt);
    // shooting
    e.shootT -= dt;
    if (!player.dead && e.shootT <= 0 && Math.abs(diff) < 0.3) {
      if (s.gun && dist < 52) { e.burst = 4; e.shootT = rnd(1.8, 3); }
      if (s.cannon && dist < 80) { e.shootT = rnd(2.6, 3.8); enemyShell(e); }
    }
    if (e.burst > 0 && (e.burstT = (e.burstT ?? 0) - dt) <= 0) {
      e.burstT = 0.11; e.burst--; const a = e.a + rnd(-0.06, 0.06), m = new THREE.Mesh(bulletGeo, ebulletMat);
      const x = e.x + Math.sin(e.a) * 2.6, z = e.z + Math.cos(e.a) * 2.6; m.position.set(x, 1.5, z); m.rotation.y = a; scene.add(m);
      bullets.push({ m, x, z, vx: Math.sin(a) * 85, vz: Math.cos(a) * 85, life: 1.1, dmg: 2.2, own: 'e' });
    }
    // ramming
    if (!player.dead && dist < e.r + player.r && e.cd <= 0) {
      const rel = Math.hypot(e.vx - player.vx, e.vz - player.vz), mass = player.spec.ram;
      hurtPlayer(s.ram * clamp(rel / 22, 0.5, 1.6) / (mass * 0.7 + 0.3)); hurtEnemy(e, (10 + player.speed * 0.9) * mass);
      e.cd = 0.7; const nx = (e.x - player.x) / (dist || 1), nz = (e.z - player.z) / (dist || 1);
      e.vx = nx * 10; e.vz = nz * 10; player.vx -= nx * 5 / mass; player.vz -= nz * 5 / mass; fx.spark(player.x + nx, 1.2, player.z + nz, 9);
    }
    if (dist > 280 && !e.dead) { scene.remove(e.mesh); enemies.splice(enemies.indexOf(e), 1); queue.push(e.kind); }
  }
}
function enemyShell(e) {
  const m = new THREE.Mesh(rocketGeo, new THREE.MeshBasicMaterial({ color: 0xff7a2a })); const a = e.a, x = e.x + Math.sin(a) * 3.4, z = e.z + Math.cos(a) * 3.4;
  m.rotation.y = a; m.position.set(x, 1.8, z); scene.add(m); rockets.push({ m, x, z, vx: Math.sin(a) * 58, vz: Math.cos(a) * 58, life: 2.4, t: 0, enemy: true });
}

function updateProjectiles(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt; b.m.position.set(b.x, 1.6, b.z);
    let dead = b.life <= 0 || inBuilding(b.x, b.z), hit = false;
    if (!dead && b.own === 'p') for (const e of enemies) if (Math.hypot(e.x - b.x, e.z - b.z) < e.r + 0.4) { hurtEnemy(e, b.dmg); dead = hit = true; break; }
    if (!dead && b.own === 'e' && !player.dead && Math.hypot(player.x - b.x, player.z - b.z) < player.r + 0.3) { hurtPlayer(b.dmg); dead = hit = true; }
    if (dead) { if (b.life > 0) fx.spark(b.x, 1.4, b.z, hit ? 5 : 3); scene.remove(b.m); bullets.splice(i, 1); }
  }
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; r.life -= dt; r.t -= dt; r.x += r.vx * dt; r.z += r.vz * dt; r.m.position.set(r.x, 1.6, r.z);
    if (r.t <= 0) { r.t = 0.03; fx.smoke(r.x - r.vx * 0.02, 1.6, r.z - r.vz * 0.02, 1.1, 0.9, 0.5); fx.fire(r.x, 1.6, r.z, 0.8, 0.15, { vy: 0 }); }
    let boom = r.life <= 0 || inBuilding(r.x, r.z) || obstacles.some((o) => Math.hypot(o.x - r.x, o.z - r.z) < o.r);
    if (!boom && !r.enemy) boom = enemies.some((e) => Math.hypot(e.x - r.x, e.z - r.z) < e.r + 0.6);
    if (!boom && r.enemy) boom = !player.dead && Math.hypot(player.x - r.x, player.z - r.z) < player.r + 0.6;
    if (boom) { scene.remove(r.m); rockets.splice(i, 1); blast(r.x, r.z, r.enemy ? 6 : 8, r.enemy ? 26 : 62, !r.enemy); }
  }
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i]; m.arm -= dt; m.life -= dt; m.led.visible = m.arm > 0 ? true : Math.floor(performance.now() / 350) % 2 === 0;
    if (m.arm <= 0 && enemies.some((e) => Math.hypot(e.x - m.x, e.z - m.z) < e.r + 1.6)) { scene.remove(m.m); mines.splice(i, 1); blast(m.x, m.z, 7.5, 75, true); }
    else if (m.life <= 0) { scene.remove(m.m); mines.splice(i, 1); }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt; p.mesh.rotation.y += dt * 2; p.mesh.position.y = 1.3 + Math.sin(p.t * 3) * 0.25;
    if (!player.dead && Math.hypot(p.x - player.x, p.z - player.z) < 3.2) {
      if (p.type === 'armor') player.hp = Math.min(player.max, player.hp + 40);
      if (p.type === 'ammo') { player.w.rockets = Math.min(14, player.w.rockets + 4); player.w.mines = Math.min(10, player.w.mines + 2); player.w.fuel = Math.min(100, player.w.fuel + 35); }
      if (p.type === 'nitro') player.nitro = Math.min(100, player.nitro + 60);
      sfx.pickup(); scene.remove(p.mesh); pickups.splice(i, 1);
    }
  }
  if (pickups.length < 5 && Math.random() < dt * 0.4) spawnPickup();
}

function updateWaves(dt) {
  if (G.mode !== 'war' || player.dead) return;
  const remain = queue.length + enemies.length;
  if (wave > 0) $('#h-remain').textContent = remain ? `${remain} ${remain === 1 ? 'RAIDER KVAR' : 'RAIDERS KVAR'}` : 'GATORNA ÄR RENA';
  if (remain === 0) {
    waveTimer -= dt;
    if (waveTimer <= 0) {
      if (wave >= G.waves) { G.state = 'won'; const key = 'wb-best-' + world.slug, best = Math.max(+localStorage.getItem(key) || 0, scrap); localStorage.setItem(key, best); $('#w-text').textContent = `Skrot ${scrap} · Rekord ${best}`; $('#win').hidden = false; return; }
      startWave(); waveTimer = 4;
    }
    return;
  }
  spawnT -= dt;
  if (queue.length && enemies.length < 4 + wave && spawnT <= 0) { spawnEnemy(); spawnT = 1.4; }
}

function respawn() {
  const s = roadSpot(player.x, player.z, 0, 220); if (!s) return;
  player.x = s.x; player.z = s.z; player.a = s.a; player.vx = player.vz = 0; collide(player, player.r); camInit = false;
}

// ---------------------------------------------------------------- camera / sync
function syncMeshes(dt) {
  for (const c of [player, ...enemies]) {
    if (!c) continue;
    c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.a;
    const roll = clamp(-(c.slip || 0) * 0.012 * Math.sign((c.vx * Math.cos(c.a) - c.vz * Math.sin(c.a)) || 1), -0.09, 0.09);
    c.mesh.rotation.z = roll;
    for (const w of c.mesh.userData.wheels) w.piv.rotation.x += ((c.fwd || 0) * dt) / w.r;
    const f = c.flash > 0 ? 0.55 : 0;
    c.mesh.traverse((o) => { if (o.isMesh && o.material.emissive && !o.material.userData.keep) o.material.emissive.setScalar(f); });
  }
}

function updateCamera(dt) {
  const k = 1 - Math.exp(-5 * dt);
  if (G.state === 'menu') return;
  const p = player, dx = Math.sin(p.a), dz = Math.cos(p.a), v = clamp(p.speed, 0, 50), back = keys.has('KeyQ');
  let want, look;
  if (G.cam === 2) { want = new THREE.Vector3(p.x + dx * 1.2, 1.9, p.z + dz * 1.2); look = new THREE.Vector3(p.x + dx * 30, 1.6, p.z + dz * 30); camPos.copy(want); }
  else {
    const d = (G.cam === 1 ? 24 : 13) + v * 0.12, h = (G.cam === 1 ? 14 : 6.2) + v * 0.04, s = back ? -1 : 1;
    want = new THREE.Vector3(p.x - dx * d * s, h, p.z - dz * d * s); look = new THREE.Vector3(p.x + dx * 10 * s, 1.6, p.z + dz * 10 * s);
    if (!camInit) { camPos.copy(want); camInit = true; } camPos.lerp(want, back ? 0.5 : k);
  }
  shake = Math.max(0, shake - dt * 2.2);
  let ct = 1;   // pull the camera in front of walls instead of letting it end up inside a house
  for (let s = 0.15; s <= 1.001; s += 0.1) { if (inBuilding(p.x + (camPos.x - p.x) * s, p.z + (camPos.z - p.z) * s)) { ct = Math.max(0.12, s - 0.15); break; } }
  camera.position.set(p.x + (camPos.x - p.x) * ct, 1.8 + (camPos.y - 1.8) * Math.max(ct, 0.45), p.z + (camPos.z - p.z) * ct)
    .add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * 0.5));
  camera.lookAt(look);
  camera.fov = 62 + clamp(p.speed - 30, 0, 24) * 0.55; camera.updateProjectionMatrix();
  sun.position.set(p.x + SUN_DIR.x * 150, SUN_DIR.y * 150, p.z + SUN_DIR.z * 150); sun.target.position.set(p.x, 0, p.z);
}

// ---------------------------------------------------------------- HUD
const H = {}; ['b-hp', 'v-hp', 'b-nitro', 'v-nitro', 'h-speed', 'h-scrap', 'h-gun', 'h-street', 'h-wave', 'h-remain', 'markers', 'hitflash'].forEach((id) => (H[id] = document.getElementById(id)));
const last = {};
function setText(id, t) { if (last[id] !== t) { last[id] = t; H[id].textContent = t; } }
function updateHud(dt) {
  const p = player, w = p.w;
  H['b-hp'].style.width = (p.hp / p.max) * 100 + '%'; H['b-nitro'].style.width = p.nitro + '%';
  H['b-hp'].classList.toggle('low', p.hp < p.max * 0.3);
  setText('v-hp', Math.ceil((p.hp / p.max) * 100) + '%'); setText('v-nitro', Math.round(p.nitro) + '%');
  setText('h-speed', String(Math.round(p.speed * 3.6)).padStart(3, '0')); setText('h-scrap', String(scrap));
  const gun = w.over ? 'ÖVERHETTAD' : w.heat > 0.7 ? 'VARM' : 'REDO'; setText('h-gun', gun); H['h-gun'].classList.toggle('warn', w.over);
  document.querySelectorAll('#weapons button').forEach((b, i) => {
    b.classList.toggle('on', i === w.slot);
    const v = [null, w.rockets, Math.round(w.fuel) + '%', w.mines][i]; if (v !== null) b.querySelector('i').textContent = v;
  });
  H['hitflash'].style.opacity = hitFlash; hitFlash = Math.max(0, hitFlash - dt * 1.6);
  streetT -= dt; if (streetT <= 0) { streetT = 0.3; setText('h-street', (roadNameAt(world, p.x, p.z) || 'RÄTTVIK').toUpperCase()); }
  updateMarkers();
}

const markerEls = []; const v3 = new THREE.Vector3();
function marker(i) {
  if (!markerEls[i]) { const d = document.createElement('div'); d.className = 'mk'; d.innerHTML = '<b>▼</b><span></span>'; H.markers.append(d); markerEls[i] = d; }
  return markerEls[i];
}
function updateMarkers() {
  const items = enemies.map((e, i) => ({ x: e.x, z: e.z, cls: 'e', t: `${i + 1}` }));
  let np = null, nd = 1e9; for (const p of pickups) { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < nd) { nd = d; np = p; } }
  if (np) items.push({ x: np.x, z: np.z, cls: 'p', t: np.type === 'armor' ? '+ PANSAR' : np.type === 'ammo' ? '+ AMMO' : '+ NITRO' });
  const W = innerWidth, Hh = innerHeight;
  items.forEach((it, i) => {
    const el = marker(i), d = Math.hypot(it.x - player.x, it.z - player.z);
    v3.set(it.x, 3.5, it.z).project(camera);
    let sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * Hh, edge = false;
    if (v3.z > 1) { sx = W - sx; sy = Hh - sy; edge = true; }
    const m = 46, cx = clamp(sx, m, W - m), cy = clamp(sy, m + 70, Hh - m - 120);
    if (cx !== sx || cy !== sy) edge = true;
    el.className = 'mk ' + it.cls + (edge ? ' edge' : ''); el.style.transform = `translate(${cx}px,${cy}px)`;
    el.firstChild.style.transform = edge ? `rotate(${Math.atan2(sy - Hh / 2, sx - W / 2) + Math.PI / 2 + Math.PI}rad)` : '';
    el.lastChild.textContent = `${it.t} / ${Math.round(d)}m`; el.style.display = 'block';
  });
  for (let i = items.length; i < markerEls.length; i++) markerEls[i].style.display = 'none';
}

const mini = $('#mini'), mx = mini.getContext('2d'), big = $('#bigmap'), bx = big.getContext('2d');
function drawMini() {
  if (!miniBase) return;
  const W = mini.width, view = 150, S = miniS, E = world.extent;
  mx.save(); mx.clearRect(0, 0, W, W); mx.beginPath(); mx.arc(W / 2, W / 2, W / 2, 0, 7); mx.clip();
  mx.fillStyle = '#14100c'; mx.fillRect(0, 0, W, W);
  mx.drawImage(miniBase, (player.x + E) * S - view * S, (player.z + E) * S - view * S, view * 2 * S, view * 2 * S, 0, 0, W, W);
  const k = W / (view * 2), at = (x, z) => [(x - player.x) * k + W / 2, (z - player.z) * k + W / 2];
  for (const e of enemies) { const [x, y] = at(e.x, e.z); mx.fillStyle = '#ff5a2a'; mx.fillRect(x - 3, y - 3, 6, 6); }
  for (const p of pickups) { const [x, y] = at(p.x, p.z); mx.fillStyle = '#ffe14a'; mx.beginPath(); mx.arc(x, y, 3, 0, 7); mx.fill(); }
  mx.translate(W / 2, W / 2); mx.rotate(Math.PI - player.a); mx.fillStyle = '#e3b06a'; mx.beginPath(); mx.moveTo(0, -8); mx.lineTo(6, 7); mx.lineTo(-6, 7); mx.fill(); mx.restore();
}
function drawBig() {
  const S = big.width / (2 * world.extent), E = world.extent;
  bx.clearRect(0, 0, big.width, big.height); bx.drawImage(miniBase, 0, 0, big.width, big.height);
  const at = (x, z) => [(x + E) * S, (z + E) * S];
  for (const e of enemies) { const [x, y] = at(e.x, e.z); bx.fillStyle = '#ff5a2a'; bx.fillRect(x - 4, y - 4, 8, 8); }
  const [px, py] = at(player.x, player.z); bx.save(); bx.translate(px, py); bx.rotate(Math.PI - player.a); bx.fillStyle = '#e3b06a'; bx.beginPath(); bx.moveTo(0, -11); bx.lineTo(8, 9); bx.lineTo(-8, 9); bx.fill(); bx.restore();
}

// ---------------------------------------------------------------- loop
let lastT = performance.now(), motesT = 0;
function render() { followCamera(); renderer.render(scene, camera); }
function frame(now) { requestAnimationFrame(frame); tick(Math.min(0.05, (now - lastT) / 1000)); lastT = now; }
function tick(dt) {
  if (!world) return;
  if (G.state === 'menu') { garageFrame(dt); return; }
  if (!player) return;
  if (bannerT > 0 && (bannerT -= dt) <= 0) $('#banner').classList.remove('on');
  if (G.state === 'paused') { render(); return; }
  if (G.state === 'playing') updatePlayer(dt);
  updateEnemies(dt); updateProjectiles(dt); updatePickups(dt); updateWaves(dt);
  fx.update(dt); syncMeshes(dt); updateCamera(dt); updateHud(dt); drawMini();
  $('#bigwrap').hidden = !keys.has('Tab'); if (keys.has('Tab')) drawBig();
  render();
}

// ---------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (G.state === 'menu') return;
  if (e.code === 'Escape') setPause(G.state !== 'paused');
  if (G.state === 'paused') return;
  if (e.code === 'KeyR') { if (G.state === 'dead') restart(); else respawn(); }
  if (e.code === 'KeyC') G.cam = (G.cam + 1) % 3;
  if (/^Digit[1-4]$/.test(e.code) && player) player.w.slot = +e.code.slice(5) - 1;
  if (e.code === 'KeyE' && player) player.w.slot = (player.w.slot + 1) % 4;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (G.state === 'playing') setPause(true); });
canvas.addEventListener('mousedown', () => { if (G.state === 'playing') mouseDown = true; });
addEventListener('mouseup', () => (mouseDown = false));

function setPause(on) {
  if (on && G.state === 'playing') { G.state = 'paused'; $('#pause').hidden = false; keys.clear(); mouseDown = false; }
  else if (!on && G.state === 'paused') { G.state = 'playing'; $('#pause').hidden = true; lastT = performance.now(); }
}

// ---------------------------------------------------------------- menu, garage, builder
const status = (t, err) => { const s = $('#status'); s.textContent = t || ''; s.classList.toggle('err', !!err); };
const loading = (on, text) => { $('#loading').hidden = !on; if (text) $('#load-text').textContent = text; };

function drawBackdrop() {   // dusk skyline: sun glow, spire, roofs and pines
  const c = $('#backdrop'), w = (c.width = 1600), h = (c.height = 900), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#15110d'); g.addColorStop(0.55, '#4a3322'); g.addColorStop(0.8, '#a8693a'); g.addColorStop(1, '#2a1a10'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const s = x.createRadialGradient(1150, 560, 10, 1150, 560, 520); s.addColorStop(0, 'rgba(255,200,120,0.85)'); s.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = s; x.fillRect(0, 0, w, h);
  const r = mulberry(5); x.fillStyle = '#0d0a07';
  const base = 700; x.beginPath(); x.moveTo(0, h); x.lineTo(0, base);
  let px = 0; while (px < w) { const bw = 60 + r() * 90, bh = 40 + r() * 90; x.lineTo(px, base - bh); x.lineTo(px + bw / 2, base - bh - 38 - r() * 25); x.lineTo(px + bw, base - bh); px += bw; } x.lineTo(w, h); x.fill();
  x.beginPath(); x.moveTo(380, base - 60); x.lineTo(380, base - 330); x.lineTo(402, base - 360); x.lineTo(402, base - 560); x.lineTo(412, base - 330); x.lineTo(430, base - 330); x.lineTo(430, base - 60); x.fill();
  for (let i = 0; i < 90; i++) { const tx = r() * w, th = 90 + r() * 170, ty = h - (r() * 70); x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx - th * 0.18, ty); x.lineTo(tx, ty - th); x.lineTo(tx + th * 0.18, ty); x.fill(); }
  const img = new Image(); img.onload = () => { x.globalAlpha = 0.85; x.drawImage(img, 0, 0, w, h); x.globalAlpha = 1; }; img.src = '../assets/images/title.png';
}

// garage preview (separate small renderer)
const gcv = $('#garage-cv'); let gren, gscene, gcam, gmodel, gkind = null;
function garageInit() {
  gren = new THREE.WebGLRenderer({ canvas: gcv, alpha: true, antialias: true }); gren.setPixelRatio(Math.min(devicePixelRatio, 2));
  gscene = new THREE.Scene(); gcam = new THREE.PerspectiveCamera(32, gcv.clientWidth / gcv.clientHeight || 2, 0.1, 100);
  gscene.add(new THREE.HemisphereLight(0xffdcb0, 0x3a2a1c, 1.6)); const l = new THREE.DirectionalLight(0xffc890, 3); l.position.set(5, 8, 4); gscene.add(l);
}
function garageFrame(dt) {
  if (!gren) return;
  if (gkind !== G.vehicle) { if (gmodel) gscene.remove(gmodel); gmodel = makeVehicle(G.vehicle); gscene.add(gmodel); gkind = G.vehicle; const s = G.vehicle === 'rig' ? 1.25 : 1; gcam.position.set(0, 3.2 * s, 9.5 * s); gcam.lookAt(0, 1.1, 0); }
  const w = gcv.clientWidth, h = gcv.clientHeight; if (gren.domElement.width !== w * gren.getPixelRatio()) { gren.setSize(w, h, false); gcam.aspect = w / h; gcam.updateProjectionMatrix(); }
  gmodel.rotation.y += dt * 0.5; gren.render(gscene, gcam);
}
function renderGarage() {
  const box = $('#garage-list'); box.innerHTML = '';
  for (const [k, v] of Object.entries(VEHICLES)) {
    const b = document.createElement('button'); b.className = k === G.vehicle ? 'on' : ''; b.innerHTML = `<em>${v.no}</em><b>${v.name}</b><small>${v.blurb}</small>`;
    b.onclick = () => { G.vehicle = k; localStorage.setItem('wb-vehicle', k); renderGarage(); }; box.append(b);
  }
}
const MODES = { war: ['KÖR IN I GATUKRIGET', 'Överlev tre vågor. Rensa varje raider. Rättvik är ditt.'], roam: ['KÖR UT PÅ GATORNA', 'Inga fiender. Utforska staden, plocka lådor, testa vapnen.'] };
function setMode(m) {
  G.mode = m; document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#m-desc').textContent = MODES[m][1]; $('#play span').textContent = MODES[m][0];
}

function showMenu() { G.state = 'menu'; $('#menu').hidden = false; $('#hud').hidden = true; $('#over').hidden = $('#win').hidden = $('#pause').hidden = true; if (player) player.mesh.visible = false; gkind = null; }
async function play() { await sfx.init().catch(() => {}); $('#menu').hidden = true; $('#hud').hidden = false; restart(); }
function restart() { if (player) player.mesh?.parent?.remove(player.mesh); resetGame(); }

function setWorld(w) {
  clearEntities(); player = null;
  world = w; world.slug = w.slug || slugify(w.name || 'world');
  const isCfg = CFG.slug === world.slug, title = (isCfg && CFG.title) || `${w.name} Wasteland`, parts = title.split(' ');
  $('#m-title1').textContent = parts[0]; $('#m-title2').textContent = parts.slice(1).join(' ') || 'WASTELAND';
  $('#m-tag').textContent = (isCfg && CFG.eyebrow) || 'Gatorna är dina. Behåll dem.'; $('#m-sub').textContent = (isCfg && CFG.tagline) || 'Gamla stan. Nya regler.';
  document.title = title;
  P = { ...DEFAULT_PALETTE, ...(CFG.palette || {}) };
  buildWorld(world);
  $('#play').disabled = false; setMode(G.mode); renderGarage();
  document.querySelectorAll('#saved button').forEach((b) => b.classList.toggle('on', b.dataset.slug === world.slug));
}
async function saveWorld(w) {
  try {
    const r = await fetch('/api/save', { method: 'POST', body: JSON.stringify({ path: `worlds/${w.slug}/world.json`, content: JSON.stringify(w) }) }); if (!r.ok) return false;
    const idx = (await loadJSON('../worlds/index.json')) || []; if (!idx.some((i) => i.slug === w.slug)) idx.push({ slug: w.slug, name: w.name });
    await fetch('/api/save', { method: 'POST', body: JSON.stringify({ path: 'worlds/index.json', content: JSON.stringify(idx, null, 1) }) }); return true;
  } catch { return false; }
}
async function renderSaved() {
  const idx = (await loadJSON('../worlds/index.json')) || [], box = $('#saved'); box.innerHTML = '';
  for (const it of idx) {
    const b = document.createElement('button'); b.textContent = it.name; b.dataset.slug = it.slug;
    b.onclick = async () => { loading(true, 'FÖRBEREDER GATORNA'); const w = await loadJSON(`../worlds/${it.slug}/world.json`); if (w) { await tick0(); setWorld(w); status(''); } else status('Kunde inte läsa världen', true); loading(false); };
    box.append(b);
  }
  return idx;
}
const tick0 = () => new Promise((r) => setTimeout(r, 30));
async function generate(place, radius) {
  $('#gen').disabled = true; $('#play').disabled = true; loading(true, 'HÄMTAR KARTAN');
  try {
    const w = await generateWorld({ place, radius, onStatus: (t) => { status(t); $('#load-text').textContent = t.toUpperCase(); } });
    await tick0(); setWorld(w);
    const saved = await saveWorld(w); if (saved) await renderSaved();
    document.querySelectorAll('#saved button').forEach((b) => b.classList.toggle('on', b.dataset.slug === w.slug));
    status(`${w.name}: ${w.buildings.length} byggnader, ${w.roads.length} vägar.` + (saved ? ' Sparad i worlds/.' : ' (Starta med start.ps1 / start.py för att spara.)'));
  } catch (e) { status(String(e.message || e), true); if (world) $('#play').disabled = false; }
  $('#gen').disabled = false; loading(false);
}

$('#gen').onclick = () => generate($('#place').value.trim() || 'Rättvik', +$('#radius').value);
$('#place').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#gen').click(); });
$('#play').onclick = play;
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
$('#again').onclick = () => restart(); $('#again2').onclick = () => restart();
$('#resume').onclick = () => setPause(false); $('#to-menu').onclick = showMenu; $('#to-menu2').onclick = showMenu; $('#to-menu3').onclick = showMenu;
document.querySelectorAll('#b-respawn').forEach((b) => (b.onclick = () => G.state === 'playing' && respawn()));
$('#b-map').onclick = () => (keys.has('Tab') ? keys.delete('Tab') : keys.add('Tab'));
$('#b-view').onclick = () => (G.cam = (G.cam + 1) % 3); $('#b-pause').onclick = () => setPause(true);
document.querySelectorAll('#weapons button').forEach((b, i) => (b.onclick = () => player && (player.w.slot = i)));

(async function boot() {
  const q = new URLSearchParams(location.search);
  CFG = { ...CFG, ...((await loadJSON('../world.config.json')) || {}) };
  if (CFG.radius) $('#radius').value = String(CFG.radius);
  drawBackdrop(); garageInit(); renderGarage();
  const idx = await renderSaved();
  requestAnimationFrame(frame);
  if (q.get('place')) { $('#place').value = q.get('place'); if (q.get('radius')) $('#radius').value = q.get('radius'); return generate(q.get('place'), +$('#radius').value); }
  const slug = q.get('world') || CFG.slug || idx[0]?.slug;
  const w = slug && (await loadJSON(`../worlds/${slug}/world.json`));
  if (w) { $('#place').value = w.name; setWorld(w); }
  else { status(`Ingen värld hittad – öppna "Byt ort" och tryck "Generera värld" (${CFG.place || 'Rättvik'}).`); $('#builder').open = true; if (CFG.place) $('#place').value = CFG.place.split(',')[0]; }
  loading(false);
})();

// Debug / test hook: advance the simulation without requestAnimationFrame.
window.__wb = { sfx, G, get player() { return player; }, get world() { return world; }, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt); }, keys, get info() { return { state: G.state, wave, scrap, enemies: enemies.length, hp: player?.hp, speed: player?.speed, x: player?.x, z: player?.z }; } };
