import asyncio
import logging

from app.core.config import settings
from app.integrations.supabase_client import release_expired_holds

logger = logging.getLogger(__name__)


async def release_expired_holds_loop() -> None:
    """Periodically cancel unpaid (expired) holds so held units/slots free up.

    Runs the synchronous Supabase call in a thread so it never blocks the event
    loop. The DB function uses FOR UPDATE SKIP LOCKED, so it's safe to run with
    multiple workers.
    """
    interval = max(60, int(settings.release_expired_holds_interval_sec))
    window = max(1, int(settings.release_expired_holds_window_min))
    logger.info(
        "Expired-hold release scheduler started (interval_sec=%s, window_min=%s).",
        interval,
        window,
    )
    while True:
        try:
            released = await asyncio.to_thread(release_expired_holds, window_minutes=window)
            if released:
                logger.info("Released %s expired hold(s).", len(released))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive
            logger.exception("Expired-hold release cycle failed.")
        await asyncio.sleep(interval)
