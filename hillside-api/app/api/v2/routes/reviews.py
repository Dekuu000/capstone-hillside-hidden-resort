import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthContext, require_authenticated
from app.integrations.supabase_client import create_review, list_my_reviews
from app.schemas.common import CreateReviewRequest, MyReviewsResponse, ReviewItem

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
