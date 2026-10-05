---
name: new-world
description: Skapa en ny spelvariant av Wasteland Builder för en ort (t.ex. "gör Falun"). Genererar världen från OpenStreetMap, sätter titel/tagline/färger och valfritt musik, ljud och bilder.
---

# Ny värld för en ort

1. **Ort och storlek.** Fråga bara om orten saknas. Standardradie 700 m (450 liten, 1000 stor).
2. **Kolla först** om `worlds/<slug>/world.json` redan finns (spara på Overpass).
3. **Generera**, i den ordning som fungerar:
   - Node finns: `node tools/osm_to_world.mjs "<Ort>" --radius 700`
   - Annars: `.\start.ps1 "<Ort>"` (Windows) eller `python start.py "<Ort>"` – webbläsaren genererar och sparar.
4. **Kontrollera** resultatet (antal byggnader/vägar/vatten skrivs ut). Väldigt få byggnader (<50) → öka radien eller välj mer centralt namn ("Falun centrum").
5. **Anpassa i `world.config.json`:** `place`, `slug` (samma som mappen i `worlds/`), `title`, `tagline` på svenska med ortens egna riktmärken (sjö, berg, torg …), och `palette`:
   - öken/damm: orange/sand (standard) · tundra/snö: vit-blågrå mark, mörk skog · våtmark: grönbrun mark, giftgrön vatten.
6. **Valfria extrafiler** (kräver `tools/install-skills.*` och API-nycklar i miljön):
   - Musik: `suno-music`-skillen → stil + text om orten → användaren genererar på suno.com → `assets/audio/music.mp3`.
   - Ljud: `elevenlabs-skill` → `assets/audio/{shoot,explosion,engine,pickup,hit}.mp3`.
   - Bild: `gemini-imagegen` → `assets/images/title.png` (16:9, ortens siluett i postapokalyptisk stil) och `assets/images/ground.png` (sömlös sandstruktur).
7. **Testa:** starta spelet, välj världen, kör en runda. Rapportera vad som genererats och vilka filer som ändrats.

Håll det enkelt: användaren ska aldrig behöva redigera kod för att byta ort.
