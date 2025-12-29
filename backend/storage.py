"""Storage backends for Snowflake jobs.

Redis holds live job state for fast access, while SQLite persists job history
and audit metadata for long-term reporting.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime

import redis


@dataclass
class RedisJobStore:
    redis_url: str | None

    def __post_init__(self) -> None:
        self.client = None
        if self.redis_url:
            self.client = redis.Redis.from_url(self.redis_url, decode_responses=True)

    def enabled(self) -> bool:
        return self.client is not None

    def save_job(self, job_id: str, job_data: dict) -> None:
        if not self.client:
            return
        key = f"snowflake:job:{job_id}"
        self.client.set(key, json.dumps(job_data))
        self.client.sadd("snowflake:jobs:active", job_id)

    def get_job(self, job_id: str) -> dict | None:
        if not self.client:
            return None
        key = f"snowflake:job:{job_id}"
        payload = self.client.get(key)
        if not payload:
            return None
        return json.loads(payload)

    def archive_job(self, job_id: str) -> None:
        if not self.client:
            return
        self.client.srem("snowflake:jobs:active", job_id)
        self.client.sadd("snowflake:jobs:archived", job_id)


class SqliteJobStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    job_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    options_json TEXT,
                    metrics_json TEXT,
                    geometric_key TEXT,
                    output_path TEXT,
                    error TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS job_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(job_id) REFERENCES jobs(job_id)
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS extraction_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    size INTEGER,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(job_id) REFERENCES jobs(job_id)
                )
                """
            )
            conn.commit()

    def upsert_job(self, job: dict) -> None:
        now = datetime.now().isoformat()
        job_type = job.get("type", "unknown")
        status = job.get("status", "unknown")
        created_at = job.get("createdAt", now)
        updated_at = job.get("updatedAt", now)
        options_json = json.dumps(job.get("options")) if job.get("options") else None
        metrics_json = json.dumps(job.get("metrics")) if job.get("metrics") else None
        geometric_key = job.get("geometricKey")
        output_path = job.get("outputPath")
        error = job.get("error")

        with self._lock, self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO jobs (
                    job_id,
                    job_type,
                    status,
                    created_at,
                    updated_at,
                    options_json,
                    metrics_json,
                    geometric_key,
                    output_path,
                    error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    job_type=excluded.job_type,
                    status=excluded.status,
                    updated_at=excluded.updated_at,
                    options_json=excluded.options_json,
                    metrics_json=excluded.metrics_json,
                    geometric_key=excluded.geometric_key,
                    output_path=excluded.output_path,
                    error=excluded.error
                """,
                (
                    job.get("jobId"),
                    job_type,
                    status,
                    created_at,
                    updated_at,
                    options_json,
                    metrics_json,
                    geometric_key,
                    output_path,
                    error,
                ),
            )
            conn.commit()

    def record_event(self, job_id: str, event_type: str, payload: dict) -> None:
        with self._lock, self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO job_events (job_id, event_type, payload_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    job_id,
                    event_type,
                    json.dumps(payload),
                    datetime.now().isoformat(),
                ),
            )
            conn.commit()

    def record_extracted_files(self, job_id: str, files: list[dict]) -> None:
        if not files:
            return
        with self._lock, self._connect() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            cursor.executemany(
                """
                INSERT INTO extraction_files (job_id, filename, size, created_at)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        job_id,
                        file.get("name", "unknown"),
                        file.get("size"),
                        now,
                    )
                    for file in files
                ],
            )
            conn.commit()
