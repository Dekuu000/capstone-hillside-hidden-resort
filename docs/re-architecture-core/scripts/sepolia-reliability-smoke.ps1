param(
  [string]$ApiBaseUrl = "http://localhost:8000",
  [int]$LoopCount = 10,
  [string]$AdminToken = "",
  [string]$SupabaseUrl = "",
  [string]$SupabasePublishableKey = "",
  [string]$AdminEmail = "",
  [string]$AdminPassword = "",
  [string]$OutputPath = "docs/re-architecture-core/sepolia-reliability-report.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AdminToken {
  param(
    [string]$Url,
    [string]$Key,
    [string]$Email,
    [string]$Password
  )

  if ([string]::IsNullOrWhiteSpace($Url) -or
      [string]::IsNullOrWhiteSpace($Key) -or
      [string]::IsNullOrWhiteSpace($Email) -or
      [string]::IsNullOrWhiteSpace($Password)) {
    throw "Missing credentials. Provide -AdminToken or Supabase auth parameters."
  }

  $uri = "{0}/auth/v1/token?grant_type=password" -f $Url.TrimEnd("/")
  $body = @{
    email = $Email
    password = $Password
  } | ConvertTo-Json

  $auth = Invoke-RestMethod -Method POST -Uri $uri -Headers @{
    apikey = $Key
    "Content-Type" = "application/json"
  } -Body $body

  if (-not $auth.access_token) {
    throw "Failed to resolve admin token from Supabase auth."
  }
  return [string]$auth.access_token
}

function Get-Percentile {
  param(
    [double[]]$Values,
    [double]$Percent
  )
  if (-not $Values -or $Values.Count -eq 0) { return 0.0 }
  $sorted = $Values | Sort-Object
  $idx = [math]::Ceiling(($Percent / 100.0) * $sorted.Count) - 1
  if ($idx -lt 0) { $idx = 0 }
  if ($idx -ge $sorted.Count) { $idx = $sorted.Count - 1 }
  return [math]::Round([double]$sorted[$idx], 2)
}

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  $AdminToken = Get-AdminToken -Url $SupabaseUrl -Key $SupabasePublishableKey -Email $AdminEmail -Password $AdminPassword
}

$headers = @{ Authorization = "Bearer $AdminToken" }

$health = Invoke-RestMethod -Method GET -Uri ("{0}/health" -f $ApiBaseUrl.TrimEnd("/"))
if ($health.service -ne "hillside-api") {
  throw ("Unexpected health service on {0}: {1}" -f $ApiBaseUrl, $health.service)
}
if (-not $health.active_chain -or $health.active_chain.key -ne "sepolia") {
  throw "Active chain is not sepolia. This smoke is intended for Sepolia reliability runs."
}

$services = Invoke-RestMethod -Method GET -Uri ("{0}/v2/catalog/services" -f $ApiBaseUrl.TrimEnd("/")) -Headers $headers
if (-not $services.items -or $services.items.Count -eq 0) {
  throw "No active services returned by /v2/catalog/services."
}
$serviceId = [string]$services.items[0].service_id

$runs = @()
for ($i = 1; $i -le $LoopCount; $i++) {
  $run = [ordered]@{
    run = $i
    started_at = (Get-Date).ToString("o")
    reservation_id = $null
    reservation_code = $null
    create_ok = $false
    guest_pass_ok = $false
    checkin_ok = $false
    reconciliation_alert = $null
    create_ms = 0.0
    verify_ms = 0.0
    checkin_ms = 0.0
    error = $null
  }

  try {
    $visitDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
    $createBody = @{
      service_id = $serviceId
      visit_date = $visitDate
      adult_qty = 1
      kid_qty = 0
      is_advance = $true
    } | ConvertTo-Json

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $created = Invoke-RestMethod -Method POST -Uri ("{0}/v2/reservations/tours" -f $ApiBaseUrl.TrimEnd("/")) -Headers $headers -ContentType "application/json" -Body $createBody
    $sw.Stop()
    $run.create_ms = [math]::Round($sw.Elapsed.TotalMilliseconds, 2)
    $run.create_ok = $true
    $run.reservation_id = [string]$created.reservation_id
    $run.reservation_code = [string]$created.reservation_code

    $sw.Restart()
    $guestPass = Invoke-RestMethod -Method GET -Uri ("{0}/v2/nft/guest-pass/{1}" -f $ApiBaseUrl.TrimEnd("/"), $run.reservation_id) -Headers $headers
    $sw.Stop()
    $run.verify_ms = [math]::Round($sw.Elapsed.TotalMilliseconds, 2)
    $run.guest_pass_ok = [bool]$guestPass.minted -and [bool]$guestPass.onchain_valid -and -not [string]::IsNullOrWhiteSpace([string]$guestPass.tx_hash)
    if (-not $run.guest_pass_ok) {
      throw "Guest pass verify failed."
    }

    $checkinBody = @{
      reservation_id = $run.reservation_id
      scanner_id = "sepolia-reliability-smoke"
      override_reason = "Automated Sepolia reliability check."
    } | ConvertTo-Json

    $sw.Restart()
    $checkin = Invoke-RestMethod -Method POST -Uri ("{0}/v2/checkins" -f $ApiBaseUrl.TrimEnd("/")) -Headers $headers -ContentType "application/json" -Body $checkinBody
    $sw.Stop()
    $run.checkin_ms = [math]::Round($sw.Elapsed.TotalMilliseconds, 2)
    $run.checkin_ok = ([string]$checkin.status -eq "checked_in")
    if (-not $run.checkin_ok) {
      throw "Check-in did not return checked_in."
    }

    $null = Invoke-RestMethod -Method POST -Uri ("{0}/v2/escrow/reconciliation-monitor/run" -f $ApiBaseUrl.TrimEnd("/")) -Headers $headers
    $monitor = Invoke-RestMethod -Method GET -Uri ("{0}/v2/escrow/reconciliation-monitor" -f $ApiBaseUrl.TrimEnd("/")) -Headers $headers
    $run.reconciliation_alert = [bool]$monitor.alert_active
  }
  catch {
    $run.error = $_.Exception.Message
  }
  finally {
    $run.ended_at = (Get-Date).ToString("o")
    $runs += [pscustomobject]$run
  }
}

$successRuns = $runs | Where-Object {
  $_.create_ok -and $_.guest_pass_ok -and $_.checkin_ok -and $_.reconciliation_alert -eq $false
}
$latencyValues = @()
foreach ($item in $successRuns) {
  $latencyValues += ([double]$item.create_ms + [double]$item.verify_ms + [double]$item.checkin_ms)
}

$report = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  api_base_url = $ApiBaseUrl
  loop_count = $LoopCount
  success_count = $successRuns.Count
  success_rate = if ($LoopCount -gt 0) { [math]::Round(($successRuns.Count / $LoopCount) * 100.0, 2) } else { 0.0 }
  latency_ms = @{
    p50 = Get-Percentile -Values $latencyValues -Percent 50
    p95 = Get-Percentile -Values $latencyValues -Percent 95
  }
  health_snapshot = $health
  runs = $runs
}

$parent = Split-Path -Path $OutputPath -Parent
if (-not [string]::IsNullOrWhiteSpace($parent) -and -not (Test-Path $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding UTF8

Write-Host ("Sepolia reliability smoke complete: {0}/{1} successful ({2}%)." -f $report.success_count, $report.loop_count, $report.success_rate)
Write-Host ("Latency p50={0} ms p95={1} ms" -f $report.latency_ms.p50, $report.latency_ms.p95)
Write-Host ("Report written to {0}" -f $OutputPath)
