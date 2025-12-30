"""Centralized job update emitter for UI notifications."""

from __future__ import annotations

from typing import Any, Callable

_emitter: Callable[[str, dict[str, Any]], None] | None = None


def set_emitter(emitter: Callable[[str, dict[str, Any]], None]) -> None:
    global _emitter
    _emitter = emitter


def emit_job_update(job_id: str, job_data: dict[str, Any]) -> None:
    if _emitter:
        _emitter(job_id, job_data)
