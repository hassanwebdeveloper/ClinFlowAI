"""File-based debug logging with rotation and feature-scoped context."""

from __future__ import annotations

import inspect
import logging
import logging.handlers
import re
from pathlib import Path
from typing import Any

from app.core.config import settings

APP_LOGGER_NAME = "clinflow"
_CONFIGURED = False

SENSITIVE_KEYS = frozenset(
    {
        "password",
        "new_password",
        "token",
        "access_token",
        "authorization",
        "secret",
        "password_hash",
        "transcript",
        "soap",
    }
)

_LOG_FORMAT = "%(asctime)s %(levelname)s [%(feature)s] %(message)s"
_LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


class _FeatureFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "feature"):
            record.feature = record.name.removeprefix(f"{APP_LOGGER_NAME}.") or "app"
        return True


def _caller_location(*, stack_level: int = 2) -> tuple[str, str, int]:
    frame = inspect.stack()[stack_level]
    return frame.function, Path(frame.filename).name, frame.lineno


class _FeatureLogger:
    def __init__(self, feature: str):
        self._feature = feature
        self._logger = logging.getLogger(f"{APP_LOGGER_NAME}.{feature}")

    def _emit(self, level: int, *, exc_info: bool = False, **fields: Any) -> None:
        func, filename, lineno = _caller_location(stack_level=3)
        clean = _sanitize_fields(fields)
        parts = [func, f"{filename}:{lineno}"]
        if clean:
            parts.append(_format_fields(clean))
        self._logger.log(
            level,
            " | ".join(parts),
            extra={"feature": self._feature},
            exc_info=exc_info,
        )

    def debug(self, **fields: Any) -> None:
        self._emit(logging.DEBUG, **fields)

    def info(self, **fields: Any) -> None:
        self._emit(logging.INFO, **fields)

    def warning(self, **fields: Any) -> None:
        self._emit(logging.WARNING, **fields)

    def error(self, *, exc_info: bool = False, **fields: Any) -> None:
        self._emit(logging.ERROR, exc_info=exc_info, **fields)

    def log(self, level: int, **fields: Any) -> None:
        self._emit(level, **fields)


def mask_email(email: str | None) -> str:
    if not email:
        return "-"
    email = email.strip().lower()
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


def mask_id(value: str | None, *, visible: int = 6) -> str:
    if not value:
        return "-"
    value = str(value).strip()
    if len(value) <= visible:
        return value
    return f"{value[:visible]}…"


def _sanitize_fields(fields: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in fields.items():
        if key in ("feature",):
            continue
        if key in SENSITIVE_KEYS:
            clean[key] = "[redacted]"
            continue
        if key == "email" and isinstance(value, str):
            clean[key] = mask_email(value)
            continue
        if key.endswith("_id") and isinstance(value, str) and len(value) > 12:
            clean[key] = mask_id(value)
            continue
        if isinstance(value, str) and len(value) > 200:
            clean[key] = f"{value[:200]}…"
            continue
        clean[key] = value
    return clean


def _format_fields(fields: dict[str, Any]) -> str:
    return " ".join(f"{k}={v}" for k, v in fields.items())


def setup_debug_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    log_dir = Path(settings.LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / settings.LOG_FILE_NAME

    level_name = settings.LOG_LEVEL.upper()
    if settings.DEBUG and level_name == "INFO":
        level_name = "DEBUG"
    level = getattr(logging, level_name, logging.INFO)

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_LOG_DATE_FORMAT)
    feature_filter = _FeatureFilter()

    file_handler = logging.handlers.RotatingFileHandler(
        log_path,
        maxBytes=settings.LOG_MAX_BYTES,
        backupCount=settings.LOG_BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(feature_filter)
    file_handler.setLevel(level)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.addFilter(feature_filter)
    console_handler.setLevel(level)

    root = logging.getLogger()
    root.setLevel(level)
    for handler in list(root.handlers):
        root.removeHandler(handler)
    root.addHandler(file_handler)
    root.addHandler(console_handler)

    app_logger = logging.getLogger(APP_LOGGER_NAME)
    app_logger.setLevel(level)
    app_logger.propagate = True

    for noisy in ("uvicorn.access", "passlib", "httpx", "httpcore", "multipart"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _CONFIGURED = True
    feature_log("app").info(log_file=str(log_path), log_level=level_name)


def feature_log(feature: str) -> _FeatureLogger:
    return _FeatureLogger(feature)


def resolve_feature(method: str, path: str) -> str:
    """Map an HTTP route to a stable feature tag for logs."""
    p = path.split("?", 1)[0].rstrip("/") or "/"
    prefix = settings.API_V1_PREFIX.rstrip("/")
    if p.startswith(prefix):
        p = p[len(prefix) :] or "/"

    if p == "/health" or p.startswith("/health/"):
        return "health"
    if p == "/auth/signup":
        return "auth.signup"
    if p == "/auth/signin":
        return "auth.signin"
    if p.startswith("/auth/access-requests/review"):
        return "auth.access_request"
    if p == "/auth/forgot-password":
        return "auth.forgot_password"
    if p == "/auth/reset-password":
        return "auth.reset_password"

    if p == "/clinics":
        return f"clinics.{method.lower()}"
    if re.match(r"^/clinics/[^/]+$", p):
        return f"clinics.{method.lower()}"

    if p == "/patients":
        return f"patients.{method.lower()}"
    if re.match(r"^/patients/[^/]+$", p):
        return f"patients.{method.lower()}"
    if re.match(r"^/patients/[^/]+/visits$", p):
        return "visits.create"
    if re.match(r"^/patients/[^/]+/visits/extract-lab-reports$", p):
        return "visits.extract_lab_reports"
    if re.match(r"^/patients/[^/]+/visits/prepare-audio$", p):
        return "visits.prepare_audio"
    if re.match(r"^/patients/[^/]+/visits/from-audio$", p):
        return "visits.from_audio"
    if re.match(r"^/patients/[^/]+/visits/[^/]+/hydrate-prescriptions$", p):
        return "visits.hydrate_prescriptions"
    if re.match(r"^/patients/[^/]+/visits/[^/]+/regenerate-soap$", p):
        return "visits.regenerate_soap"
    if re.match(r"^/patients/[^/]+/visits/[^/]+/refresh-ai-reminders$", p):
        return "visits.refresh_ai_reminders"
    if re.match(r"^/patients/[^/]+/visits/[^/]+/soap$", p):
        return "visits.patch_soap"
    if re.match(r"^/patients/[^/]+/visits/[^/]+$", p):
        return f"visits.{method.lower()}"
    if re.match(r"^/patients/[^/]+/health-profile$", p):
        return "patients.health_profile"
    if re.match(r"^/patients/[^/]+/lab-reports/[^/]+$", p):
        return "patients.lab_report"

    if re.match(r"^/lab-files/[^/]+$", p):
        return "lab_files.download"

    return "api.other"


def request_log_level(status_code: int) -> int:
    if status_code >= 500:
        return logging.ERROR
    if status_code >= 400:
        return logging.WARNING
    return logging.INFO
