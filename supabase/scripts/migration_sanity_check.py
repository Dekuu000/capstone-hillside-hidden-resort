from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

REQUIRED_FILES = {
    "supabase/migrations/20260218_001_payment_submission_only.sql": [
        r"CREATE OR REPLACE FUNCTION public\.create_tour_reservation_atomic",
        r"CREATE OR REPLACE FUNCTION public\.submit_payment_proof",
        r"CREATE OR REPLACE FUNCTION public\.verify_payment",
    ],
    "supabase/migrations/20260221_002_security_hardening.sql": [
        r"CREATE OR REPLACE FUNCTION public\.handle_new_user",
        r"CREATE OR REPLACE FUNCTION public\.prevent_non_admin_role_change",
        r"ALTER TABLE public\.qr_tokens ENABLE ROW LEVEL SECURITY",
    ],
    "supabase/migrations/20260221_003_policy_cleanup.sql": [
        r"DROP POLICY IF EXISTS \"users_can_insert_own_profile\" ON public\.users;",
        r"DROP POLICY IF EXISTS \"units_read_active\" ON public\.units;",
    ],
    "supabase/migrations/20260223_001_guest_pass_nft.sql": [
        r"ADD COLUMN IF NOT EXISTS guest_pass_token_id",
        r"ADD COLUMN IF NOT EXISTS guest_pass_tx_hash",
    ],
    "supabase/migrations/20260223_002_ai_forecasts.sql": [
        r"CREATE TABLE IF NOT EXISTS public\.ai_forecasts",
        r"CREATE POLICY \"admins_read_ai_forecasts\"",
    ],
}


def main() -> int:
    missing_files: list[str] = []
    missing_patterns: dict[str, list[str]] = {}

    for rel_path, patterns in REQUIRED_FILES.items():
        target = ROOT / rel_path
        if not target.exists():
            missing_files.append(rel_path)
            continue

        text = target.read_text(encoding="utf-8")
        for pattern in patterns:
            if not re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE):
                missing_patterns.setdefault(rel_path, []).append(pattern)

    result = {
        "ok": not missing_files and not missing_patterns,
        "checked_files": len(REQUIRED_FILES),
        "missing_files": missing_files,
        "missing_patterns": missing_patterns,
    }

    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
