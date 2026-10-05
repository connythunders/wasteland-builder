#!/usr/bin/env node
// Generate worlds/<slug>/world.json from a place name (Node 18+, no dependencies).
//   node tools/osm_to_world.mjs "Falun"
//   node tools/osm_to_world.mjs "Visby" --radius 1000
// Without a place name it reads "place" and "radius" from world.config.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWorld } from '../game/osm.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const radiusArg = flag('--radius');
const cfg = JSON.parse(await readFile(join(root, 'world.config.json'), 'utf8').catch(() => '{}'));
const place = args[0] || cfg.place;
const radius = +(radiusArg || cfg.radius || 700);
if (!place) { console.error('Ange en ort: node tools/osm_to_world.mjs "Falun"'); process.exit(1); }

const w = await generateWorld({ place, radius, onStatus: (s) => console.log(s) });
const dir = join(root, 'worlds', w.slug);
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'world.json'), JSON.stringify(w));

const idxPath = join(root, 'worlds', 'index.json');
const idx = JSON.parse(await readFile(idxPath, 'utf8').catch(() => '[]'));
if (!idx.some((i) => i.slug === w.slug)) idx.push({ slug: w.slug, name: w.name });
await writeFile(idxPath, JSON.stringify(idx, null, 1));
console.log(`OK: worlds/${w.slug}/world.json  (${w.buildings.length} byggnader, ${w.roads.length} vägar, ${w.water.length} vattenytor)`);
