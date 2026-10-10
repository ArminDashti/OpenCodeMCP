#!/usr/bin/env python3
"""Upsert one session turn into <PROJECT>/.armin/logs-db.sqlite (stdlib only)."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from schema import ensure_schema

ITEM_KINDS = (
    ("tools", "tool"),
    ("mcps", "mcp"),
    ("rules", "rule"),
    ("skills", "skill"),
    ("hooks", "hook"),
    ("subagents", "subagent"),
)


def die(msg: str, code: int = 1) -> None:
    print(json.dumps({"ok": False, "error": msg}), file=sys.stderr)
    raise SystemExit(code)


def load_payload(path: str) -> dict[str, Any]:
    if path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path).read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        die(f"invalid JSON payload: {exc}")
    if not isinstance(data, dict):
        die("payload must be a JSON object")
    return data


def fetch_public_ip(timeout: float = 3.0) -> str | None:
    try:
        with urllib.request.urlopen("https://api.ipify.org", timeout=timeout) as resp:
            text = resp.read().decode("utf-8").strip()
            return text or None
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def as_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        die(f"expected integer, got {value!r}")


def normalize_names(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        die("tools/mcps/rules/skills/hooks/subagents must be arrays")
    names: list[str] = []
    seen: set[str] = set()
    for item in value:
        name = str(item).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def next_prompt_number(conn: sqlite3.Connection, session_id: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(prompt_number), 0) FROM turns WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    return int(row[0]) + 1


def upsert_turn(conn: sqlite3.Connection, payload: dict[str, Any]) -> tuple[str, int, int]:
    session_id = as_str(payload.get("session_id"))
    if not session_id:
        die("session_id is required")

    prompt = as_str(payload.get("prompt"))
    if prompt is None or prompt == "":
        die("prompt is required")

    title = as_str(payload.get("title"))
    topic = as_str(payload.get("topic"))
    project = as_str(payload.get("project"))
    project_path = as_str(payload.get("project_path") or payload.get("project-path"))
    device = as_str(payload.get("device"))
    version = as_str(payload.get("version"))
    start_at = as_str(payload.get("start_at") or payload.get("start-at"))
    finished_at = as_str(payload.get("finished_at") or payload.get("finished-at"))
    ip_from_payload = as_str(payload.get("ip"))

    prompt_number = as_int(payload.get("prompt_number") or payload.get("prompt-number"))
    if prompt_number is None:
        prompt_number = next_prompt_number(conn, session_id)
    if prompt_number < 1:
        die("prompt_number must be >= 1")

    rate = as_int(payload.get("rate"))
    duration_ms = as_int(payload.get("duration_ms") or payload.get("duration"))
    tokens = as_int(payload.get("tokens"))
    model = as_str(payload.get("model"))
    mode = as_str(payload.get("mode"))
    response = as_str(payload.get("response"))

    existing = conn.execute(
        "SELECT ip, started_at FROM sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()

    existing_ip = existing[0] if existing else None
    existing_started = existing[1] if existing else None
    started_at = existing_started or start_at or finished_at
    ip = existing_ip or ip_from_payload
    if not ip:
        ip = fetch_public_ip()

    conn.execute(
        """
        INSERT INTO sessions (
          session_id, title, topic, project, project_path, device, ip, version,
          started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          title = COALESCE(excluded.title, sessions.title),
          topic = COALESCE(excluded.topic, sessions.topic),
          project = COALESCE(excluded.project, sessions.project),
          project_path = COALESCE(excluded.project_path, sessions.project_path),
          device = COALESCE(excluded.device, sessions.device),
          ip = COALESCE(sessions.ip, excluded.ip),
          version = COALESCE(excluded.version, sessions.version),
          started_at = COALESCE(sessions.started_at, excluded.started_at),
          finished_at = COALESCE(excluded.finished_at, sessions.finished_at)
        """,
        (
            session_id,
            title,
            topic,
            project,
            project_path,
            device,
            ip,
            version,
            started_at,
            finished_at,
        ),
    )

    conn.execute(
        """
        INSERT INTO turns (
          session_id, prompt_number, prompt, response, rate, model, mode,
          duration_ms, start_at, finished_at, tokens
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, prompt_number) DO UPDATE SET
          prompt = excluded.prompt,
          response = excluded.response,
          rate = excluded.rate,
          model = excluded.model,
          mode = excluded.mode,
          duration_ms = excluded.duration_ms,
          start_at = excluded.start_at,
          finished_at = excluded.finished_at,
          tokens = excluded.tokens
        """,
        (
            session_id,
            prompt_number,
            prompt,
            response,
            rate,
            model,
            mode,
            duration_ms,
            start_at,
            finished_at,
            tokens,
        ),
    )

    turn_row = conn.execute(
        "SELECT id FROM turns WHERE session_id = ? AND prompt_number = ?",
        (session_id, prompt_number),
    ).fetchone()
    if turn_row is None:
        die("failed to resolve turn_id after upsert")
    turn_id = int(turn_row[0])

    conn.execute("DELETE FROM turn_items WHERE turn_id = ?", (turn_id,))
    for key, kind in ITEM_KINDS:
        names = normalize_names(payload.get(key))
        if kind == "subagent":
            names = list(dict.fromkeys(names + normalize_names(payload.get("sub-agent"))))
        for name in names:
            conn.execute(
                "INSERT INTO turn_items (turn_id, kind, name) VALUES (?, ?, ?)",
                (turn_id, kind, name),
            )

    return session_id, prompt_number, turn_id


def main() -> int:
    parser = argparse.ArgumentParser(description="Upsert a session turn into logs-db.sqlite")
    parser.add_argument("--db", required=True, help="Path to .armin/logs-db.sqlite")
    parser.add_argument("--payload", required=True, help="JSON file path, or - for stdin")
    args = parser.parse_args()

    db_path = Path(args.db).expanduser().resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    payload = load_payload(args.payload)

    conn = sqlite3.connect(str(db_path))
    try:
        # Manage transactions explicitly (default sqlite3 starts an implicit txn on DML).
        conn.isolation_level = None
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        ensure_schema(conn)
        conn.execute("BEGIN IMMEDIATE")
        try:
            session_id, prompt_number, turn_id = upsert_turn(conn, payload)
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — surface as JSON error
        die(str(exc))
    finally:
        conn.close()

    print(
        json.dumps(
            {
                "ok": True,
                "db": str(db_path).replace("\\", "/"),
                "session_id": session_id,
                "prompt_number": prompt_number,
                "turn_id": turn_id,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
