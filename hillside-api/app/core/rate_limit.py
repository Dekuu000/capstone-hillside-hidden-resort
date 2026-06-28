"""Lightweight in-process rate limiting for abuse-prone endpoints.

No external dependency (no slowapi / Redis): a fixed-window counter per
(method, path, client-ip), kept in process memory. The app runs on a single
Render free-tier worker, so per-process state is the whole picture; if it ever
scales to multiple workers this degrades to per-worker limits — still a useful
backstop. Only a small allow-list of sensitive endpoints is limited (auth token
exchange, promo-code validation, QR issue/verify, the payment webhook); every
other request passes straight through with negligible overhead.
"""
from __future__ import annotations

import time
from collections import deque
from threading import Lock

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

_WINDOW_SECONDS = 60


def _rules() -> dict[tuple[str, str], int]:
    """(method, path) -> max requests per minute. Read from settings so the caps
    are env-tunable. Brute-forceable / floodable endpoints only."""
    return {
        ("POST", "/v2/auth/session"): settings.rate_limit_auth_per_min,
        ("POST", "/v2/promos/validate"): settings.rate_limit_promo_per_min,
        ("POST", "/v2/qr/issue"): settings.rate_limit_qr_per_min,
        ("POST", "/v2/qr/verify"): settings.rate_limit_qr_per_min,
        # Webhook is signature-verified (forgery is already blocked); the cap only
        # guards against a flood, so it is deliberately generous to never drop a
        # legitimate PayMongo delivery.
        ("POST", "/v2/payments/webhooks/provider"): settings.rate_limit_webhook_per_min,
    }


_buckets: dict[str, deque[float]] = {}
_lock = Lock()


def _client_ip(request: Request) -> str:
    # Behind Render's proxy the real client is the first X-Forwarded-For hop.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.feature_rate_limiting:
            return await call_next(request)

        limit = _rules().get((request.method, request.url.path))
        if not limit or limit <= 0:
            return await call_next(request)

        now = time.monotonic()
        cutoff = now - _WINDOW_SECONDS
        key = f"{request.method}:{request.url.path}:{_client_ip(request)}"
        with _lock:
            bucket = _buckets.setdefault(key, deque())
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(_WINDOW_SECONDS - (now - bucket[0])))
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                    content={
                        "detail": "Too many requests. Please slow down and try again shortly.",
                        "code": "rate_limited",
                    },
                )
            bucket.append(now)
            # Keep the registry from growing unbounded: drop fully-drained buckets.
            if not bucket:
                _buckets.pop(key, None)
        return await call_next(request)
