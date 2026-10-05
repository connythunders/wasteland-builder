// Procedural textures (no image files needed). Facade/roof/asphalt/cobble tiles are grey-scale
// so vertex colours or material colours can tint them; sprites are RGBA.
import * as THREE from 'three';

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function make(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function grit(x, w, h, n, seed, amp = 0.08) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * amp})` : `rgba(0,0,0,${r() * amp * 1.4})`;
    x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
function stains(x, w, h, seed, n = 5) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {   // soot / rain streaks running down the wall
    const px = r() * w, g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, `rgba(20,14,8,${0.1 + r() * 0.12})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px, 0, 2 + r() * 5, h);
  }
}

const cache = {};
const once = (k, f) => (cache[k] ??= f());

/** One floor x one bay (3.2 x 3.1 m). kind: plaster | timber | brick */
export function facade(kind) {
  return once('f-' + kind, () => make(128, 128, (x, w, h) => {
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, w, h);
    if (kind === 'timber') {           // horizontal boards
      for (let y = 0; y < h; y += 12) { x.fillStyle = 'rgba(0,0,0,0.20)'; x.fillRect(0, y, w, 2); x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, y + 2, w, 1); }
    } else if (kind === 'brick') {
      for (let row = 0; row < 16; row++) {
        const y = row * 8, off = row % 2 ? 8 : 0;
        x.fillStyle = 'rgba(40,30,25,0.55)'; x.fillRect(0, y, w, 1);
        for (let bx = -off; bx < w; bx += 16) { x.fillRect(bx, y, 1, 8); const r = Math.random(); x.fillStyle = `rgba(${r < 0.5 ? '255,255,255' : '0,0,0'},${r * 0.12})`; x.fillRect(bx + 1, y + 1, 15, 7); x.fillStyle = 'rgba(40,30,25,0.55)'; }
      }
    }
    // window: trim, glass, sky reflection, mullions, sill + lintel
    x.fillStyle = '#d8d8d8'; x.fillRect(34, 16, 60, 78);
    x.fillStyle = '#1d2128'; x.fillRect(40, 22, 48, 66);
    const g = x.createLinearGradient(0, 22, 0, 88); g.addColorStop(0, '#4a5058'); g.addColorStop(0.5, '#262b32'); g.addColorStop(1, '#1a1d22');
    x.fillStyle = g; x.fillRect(40, 22, 48, 66);
    x.fillStyle = '#e6e6e6'; x.fillRect(62, 22, 4, 66); x.fillRect(40, 52, 48, 4);
    x.fillStyle = '#bcbcbc'; x.fillRect(30, 94, 68, 6); x.fillStyle = '#cfcfcf'; x.fillRect(30, 12, 68, 5);
    if (kind === 'timber') { x.fillStyle = '#f6f6f6'; x.fillRect(32, 14, 4, 80); x.fillRect(92, 14, 4, 80); }
    stains(x, w, h, kind.length * 31, 4); grit(x, w, h, 500, 7);
  }));
}

/** Ground floor, two bays wide (6.4 x 3.1 m): door + shop/low window. */
export function facadeGround(kind) {
  return once('g-' + kind, () => make(256, 128, (x, w, h) => {
    x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, w, h);
    if (kind === 'timber') for (let y = 0; y < h; y += 12) { x.fillStyle = 'rgba(0,0,0,0.20)'; x.fillRect(0, y, w, 2); }
    if (kind === 'brick') for (let row = 0; row < 16; row++) { const y = row * 8, off = row % 2 ? 8 : 0; x.fillStyle = 'rgba(40,30,25,0.55)'; x.fillRect(0, y, w, 1); for (let bx = -off; bx < w; bx += 16) x.fillRect(bx, y, 1, 8); }
    x.fillStyle = '#9a9a9a'; x.fillRect(0, h - 10, w, 10);                 // plinth
    x.fillStyle = '#d4d4d4'; x.fillRect(28, 20, 50, 100);                  // door frame
    x.fillStyle = '#56402e'; x.fillRect(33, 26, 40, 94);                   // door
    x.fillStyle = '#2b2118'; x.fillRect(38, 31, 13, 30); x.fillRect(55, 31, 13, 30); x.fillRect(38, 68, 13, 36); x.fillRect(55, 68, 13, 36);
    x.fillStyle = '#c9a24a'; x.fillRect(64, 76, 4, 4);
    x.fillStyle = '#d4d4d4'; x.fillRect(150, 30, 80, 66);                  // low window
    x.fillStyle = '#1d2128'; x.fillRect(155, 35, 70, 56); x.fillStyle = '#4a5058'; x.fillRect(155, 35, 70, 14);
    x.fillStyle = '#e6e6e6'; x.fillRect(188, 35, 4, 56);
    x.fillStyle = '#bcbcbc'; x.fillRect(146, 96, 88, 6);
    stains(x, w, h, 91, 6); grit(x, w, h, 900, 8);
  }));
}

export function roofTiles() {
  return once('roof', () => make(64, 64, (x, w, h) => {
    x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) {
      const y = row * 8, off = row % 2 ? 4 : 0;
      x.fillStyle = 'rgba(0,0,0,0.38)'; x.fillRect(0, y + 7, w, 1);
      for (let bx = -off; bx < w; bx += 8) { x.fillRect(bx, y, 1, 8); const r = Math.random(); x.fillStyle = `rgba(${r < 0.5 ? '255,255,255' : '0,0,0'},${r * 0.2})`; x.fillRect(bx + 1, y, 7, 7); x.fillStyle = 'rgba(0,0,0,0.38)'; }
    }
    grit(x, w, h, 200, 3, 0.12);
  }));
}

export function cobbles() {
  return once('cobble', () => make(256, 256, (x, w, h) => {
    x.fillStyle = '#2a2622'; x.fillRect(0, 0, w, h);
    const r = rng(11), s = 32;
    for (let row = 0; row < h / s + 1; row++) {
      for (let col = 0; col < w / s + 1; col++) {
        const cx = col * s + (row % 2 ? s / 2 : 0) + (r() - 0.5) * 4, cy = row * s + (r() - 0.5) * 4, tone = 90 + r() * 70;
        const g = x.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, s * 0.62);
        g.addColorStop(0, `rgb(${tone + 25},${tone + 20},${tone + 10})`); g.addColorStop(1, `rgb(${tone - 30},${tone - 32},${tone - 36})`);
        x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, s * 0.46, s * 0.4, r() * 0.4, 0, 7); x.fill();
      }
    }
    grit(x, w, h, 1200, 5, 0.12);
  }));
}

export function asphaltTile(marks) {
  return once('asph' + !!marks, () => make(64, 128, (x, w, h) => {
    x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, w, h);
    grit(x, w, h, 900, 21, 0.14);
    if (marks) {
      x.fillStyle = '#e6dcc0';
      x.fillRect(5, 0, 2, h); x.fillRect(57, 0, 2, h); x.fillRect(31, 0, 2, 56);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(5, 0, 2, 20); x.fillRect(31, 10, 2, 30);   // worn paint
    }
    // cracks
    const r = rng(77); x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 1;
    for (let i = 0; i < 4; i++) { x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 14; py += r() * 14; x.lineTo(px, py); } x.stroke(); }
  }));
}

export function paving() {
  return once('pave', () => make(128, 128, (x, w, h) => {
    x.fillStyle = '#6e6a62'; x.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let yy = 0; yy < h; yy += 32) for (let xx = 0; xx < w; xx += 32) {
      const t = 140 + r() * 40; x.fillStyle = `rgb(${t},${t - 4},${t - 12})`; x.fillRect(xx + 1, yy + 1, 30, 30);
    }
    grit(x, w, h, 400, 6, 0.1);
  }));
}

export function dirt() {
  return once('dirt', () => make(128, 128, (x, w, h) => {
    x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, w, h); grit(x, w, h, 2500, 31, 0.25);
    const r = rng(4); for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.08})`; x.beginPath(); x.ellipse(r() * w, r() * h, 4 + r() * 12, 2 + r() * 6, r() * 3, 0, 7); x.fill(); }
  }));
}

export function sprite(kind) {
  return once('spr-' + kind, () => make(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
    if (kind === 'smoke') { g.addColorStop(0, 'rgba(210,200,190,0.9)'); g.addColorStop(0.5, 'rgba(120,112,104,0.45)'); g.addColorStop(1, 'rgba(60,56,52,0)'); }
    else if (kind === 'fire') { g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.25, 'rgba(255,190,70,0.95)'); g.addColorStop(0.6, 'rgba(230,80,20,0.55)'); g.addColorStop(1, 'rgba(120,20,0,0)'); }
    else if (kind === 'dust') { g.addColorStop(0, 'rgba(190,160,120,0.55)'); g.addColorStop(1, 'rgba(150,120,90,0)'); }
    else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,220,140,0.8)'); g.addColorStop(1, 'rgba(255,160,40,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }, { repeat: false }));
}

export function planks() {
  return once('planks', () => make(64, 64, (x, w, h) => {
    x.fillStyle = '#b9a58a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(0,0,0,${0.08 + (i % 3) * 0.06})`; x.fillRect(i * 8, 0, 7, h); x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(i * 8 + 7, 0, 1, h); }
    grit(x, w, h, 300, 12, 0.15);
  }));
}
