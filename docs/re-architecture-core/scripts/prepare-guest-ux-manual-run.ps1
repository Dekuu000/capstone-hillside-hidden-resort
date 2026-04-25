param(
  [string]$Tester = "TBD",
  [switch]$OpenFolder
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$evidenceDir = Join-Path $repoRoot "docs\re-architecture-core\evidence\guest-ux"
$templatePath = Join-Path $evidenceDir "manual-run-template.md"

if (-not (Test-Path $templatePath)) {
  Write-Error "Template not found: $templatePath"
  exit 1
}

New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$dateValue = Get-Date -Format "yyyy-MM-dd"
$outputPath = Join-Path $evidenceDir ("manual-run-{0}.md" -f $timestamp)

$content = Get-Content $templatePath -Raw
$content = $content -replace "(?m)^Date:\s*YYYY-MM-DD\s*$", ("Date: {0}" -f $dateValue)
$content = $content -replace "(?m)^Tester:\s*$", ("Tester: {0}" -f $Tester)

Set-Content -Path $outputPath -Value $content -Encoding UTF8

Write-Host "Created manual run file:"
Write-Host $outputPath
Write-Host ""
Write-Host "Next:"
Write-Host "1) Open the file and fill scenario rows while testing."
Write-Host "2) Save screenshots in docs/re-architecture-core/evidence/guest-ux/."
Write-Host "3) Link screenshot names in the Evidence File column."

if ($OpenFolder) {
  Start-Process explorer.exe $evidenceDir
}
