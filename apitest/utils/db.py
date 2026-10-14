from __future__ import annotations

import sqlite3
from pathlib import Path


class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._conn: sqlite3.Connection | None = None

    def connect(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def _ensure_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self.connect()
        return self._conn

    def query(self, sql: str, params: tuple | None = None) -> list[dict]:
        conn = self._ensure_conn()
        cur = conn.execute(sql, params or ())
        return [dict(row) for row in cur.fetchall()]

    def fetchone(self, sql: str, params: tuple | None = None) -> dict | None:
        conn = self._ensure_conn()
        cur = conn.execute(sql, params or ())
        row = cur.fetchone()
        return dict(row) if row else None