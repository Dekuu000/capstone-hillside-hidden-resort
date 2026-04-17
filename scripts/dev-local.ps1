$ErrorActionPreference = "Stop"

param(
  [switch]$WithAi
)

$repoRoot = Split-Path -Parent $PSScriptRoot

function Start-DevWindow {
  param(
    [string]$Title,
    [string]$Command
  )

  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "$host.UI.RawUI.WindowTitle = '$Title'; cd '$repoRoot'; $Command"
  ) | Out-Null
}

Write-Host "Starting local Supabase, API, and Next dev processes..."
Start-DevWindow -Title "hillside-db" -Command "supabase start"
Start-DevWindow -Title "hillside-api" -Command "npm run dev:api"
Start-DevWindow -Title "hillside-next" -Command "npm run dev:next"

if ($WithAi) {
  Start-DevWindow -Title "hillside-ai" -Command "npm run dev:ai"
}

Write-Host "Done. Separate PowerShell windows were opened."
