# Installerar bild-, ElevenLabs- och Suno-skillsen i .claude/ (kräver git).
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $PSScriptRoot "skills.json") -Raw | ConvertFrom-Json
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("wb-skills-" + [guid]::NewGuid())
foreach ($r in $cfg.repos) {
    $dir = Join-Path $tmp $r.name
    git clone --depth 1 -q $r.url $dir
    foreach ($sub in "skills", "agents") {
        $from = Join-Path $dir $sub
        if (Test-Path $from) {
            $to = Join-Path $root ".claude\$sub"
            New-Item -ItemType Directory -Force $to | Out-Null
            Copy-Item "$from\*" $to -Recurse -Force
        }
    }
    Write-Host "Installerad: $($r.name)  (nyckel: $($r.needs))"
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Klart. Starta om Claude Code så hittar den skillsen."
