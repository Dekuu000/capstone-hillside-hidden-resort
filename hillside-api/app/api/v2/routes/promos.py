import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthContext, require_admin, require_authenticated
from app.integrations.supabase_client import (
    create_promo,
    list_promos,
    update_promo,
    validate_promo_code,
)
from app.schemas.common import (
    CreatePromoRequest,
    PromoCode,
    PromoListResponse,
    PromoValidateRequest,
    PromoValidationResult,
    UpdatePromoRequest,
)

logger = logging.getLogger(__name__)

# Guest-facing: preview a code against a draft total.
router = APIRouter()
# Back-office: manage promo codes (Manager + System Admin).
admin_router = APIRouter()


@router.post("/validate", response_model=PromoValidationResult)
def validate_promo(payload: PromoValidateRequest, auth: AuthContext = Depends(require_authenticated)):
    try:
        result = validate_promo_code(
            code=payload.code, total=payload.total, user_id=auth.user_id, kind=payload.kind
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return PromoValidationResult(**result)


@admin_router.get("", response_model=PromoListResponse)
def get_promos(auth: AuthContext = Depends(require_admin)):
    try:
        items = list_promos()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return PromoListResponse(items=[PromoCode(**item) for item in items])


@admin_router.post("", response_model=PromoCode, status_code=status.HTTP_201_CREATED)
def add_promo(payload: CreatePromoRequest, auth: AuthContext = Depends(require_admin)):
    try:
        row = create_promo(actor_user_id=auth.user_id, payload=payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return PromoCode(**row)


@admin_router.patch("/{promo_id}", response_model=PromoCode)
def edit_promo(promo_id: str, payload: UpdatePromoRequest, auth: AuthContext = Depends(require_admin)):
    try:
        row = update_promo(promo_id=promo_id, patch=payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return PromoCode(**row)
