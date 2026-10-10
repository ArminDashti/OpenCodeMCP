#!/usr/bin/env python3
"""Create a ready-to-use .armin/logs-db.sqlite for logging-cursor-session-by-armin (stdlib only)."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from schema import SCHEMA_VERSION, ensure_schema


REQUIRED_TABLES = ("schema_meta", "sessions", "turns", "turn_items")


def die(msg: str, code: int = 1) -> None:
    print(json.dumps({"ok": False, "error": msg}), file=sys.stderr)
    raise SystemExit(code)


def table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {str(r[0]) for r in rows}


def verify_ready(conn: sqlite3.Connection) -> dict[str, int]:
    names = table_names(conn)
    missing = [t for t in REQUIRED_TABLES if t not in names]
    if missing:
        die(f"missing tables: {', '.join(missing)}")

    row = conn.execute("SELECT version FROM schema_meta LIMIT 1").fetchone()
    if row is None:
        die("schema_meta has no version row")
    version = int(row[0])
    if version != SCHEMA_VERSION:
        die(f"schema version {version} != supported {SCHEMA_VERSION}")

    counts = {
        "sessions": int(conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]),
        "turns": int(conn.execute("SELECT COUNT(*) FROM turns").fetchone()[0]),
        "turn_items": int(conn.execute("SELECT COUNT(*) FROM turn_items").fetchone()[0]),
    }
    return counts


def prepare(db_path: Path, *, created: bool) -> dict:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    try:
        # Do not wrap executescript in an explicit BEGIN — it issues COMMIT first.
        conn.execute("PRAGMA foreign_keys = ON")
        journal = conn.execute("PRAGMA journal_mode = WAL").fetchone()
        journal_mode = str(journal[0]) if journal else "unknown"
        ensure_schema(conn)
        conn.commit()
        counts = verify_ready(conn)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — surface as JSON error
        die(str(exc))
    finally:
        conn.close()

    return {
        "ok": True,
        "db": str(db_path).replace("\\", "/"),
        "schema_version": SCHEMA_VERSION,
        "journal_mode": journal_mode,
        "created": created,
        "ready": True,
        "counts": counts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create/ready .armin/logs-db.sqlite for logging-cursor-session-by-armin"
    )
    parser.add_argument(
        "--db",
        required=True,
        help="Path to logs-db.sqlite (usually <project>/.armin/logs-db.sqlite)",
    )
    args = parser.parse_args()

    db_path = Path(args.db).expanduser().resolve()
    created = not db_path.is_file()
    result = prepare(db_path, created=created)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
