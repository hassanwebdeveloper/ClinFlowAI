"""Helpers for cleaning up uploaded files stored on disk under /uploads.

We keep this for backwards compatibility with older records that still store
`/uploads/<filename>` URLs in MongoDB.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

from app.core.config import settings


def _upload_dir_abs() -> str:
    return os.path.abspath(os.path.realpath(settings.UPLOAD_DIR))


def resolve_upload_file_path(url: str | None) -> str | None:
    """Resolve `/uploads/<basename>` URL to an absolute safe path under UPLOAD_DIR."""
    if not url or not isinstance(url, str):
        return None
    raw = url.strip()
    if not raw:
        return None
    path_part = raw
    if "://" in raw:
        path_part = urlparse(raw).path or ""
    if not path_part.startswith("/uploads/"):
        return None
    basename = os.path.basename(path_part)
    if not basename or basename in (".", ".."):
        return None
    base = _upload_dir_abs()
    full = os.path.abspath(os.path.realpath(os.path.join(base, basename)))
    if full != base and not full.startswith(base + os.sep):
        return None
    return full


def remove_upload_files(*urls: str | None) -> None:
    """Best-effort delete of files referenced by `/uploads/...` URLs."""
    seen: set[str] = set()
    for u in urls:
        path = resolve_upload_file_path(u)
        if not path or path in seen:
            continue
        seen.add(path)
        try:
            os.remove(path)
        except OSError:
            pass


def collect_visit_file_urls(visit: dict) -> list[str]:
    out: list[str] = []
    au = visit.get("audio_url")
    if isinstance(au, str) and au.strip():
        out.append(au.strip())
    for x in visit.get("audio_urls") or []:
        if isinstance(x, str) and x.strip():
            out.append(x.strip())
    return out


def collect_lab_file_url(lab: dict) -> str | None:
    fu = lab.get("file_url")
    if isinstance(fu, str) and fu.strip():
        return fu.strip()
    return None

