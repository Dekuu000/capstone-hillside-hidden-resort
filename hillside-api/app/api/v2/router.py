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
    notifications,
    operations,
    payments,
    promos,
    qr,
    reports,
    reservations,
    reviews,
    sync,
    team,
    units,
)

router = APIRouter(prefix="/v2")
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(me.router, prefix="/me", tags=["me"])
router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
router.include_router(reservations.router, prefix="/reservations", tags=["reservations"])
router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
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
router.include_router(team.router, prefix="/admin/team", tags=["team"])
router.include_router(promos.router, prefix="/promos", tags=["promos"])
router.include_router(promos.admin_router, prefix="/admin/promos", tags=["admin-promos"])
router.include_router(sync.router, tags=["sync"])
