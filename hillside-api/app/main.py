import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v2.router import router as v2_router
from app.api.v2.routes._http_errors import ApiHttpError, build_http_error_payload, default_error_code
from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.middleware.correlation import CorrelationIdMiddleware
from app.middleware.performance import ApiPerformanceMiddleware
from app.observability.escrow_reconciliation_monitor import (
    escrow_reconciliation_scheduler_loop,
    get_escrow_reconciliation_monitor_snapshot,
)

logger = logging.getLogger(__name__)
_escrow_reconciliation_task: asyncio.Task | None = None


async def _start_escrow_reconciliation_scheduler() -> None:
    global _escrow_reconciliation_task
    if settings.feature_escrow_reconciliation_scheduler and _escrow_reconciliation_task is None:
        _escrow_reconciliation_task = asyncio.create_task(escrow_reconciliation_scheduler_loop())
        logger.info("Started escrow reconciliation scheduler task.")


async def _stop_escrow_reconciliation_scheduler() -> None:
    global _escrow_reconciliation_task
    task = _escrow_reconciliation_task
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    _escrow_reconciliation_task = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    await _start_escrow_reconciliation_scheduler()
    try:
        yield
    finally:
        await _stop_escrow_reconciliation_scheduler()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(ApiPerformanceMiddleware)

cors_origins = [
    origin.strip()
    for origin in settings.api_cors_allowed_origins.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["http://localhost:5173"],
    allow_credentials=settings.api_cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.include_router(v2_router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    correlation_id = getattr(request.state, "correlation_id", None)
    if isinstance(exc, ApiHttpError):
        payload = build_http_error_payload(
            status_code=exc.status_code,
            detail=exc.detail,
            code=exc.code,
            context={**exc.context, **({"correlation_id": correlation_id} if correlation_id else {})},
        )
    else:
        payload = build_http_error_payload(
            status_code=exc.status_code,
            detail=exc.detail,
            code=default_error_code(exc.status_code),
            context={"correlation_id": correlation_id} if correlation_id else {},
        )
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.get("/health")
def health():
    chain_registry = get_chain_registry()
    active_chain = get_active_chain()
    monitor = get_escrow_reconciliation_monitor_snapshot()
    return {
        "ok": True,
        "service": settings.app_name,
        "env": settings.app_env,
        "api_version": settings.api_version,
        "supabase_configured": bool(
            settings.supabase_url and settings.supabase_service_role_key
        ),
        "escrow_shadow_write_enabled": settings.feature_escrow_shadow_write,
        "escrow_onchain_lock_enabled": settings.feature_escrow_onchain_lock,
        "nft_guest_pass_enabled": settings.feature_nft_guest_pass,
        "dynamic_qr_enabled": settings.feature_dynamic_qr,
        "escrow_reconciliation_scheduler_enabled": settings.feature_escrow_reconciliation_scheduler,
        "escrow_reconciliation_monitor": {
            "running": bool(monitor.get("running")),
            "last_success_at": monitor.get("last_success_at"),
            "alert_active": bool(monitor.get("alert_active")),
        },
        "active_chain": {
            "key": active_chain.key,
            "chain_id": active_chain.chain_id,
            "rpc_configured": bool(active_chain.rpc_url),
            "contract_configured": bool(active_chain.escrow_contract_address),
            "guest_pass_contract_configured": bool(active_chain.guest_pass_contract_address),
        },
        "chains": {
            key: {
                "chain_id": value.chain_id,
                "enabled": value.enabled,
                "rpc_configured": bool(value.rpc_url),
                "contract_configured": bool(value.escrow_contract_address),
                "guest_pass_contract_configured": bool(value.guest_pass_contract_address),
            }
            for key, value in chain_registry.items()
        },
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    correlation_id = getattr(request.state, "correlation_id", "n/a")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": str(exc),
                "details": {},
                "correlation_id": correlation_id,
            }
        },
    )
