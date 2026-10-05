#!/usr/bin/env python3
"""Start the game locally (Python 3, standard library only).

    python start.py             open the game
    python start.py "Falun"     generate a new world of Falun straight away
"""
import argparse, json, re, sys, threading, urllib.parse, webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/":
            self.send_response(302); self.send_header("Location", "/game/"); self.end_headers(); return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/save":
            self.send_error(404); return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        rel = body.get("path", "")
        if not re.fullmatch(r"worlds/[A-Za-z0-9_\-/]+\.json", rel) or ".." in rel:
            self.send_error(400); return
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(body["content"], encoding="utf-8")
        self.send_response(200); self.end_headers()

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("place", nargs="?", default="")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    url = f"http://localhost:{args.port}/game/"
    if args.place:
        url += "?place=" + urllib.parse.quote(args.place)
    try:
        server = ThreadingHTTPServer(("localhost", args.port), Handler)
    except OSError:
        sys.exit(f"Port {args.port} är upptagen. Prova: python start.py --port {args.port + 1}")
    print(f"Wasteland Builder kör på {url}  (Ctrl+C för att avsluta)")
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
