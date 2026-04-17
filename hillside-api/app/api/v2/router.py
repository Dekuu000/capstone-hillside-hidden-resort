from fastapi import APIRouter

from app.api.v2.routes import (
    admin_services,
    ai,
    audit,
    auth,
    catalog,
    dashboard,
    escrow,
    guest_services,
    me,
    nft,
    operations,
    payments,
    qr,
    reports,
    reservations,
    sync,
    units,
)

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
router.include_router(guest_services.router, prefix="/guest/services", tags=["guest-services"])
router.include_router(admin_services.router, prefix="/admin/services", tags=["admin-services"])
router.include_router(sync.router, tags=["sync"])
