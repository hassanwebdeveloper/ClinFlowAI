"""HTTP middleware for balanced per-request debug logging."""

from __future__ import annotations

import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.debug_log import feature_log, request_log_level, resolve_feature
from app.core.security import decode_access_token

_SKIP_PREFIXES = ("/assets/", "/uploads/", "/landing/", "/favicon.ico")
_SKIP_EXACT = {"/", "/index.html"}


def _should_skip(path: str) -> bool:
    if path in _SKIP_EXACT:
        return True
    return any(path.startswith(prefix) for prefix in _SKIP_PREFIXES)


def _doctor_id_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    payload = decode_access_token(auth[7:].strip())
    if not payload:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) and sub else None


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if _should_skip(path) or (not path.startswith("/api/") and path not in ("/api",)):
            return await call_next(request)

        method = request.method.upper()
        feature = resolve_feature(method, path)
        fl = feature_log(feature)
        started = time.perf_counter()
        doctor_id = _doctor_id_from_request(request)

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - started) * 1000, 1)
            fl.error(
                method=method,
                path=path,
                duration_ms=duration_ms,
                doctor_id=doctor_id,
                exc_info=True,
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        level = request_log_level(response.status_code)
        fl.log(
            level,
            method=method,
            path=path,
            status=response.status_code,
            duration_ms=duration_ms,
            doctor_id=doctor_id,
        )
        return response
