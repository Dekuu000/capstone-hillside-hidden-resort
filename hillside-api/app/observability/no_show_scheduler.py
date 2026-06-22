import asyncio
import logging

from app.core.config import settings
from app.integrations.supabase_client import mark_expired_no_shows

logger = logging.getLogger(__name__)


async def auto_no_show_loop() -> None:
    """Periodically flag confirmed bookings whose stay has ended without a check-in
    as no_show (deposit forfeited). Runs the synchronous Supabase call in a thread.
    The DB function uses FOR UPDATE SKIP LOCKED, so it's safe with multiple workers.
    """
    interval = max(300, int(settings.auto_no_show_interval_sec))
    grace = max(0, int(settings.auto_no_show_grace_days))
    logger.info(
        "Auto no-show scheduler started (interval_sec=%s, grace_days=%s).",
        interval,
        grace,
    )
    while True:
        try:
            flagged = await asyncio.to_thread(mark_expired_no_shows, grace_days=grace)
            if flagged:
                logger.info("Flagged %s no-show(s).", len(flagged))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive
            logger.exception("Auto no-show cycle failed.")
        await asyncio.sleep(interval)
