# Wasteland Builder – instruktioner för Claude Code

Projektet gör vilken ort som helst till ett Mad Max-inspirerat bilspel. OpenStreetMap-data
(byggnader, vägar, vatten, skog) blir en spelbar 3D-värld i webbläsaren (three.js, ingen byggprocess).

**Standardort: Rättvik** (`world.config.json`). Användaren vill oftast bara byta ort eller känsla – gör det enkelt.

## Vanliga uppdrag

| Användaren säger | Gör så |
|---|---|
| "Gör en variant av *Falun*" | Följ skillen `new-world` (`.claude/skills/new-world/SKILL.md`). |
| "Gör den mörkare / grönare / snöigare" | Ändra `palette` i `world.config.json`. Rör inte `game/main.js` i onödan. |
| "Ny titel / tagline" | `title` och `tagline` i `world.config.json`. |
| "Ny musik / ljud / bild" | Skillsen för Suno, ElevenLabs och bild (se nedan). Filerna läggs i `assets/`. |
| "Starta spelet" | `.\start.ps1` (Windows) eller `python start.py` / `node`-fritt, se README. |

## Kommandon

```
.\start.ps1 "Falun"                 # Windows: starta + generera värld
python start.py "Falun"             # macOS/Linux/Windows med Python
node tools/osm_to_world.mjs "Falun" --radius 1000   # bara generera världsfilen (Node 18+)
blender --background --python tools/blender_build.py -- worlds/falun/world.json out/falun.glb   # valfritt
```

## Arkitektur

- `game/osm.js` – geokodning (Nominatim) + Overpass → `world.json`. Används av både webbläsaren och Node-CLI:t.
- `game/main.js` – scen, bil, fiender, vågor, pickups, minikarta. `game/audio.js` – ljud.
- `worlds/<slug>/world.json` – genererade världar (meter, +x öst, +z syd). `worlds/index.json` listar dem.
- `assets/` – valfria filer som spelet hittar själv:
  - `assets/audio/{music,engine,shoot,explosion,pickup,hit}.{mp3,wav,ogg}` – annars syntetiskt ljud.
  - `assets/images/title.png` (menybakgrund) och `assets/images/ground.png` (sömlös markstruktur).
- `tools/` – CLI, Blender-export, skill-installation.

## Skills (bild, ElevenLabs, Suno)

De ligger inte i repot. Installera med `tools/install-skills.ps1` (eller `.sh`). Därefter finns
`gemini-imagegen`, `elevenlabs-skill` och `suno-music-skill` i `.claude/skills/`.
Nycklar: `OPENROUTER_API_KEY` (bild), `ELEVENLABS_API_KEY` (röst/ljud). Suno kräver ingen nyckel här –
skillen skriver stil + text som användaren klistrar in på suno.com och laddar ner som `assets/audio/music.mp3`.
Be aldrig användaren klistra in nycklar i chatten; be dem sätta miljövariabeln.

## Regler

- Håll spelet beroendefritt: three.js ligger i `game/vendor/`, inga npm-paket.
- Kartdata är © OpenStreetMap contributors (ODbL) – behåll attributionen i menyn.
- Testa i webbläsaren efter ändringar. `window.__wb.step(n)` stegar simuleringen utan `requestAnimationFrame`.
- Overpass/Nominatim har användningsgränser: generera inte om samma ort i onödan, kolla `worlds/` först.
