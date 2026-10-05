// Turns OSM building footprints into houses that follow the OSM tags (type, roof shape, colour,
// material, levels) and fall back to local styles: falu-red timber houses, plaster apartment
// blocks, churches with a spire. Sets b.bb (bounding box) and b.ruin on every building.
import * as THREE from 'three';
import { facade, facadeGround, roofTiles } from './textures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BAY = 3.2, FLOOR = 3.1;

function pip(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function areaOf(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(s / 2);
}
function parseColor(s) {
  if (!s) return null;
  try { const c = new THREE.Color(); c.setStyle(String(s).toLowerCase().replace(/\s/g, '')); return c; } catch { return null; }
}
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

class Batch {
  constructor(uv) { this.pos = []; this.nor = []; this.col = []; this.uv = uv ? [] : null; }
  /** Convex fan; vertex order flips when its geometric normal disagrees with n. */
  face(pts, n, cols, uvs) {
    const [a, b, c] = pts;
    const gx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const gy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const gz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const order = pts.map((_, i) => i);
    if (gx * n[0] + gy * n[1] + gz * n[2] < 0) order.reverse();
    for (let k = 1; k < order.length - 1; k++) {
      for (const idx of [order[0], order[k], order[k + 1]]) {
        this.pos.push(...pts[idx]); this.nor.push(...n); this.col.push(...cols[idx]);
        if (this.uv) this.uv.push(...(uvs ? uvs[idx] : [0, 0]));
      }
    }
  }
  get empty() { return !this.pos.length; }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
  }
}

function crossN(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** Planar UVs for a roof face: along the first edge and up the slope, tile every ~1.1 m. */
function faceUV(pts, n) {
  const o = pts[0], e1 = [pts[1][0] - o[0], pts[1][1] - o[1], pts[1][2] - o[2]], l = Math.hypot(...e1) || 1;
  const u = e1.map((v) => v / l), v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return pts.map((p) => {
    const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    return [(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / 1.1, (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / 1.1];
  });
}

function box(batch, cx, cz, w, d, y0, y1, ang, col) {
  const c = Math.cos(ang), s = Math.sin(ang), hw = w / 2, hd = d / 2;
  const P = (lx, lz, y) => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
  const bot = [P(-hw, -hd, y0), P(hw, -hd, y0), P(hw, hd, y0), P(-hw, hd, y0)], top = bot.map((p) => [p[0], y1, p[2]]);
  for (let i = 0; i < 4; i++) {
    const a = bot[i], b = bot[(i + 1) % 4], n = [(b[2] - a[2]), 0, -(b[0] - a[0])], l = Math.hypot(n[0], n[2]) || 1;
    batch.face([a, b, top[(i + 1) % 4], top[i]], [n[0] / l, 0, n[2] / l], [col, col, col, col]);
  }
  batch.face(top, [0, 1, 0], [col, col, col, col]);
}

function spire(batch, cx, cz, half, y0, h, ang, col) {
  const c = Math.cos(ang), s = Math.sin(ang), P = (lx, lz, y) => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
  const base = [P(-half, -half, y0), P(half, -half, y0), P(half, half, y0), P(-half, half, y0)], tip = P(0, 0, y0 + h);
  for (let i = 0; i < 4; i++) {
    const a = base[i], b = base[(i + 1) % 4], n = crossN(a, b, tip);
    const mid = [(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz];
    if (n[0] * mid[0] + n[2] * mid[2] < 0) for (let k = 0; k < 3; k++) n[k] *= -1;
    batch.face([a, b, tip], n, [col, col, col]);
  }
}

const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'cabin', 'farm', 'bungalow', 'residential', 'static_caravan', 'barn', 'farm_auxiliary']);
const BLOCK = new Set(['apartments', 'commercial', 'retail', 'office', 'hotel', 'public', 'civic', 'school', 'hospital', 'kindergarten', 'university', 'dormitory']);
const SHED = new Set(['garage', 'garages', 'shed', 'carport', 'hut', 'roof', 'service', 'outbuilding']);
const CHURCH = new Set(['church', 'cathedral', 'chapel']);

export function buildBuildings(w, P, mulberry) {
  const wallBatches = {}, roofs = new Batch(true), misc = new Batch(false);
  const wb = (k) => (wallBatches[k] ??= new Batch(true));
  const tmp = new THREE.Color();
  const col3 = (c) => [c.r, c.g, c.b];
  const falu = (P.houseWalls || []).map((c) => new THREE.Color(c)), plaster = (P.walls || []).map((c) => new THREE.Color(c));
  const roofCols = (P.roofs || []).map((c) => new THREE.Color(c));
  const brickC = new THREE.Color('#8a4a3a'), rubbleC = [0.22, 0.2, 0.18], floorC = [0.16, 0.13, 0.10], copper = col3(new THREE.Color('#4f7f6c')), soot = [0.12, 0.1, 0.09];

  w.buildings.forEach((b, i) => {
    const r = mulberry(i * 977 + 13), p = b.p, n = p.length, k = b.k || 'yes';
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, cx = 0, cz = 0;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z; }
    b.bb = [x0, x1, z0, z1]; cx /= n; cz /= n;
    const area = areaOf(p);
    b.ruin = r() < (P.ruinShare ?? 0.2);

    // --- style from tags, else from type/size
    const small = area < 150, isHouse = HOUSE.has(k) || (k === 'yes' && small), isBlock = BLOCK.has(k) || k === 'industrial';
    let fk = (b.m === 'brick' || k === 'industrial') ? 'brick' : (b.m === 'wood' || isHouse) ? 'timber' : 'plaster';
    if (fk === 'timber' && b.m !== 'wood' && !HOUSE.has(k) && r() < 0.3) fk = 'plaster';
    let wcol = parseColor(b.c);
    if (!wcol) wcol = fk === 'brick' ? brickC.clone() : fk === 'timber' ? pick(falu, r()).clone() : pick(plaster, r()).clone();
    wcol.multiplyScalar(0.8 + r() * 0.28);
    const wc = col3(wcol), wcLow = wc.map((v) => v * 0.68);

    // --- height
    let h = b.h;
    if (isHouse && !b.lv && !(b.h > 0 && b.h !== Math.round(b.h * 10) / 10)) h = r() < 0.55 ? 6.4 : 3.9;
    if (SHED.has(k)) h = Math.min(h, 3);
    if (b.ruin) h *= 0.45 + r() * 0.4;
    h = Math.max(h, 2.6);

    // --- walls: ground-floor band + upper floors
    const gh = Math.min(FLOOR, h);
    for (let e = 0; e < n; e++) {
      const a = p[e], c = p[(e + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      let nx = dz / len, nz = -dx / len;
      if (pip((a[0] + c[0]) / 2 + nx * 0.1, (a[1] + c[1]) / 2 + nz * 0.1, p)) { nx = -nx; nz = -nz; }
      const u0 = r() * 5, ug = u0 + len / (BAY * 2), uu = u0 + len / BAY;
      const gb = wb(fk + 'g'); const lowC = [wcLow, wcLow, wc, wc];
      gb.face([[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], gh, c[1]], [a[0], gh, a[1]]], [nx, 0, nz], lowC, [[u0, 0], [ug, 0], [ug, gh / FLOOR], [u0, gh / FLOOR]]);
      if (h > gh + 0.3) {
        const ub = wb(fk + 'u'), vv = (h - gh) / FLOOR;
        ub.face([[a[0], gh, a[1]], [c[0], gh, c[1]], [c[0], h, c[1]], [a[0], h, a[1]]], [nx, 0, nz], [wc, wc, wc, wc], [[u0, 0], [uu, 0], [uu, vv], [u0, vv]]);
      }
    }

    if (b.ruin) {   // open top, rubble and scorch marks
      const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [a, bb, d] of tris) misc.face([[p[a][0], 0.25, p[a][1]], [p[bb][0], 0.25, p[bb][1]], [p[d][0], 0.25, p[d][1]]], [0, 1, 0], [floorC, floorC, floorC]);
      for (let q = 0; q < 5; q++) {
        const rx = x0 + r() * (x1 - x0), rz = z0 + r() * (z1 - z0);
        if (pip(rx, rz, p)) box(misc, rx, rz, 0.6 + r() * 1.4, 0.6 + r() * 1.4, 0.25, 0.5 + r() * 1.1, r() * 3, rubbleC);
      }
      return;
    }

    // --- roof colour
    let rcol = parseColor(b.rc) || pick(roofCols, r()).clone();
    rcol.multiplyScalar(0.8 + r() * 0.3);
    const rc = col3(rcol), rcLit = rc.map((v) => v * 1.12);

    // --- oriented bounding box along the longest edge
    let best = 0, ba = [1, 0];
    for (let e = 0; e < n; e++) {
      const a = p[e], c = p[(e + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > best) { best = l; ba = [(c[0] - a[0]) / l, (c[1] - a[1]) / l]; }
    }
    const bv = [-ba[1], ba[0]], ang = Math.atan2(ba[1], ba[0]);
    let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    for (const [x, z] of p) {
      const u = (x - cx) * ba[0] + (z - cz) * ba[1], v = (x - cx) * bv[0] + (z - cz) * bv[1];
      umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    const du = umax - umin, dv = vmax - vmin, rectish = area / (du * dv) > 0.78, short = Math.min(du, dv), long = Math.max(du, dv);

    const flatCap = (col) => {
      const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [a, bb, d] of tris) misc.face([[p[a][0], h, p[a][1]], [p[bb][0], h, p[bb][1]], [p[d][0], h, p[d][1]]], [0, 1, 0], [col, col, col]);
    };

    if (CHURCH.has(k)) {   // nave with a steeple at one end
      if (rectish && short < 22) pitchedRoof(true);
      else flatCap(rc);
      const sgn = r() < 0.5 ? 1 : -1, tw = Math.min(3.2, short * 0.45);
      const tu = (sgn > 0 ? umax - tw : umin + tw), tx = cx + ba[0] * tu, tz = cz + ba[1] * tu, th = h + 11 + r() * 4;
      const stone = col3(new THREE.Color('#d9d0bd'));
      box(misc, tx, tz, tw * 2, tw * 2, h - 1, th, ang, stone);
      spire(misc, tx, tz, tw * 1.15, th, tw * 4.2, ang, copper);
      return;
    }

    const wantFlat = b.rs === 'flat' || area > 700 || h > 17 || !rectish || short <= 2.6 || short > 24;
    if (wantFlat) { flatCap(rc); return; }
    pitchedRoof(false);

    function pitchedRoof(church) {
      const e = 0.4, longU = du >= dv;
      const shape = b.rs === 'hipped' || b.rs === 'pyramidal' ? 'hip' : b.rs === 'gabled' ? 'gable' : (SHED.has(k) ? 'mono' : (r() < (isBlock ? 0.45 : 0.25) ? 'hip' : 'gable'));
      const pitch = isBlock ? 0.2 : church ? 0.42 : 0.3 + r() * 0.08;
      const rh = clamp(short * pitch, 0.9, church ? 6 : 4.5);
      const ins = shape === 'hip' ? Math.min(short / 2, (long / 2) * 0.95) : 0;
      const smin = longU ? umin : vmin, smax = longU ? umax : vmax, tmin = longU ? vmin : umin, tmax = longU ? vmax : umax, tm = (tmin + tmax) / 2;
      const Wp = (s, t, y) => { const u = longU ? s : t, v = longU ? t : s; return [cx + ba[0] * u + bv[0] * v, y, cz + ba[1] * u + bv[1] * v]; };
      const C0 = Wp(smin - e, tmin - e, h), C1 = Wp(smax + e, tmin - e, h), C2 = Wp(smax + e, tmax + e, h), C3 = Wp(smin - e, tmax + e, h);
      const mid = [cx, h, cz];
      const f = (pts, lit) => {
        const nn = crossN(pts[0], pts[1], pts[2]);
        const fc = pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length, s[2] + q[2] / pts.length], [0, 0, 0]);
        if (nn[0] * (fc[0] - mid[0]) + nn[1] * (fc[1] - mid[1]) + nn[2] * (fc[2] - mid[2]) < 0) for (let q = 0; q < 3; q++) nn[q] *= -1;
        const cc = lit ? rcLit : rc; roofs.face(pts, nn, pts.map(() => cc), faceUV(pts, nn));
      };
      if (shape === 'mono') {
        const hi = Wp(smin - e, tmin - e, h + rh * 0.6), hi2 = Wp(smax + e, tmin - e, h + rh * 0.6);
        f([hi, hi2, C2, C3], true);
        return;
      }
      const R0 = Wp(smin + ins, tm, h + rh), R1 = Wp(smax - ins, tm, h + rh);
      f([C0, C1, R1, R0], true); f([C2, C3, R0, R1], false); f([C3, C0, R0], false); f([C1, C2, R1], true);
      if (!church && shape === 'gable') {   // gable end walls above the eaves
        const g1 = Wp(smin, tmin, h), g2 = Wp(smin, tmax, h), g3 = Wp(smax, tmin, h), g4 = Wp(smax, tmax, h), rr0 = Wp(smin, tm, h + rh), rr1 = Wp(smax, tm, h + rh);
        const gc = [wc, wc, wc];
        misc.face([g1, g2, rr0], crossN(g1, g2, rr0), gc); misc.face([g3, g4, rr1], crossN(g3, g4, rr1), gc);
      }
      if (!church && r() < 0.55 && short > 4) {   // chimney
        const s = smin + (smax - smin) * (0.2 + r() * 0.2), ch = Wp(s, tm, 0);
        box(misc, ch[0], ch[2], 0.7, 0.7, h + rh * 0.4, h + rh + 1.1, ang, soot);
      }
    }
  });

  const mats = {};
  const wallMat = (key) => (mats[key] ??= new THREE.MeshLambertMaterial({ map: key.endsWith('g') ? facadeGround(key.slice(0, -1)) : facade(key.slice(0, -1)), vertexColors: true, side: THREE.DoubleSide }));
  const out = Object.entries(wallBatches).filter(([, b]) => !b.empty).map(([k, b]) => b.mesh(wallMat(k)));
  if (!roofs.empty) out.push(roofs.mesh(new THREE.MeshLambertMaterial({ map: roofTiles(), vertexColors: true, side: THREE.DoubleSide })));
  if (!misc.empty) out.push(misc.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  return out;
}
