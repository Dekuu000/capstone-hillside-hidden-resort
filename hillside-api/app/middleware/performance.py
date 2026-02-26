from time import perf_counter

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.observability.perf_metrics import perf_metrics

MONITORED_PATH_PREFIXES = ("/v2/",)
MONITORED_PATH_EXACT: set[str] = set()


def _is_monitored_path(path: str) -> bool:
    return path in MONITORED_PATH_EXACT or any(
        path.startswith(prefix) for prefix in MONITORED_PATH_PREFIXES
    )


class ApiPerformanceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not _is_monitored_path(path):
            return await call_next(request)

        start = perf_counter()
        response: Response = await call_next(request)
        latency_ms = (perf_counter() - start) * 1000

        route = request.scope.get("route")
        route_path = getattr(route, "path", path) if route else path
        metric_key = f"{request.method.upper()} {route_path}"

        perf_metrics.record_api(metric_key, latency_ms)
        response.headers["x-api-latency-ms"] = f"{latency_ms:.2f}"

        summary = perf_metrics.get_api_summary(metric_key)
        if summary:
            response.headers["x-api-latency-p95-ms"] = f"{summary['p95_ms']:.2f}"
            response.headers["x-api-sample-count"] = str(summary["count"])

        return response
