import pytest
from fastapi import HTTPException, status

from app.api.v2.routes._http_errors import raise_http_from_runtime_error, runtime_error_status


def test_runtime_error_status_maps_not_configured_to_service_unavailable() -> None:
    code = runtime_error_status(
        RuntimeError("Supabase client is not configured"),
        default_status=status.HTTP_400_BAD_REQUEST,
    )
    assert code == status.HTTP_503_SERVICE_UNAVAILABLE


def test_runtime_error_status_uses_default_for_other_errors() -> None:
    code = runtime_error_status(
        RuntimeError("Invalid reservation payload"),
        default_status=status.HTTP_400_BAD_REQUEST,
    )
    assert code == status.HTTP_400_BAD_REQUEST


def test_raise_http_from_runtime_error_preserves_message() -> None:
    with pytest.raises(HTTPException) as exc_info:
        raise_http_from_runtime_error(
            RuntimeError("Invalid reservation payload"),
            default_status=status.HTTP_400_BAD_REQUEST,
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == "Invalid reservation payload"
