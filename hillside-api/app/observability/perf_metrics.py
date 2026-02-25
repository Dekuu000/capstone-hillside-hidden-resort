from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from math import ceil
from threading import Lock
from typing import Any


def _percentile(values: list[float], pct: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, ceil((pct / 100) * len(ordered)) - 1))
    return ordered[index]


def _summarize(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"count": 0, "avg_ms": 0.0, "p50_ms": 0.0, "p95_ms": 0.0, "last_ms": 0.0}
    return {
        "count": len(values),
        "avg_ms": round(sum(values) / len(values), 2),
        "p50_ms": round(_percentile(values, 50), 2),
        "p95_ms": round(_percentile(values, 95), 2),
        "last_ms": round(values[-1], 2),
    }


class PerformanceMetrics:
    def __init__(self, *, max_samples: int = 200) -> None:
        self._max_samples = max_samples
        self._lock = Lock()
        self._api_store: dict[str, deque[float]] = defaultdict(
            lambda: deque(maxlen=self._max_samples)
        )
        self._db_store: dict[str, deque[float]] = defaultdict(
            lambda: deque(maxlen=self._max_samples)
        )

    def record_api(self, key: str, duration_ms: float) -> None:
        self._record(self._api_store, key, duration_ms)

    def record_db(self, key: str, duration_ms: float) -> None:
        self._record(self._db_store, key, duration_ms)

    def get_api_summary(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            values = list(self._api_store.get(key, []))
        if not values:
            return None
        return _summarize(values)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            api_snapshot = {key: _summarize(list(values)) for key, values in self._api_store.items()}
            db_snapshot = {key: _summarize(list(values)) for key, values in self._db_store.items()}
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "api": api_snapshot,
            "db": db_snapshot,
        }

    def clear(self) -> None:
        with self._lock:
            self._api_store.clear()
            self._db_store.clear()

    def _record(self, store: dict[str, deque[float]], key: str, duration_ms: float) -> None:
        with self._lock:
            store[key].append(float(duration_ms))


perf_metrics = PerformanceMetrics()
