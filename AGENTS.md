# Wasteland Builder – instruktioner för Codex och andra agenter

Läs **CLAUDE.md** – den gäller även dig (arkitektur, kommandon, regler). Kort version:

- Byt ort: `node tools/osm_to_world.mjs "Ort" --radius 700` (skapar `worlds/<slug>/world.json`),
  sätt sedan `place`, `slug`, `title`, `tagline` i `world.config.json`. Följ stegen i
  `.claude/skills/new-world/SKILL.md`.
- Ändra utseende via `palette` i `world.config.json`.
- Ljud/bild/musik: läs `SKILL.md` i `.claude/skills/*` efter `tools/install-skills.sh` (eller `.ps1`) och kör skripten där.
  Lägg resultatet i `assets/audio/` och `assets/images/` (filnamn, se CLAUDE.md).
- Starta: `python start.py` eller `.\start.ps1`. Öppna `http://localhost:8000/game/`.
