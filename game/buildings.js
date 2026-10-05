// Turns OSM building footprints into houses: windowed walls in local plaster/falu colours,
// pitched (gable/hip) roofs on rectangular buildings, flat roofs on big/odd ones, and hollow
// ruins. Also sets b.bb (bounding box) and b.ruin on every building.
import * as THREE from 'three';

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

function windowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#e4e4e4'; x.fillRect(16, 10, 32, 42);
  x.fillStyle = '#23272e'; x.fillRect(19, 13, 26, 36);
  x.fillStyle = '#3d434d'; x.fillRect(19, 13, 26, 10);
  x.fillStyle = '#e4e4e4'; x.fillRect(31, 13, 2, 36); x.fillRect(19, 29, 26, 2);
  x.fillStyle = '#c4c4c4'; x.fillRect(14, 52, 36, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

class Batch {
  constructor(uv) { this.pos = []; this.nor = []; this.col = []; this.uv = uv ? [] : null; }
  /** Emit a convex fan; vertex order is flipped when its geometric normal disagrees with n. */
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
        if (this.uv) this.uv.push(...uvs[idx]);
      }
    }
  }
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

function fillPoly(batch, p, y, c) {
  const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [a, b, d] of tris) batch.face([[p[a][0], y, p[a][1]], [p[b][0], y, p[b][1]], [p[d][0], y, p[d][1]]], [0, 1, 0], [c, c, c]);
}

export function buildBuildings(w, P, mulberry) {
  const walls = new Batch(true), roofs = new Batch(false);
  const palette = (P.walls || []).map((c) => new THREE.Color(c));
  const roofC = new THREE.Color(P.roof), rust = new THREE.Color('#8a4a2a'), floorC = [0.16, 0.13, 0.10];
  const tmp = new THREE.Color();

  w.buildings.forEach((b, i) => {
    const r = mulberry(i * 977 + 13), p = b.p, n = p.length;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, cx = 0, cz = 0;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z; }
    b.bb = [x0, x1, z0, z1]; cx /= n; cz /= n;
    b.ruin = r() < 0.22;
    const h = b.ruin ? b.h * (0.45 + r() * 0.4) : b.h;
    tmp.copy(palette[Math.floor(r() * palette.length)] || new THREE.Color(P.building)).multiplyScalar(0.75 + r() * 0.3);
    const wc = [tmp.r, tmp.g, tmp.b], wcLow = wc.map((v) => v * 0.7), uOff = r() * 10;

    for (let k = 0; k < n; k++) {
      const a = p[k], c = p[(k + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      let nx = dz / len, nz = -dx / len;
      if (pip((a[0] + c[0]) / 2 + nx * 0.1, (a[1] + c[1]) / 2 + nz * 0.1, p)) { nx = -nx; nz = -nz; }
      const u1 = uOff + len / BAY, v1 = Math.max(1, Math.round(h / FLOOR));
      walls.face([[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], h, c[1]], [a[0], h, a[1]]], [nx, 0, nz],
        [wcLow, wcLow, wc, wc], [[uOff, 0], [u1, 0], [u1, v1], [uOff, v1]]);
    }

    tmp.copy(roofC).lerp(rust, r() < 0.3 ? 0.5 : 0).multiplyScalar(0.8 + r() * 0.35);
    const rc = [tmp.r, tmp.g, tmp.b], rcLit = rc.map((v) => v * 1.12);

    if (b.ruin) { fillPoly(roofs, p, 0.2, floorC); return; }

    let best = 0, ba = [1, 0];
    for (let k = 0; k < n; k++) {
      const a = p[k], c = p[(k + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > best) { best = l; ba = [(c[0] - a[0]) / l, (c[1] - a[1]) / l]; }
    }
    const bv = [-ba[1], ba[0]];
    let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    for (const [x, z] of p) {
      const u = (x - cx) * ba[0] + (z - cz) * ba[1], v = (x - cx) * bv[0] + (z - cz) * bv[1];
      umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    const du = umax - umin, dv = vmax - vmin, area = areaOf(p);
    const pitched = area / (du * dv) > 0.78 && area < 700 && h <= 16 && Math.min(du, dv) > 3 && Math.min(du, dv) < 22;
    if (!pitched) { fillPoly(roofs, p, h, rc); return; }

    const e = 0.35, longU = du >= dv, hip = r() < 0.35, short = Math.min(du, dv), long = Math.max(du, dv);
    const rh = clamp(short * (0.22 + r() * 0.1), 0.9, 4);
    const ins = hip ? Math.min(short / 2, (long / 2) * 0.95) : 0;
    const smin = longU ? umin : vmin, smax = longU ? umax : vmax, tmin = longU ? vmin : umin, tmax = longU ? vmax : umax, tm = (tmin + tmax) / 2;
    const W = (s, t, y) => {
      const u = longU ? s : t, v = longU ? t : s;
      return [cx + ba[0] * u + bv[0] * v, y, cz + ba[1] * u + bv[1] * v];
    };
    const C0 = W(smin - e, tmin - e, h), C1 = W(smax + e, tmin - e, h), C2 = W(smax + e, tmax + e, h), C3 = W(smin - e, tmax + e, h);
    const R0 = W(smin + ins, tm, h + rh), R1 = W(smax - ins, tm, h + rh), mid = [cx, h, cz];
    const f = (pts, lit) => {
      const nn = crossN(pts[0], pts[1], pts[2]);
      const fc = pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length, s[2] + q[2] / pts.length], [0, 0, 0]);
      if (nn[0] * (fc[0] - mid[0]) + nn[1] * (fc[1] - mid[1]) + nn[2] * (fc[2] - mid[2]) < 0) for (let q = 0; q < 3; q++) nn[q] *= -1;
      const col = lit ? rcLit : rc; roofs.face(pts, nn, pts.map(() => col));
    };
    f([C0, C1, R1, R0], true); f([C2, C3, R0, R1], false); f([C3, C0, R0], false); f([C1, C2, R1], true);
  });

  const wallMat = new THREE.MeshLambertMaterial({ map: windowTexture(), vertexColors: true, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  return [walls.mesh(wallMat), roofs.mesh(roofMat)];
}
