"""Persist usage analytics for LLM, VLM, and STT/translation API calls."""

from __future__ import annotations

import logging
import os
import struct
import wave
from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.core.database import get_database

logger = logging.getLogger(__name__)

API_USAGE_COLLECTION = "api_usage_events"


@dataclass
class AnalyticsContext:
    doctor_id: str | None = None
    patient_id: str | None = None
    feature: str = "unknown"
    extra: dict[str, Any] = field(default_factory=dict)


_analytics_ctx: ContextVar[AnalyticsContext | None] = ContextVar(
    "api_analytics_ctx", default=None
)


def get_analytics_context() -> AnalyticsContext:
    ctx = _analytics_ctx.get()
    return ctx if ctx is not None else AnalyticsContext()


@contextmanager
def api_analytics_scope(
    *,
    doctor_id: str | None = None,
    patient_id: str | None = None,
    feature: str = "unknown",
    **extra: Any,
):
    """Set doctor/patient context for analytics within a request or background task."""
    parent = _analytics_ctx.get()
    merged = AnalyticsContext(
        doctor_id=doctor_id or (parent.doctor_id if parent else None),
        patient_id=patient_id or (parent.patient_id if parent else None),
        feature=feature if feature != "unknown" else (parent.feature if parent else "unknown"),
        extra={**(parent.extra if parent else {}), **extra},
    )
    token = _analytics_ctx.set(merged)
    try:
        yield
    finally:
        _analytics_ctx.reset(token)


def bind_api_analytics_context(
    *,
    doctor_id: str | None = None,
    patient_id: str | None = None,
    feature: str = "unknown",
    **extra: Any,
) -> Token:
    """Bind analytics context for the current async task; pair with reset_api_analytics_context."""
    parent = _analytics_ctx.get()
    merged = AnalyticsContext(
        doctor_id=doctor_id or (parent.doctor_id if parent else None),
        patient_id=patient_id or (parent.patient_id if parent else None),
        feature=feature if feature != "unknown" else (parent.feature if parent else "unknown"),
        extra={**(parent.extra if parent else {}), **extra},
    )
    return _analytics_ctx.set(merged)


def reset_api_analytics_context(token: Token) -> None:
    _analytics_ctx.reset(token)


@contextmanager
def analytics_feature(feature: str):
    """Override only the feature label while preserving doctor/patient context."""
    parent = _analytics_ctx.get() or AnalyticsContext()
    merged = AnalyticsContext(
        doctor_id=parent.doctor_id,
        patient_id=parent.patient_id,
        feature=feature,
        extra=dict(parent.extra),
    )
    token = _analytics_ctx.set(merged)
    try:
        yield
    finally:
        _analytics_ctx.reset(token)


def parse_together_usage(data: dict[str, Any] | None) -> dict[str, int | None]:
    """Extract token usage from Together/OpenAI-compatible chat or embedding responses."""
    usage = (data or {}).get("usage")
    if not isinstance(usage, dict):
        return {
            "tokens_input": None,
            "tokens_output": None,
            "tokens_reasoning": None,
            "tokens_total": None,
        }

    prompt = usage.get("prompt_tokens")
    completion = usage.get("completion_tokens")
    total = usage.get("total_tokens")

    reasoning = None
    completion_details = usage.get("completion_tokens_details")
    if isinstance(completion_details, dict):
        reasoning = completion_details.get("reasoning_tokens")

    return {
        "tokens_input": _coerce_int(prompt),
        "tokens_output": _coerce_int(completion),
        "tokens_reasoning": _coerce_int(reasoning),
        "tokens_total": _coerce_int(total),
    }


def _read_ebml_vint(data: bytes, pos: int, *, is_id: bool) -> tuple[int, int]:
    """Parse an EBML variable-size integer; returns (value, byte_length)."""
    if pos >= len(data):
        raise ValueError("unexpected end of EBML data")
    first = data[pos]
    if first == 0:
        raise ValueError("invalid EBML integer")
    mask = 0x80
    length = 1
    while length <= 8 and not (first & mask):
        mask >>= 1
        length += 1
    if length > 8:
        raise ValueError("invalid EBML integer length")
    value = first & (mask - 1)
    for offset in range(1, length):
        if pos + offset >= len(data):
            raise ValueError("unexpected end of EBML data")
        value = (value << 8) | data[pos + offset]
    if not is_id:
        value -= (1 << (7 * length)) - 1
    return value, length


def _matroska_duration_sec(data: bytes) -> float | None:
    """Extract Duration (element 0x4489) from WebM/Matroska EBML, if present."""
    duration_element_id = 0x4489
    segment_element_id = 0x18538067
    pos = 0
    end = len(data)
    while pos < end:
        try:
            element_id, id_len = _read_ebml_vint(data, pos, is_id=True)
            pos += id_len
            if pos >= end:
                return None
            element_size, size_len = _read_ebml_vint(data, pos, is_id=False)
            pos += size_len
            if element_size < 0:
                return None
            element_end = pos + element_size
            if element_end > end or element_end < pos:
                return None
            if element_id == duration_element_id and element_size == 8:
                return struct.unpack(">d", data[pos : pos + 8])[0]
            if element_id == segment_element_id:
                nested = _matroska_duration_sec(data[pos:element_end])
                if nested is not None:
                    return nested
            pos = element_end
        except (ValueError, IndexError, struct.error):
            return None
    return None


def _audio_duration_from_file(file_path: str) -> float | None:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in {".webm", ".mkv", ".mka"}:
        try:
            with open(file_path, "rb") as handle:
                # Duration lives in the Segment/Info header near the start of the file.
                header = handle.read(5 * 1024 * 1024)
            duration = _matroska_duration_sec(header)
            if duration is not None and duration > 0:
                return duration
        except (OSError, ValueError, IndexError, struct.error):
            pass

    try:
        with wave.open(file_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate:
                return frames / float(rate)
    except Exception:
        pass

    return None


def audio_file_metrics(file_path: str) -> tuple[float | None, int | None]:
    """Best-effort audio duration (seconds) and file size (bytes)."""
    size: int | None = None
    try:
        size = os.path.getsize(file_path)
    except OSError:
        size = None

    duration = _audio_duration_from_file(file_path)
    return duration, size


def count_soniox_tokens(
    tokens: list[Any] | None,
) -> tuple[int | None, int | None]:
    """Return (transcription_token_count, translation_token_count) from Soniox tokens."""
    if not tokens:
        return None, None
    transcription = 0
    translation = 0
    for token in tokens:
        status = getattr(token, "translation_status", None)
        if status == "translation":
            translation += 1
        else:
            transcription += 1
    return transcription, translation


def _coerce_int(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _build_event(
    *,
    service_type: str,
    operation: str,
    provider: str,
    model: str,
    duration_ms: float,
    success: bool,
    error_message: str | None = None,
    tokens_input: int | None = None,
    tokens_output: int | None = None,
    tokens_reasoning: int | None = None,
    tokens_total: int | None = None,
    audio_duration_sec: float | None = None,
    audio_file_size_bytes: int | None = None,
    transcription_tokens: int | None = None,
    translation_tokens: int | None = None,
    translate_to_english: bool | None = None,
    language: str | None = None,
    provider_request_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ctx = get_analytics_context()
    doc: dict[str, Any] = {
        "service_type": service_type,
        "operation": operation,
        "doctor_id": ctx.doctor_id,
        "patient_id": ctx.patient_id,
        "feature": ctx.feature,
        "provider": provider,
        "model": model,
        "duration_ms": round(duration_ms, 2),
        "success": success,
        "error_message": (error_message or "")[:1000] or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "tokens_reasoning": tokens_reasoning,
        "tokens_total": tokens_total,
        "audio_duration_sec": audio_duration_sec,
        "audio_file_size_bytes": audio_file_size_bytes,
        "transcription_tokens": transcription_tokens,
        "translation_tokens": translation_tokens,
        "translate_to_english": translate_to_english,
        "language": language,
        "provider_request_id": provider_request_id,
    }
    merged_extra = {**ctx.extra, **(extra or {})}
    if merged_extra:
        doc["metadata"] = merged_extra
    return doc


async def record_api_usage_event(**kwargs: Any) -> None:
    """Insert one analytics event. Never raises to callers."""
    try:
        doc = _build_event(**kwargs)
        db = get_database()
        await db[API_USAGE_COLLECTION].insert_one(doc)
    except Exception:
        logger.exception("Failed to record API usage analytics event")


async def record_llm_usage(
    *,
    provider: str,
    model: str,
    operation: str,
    duration_ms: float,
    success: bool,
    usage_data: dict[str, Any] | None = None,
    error_message: str | None = None,
    provider_request_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    tokens = parse_together_usage(usage_data or {})
    await record_api_usage_event(
        service_type="llm",
        operation=operation,
        provider=provider,
        model=model,
        duration_ms=duration_ms,
        success=success,
        error_message=error_message,
        provider_request_id=provider_request_id,
        extra=extra,
        **tokens,
    )


async def record_vlm_usage(
    *,
    provider: str,
    model: str,
    operation: str,
    duration_ms: float,
    success: bool,
    usage_data: dict[str, Any] | None = None,
    error_message: str | None = None,
    provider_request_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    tokens = parse_together_usage(usage_data or {})
    await record_api_usage_event(
        service_type="vlm",
        operation=operation,
        provider=provider,
        model=model,
        duration_ms=duration_ms,
        success=success,
        error_message=error_message,
        provider_request_id=provider_request_id,
        extra=extra,
        **tokens,
    )


async def record_stt_usage(
    *,
    provider: str,
    model: str,
    duration_ms: float,
    success: bool,
    audio_duration_sec: float | None = None,
    audio_file_size_bytes: int | None = None,
    transcription_tokens: int | None = None,
    translation_tokens: int | None = None,
    translate_to_english: bool | None = None,
    language: str | None = None,
    error_message: str | None = None,
    provider_request_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    await record_api_usage_event(
        service_type="stt",
        operation="transcription",
        provider=provider,
        model=model,
        duration_ms=duration_ms,
        success=success,
        audio_duration_sec=audio_duration_sec,
        audio_file_size_bytes=audio_file_size_bytes,
        transcription_tokens=transcription_tokens,
        translation_tokens=translation_tokens,
        translate_to_english=translate_to_english,
        language=language,
        error_message=error_message,
        provider_request_id=provider_request_id,
        extra=extra,
    )
