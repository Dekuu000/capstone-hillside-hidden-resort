import asyncio
import logging

from app.core.config import settings
from app.integrations.supabase_client import prune_read_notifications

logger = logging.getLogger(__name__)


async def notification_retention_loop() -> None:
    """Periodically delete read notifications older than the retention window so
    the notifications table doesn't grow without bound. Unread notifications are
    never pruned, regardless of age.

    Runs the synchronous Supabase call in a thread so it never blocks the event
    loop. The DELETE is idempotent, so it's safe to run with multiple workers.
    """
    interval = max(3600, int(settings.notification_retention_interval_sec))
    days = max(1, int(settings.notification_retention_days))
    logger.info(
        "Notification retention scheduler started (interval_sec=%s, retention_days=%s).",
        interval,
        days,
    )
    while True:
        try:
            deleted = await asyncio.to_thread(prune_read_notifications, retention_days=days)
            if deleted:
                logger.info("Pruned %s read notification(s) older than %s days.", deleted, days)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive
            logger.exception("Notification retention cycle failed.")
        await asyncio.sleep(interval)
