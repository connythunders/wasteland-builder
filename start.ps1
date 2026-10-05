# Startar spelet lokalt (Windows, inget att installera).
#   .\start.ps1                 -> öppnar spelet
#   .\start.ps1 "Falun"         -> genererar en ny värld av Falun direkt
param([string]$Place = "", [int]$Port = 8000, [switch]$NoBrowser)

$root = $PSScriptRoot
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css"; ".json"="application/json"; ".png"="image/png"; ".jpg"="image/jpeg"; ".webp"="image/webp"; ".mp3"="audio/mpeg"; ".wav"="audio/wav"; ".ogg"="audio/ogg"; ".glb"="model/gltf-binary" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "Port $Port är upptagen. Prova: .\start.ps1 -Port 8001"; exit 1 }

$url = "http://localhost:$Port/game/"
if ($Place) { $url += "?place=" + [uri]::EscapeDataString($Place) }
Write-Host "Wasteland Builder kör på $url  (Ctrl+C för att avsluta)"
if (-not $NoBrowser) { Start-Process $url }

while ($listener.IsListening) {
    $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response
    try {
        $path = [uri]::UnescapeDataString($req.Url.AbsolutePath)
        if ($req.HttpMethod -eq "POST" -and $path -eq "/api/save") {
            $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd() | ConvertFrom-Json
            $rel = $body.path
            if ($rel -notmatch '^worlds/[A-Za-z0-9_\-/]+\.json$' -or $rel -match '\.\.') { $res.StatusCode = 400 }
            else {
                $dest = Join-Path $root $rel
                New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
                [IO.File]::WriteAllText($dest, $body.content, (New-Object Text.UTF8Encoding($false)))
                $res.StatusCode = 200
            }
        } else {
            if ($path -eq "/") { $path = "/game/index.html" }
            $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart("/")))
            if ($path.EndsWith("/")) { $file = Join-Path $file "index.html" }
            if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($file)
                $ext = [IO.Path]::GetExtension($file).ToLower()
                $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
                $res.Headers.Add("Cache-Control", "no-store")
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else { $res.StatusCode = 404 }
        }
    } catch { $res.StatusCode = 500 }
    finally { $res.Close() }
}
