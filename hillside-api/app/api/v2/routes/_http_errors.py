from typing import NoReturn

from fastapi import HTTPException, status


def runtime_error_status(exc: RuntimeError, *, default_status: int) -> int:
    message = str(exc).lower()
    if "not configured" in message:
        return status.HTTP_503_SERVICE_UNAVAILABLE
    return default_status


def raise_http_from_runtime_error(exc: RuntimeError, *, default_status: int) -> NoReturn:
    raise HTTPException(
        status_code=runtime_error_status(exc, default_status=default_status),
        detail=str(exc),
    ) from exc
