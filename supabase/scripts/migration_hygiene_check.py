from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"

CANONICAL_PATTERN = re.compile(r"^\d{11}_[a-z0-9_]+\.sql$")

# Historical compatibility waivers that are intentionally retained.
ALLOWED_LEGACY_FILENAMES = {
    "20260218_002_payment_rejection_reason.sql",
}

ALLOWED_DUPLICATE_GROUPS = {
    frozenset(
        {
            "20260218006_payment_rejection_reason.sql",
            "20260218_002_payment_rejection_reason.sql",
        }
    )
}


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    filenames = [path.name for path in sql_files]

    invalid_names: list[str] = []
    waived_legacy_names: list[str] = []
    for name in filenames:
        if CANONICAL_PATTERN.match(name):
            continue
        if name in ALLOWED_LEGACY_FILENAMES:
            waived_legacy_names.append(name)
            continue
        invalid_names.append(name)

    hash_groups: dict[str, list[str]] = {}
    for path in sql_files:
        hash_groups.setdefault(_hash_file(path), []).append(path.name)

    blocking_duplicate_groups: list[list[str]] = []
    waived_duplicate_groups: list[list[str]] = []
    for names in hash_groups.values():
        if len(names) < 2:
            continue
        group = sorted(names)
        if frozenset(group) in ALLOWED_DUPLICATE_GROUPS:
            waived_duplicate_groups.append(group)
        else:
            blocking_duplicate_groups.append(group)

    blocking_issues = bool(invalid_names or blocking_duplicate_groups)
    result = {
        "ok": not blocking_issues,
        "checked_files": len(sql_files),
        "canonical_pattern": CANONICAL_PATTERN.pattern,
        "blocking": {
            "invalid_filenames": invalid_names,
            "duplicate_groups": blocking_duplicate_groups,
        },
        "waived": {
            "legacy_filenames": waived_legacy_names,
            "duplicate_groups": waived_duplicate_groups,
        },
    }
    print(json.dumps(result, indent=2))
    return 1 if blocking_issues else 0


if __name__ == "__main__":
    sys.exit(main())
