from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

REQUIRED_GROUPS = {
    "payment_submission_lifecycle": [
        r"CREATE OR REPLACE FUNCTION public\.create_tour_reservation_atomic",
        r"CREATE OR REPLACE FUNCTION public\.submit_payment_proof",
        r"CREATE OR REPLACE FUNCTION public\.verify_payment",
    ],
    "security_hardening": [
        r"CREATE OR REPLACE FUNCTION public\.handle_new_user",
        r"CREATE OR REPLACE FUNCTION public\.prevent_non_admin_role_change",
        r"ALTER TABLE public\.qr_tokens ENABLE ROW LEVEL SECURITY",
    ],
    "policy_cleanup": [
        r"DROP POLICY IF EXISTS \"users_can_insert_own_profile\" ON public\.users;",
        r"DROP POLICY IF EXISTS \"units_read_active\" ON public\.units;",
    ],
    "guest_pass_nft": [
        r"ADD COLUMN IF NOT EXISTS guest_pass_token_id",
        r"ADD COLUMN IF NOT EXISTS guest_pass_tx_hash",
    ],
    "ai_forecasts": [
        r"CREATE TABLE IF NOT EXISTS public\.ai_forecasts",
        r"CREATE POLICY \"admins_read_ai_forecasts\"",
    ],
}


def main() -> int:
    migrations_dir = ROOT / "supabase" / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))
    corpus = "\n\n".join(path.read_text(encoding="utf-8") for path in sql_files)

    missing_patterns: dict[str, list[str]] = {}
    for group, patterns in REQUIRED_GROUPS.items():
        for pattern in patterns:
            if not re.search(pattern, corpus, flags=re.IGNORECASE | re.MULTILINE):
                missing_patterns.setdefault(group, []).append(pattern)

    result = {
        "ok": not missing_patterns,
        "checked_files": len(sql_files),
        "checked_groups": len(REQUIRED_GROUPS),
        "missing_patterns": missing_patterns,
    }

    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
