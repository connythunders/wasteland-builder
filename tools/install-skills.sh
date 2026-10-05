#!/usr/bin/env sh
# Installs the image, ElevenLabs and Suno skills into .claude/ (needs git).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
for entry in \
  "image https://github.com/fltman/claude-code-imagegen-skill OPENROUTER_API_KEY" \
  "elevenlabs https://github.com/fltman/claude-code-elevenlabs-dialogue-skill ELEVENLABS_API_KEY" \
  "suno https://github.com/fltman/claude-code-suno-musicgen-skill none"; do
  set -- $entry
  git clone --depth 1 -q "$2" "$TMP/$1"
  for sub in skills agents; do
    [ -d "$TMP/$1/$sub" ] && mkdir -p "$ROOT/.claude/$sub" && cp -R "$TMP/$1/$sub/." "$ROOT/.claude/$sub/"
  done
  echo "Installed: $1 (key: $3)"
done
rm -rf "$TMP"
echo "Done. Restart Claude Code so it picks up the skills."
