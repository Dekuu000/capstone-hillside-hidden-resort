from typing import Any, NoReturn

from fastapi import HTTPException, status

ERROR_CODE_BY_STATUS: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: "bad_request",
    status.HTTP_401_UNAUTHORIZED: "unauthorized",
    status.HTTP_403_FORBIDDEN: "forbidden",
    status.HTTP_404_NOT_FOUND: "not_found",
    status.HTTP_409_CONFLICT: "conflict",
    getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422): "unprocessable_content",
    status.HTTP_429_TOO_MANY_REQUESTS: "rate_limited",
    status.HTTP_500_INTERNAL_SERVER_ERROR: "internal_error",
    status.HTTP_503_SERVICE_UNAVAILABLE: "service_unavailable",
}


class ApiHttpError(HTTPException):
    def __init__(
        self,
        *,
        status_code: int,
        detail: str,
        code: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code or default_error_code(status_code)
        self.context = context or {}


def default_error_code(status_code: int) -> str:
    return ERROR_CODE_BY_STATUS.get(status_code, "http_error")


def build_http_error_payload(
    *,
    status_code: int,
    detail: object,
    code: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, object]:
    if isinstance(detail, str):
        message = detail
    else:
        message = str(detail)
    return {
        "detail": message,
        "code": code or default_error_code(status_code),
        "context": context or {},
    }


def raise_api_http_error(
    *,
    status_code: int,
    detail: str,
    code: str | None = None,
    context: dict[str, Any] | None = None,
) -> NoReturn:
    raise ApiHttpError(
        status_code=status_code,
        detail=detail,
        code=code,
        context=context,
    )


def runtime_error_status(exc: RuntimeError, *, default_status: int) -> int:
    message = str(exc).lower()
    if "not configured" in message:
        return status.HTTP_503_SERVICE_UNAVAILABLE
    return default_status


def raise_http_from_runtime_error(
    exc: RuntimeError,
    *,
    default_status: int,
    default_code: str | None = None,
    context: dict[str, Any] | None = None,
) -> NoReturn:
    status_code = runtime_error_status(exc, default_status=default_status)
    code = default_code or default_error_code(status_code)
    if status_code == status.HTTP_503_SERVICE_UNAVAILABLE:
        code = default_error_code(status_code)
    raise ApiHttpError(
        status_code=status_code,
        detail=str(exc),
        code=code,
        context=context,
    ) from exc
