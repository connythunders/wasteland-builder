import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { generateWorld, slugify } from './osm.js';
import { Sfx } from './audio.js';
import { buildBuildings } from './buildings.js';
import { buildRoads, roadNameAt } from './roads.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- config
const DEFAULT_PALETTE = {
  sky: '#d98c4f', fog: '#c98a58', ground: '#b48a56', building: '#b39068', roof: '#6e5a4a', pave: '#a89c84',
  walls: ['#c9a15a', '#d8c79a', '#d9d3c2', '#8c3b2a', '#d4b04a', '#c99a8a', '#b8b09a'],
  road: '#3a3532', track: '#7d6242', rail: '#2a2623', water: '#56612f', forest: '#4a4426',
  field: '#a68b50', scrub: '#8d7a45', park: '#8a8248', sand: '#cfa66a', tree: '#3f3a20',
  player: '#d4651f', buggy: '#c9b23a', brute: '#4b4744',
};
let CFG = { palette: {} };
let P = DEFAULT_PALETTE;

async function loadJSON(url) {
  try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

// ---------------------------------------------------------------- renderer / scene
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 1200);
const hemi = new THREE.HemisphereLight(0xffd7a8, 0x7a5a3a, 1.9);
const sun = new THREE.DirectionalLight(0xffb070, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 400 });
sun.shadow.bias = -0.0008;
scene.add(hemi, sun, sun.target);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const sfx = new Sfx();

// ---------------------------------------------------------------- world state
let world = null, worldGroup = null, grid = null, cell = 40;
let miniBase = null, miniS = 1.5;
const treeColor = () => new THREE.Color(P.tree);

function colorize(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
const shapeOf = (p, holes) => {
  const s = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes || []) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
};
function flat(p, holes, y, color) {
  const g = new THREE.ShapeGeometry(shapeOf(p, holes));
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0); colorize(g, color); return g;
}
function ribbon(lines, y, colorFn) {
  const pos = [], col = [];
  for (const l of lines) {
    const c = colorFn(l), hw = l.w / 2;
    for (let i = 0; i < l.p.length - 1; i++) {
      let [ax, az] = l.p[i], [bx, bz] = l.p[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); if (len < 0.01) continue;
      const ux = dx / len, uz = dz / len, nx = -uz * hw, nz = ux * hw, e = hw * 0.5;
      ax -= ux * e; az -= uz * e; bx += ux * e; bz += uz * e;
      const q = [[ax + nx, az + nz], [ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(q[k][0], y, q[k][1]); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const pip = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function buildWorld(w) {
  if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse((o) => { o.geometry?.dispose(); }); }
  const g = new THREE.Group(); worldGroup = g;
  const r = mulberry(7);
  const E = w.extent;

  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.fog, 90, 520);
  hemi.color.set(P.sky).lerp(new THREE.Color(0xffffff), 0.35);

  // ground
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: P.ground }));
  gm.receiveShadow = true; g.add(gm);
  new THREE.TextureLoader().load('../assets/images/ground.png', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(400, 400); t.colorSpace = THREE.SRGBColorSpace;
    gm.material.map = t; gm.material.color.set(0xffffff); gm.material.needsUpdate = true;
  }, undefined, () => {});

  // land cover
  const kindCol = (k) => new THREE.Color(P[k] || P.field);
  const gg = (w.green || []).map((a, i) => flat(a.p, a.holes, 0.02 + (a.k === 'forest' ? 0.004 : 0), kindCol(a.k)));
  if (gg.length) { const m = new THREE.Mesh(mergeGeometries(gg), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.receiveShadow = true; g.add(m); }
  const wg = (w.water || []).map((a) => flat(a.p, a.holes, 0.04, new THREE.Color(P.water)));
  if (wg.length) g.add(new THREE.Mesh(mergeGeometries(wg), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x1a2008 })));
  if (w.rivers?.length) g.add(new THREE.Mesh(ribbon(w.rivers, 0.045, () => new THREE.Color(P.water)), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // roads: marked asphalt, pavements, junctions, lamps, rails (see roads.js)
  g.add(...buildRoads(w, P));

  // buildings: textured walls, pitched roofs, hollow ruins (see buildings.js)
  g.add(...buildBuildings(w, P, mulberry));

  // collision grid
  grid = new Map();
  w.buildings.forEach((b, i) => {
    for (let cx = Math.floor(b.bb[0] / cell); cx <= Math.floor(b.bb[1] / cell); cx++)
      for (let cz = Math.floor(b.bb[2] / cell); cz <= Math.floor(b.bb[3] / cell); cz++) {
        const k = cx + ',' + cz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
      }
  });

  // dead trees
  const spots = [];
  for (const a of w.green || []) {
    if (a.k !== 'forest' && a.k !== 'scrub') continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of a.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const want = Math.min(700, ((x1 - x0) * (z1 - z0)) / (a.k === 'forest' ? 260 : 700));
    for (let t = 0; t < want * 3 && spots.length < 3500; t++) {
      const x = rnd(x0, x1), z = rnd(z0, z1);
      if (pip(x, z, a.p) && !(a.holes || []).some((h) => pip(x, z, h))) spots.push([x, z]);
      if (spots.length >= 3500) break;
    }
  }
  if (spots.length) {
    const cone = new THREE.ConeGeometry(1.3, 7, 5).translate(0, 3.5, 0);
    const im = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: P.tree, flatShading: true }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const s = 0.7 + r() * 0.9; sc.set(s * 0.8, s * (0.8 + r() * 0.6), s * 0.8);
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25));
      im.setMatrixAt(i, m4.compose(ps.set(x, 0, z), q, sc));
    });
    im.castShadow = true; g.add(im);
  }

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
    for (const ring of [a.p, ...(a.holes || [])]) {
      ring.forEach((p, i) => { const [px, py] = tx(p); i ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.closePath();
    }
    x.fillStyle = col; x.fill('evenodd');
  };
  (w.green || []).forEach((a) => poly(a, P[a.k] || P.field));
  (w.water || []).forEach((a) => poly(a, '#6f8a3c'));
  const line = (l, col, wd) => { x.beginPath(); l.p.forEach((p, i) => { const [px, py] = tx(p); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = col; x.lineWidth = wd; x.stroke(); };
  (w.rivers || []).forEach((l) => line(l, '#6f8a3c', l.w * S));
  (w.roads || []).forEach((l) => line(l, '#e8c58a', Math.max(2, l.w * S * 0.8)));
  (w.buildings || []).forEach((b) => poly(b, '#2b1d14'));
  miniBase = c;
}

// ---------------------------------------------------------------- collision helpers
function nearBuildings(x, z, r) {
  const out = new Set();
  for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++)
    for (let cz = Math.floor((z - r) / cell); cz <= Math.floor((z + r) / cell); cz++) {
      const l = grid.get(cx + ',' + cz); if (l) for (const i of l) out.add(i);
    }
  return out;
}
function inBuilding(x, z) {
  for (const i of nearBuildings(x, z, 0.1)) { const b = world.buildings[i]; if (x >= b.bb[0] && x <= b.bb[1] && z >= b.bb[2] && z <= b.bb[3] && pip(x, z, b.p)) return true; }
  return false;
}
function inWater(x, z) {
  for (const a of world.water || []) {
    if (pip(x, z, a.p) && !(a.holes || []).some((h) => pip(x, z, h))) return true;
  }
  return false;
}
/** Push circle (e.x,e.z,r) out of buildings. Returns true when it hit one. */
function collide(e, r) {
  let hit = false;
  for (const i of nearBuildings(e.x, e.z, r)) {
    const b = world.buildings[i];
    if (e.x < b.bb[0] - r || e.x > b.bb[1] + r || e.z < b.bb[2] - r || e.z > b.bb[3] + r) continue;
    const p = b.p; let bd = 1e9, cx = 0, cz = 0;
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const ax = p[j][0], az = p[j][1], dx = p[k][0] - ax, dz = p[k][1] - az, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((e.x - ax) * dx + (e.z - az) * dz) / l2, 0, 1), qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(e.x - qx, e.z - qz); if (d < bd) { bd = d; cx = qx; cz = qz; }
    }
    const inside = pip(e.x, e.z, p);
    if (inside) { const d = Math.hypot(cx - e.x, cz - e.z) || 1; e.x = cx + ((cx - e.x) / d) * r; e.z = cz + ((cz - e.z) / d) * r; hit = true; }
    else if (bd < r) { e.x = cx + ((e.x - cx) / (bd || 1)) * r; e.z = cz + ((e.z - cz) / (bd || 1)) * r; hit = true; }
  }
  const L = world.extent * 0.97;
  if (Math.abs(e.x) > L || Math.abs(e.z) > L) { e.x = clamp(e.x, -L, L); e.z = clamp(e.z, -L, L); hit = true; }
  return hit;
}
function freeSpot(cx, cz, minD, maxD) {
  for (let t = 0; t < 40; t++) {
    const a = rnd(0, Math.PI * 2), d = rnd(minD, maxD), x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    if (Math.abs(x) < world.extent * 0.92 && Math.abs(z) < world.extent * 0.92 && !inBuilding(x, z) && !inWater(x, z)) return [x, z];
  }
  return null;
}

// ---------------------------------------------------------------- vehicles
const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; }
function makeCar(kind) {
  const g = new THREE.Group(), wheels = [];
  const dark = M('#1c1714'), metal = M('#5a5249');
  const spec = {
    player: { w: 2.0, h: 0.8, l: 4.3, col: P.player, wr: 0.5, ww: 0.5, cab: [1.7, 0.75, 1.7, -0.4] },
    buggy: { w: 1.7, h: 0.55, l: 3.4, col: P.buggy, wr: 0.55, ww: 0.55, cab: [1.3, 0.2, 1.2, -0.2] },
    brute: { w: 2.9, h: 1.3, l: 5.4, col: P.brute, wr: 0.8, ww: 0.7, cab: [2.5, 1.1, 2.0, -0.6] },
  }[kind];
  const y0 = spec.wr + 0.05;
  g.add(box(spec.w, spec.h, spec.l, M(spec.col), 0, y0 + spec.h / 2, 0));
  g.add(box(spec.cab[0], spec.cab[1], spec.cab[2], M(kind === 'buggy' ? '#2a2420' : '#3b2b20'), 0, y0 + spec.h + spec.cab[1] / 2, spec.cab[3]));
  // armour + spikes
  g.add(box(spec.w + 0.3, 0.4, 0.4, metal, 0, y0 + 0.2, spec.l / 2 + 0.1));
  for (let i = -2; i <= 2; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 4), metal); s.rotation.x = Math.PI / 2; s.position.set(i * spec.w * 0.2, y0 + 0.25, spec.l / 2 + 0.55); g.add(s); }
  if (kind === 'brute') g.add(box(spec.w + 0.8, 1.4, 0.3, metal, 0, y0 + 0.7, spec.l / 2 + 0.45));
  if (kind === 'buggy') for (const sx of [-1, 1]) { g.add(box(0.1, 1.0, 0.1, metal, sx * 0.7, y0 + 1.0, -0.8)); g.add(box(0.1, 1.0, 0.1, metal, sx * 0.7, y0 + 1.0, 0.4)); }
  if (kind === 'player') {
    g.add(box(0.18, 0.18, 1.5, dark, 0, y0 + spec.h + spec.cab[1] + 0.35, 0.9)); // roof gun
    for (const sx of [-1, 1]) g.add(box(0.14, 0.14, 1.2, metal, sx * 1.0, y0 + 1.0, -spec.l / 2 + 0.1)); // exhausts
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * (spec.w / 2 + 0.02), spec.wr, sz * spec.l * 0.33);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(spec.wr, spec.wr, spec.ww, 10), dark); wh.rotation.z = Math.PI / 2; wh.castShadow = true;
    piv.add(wh); g.add(piv); wheels.push({ piv, r: spec.wr });
  }
  g.userData.wheels = wheels;
  return g;
}

const TYPES = {
  buggy: { hp: 30, speed: 31, dmg: 8, score: 100, r: 1.6, turn: 2.4 },
  brute: { hp: 95, speed: 20, dmg: 18, score: 300, r: 2.4, turn: 1.6 },
};

// ---------------------------------------------------------------- effects
const puffs = [], bullets = [];
const puffGeo = new THREE.IcosahedronGeometry(1, 0), debrisGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const bulletGeo = new THREE.BoxGeometry(0.12, 0.12, 1.6), bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
function puff(x, y, z, { color = '#6b5a48', size = 1, life = 0.8, vy = 2, spread = 1.5, debris = false } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, fog: true });
  const m = new THREE.Mesh(debris ? debrisGeo : puffGeo, mat); m.position.set(x, y, z); m.scale.setScalar(size); scene.add(m);
  puffs.push({ m, vx: rnd(-spread, spread), vy: debris ? rnd(4, 11) : vy, vz: rnd(-spread, spread), life, max: life, debris, size });
}
function explode(x, z, big = 1) {
  for (let i = 0; i < 12 * big; i++) puff(x, 1.2, z, { color: i % 2 ? '#ff7a1a' : '#ffcf4a', size: rnd(0.8, 1.8) * big, life: rnd(0.4, 0.9), vy: rnd(2, 6), spread: 5 * big });
  for (let i = 0; i < 8 * big; i++) puff(x, 1.2, z, { color: '#2a2420', size: rnd(1.2, 2.6) * big, life: rnd(1, 1.8), vy: rnd(3, 7), spread: 3 });
  for (let i = 0; i < 8 * big; i++) puff(x, 1, z, { color: '#4b4744', size: 1, life: 1.4, spread: 8, debris: true });
  sfx.explosion(); shake = Math.max(shake, 0.8 * big);
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); continue; }
    if (p.debris) { p.vy -= 22 * dt; p.m.rotation.x += dt * 6; p.m.rotation.z += dt * 5; } else p.m.scale.setScalar(p.size * (1 + (1 - p.life / p.max) * 1.4));
    p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.2, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.material.opacity = 0.8 * (p.life / p.max);
  }
}

// ---------------------------------------------------------------- game state
let state = 'menu', shake = 0, camPos = new THREE.Vector3(), camInit = false;
let player, enemies = [], pickups = [];
let score = 0, wave = 0, waveQueue = 0, waveTimer = 0, spawnT = 0, fireT = 0, gunSide = 1, ramCd = 0, hitCd = 0, bannerT = 0;
let streetT = 0;
const keys = new Set(); let mouseDown = false;

function setBanner(t, secs = 2) { const b = $('#banner'); b.textContent = t; b.classList.add('on'); bannerT = secs; }

function spawnCar(kind, x, z, a) {
  const mesh = makeCar(kind); scene.add(mesh);
  const t = TYPES[kind] || { hp: 100, r: 1.7 };
  return { kind, mesh, x, z, a, v: 0, hp: t.hp, max: t.hp, r: t.r, stuck: 0, back: 0, cd: 0, flash: 0 };
}

function resetGame() {
  for (const e of enemies) scene.remove(e.mesh); enemies = [];
  for (const p of pickups) scene.remove(p.mesh); pickups = [];
  for (const b of bullets) scene.remove(b.m); bullets.length = 0;
  for (const p of puffs) scene.remove(p.m); puffs.length = 0;
  if (player) scene.remove(player.mesh);
  const s = world.spawn;
  player = spawnCar('player', s.x, s.z, s.a); player.hp = player.max = 100; player.ammo = 250; player.nitro = 100; player.dead = false;
  collide(player, 1.7);
  score = 0; wave = 0; waveQueue = 0; waveTimer = 1.5; spawnT = 0; shake = 0; camInit = false;
  for (let i = 0; i < 5; i++) spawnPickup();
  $('#over').hidden = true;
  setBanner(CFG.title ? CFG.title.toUpperCase() : 'KÖR!', 2.2);
}

function spawnPickup() {
  const spot = freeSpot(player.x, player.z, 25, 130); if (!spot) return;
  const type = ['ammo', 'repair', 'nitro'][Math.floor(Math.random() * 3)];
  const col = { ammo: '#ffb62e', repair: '#e8e8e8', nitro: '#38a8ff' }[type];
  const m = new THREE.Group();
  m.add(box(1.4, 1.1, 1.4, M(col, { emissive: col, emissiveIntensity: 0.35 }), 0, 0, 0));
  if (type === 'repair') { m.add(box(0.3, 1.2, 1.5, M('#d12020'), 0, 0, 0)); m.add(box(1.5, 1.2, 0.3, M('#d12020'), 0, 0, 0)); }
  m.position.set(spot[0], 1.2, spot[1]); scene.add(m);
  pickups.push({ mesh: m, x: spot[0], z: spot[1], type, t: Math.random() * 6 });
}

function startWave() {
  wave++; waveQueue = 3 + wave * 2; setBanner(`VÅG ${wave}`, 2.2);
  $('#h-wave').textContent = `Våg ${wave}`;
}
function spawnEnemy() {
  const spot = freeSpot(player.x, player.z, 80, 140); if (!spot) return;
  const kind = Math.random() < Math.min(0.5, (wave - 1) * 0.1) ? 'brute' : 'buggy';
  const e = spawnCar(kind, spot[0], spot[1], Math.atan2(player.x - spot[0], player.z - spot[1])); e.v = 10;
  enemies.push(e); waveQueue--;
}

function damagePlayer(d) {
  if (player.dead) return;
  player.hp -= d; hitCd = 0.15; shake = Math.max(shake, clamp(d / 15, 0.2, 1)); sfx.hit();
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; explode(player.x, player.z, 1.6); player.mesh.visible = false; state = 'dead';
    const key = 'wb-best-' + world.slug, best = Math.max(+localStorage.getItem(key) || 0, score); localStorage.setItem(key, best);
    $('#o-text').textContent = `Poäng ${score} · Våg ${wave} · Rekord ${best}`; $('#over').hidden = false;
  }
}
function killEnemy(e) {
  explode(e.x, e.z, e.kind === 'brute' ? 1.4 : 1); score += TYPES[e.kind].score; scene.remove(e.mesh);
  enemies.splice(enemies.indexOf(e), 1);
  if (Math.random() < 0.4) spawnPickupAt(e.x, e.z);
}
function spawnPickupAt(x, z) { spawnPickup(); const p = pickups[pickups.length - 1]; if (p) { p.x = x; p.z = z; p.mesh.position.set(x, 1.2, z); } }

// ---------------------------------------------------------------- update
function updatePlayer(dt) {
  const p = player;
  const up = keys.has('KeyW') || keys.has('ArrowUp'), dn = keys.has('KeyS') || keys.has('ArrowDown');
  const lf = keys.has('KeyA') || keys.has('ArrowLeft'), rt = keys.has('KeyD') || keys.has('ArrowRight');
  const boost = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && p.nitro > 0 && up;
  const maxV = boost ? 54 : 36;
  if (up) p.v += (boost ? 44 : 26) * dt; else if (dn) p.v -= (p.v > 0 ? 45 : 17) * dt; else p.v -= Math.sign(p.v) * Math.min(Math.abs(p.v), 8 * dt);
  if (p.v > maxV) p.v = Math.max(maxV, p.v - 25 * dt);
  p.v = Math.max(p.v, -12);
  p.nitro = clamp(p.nitro + (boost ? -35 : 4) * dt, 0, 100);
  if (inWater(p.x, p.z)) { p.v *= Math.pow(0.3, dt); p.hp -= 3 * dt; if (p.hp <= 0) damagePlayer(1); if (Math.random() < 0.3) puff(p.x, 0.3, p.z, { color: '#7a8a40', size: 0.7, life: 0.5, spread: 3 }); }
  const steer = (lf ? 1 : 0) - (rt ? 1 : 0);
  p.a += steer * 2.3 * dt * clamp(Math.abs(p.v) / 9, 0, 1) * Math.sign(p.v || 1) * (1 - 0.45 * Math.abs(p.v) / 54);
  p.x += Math.sin(p.a) * p.v * dt; p.z += Math.cos(p.a) * p.v * dt;
  if (collide(p, 1.7)) {
    const imp = Math.abs(p.v);
    if (imp > 8) { damagePlayer((imp - 6) * 0.7); puff(p.x, 1, p.z, { size: 1.2, life: 0.6 }); }
    p.v *= 0.3;
  }
  // gun
  fireT -= dt;
  if ((keys.has('Space') || mouseDown) && fireT <= 0 && p.ammo > 0) {
    fireT = 0.085; p.ammo--; gunSide *= -1; sfx.shoot();
    const sp = rnd(-0.025, 0.025), a = p.a + sp, m = new THREE.Mesh(bulletGeo, bulletMat);
    const sx = Math.sin(p.a), sz = Math.cos(p.a), ox = gunSide * 0.5;
    const x = p.x + sx * 2.6 + sz * ox, z = p.z + sz * 2.6 - sx * ox;
    m.position.set(x, 1.5, z); m.rotation.y = a; scene.add(m);
    bullets.push({ m, x, z, vx: Math.sin(a) * (125 + Math.max(0, p.v)), vz: Math.cos(a) * (125 + Math.max(0, p.v)), life: 1.1 });
    puff(x, 1.5, z, { color: '#ffd070', size: 0.35, life: 0.1, spread: 0.2, vy: 0 });
  }
  if (boost && Math.random() < 0.6) puff(p.x - Math.sin(p.a) * 2.4, 0.9, p.z - Math.cos(p.a) * 2.4, { color: '#5ab8ff', size: 0.5, life: 0.35, spread: 0.5 });
  if (Math.abs(p.v) > 12 && Math.random() < 0.5) puff(p.x - Math.sin(p.a) * 2.2, 0.4, p.z - Math.cos(p.a) * 2.2, { color: '#a8855a', size: 0.8, life: 0.7, spread: 1 });
  sfx.engine(Math.abs(p.v) / 54, up ? 1 : 0);
}

function updateEnemies(dt) {
  for (const e of [...enemies]) {
    const t = TYPES[e.kind], dx = player.x - e.x, dz = player.z - e.z, dist = Math.hypot(dx, dz);
    e.cd -= dt; e.flash = Math.max(0, e.flash - dt);
    let want = Math.atan2(dx + Math.sin(player.a) * player.v * 0.4, dz + Math.cos(player.a) * player.v * 0.4);
    if (e.back > 0) { e.back -= dt; want = e.a + Math.PI * 0.6; }
    const diff = wrapAngle(want - e.a);
    e.a += clamp(diff * 2.5, -1, 1) * t.turn * dt * clamp(Math.abs(e.v) / 8, 0.35, 1);
    let target = e.back > 0 ? -8 : t.speed * (Math.abs(diff) > 1.2 ? 0.45 : 1);
    if (player.dead) target = 6;
    e.v += clamp(target - e.v, -30 * dt, 22 * dt);
    if (inWater(e.x, e.z)) { e.v *= Math.pow(0.35, dt); e.hp -= 4 * dt; }
    e.x += Math.sin(e.a) * e.v * dt; e.z += Math.cos(e.a) * e.v * dt;
    if (collide(e, e.r)) { e.stuck += dt * 2; e.v *= 0.5; } else e.stuck = Math.max(0, e.stuck - dt);
    if (e.stuck > 1.2) { e.back = 1.0; e.stuck = 0; }
    for (const o of enemies) if (o !== e) { const ox = e.x - o.x, oz = e.z - o.z, d = Math.hypot(ox, oz), m = e.r + o.r; if (d < m && d > 0.01) { e.x += (ox / d) * (m - d) * 0.5; e.z += (oz / d) * (m - d) * 0.5; } }
    // ramming
    if (!player.dead && dist < e.r + 1.7 && e.cd <= 0) {
      const rel = Math.abs(e.v) + Math.abs(player.v);
      damagePlayer(t.dmg * clamp(rel / 25, 0.5, 1.6));
      e.hp -= 8 + Math.abs(player.v) * 0.9; e.flash = 0.15; e.cd = 0.7;
      const nx = (e.x - player.x) / (dist || 1), nz = (e.z - player.z) / (dist || 1);
      e.x += nx * 1.5; e.z += nz * 1.5; e.v = -6; player.v *= 0.55; puff(player.x + nx, 1.2, player.z + nz, { color: '#ffcf4a', size: 0.8, life: 0.3, spread: 3 });
    }
    if (e.hp <= 0) { killEnemy(e); continue; }
    if (dist > 260) { e.hp = 0; scene.remove(e.mesh); enemies.splice(enemies.indexOf(e), 1); waveQueue++; }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt; b.m.position.set(b.x, 1.5, b.z);
    let dead = b.life <= 0 || inBuilding(b.x, b.z);
    if (!dead) for (const e of enemies) {
      if (Math.hypot(e.x - b.x, e.z - b.z) < e.r + 0.5) { e.hp -= 12; e.flash = 0.08; dead = true; puff(b.x, 1.4, b.z, { color: '#ffcf4a', size: 0.5, life: 0.2, spread: 2 }); break; }
    }
    if (dead) { if (b.life > 0) puff(b.x, 1.4, b.z, { color: '#c8b08a', size: 0.5, life: 0.3, spread: 1.5 }); scene.remove(b.m); bullets.splice(i, 1); }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt; p.mesh.rotation.y += dt * 2; p.mesh.position.y = 1.3 + Math.sin(p.t * 3) * 0.25;
    if (!player.dead && Math.hypot(p.x - player.x, p.z - player.z) < 3) {
      if (p.type === 'ammo') player.ammo = Math.min(300, player.ammo + 90);
      if (p.type === 'repair') player.hp = Math.min(player.max, player.hp + 35);
      if (p.type === 'nitro') player.nitro = Math.min(100, player.nitro + 60);
      sfx.pickup(); scene.remove(p.mesh); pickups.splice(i, 1);
    }
  }
  if (pickups.length < 5 && Math.random() < dt * 0.5) spawnPickup();
}

function updateWaves(dt) {
  if (player.dead) return;
  if (waveQueue <= 0 && enemies.length === 0) { waveTimer -= dt; if (waveTimer <= 0) { startWave(); waveTimer = 3.5; } return; }
  spawnT -= dt;
  if (waveQueue > 0 && enemies.length < 6 + Math.floor(wave / 2) && spawnT <= 0) { spawnEnemy(); spawnT = 1.3; }
}

function syncMeshes(dt) {
  for (const c of [player, ...enemies]) {
    if (!c) continue;
    c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.a;
    for (const w of c.mesh.userData.wheels) w.piv.rotation.x += (c.v * dt) / w.r;
    c.mesh.rotation.z = c === player ? clamp(-(c.v / 54) * 0.02 * Math.sin(performance.now() / 90), -0.02, 0.02) : 0;
    const f = c.flash > 0 ? 0.6 : 0;
    c.mesh.traverse((o) => { if (o.material?.emissive && !o.material.userData.keep) o.material.emissive.setScalar(f); });
  }
}

function updateCamera(dt) {
  const k = 1 - Math.exp(-5 * dt);
  if (state === 'menu') {
    const t = performance.now() / 9000, s = world.spawn;
    camera.position.set(s.x + Math.sin(t) * 70, 38, s.z + Math.cos(t) * 70); camera.lookAt(s.x, 4, s.z);
    sun.position.set(s.x + 120, 130, s.z + 60); sun.target.position.set(s.x, 0, s.z);
    return;
  }
  const p = player, dx = Math.sin(p.a), dz = Math.cos(p.a), back = 13 + clamp(p.v, 0, 54) * 0.12;
  const want = new THREE.Vector3(p.x - dx * back, 7 + clamp(p.v, 0, 54) * 0.05, p.z - dz * back);
  if (!camInit) { camPos.copy(want); camInit = true; }
  camPos.lerp(want, k);
  shake = Math.max(0, shake - dt * 2.2);
  camera.position.copy(camPos).add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * 0.5));
  camera.lookAt(p.x + dx * 10, 1.5, p.z + dz * 10);
  camera.fov = 65 + clamp(p.v - 36, 0, 20) * 0.6; camera.updateProjectionMatrix();
  sun.position.set(p.x + 90, 110, p.z + 50); sun.target.position.set(p.x, 0, p.z);
}

const mini = $('#mini'), mx = mini.getContext('2d');
function drawMini() {
  if (!miniBase) return;
  const W = mini.width, view = 150, S = miniS, E = world.extent;
  mx.save(); mx.clearRect(0, 0, W, W); mx.beginPath(); mx.arc(W / 2, W / 2, W / 2, 0, 7); mx.clip();
  mx.fillStyle = '#1a120c'; mx.fillRect(0, 0, W, W);
  const sx = (player.x + E) * S - view * S, sy = (player.z + E) * S - view * S, sw = view * 2 * S;
  mx.drawImage(miniBase, sx, sy, sw, sw, 0, 0, W, W);
  const k = W / (view * 2), at = (x, z) => [(x - player.x) * k + W / 2, (z - player.z) * k + W / 2];
  for (const e of enemies) { const [x, y] = at(e.x, e.z); mx.fillStyle = e.kind === 'brute' ? '#ff2a2a' : '#ff6a2a'; mx.fillRect(x - 3, y - 3, 6, 6); }
  for (const p of pickups) { const [x, y] = at(p.x, p.z); mx.fillStyle = '#ffe14a'; mx.beginPath(); mx.arc(x, y, 3, 0, 7); mx.fill(); }
  mx.translate(W / 2, W / 2); mx.rotate(Math.PI - player.a); mx.fillStyle = '#5ae05a'; mx.beginPath(); mx.moveTo(0, -8); mx.lineTo(6, 7); mx.lineTo(-6, 7); mx.fill();
  mx.restore();
}

const hud = { hp: $('#b-hp'), ammo: $('#b-ammo'), nitro: $('#b-nitro'), score: $('#h-score'), speed: $('#h-speed') };
function updateHud() {
  streetT -= 0.016; if (streetT <= 0) { streetT = 0.3; $('#h-street').textContent = roadNameAt(world, player.x, player.z); }
  hud.hp.style.width = (player.hp / player.max) * 100 + '%';
  hud.hp.style.background = player.hp < 30 ? '#d83a2a' : '#6ac04a';
  hud.ammo.style.width = (player.ammo / 300) * 100 + '%'; hud.nitro.style.width = player.nitro + '%';
  hud.score.textContent = score; hud.speed.textContent = Math.round(Math.abs(player.v) * 3.6);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, (now - last) / 1000)); last = now;
}
function tick(dt) {
  if (!world || !player) { if (world) renderer.render(scene, camera); return; }
  if (bannerT > 0 && (bannerT -= dt) <= 0) $('#banner').classList.remove('on');
  if (state === 'playing' || state === 'dead') {
    hitCd = Math.max(0, hitCd - dt);
    if (state === 'playing') updatePlayer(dt);
    updateEnemies(dt); updateBullets(dt); updatePickups(dt); updateWaves(dt);
    updateHud(); drawMini();
    if (state === 'dead') sfx.engine(0, 0);
  } else if (state === 'menu') {
    for (const e of enemies) e.mesh.visible = false;
  }
  updatePuffs(dt); syncMeshes(dt); updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR' && (state === 'playing' || state === 'dead')) { state = 'playing'; player.mesh.visible = true; resetGame(); }
  if (e.code === 'Escape' && state !== 'menu') showMenu();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('mousedown', () => { if (state === 'playing') mouseDown = true; });
addEventListener('mouseup', () => (mouseDown = false));

// ---------------------------------------------------------------- UI / world loading
const status = (t, err) => { const s = $('#status'); s.textContent = t || ''; s.classList.toggle('err', !!err); };

function showMenu() { state = 'menu'; $('#menu').hidden = false; $('#hud').hidden = true; $('#over').hidden = true; for (const e of enemies) e.mesh.visible = false; }
async function play() {
  await sfx.init();
  state = 'playing'; $('#menu').hidden = true; $('#hud').hidden = false;
  player.mesh.visible = true; resetGame();
}

function setWorld(w) {
  world = w; world.slug = w.slug || slugify(w.name || 'world');
  const isCfg = CFG.slug === world.slug;
  $('#m-title').textContent = (isCfg && CFG.title) || `${w.name} Wasteland`;
  $('#m-tag').textContent = (isCfg && CFG.tagline) || 'Vägarna finns kvar. Det gör inte grannarna.';
  CFG.title = $('#m-title').textContent;
  document.title = CFG.title;
  P = { ...DEFAULT_PALETTE, ...(CFG.palette || {}) };
  buildWorld(world);
  state = 'menu'; resetGame(); $('#banner').classList.remove('on'); for (const e of enemies) e.mesh.visible = false;
  player.mesh.visible = true;
  $('#play').disabled = false; $('#play').textContent = 'KÖR!';
  document.querySelectorAll('#saved button').forEach((b) => b.classList.toggle('on', b.dataset.slug === world.slug));
}

async function saveWorld(w) {
  const dir = `worlds/${w.slug}/world.json`;
  try {
    const r = await fetch('/api/save', { method: 'POST', body: JSON.stringify({ path: dir, content: JSON.stringify(w) }) });
    if (!r.ok) return false;
    const idx = (await loadJSON('../worlds/index.json')) || [];
    if (!idx.some((i) => i.slug === w.slug)) idx.push({ slug: w.slug, name: w.name });
    await fetch('/api/save', { method: 'POST', body: JSON.stringify({ path: 'worlds/index.json', content: JSON.stringify(idx, null, 1) }) });
    return true;
  } catch { return false; }
}

async function renderSaved(sel) {
  const idx = (await loadJSON('../worlds/index.json')) || [], box = $('#saved'); box.innerHTML = '';
  for (const it of idx) {
    const b = document.createElement('button'); b.textContent = it.name; b.dataset.slug = it.slug;
    b.onclick = async () => { status('Laddar …'); const w = await loadJSON(`../worlds/${it.slug}/world.json`); if (w) { setWorld(w); status(''); } else status('Kunde inte läsa världen', true); };
    box.append(b);
  }
  return idx;
}

async function generate(place, radius) {
  $('#gen').disabled = true; $('#play').disabled = true;
  try {
    const w = await generateWorld({ place, radius, onStatus: status });
    setWorld(w);
    const saved = await saveWorld(w);
    if (saved) await renderSaved();
    document.querySelectorAll('#saved button').forEach((b) => b.classList.toggle('on', b.dataset.slug === w.slug));
    status(`${w.name}: ${w.buildings.length} byggnader, ${w.roads.length} vägar.` + (saved ? ' Sparad i worlds/.' : ' (Startservern sparar inte – kör start.ps1 / start.py för att spara.)'));
  } catch (e) { status(String(e.message || e), true); if (world) $('#play').disabled = false; }
  $('#gen').disabled = false;
}

$('#gen').onclick = () => generate($('#place').value.trim() || 'Rättvik', +$('#radius').value);
$('#place').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#gen').click(); });
$('#play').onclick = play;
$('#again').onclick = () => { state = 'playing'; player.mesh.visible = true; resetGame(); };

(async function boot() {
  const q = new URLSearchParams(location.search);
  CFG = { ...CFG, ...((await loadJSON('../world.config.json')) || {}) };
  if (CFG.radius) $('#radius').value = String(CFG.radius);
  const img = new Image(); img.onload = () => ($('#menu').style.backgroundImage = `linear-gradient(#140a04aa,#140a04aa),url(../assets/images/title.png)`); img.src = '../assets/images/title.png';
  const idx = await renderSaved();
  requestAnimationFrame(frame);
  if (q.get('place')) { $('#place').value = q.get('place'); if (q.get('radius')) $('#radius').value = q.get('radius'); return generate(q.get('place'), +$('#radius').value); }
  const slug = q.get('world') || CFG.slug || idx[0]?.slug;
  const w = slug && (await loadJSON(`../worlds/${slug}/world.json`));
  if (w) { $('#place').value = w.name; setWorld(w); }
  else { $('#play').textContent = 'Generera en värld först'; status(`Ingen värld hittad – tryck "Generera värld" (${CFG.place || 'Rättvik'}).`); if (CFG.place) $('#place').value = CFG.place.split(',')[0]; }
})();

// Debug / test hook: advance the simulation without requestAnimationFrame.
window.__wb = { sfx, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt); }, keys, get info() { return { state, wave, score, enemies: enemies.length, hp: player?.hp, v: player?.v, x: player?.x, z: player?.z }; } };
