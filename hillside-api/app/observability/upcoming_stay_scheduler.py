import asyncio
import logging

from app.core.config import settings
from app.integrations.supabase_client import emit_upcoming_stay_reminders

logger = logging.getLogger(__name__)


async def upcoming_stay_reminder_loop() -> None:
    """Periodically remind guests of stays/tours starting soon.

    Runs the (synchronous) Supabase scan in a thread so it never blocks the event
    loop. Reminders are deduped per reservation, so re-scanning is idempotent —
    safe even with multiple workers.
    """
    interval = max(300, int(settings.upcoming_stay_reminder_interval_sec))
    lookahead = max(1, int(settings.upcoming_stay_reminder_lookahead_days))
    logger.info(
        "Upcoming-stay reminder scheduler started (interval_sec=%s, lookahead_days=%s).",
        interval,
        lookahead,
    )
    while True:
        try:
            sent = await asyncio.to_thread(emit_upcoming_stay_reminders, lookahead_days=lookahead)
            if sent:
                logger.info("Emitted %s upcoming-stay reminder(s).", sent)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive
            logger.exception("Upcoming-stay reminder cycle failed.")
        await asyncio.sleep(interval)
