from fastapi import APIRouter

from app.api.v2.routes import ai, audit, auth, catalog, dashboard, escrow, me, nft, operations, payments, qr, reports, reservations, units

router = APIRouter(prefix="/v2")
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(me.router, prefix="/me", tags=["me"])
router.include_router(reservations.router, prefix="/reservations", tags=["reservations"])
router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
router.include_router(payments.router, prefix="/payments", tags=["payments"])
router.include_router(qr.router, prefix="/qr", tags=["qr"])
router.include_router(operations.router, tags=["operations"])
router.include_router(reports.router, prefix="/reports", tags=["reports"])
router.include_router(audit.router, prefix="/audit", tags=["audit"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
router.include_router(units.router, prefix="/units", tags=["units"])
router.include_router(ai.router, prefix="/ai", tags=["ai"])
router.include_router(escrow.router, prefix="/escrow", tags=["escrow"])
router.include_router(nft.router, prefix="/nft", tags=["nft"])
