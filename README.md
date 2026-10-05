# Wasteland Builder

Skriv en ort – få ett Mad Max-inspirerat bilspel i den orten. Byggnader, vägar, sjöar och skog hämtas från
OpenStreetMap och blir en död värld att köra, skjuta och överleva i. Standardorten är **Rättvik**.

Allt körs i webbläsaren. Inget att bygga, inga npm-paket.

## Kom igång (2 minuter)

```
git clone https://github.com/connythunders/wasteland-builder
cd wasteland-builder
```

**Windows** (inget behöver installeras):

```
.\start.ps1
```

**macOS / Linux / Windows med Python 3:**

```
python start.py
```

Spelet öppnas i webbläsaren. Tryck **KÖR!** – eller skriv en annan ort i rutan och tryck **Generera värld**.
Världar sparas i `worlds/` så att de laddas direkt nästa gång.

Genväg: `.\start.ps1 "Falun"` / `python start.py "Falun"` genererar Falun direkt.

> Lägg gärna `-NoBrowser` / `--no-browser` till om du själv vill öppna `http://localhost:8000/game/`.

## Styrning

| | |
|---|---|
| W A S D / pilar | Kör |
| Mellanslag / musknapp | Skjut |
| Skift | Nitro |
| R | Starta om · Esc: meny |

Plocka upp lådor: **gul** = ammo, **vit/röd** = reparation, **blå** = nitro. Vatten är giftigt och bromsar. Var 6:e fiende är en tung "brute".

## Låt Claude Code eller Codex göra variationerna

Öppna mappen i Claude Code (eller Codex) och säg till på vanlig svenska:

- *"Gör en variant av Visby med vinterkänsla."*
- *"Byt tagline och färger till något mer grönt och giftigt."*
- *"Skapa musik och ljudeffekter till Falun-versionen."*

Agenten läser [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) och skillen `new-world`.

### Skills för bild, röst/ljud och musik

De tre skillsen är separata repon som inte ligger i det här projektet. Installera dem en gång:

```
.\tools\install-skills.ps1        # Windows
sh tools/install-skills.sh        # macOS / Linux
```

| Skill | Repo | Används till | Nyckel |
|---|---|---|---|
| Bild (`gemini-imagegen`) | [claude-code-imagegen-skill](https://github.com/fltman/claude-code-imagegen-skill) | `assets/images/title.png`, `ground.png` | `OPENROUTER_API_KEY` |
| ElevenLabs | [claude-code-elevenlabs-dialogue-skill](https://github.com/fltman/claude-code-elevenlabs-dialogue-skill) | ljud och röster i `assets/audio/` | `ELEVENLABS_API_KEY` |
| Suno | [claude-code-suno-musicgen-skill](https://github.com/fltman/claude-code-suno-musicgen-skill) | `assets/audio/music.mp3` | – (skriver prompt, du genererar på suno.com) |

Sätt nycklarna som miljövariabler, inte i chatten. Filer som spelet hittar automatiskt:

```
assets/audio/music | engine | shoot | explosion | pickup | hit   (.mp3 / .wav / .ogg)
assets/images/title.png    menybakgrund
assets/images/ground.png   sömlös markstruktur
```

Saknas en fil används syntetiskt ljud och enfärgad mark.

## Anpassa själv

`world.config.json`: ort, titel, tagline och färgpalett. Ingen kod behöver ändras.

## Valfritt: Blender

Spelet bygger världen direkt från `worlds/<ort>/world.json`. Vill du polera staden i Blender eller flytta den till en annan motor:

```
blender --background --python tools/blender_build.py -- worlds/rattvik/world.json out/rattvik.glb
```

(Exporten är ny och har inte testats mot en installerad Blender än.)

## Hur det fungerar

`game/osm.js` frågar Nominatim efter orten och Overpass efter kartobjekt, projicerar till meter runt centrum
och skriver `world.json`. `game/main.js` extruderar byggnader (30 % blir ruiner), lägger ut vägar och vatten,
strör döda träd över skogsytor och kör fysik, fiender och vågor. Se [CLAUDE.md](CLAUDE.md) för detaljer.

## Licens och data

Kod: MIT. Kartdata © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
Nominatim och Overpass är gratis delade tjänster – generera inte tusentals världar i en loop.
three.js (MIT) ligger i `game/vendor/`.
