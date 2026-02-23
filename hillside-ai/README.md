# hillside-ai

Local AI pricing inference service for Hillside V2.

## Endpoints

- `GET /health`
- `POST /v1/pricing/recommendation`
- `POST /v1/occupancy/forecast`

Request body:

```json
{
  "reservation_id": "optional-id",
  "context": {
    "total_amount": 1200,
    "nights": 1,
    "party_size": 2,
    "unit_count": 1,
    "is_weekend": true,
    "is_tour": false
  }
}
```

Response body:

```json
{
  "recommendation": {
    "reservation_id": "optional-id",
    "pricing_adjustment": 20.0,
    "confidence": 0.78,
    "explanations": ["Live model used (heuristic v1).", "Weekend uplift applied."]
  },
  "model_version": "heuristic-v1",
  "source": "hillside-ai"
}
```

## Local run

```bash
cd hillside-ai
python -m venv .venv
.venv\\Scripts\\activate
pip install -e .
uvicorn app.main:app --reload --port 8100
```

## Quick smoke test (PowerShell)

```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:8100/v1/pricing/recommendation" `
  -ContentType "application/json" `
  -Body (@{
    reservation_id = "demo-1"
    context = @{
      total_amount = 1200
      nights = 1
      party_size = 3
      unit_count = 1
      is_weekend = $true
      is_tour = $false
    }
  } | ConvertTo-Json -Depth 5)
```

```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:8100/v1/occupancy/forecast" `
  -ContentType "application/json" `
  -Body (@{
    start_date = "2026-02-24"
    horizon_days = 7
    history = @(
      @{ date = "2026-02-17"; occupancy = 11 }
      @{ date = "2026-02-18"; occupancy = 9 }
      @{ date = "2026-02-19"; occupancy = 10 }
      @{ date = "2026-02-20"; occupancy = 13 }
      @{ date = "2026-02-21"; occupancy = 14 }
    )
  } | ConvertTo-Json -Depth 5)
```
