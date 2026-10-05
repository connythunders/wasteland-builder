// OpenStreetMap -> world.json. Pure ES module: runs in the browser (game menu)
// and in Node 18+ (tools/osm_to_world.mjs). No dependencies.
//
// world.json (metres, local frame: +x east, +z south, origin = place centre):
//   { name, slug, center:{lat,lon}, radius, extent, spawn:{x,z,a},
//     buildings:[{h,p:[[x,z]..]}], roads:[{t,w,p}], rails:[{w,p}],
//     water:[{p,holes}], rivers:[{w,p}], green:[{k,p,holes}] }

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export function slugify(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/å|ä/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world';
}

export async function geocode(place) {
  const url = `${NOMINATIM}?format=json&limit=1&accept-language=sv&q=${encodeURIComponent(place)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Nominatim svarade ${r.status}`);
  const j = await r.json();
  if (!j.length) throw new Error(`Hittade ingen plats som heter "${place}"`);
  return { lat: +j[0].lat, lon: +j[0].lon, name: j[0].name || place, display: j[0].display_name };
}

async function overpass(query, onStatus) {
  let lastErr;
  for (let round = 0; round < 4; round++) {
    if (round) await new Promise((r) => setTimeout(r, 3000 * round));
    for (const ep of round % 2 ? [OVERPASS[0]] : OVERPASS) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ep === OVERPASS[0] ? 45000 : 15000);
      try {
        onStatus?.(`Hämtar kartdata från ${new URL(ep).host} …${round ? ` (försök ${round + 1})` : ''}`);
        const r = await fetch(ep, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { lastErr = e.name === 'AbortError' ? new Error('timeout') : e; } finally { clearTimeout(timer); }
    }
  }
  throw new Error('Kartservrarna (Overpass) är överbelastade just nu, försök igen om en stund. (' + lastErr + ')');
}

function buildQuery(lat, lon, r) {
  const a = `(around:${r},${lat},${lon})`;
  return `[out:json][timeout:90];(
way["building"]${a};
way["highway"]${a};
way["railway"="rail"]${a};
way["waterway"~"^(river|stream|canal)$"]${a};
way["natural"~"^(water|wood|scrub|grassland|wetland|beach)$"]${a};
way["landuse"~"^(forest|grass|meadow|farmland|orchard|cemetery|recreation_ground|allotments|village_green)$"]${a};
way["leisure"~"^(park|pitch|golf_course|garden)$"]${a};
way["man_made"="pier"]${a};
node["natural"="tree"]${a};
relation["natural"~"^(water|wood)$"]${a};
relation["landuse"~"^(forest|meadow|farmland)$"]${a};
);out geom;`;
}

const ROAD_W = {
  motorway: 12, trunk: 10, primary: 9, secondary: 8, tertiary: 7, unclassified: 5.5,
  residential: 5.5, living_street: 4.5, service: 3.5, track: 3.5, motorway_link: 6, trunk_link: 6,
  primary_link: 6, secondary_link: 5, tertiary_link: 5, pedestrian: 3.5,
};

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const round1 = (v) => Math.round(v * 10) / 10;

function area(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return s / 2;
}
function pip(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Sutherland-Hodgman against the square [-e, e]^2.
function clipSquare(poly, e) {
  const edges = [
    [(p) => p[0] >= -e, (a, b) => { const t = (-e - a[0]) / (b[0] - a[0]); return [-e, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= e, (a, b) => { const t = (e - a[0]) / (b[0] - a[0]); return [e, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= -e, (a, b) => { const t = (-e - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), -e]; }],
    [(p) => p[1] <= e, (a, b) => { const t = (e - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), e]; }],
  ];
  let out = poly;
  for (const [inside, inter] of edges) {
    const inp = out; out = [];
    if (!inp.length) break;
    let prev = inp[inp.length - 1];
    for (const cur of inp) {
      if (inside(cur)) { if (!inside(prev)) out.push(inter(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(inter(prev, cur));
      prev = cur;
    }
  }
  return out.length >= 3 ? out : null;
}

// Split a polyline into runs that stay within the square [-e, e]^2.
function clipLine(p, e) {
  const runs = []; let cur = [];
  for (const pt of p) {
    if (Math.abs(pt[0]) <= e && Math.abs(pt[1]) <= e) cur.push(pt);
    else { if (cur.length > 1) runs.push(cur); cur = []; }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

function stitch(ways) {
  const rings = []; const pool = ways.filter((w) => w.length > 1).map((w) => w.slice());
  while (pool.length) {
    let cur = pool.pop(); let guard = 0;
    while (!same(cur[0], cur[cur.length - 1]) && guard++ < 20000) {
      const end = cur[cur.length - 1];
      const idx = pool.findIndex((w) => same(w[0], end) || same(w[w.length - 1], end));
      if (idx < 0) break;
      const w = pool.splice(idx, 1)[0];
      if (!same(w[0], end)) w.reverse();
      cur = cur.concat(w.slice(1));
    }
    if (cur.length >= 4 && same(cur[0], cur[cur.length - 1])) rings.push(cur.slice(0, -1));
  }
  return rings;
}

function hash(n) { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

function buildingHeight(tags, id) {
  const h = parseFloat(tags.height);
  if (h > 0) return Math.min(h, 80);
  const lv = parseFloat(tags['building:levels']);
  if (lv > 0) return Math.min(lv * 3.1 + 1, 80);
  const t = tags.building;
  if (t === 'church' || t === 'cathedral' || t === 'chapel') return 12;
  if (t === 'industrial' || t === 'warehouse') return 8;
  if (t === 'garage' || t === 'garages' || t === 'shed' || t === 'carport' || t === 'hut') return 3;
  if (t === 'apartments') return 12;
  return 5 + Math.round(hash(id) * 4);
}

export function convert(osm, center, radius) {
  const kx = Math.cos((center.lat * Math.PI) / 180) * 111320, kz = 110540;
  const proj = (g) => [round1((g.lon - center.lon) * kx), round1(-(g.lat - center.lat) * kz)];
  const E = radius * 1.15;
  const world = { buildings: [], roads: [], rails: [], piers: [], trees: [], water: [], rivers: [], green: [] };

  const addPoly = (list, ring, holes, extra) => {
    const c = clipSquare(ring, E);
    if (!c || Math.abs(area(c)) < 4) return;
    const hs = (holes || []).map((h) => clipSquare(h, E)).filter(Boolean);
    list.push({ ...extra, p: c, holes: hs.length ? hs : undefined });
  };
  const greenKind = (t) => {
    if (t.natural === 'wood' || t.landuse === 'forest') return 'forest';
    if (t.natural === 'water') return 'water';
    if (t.natural === 'scrub' || t.natural === 'wetland') return 'scrub';
    if (t.natural === 'beach') return 'sand';
    if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'village_green') return 'park';
    if (t.landuse === 'cemetery') return 'park';
    return 'field';
  };

  for (const el of osm.elements) {
    const t = el.tags || {};
    if (el.type === "node") {
      if (t.natural === "tree" && world.trees.length < 1500) {
        const q = proj(el); if (Math.abs(q[0]) < E && Math.abs(q[1]) < E) world.trees.push(q);
      }
      continue;
    }
    if (el.type === 'way' && el.geometry) {
      let p = el.geometry.map(proj);
      const closed = p.length > 3 && same(p[0], p[p.length - 1]);
      if (closed) p = p.slice(0, -1);
      if (t.building) {
        if (!closed || p.length < 3 || Math.abs(area(p)) < 6) continue;
        if (p.every((q) => Math.abs(q[0]) > E || Math.abs(q[1]) > E)) continue;
        const c = clipSquare(p, E); if (!c) continue;
        const lv = parseFloat(t["building:levels"]);
        world.buildings.push({
          h: round1(buildingHeight(t, el.id)), p: c,
          ...(t.building !== "yes" ? { k: t.building } : {}),
          ...(t["roof:shape"] ? { rs: t["roof:shape"] } : {}),
          ...(t["roof:colour"] ? { rc: t["roof:colour"] } : {}),
          ...(t["building:colour"] || t.colour ? { c: t["building:colour"] || t.colour } : {}),
          ...(t["building:material"] ? { m: t["building:material"] } : {}),
          ...(lv > 0 ? { lv } : {}),
          ...(t.name ? { n: t.name } : {}),
        });
      } else if (t.highway) {
        const w = ROAD_W[t.highway]; if (!w) continue;
        for (const run of clipLine(el.geometry.map(proj), E)) world.roads.push({ t: t.highway, w, p: run, ...(t.name ? { n: t.name } : {}), ...(t.surface ? { s: t.surface } : {}) });
      } else if (t.man_made === "pier") {
        for (const run of clipLine(el.geometry.map(proj), E)) world.piers.push({ w: parseFloat(t.width) || 3.5, p: run, ...(t.name ? { n: t.name } : {}) });
      } else if (t.railway) {
        for (const run of clipLine(el.geometry.map(proj), E)) world.rails.push({ w: 2.6, p: run });
      } else if (t.waterway) {
        const w = t.waterway === 'river' ? 9 : t.waterway === 'canal' ? 6 : 2.5;
        for (const run of clipLine(el.geometry.map(proj), E)) world.rivers.push({ w, p: run });
      } else if ((t.natural || t.landuse || t.leisure) && closed && p.length >= 3) {
        const k = greenKind(t);
        addPoly(k === 'water' ? world.water : world.green, p, null, k === 'water' ? {} : { k });
      }
    } else if (el.type === 'relation' && el.members) {
      const outers = [], inners = [];
      for (const m of el.members) {
        if (m.type !== 'way' || !m.geometry) continue;
        (m.role === 'inner' ? inners : outers).push(m.geometry.map(proj));
      }
      const outerRings = stitch(outers), innerRings = stitch(inners);
      const k = greenKind(t);
      for (const ring of outerRings) {
        const holes = innerRings.filter((h) => pip(h[0][0], h[0][1], ring));
        addPoly(k === 'water' ? world.water : world.green, ring, holes, k === 'water' ? {} : { k });
      }
    }
  }

  // Spawn: nearest vertex on a drivable road, not inside a building, heading along the road.
  let best = null;
  for (const r of world.roads) {
    if (r.w < 4.5) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [x, z] = r.p[i], d = x * x + z * z;
      if ((!best || d < best.d) && !world.buildings.some((b) => pip(x, z, b.p))) {
        best = { d, x, z, a: Math.atan2(r.p[i + 1][0] - x, r.p[i + 1][1] - z) };
      }
    }
  }
  world.spawn = best ? { x: best.x, z: best.z, a: best.a } : { x: 0, z: 0, a: 0 };
  world.extent = E;
  return world;
}

export async function generateWorld({ place, radius = 700, onStatus } = {}) {
  onStatus?.(`Söker efter "${place}" …`);
  const geo = await geocode(place);
  const osm = await overpass(buildQuery(geo.lat, geo.lon, Math.round(radius * 1.2)), onStatus);
  onStatus?.(`Bygger världen av ${osm.elements.length} kartobjekt …`);
  const world = convert(osm, { lat: geo.lat, lon: geo.lon }, radius);
  return {
    name: geo.name, slug: slugify(geo.name), display: geo.display,
    center: { lat: geo.lat, lon: geo.lon }, radius,
    attribution: '© OpenStreetMap contributors (ODbL)',
    ...world,
  };
}
