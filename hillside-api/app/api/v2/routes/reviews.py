import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthContext, require_admin, require_authenticated
from app.integrations.supabase_client import (
    create_review,
    list_my_reviews,
    list_reviews_for_admin,
    set_review_hidden,
)
from app.schemas.common import (
    AdminReviewItem,
    AdminReviewsResponse,
    CreateReviewRequest,
    ModerateReviewRequest,
    MyReviewsResponse,
    ReviewItem,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", response_model=ReviewItem)
def submit_review(payload: CreateReviewRequest, auth: AuthContext = Depends(require_authenticated)):
    try:
        row = create_review(
            guest_user_id=auth.user_id,
            reservation_id=payload.reservation_id,
            rating=payload.rating,
            comment=payload.comment,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return ReviewItem(**row)


@router.get("/mine", response_model=MyReviewsResponse)
def my_reviews(auth: AuthContext = Depends(require_authenticated)):
    try:
        items = list_my_reviews(guest_user_id=auth.user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return MyReviewsResponse(items=[ReviewItem(**item) for item in items])


@router.get("/admin", response_model=AdminReviewsResponse)
def list_admin_reviews(auth: AuthContext = Depends(require_admin)):
    try:
        items = list_reviews_for_admin()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return AdminReviewsResponse(items=[AdminReviewItem(**item) for item in items])


@router.patch("/admin/{review_id}", response_model=AdminReviewItem)
def moderate_review(
    review_id: str,
    payload: ModerateReviewRequest,
    auth: AuthContext = Depends(require_admin),
):
    try:
        row = set_review_hidden(review_id=review_id, hidden=payload.is_hidden)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")
    return AdminReviewItem(**row)
