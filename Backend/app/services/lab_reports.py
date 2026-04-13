"""Classify lab uploads and extract structured details (vision vs text-only path)."""

from __future__ import annotations

import mimetypes
from pathlib import Path

import fitz

from app.services.together import extract_lab_report_with_vl, normalize_lab_report_from_text

MIN_TEXT_CHARS_TO_SKIP_VL = 80
MAX_PDF_PAGES_FOR_VL = 8


def split_lab_headers_from_extraction(details: str) -> tuple[str, str, str]:
    """
    Parse LAB_TEST_NAME and LAB_TEST_PATTERN; strip header lines from the body shown in UI.
    Returns (lab_test_name, lab_test_pattern, body). Pattern is stored in DB only (e.g. [monitoring]).
    """
    if not details or not details.strip():
        return "", "", ""
    lines = details.split("\n")
    name = ""
    pattern = ""
    name_seen = False
    pattern_seen = False
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        upper = stripped.upper()
        if upper.startswith("LAB_TEST_NAME:") or upper.startswith("PANEL_NAME:"):
            if not name_seen:
                raw = line.split(":", 1)[1].strip() if ":" in line else ""
                if raw and raw.upper() not in ("UNKNOWN", "N/A", "NONE", "UNCLEAR"):
                    name = raw
                name_seen = True
            continue
        if upper.startswith("LAB_TEST_PATTERN:"):
            if not pattern_seen:
                pattern = line.split(":", 1)[1].strip() if ":" in line else ""
                pattern_seen = True
            continue
        out.append(line)
    return name, pattern, "\n".join(out).strip()


def _pdf_extract_text(path: str) -> str:
    doc = fitz.open(path)
    try:
        parts: list[str] = []
        for i in range(doc.page_count):
            parts.append(doc[i].get_text())
        return "\n".join(parts).strip()
    finally:
        doc.close()


def _pdf_pages_as_png(path: str, max_pages: int) -> list[bytes]:
    doc = fitz.open(path)
    try:
        out: list[bytes] = []
        n = min(doc.page_count, max_pages)
        mat = fitz.Matrix(2, 2)
        for i in range(n):
            pix = doc[i].get_pixmap(matrix=mat, alpha=False)
            out.append(pix.tobytes("png"))
        return out
    finally:
        doc.close()


def _docx_extract_text(path: str) -> str:
    from docx import Document

    doc = Document(path)
    parts: list[str] = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts).strip()


def _resolve_mime(filename: str, content_type: str | None) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct and ct != "application/octet-stream":
        return ct
    guessed, _ = mimetypes.guess_type(filename)
    return (guessed or "application/octet-stream").lower()


_IMAGE_EXT = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
}


def _looks_like_image_file(path: Path, original_filename: str, content_type: str | None) -> bool:
    mime = _resolve_mime(original_filename, content_type)
    ext = path.suffix.lower()
    return mime.startswith("image/") or ext in _IMAGE_EXT


async def extract_lab_from_image_group(
    items: list[tuple[str, str, str | None]],
) -> tuple[str, str, str, str]:
    """
    One logical report from multiple photos (e.g. multi-page lab result photographed in parts).
    Each image is passed through VL; outputs are merged like multi-page PDF extraction.
    """
    if not items:
        raise ValueError("No lab images")
    if len(items) == 1:
        return await extract_lab_from_saved_file(items[0][0], items[0][1], items[0][2])
    chunks: list[str] = []
    for i, (path, fname, ctype) in enumerate(items):
        p = Path(path)
        if not _looks_like_image_file(p, fname, ctype):
            raise ValueError(
                f"Merged lab report must be images only; put {fname!r} in a separate upload"
            )
        mime = _resolve_mime(fname, ctype)
        img_mime = mime if mime.startswith("image/") else "image/jpeg"
        data = p.read_bytes()
        raw = (await extract_lab_report_with_vl(data, img_mime)).strip()
        label = fname or f"part-{i + 1}"
        chunks.append(f"--- Photo {i + 1} of {len(items)} ({label}) ---\n{raw}")
    joined = "\n\n".join(chunks)
    sugg, patt, body = split_lab_headers_from_extraction(joined)
    return body, "vl", sugg, patt


async def extract_lab_from_saved_file(
    saved_path: str,
    original_filename: str,
    content_type: str | None,
) -> tuple[str, str, str, str]:
    """
    Returns (details_text, extraction_method, suggested_lab_test_name, lab_test_pattern).
    lab_test_pattern is e.g. [one-time] or [monitoring]; stored in DB, omitted from UI.
    """
    path = Path(saved_path)
    ext = path.suffix.lower()
    mime = _resolve_mime(original_filename, content_type)

    if mime.startswith("image/") or ext in {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
        ".tif",
        ".tiff",
        ".heic",
        ".heif",
    }:
        data = path.read_bytes()
        img_mime = mime if mime.startswith("image/") else "image/jpeg"
        raw = (await extract_lab_report_with_vl(data, img_mime)).strip()
        sugg, patt, body = split_lab_headers_from_extraction(raw)
        return body, "vl", sugg, patt

    if mime in {"text/plain", "text/csv"} or ext in {".txt", ".csv"}:
        raw_file = path.read_text(encoding="utf-8", errors="replace").strip()
        if len(raw_file) < 3:
            raise ValueError("Lab text file is empty")
        raw = (await normalize_lab_report_from_text(raw_file)).strip()
        sugg, patt, body = split_lab_headers_from_extraction(raw)
        return body, "text", sugg, patt

    if ext == ".docx" or mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        raw_doc = _docx_extract_text(str(path))
        if len(raw_doc) < MIN_TEXT_CHARS_TO_SKIP_VL:
            raise ValueError("Could not extract enough text from the Word document")
        raw = (await normalize_lab_report_from_text(raw_doc)).strip()
        sugg, patt, body = split_lab_headers_from_extraction(raw)
        return body, "text", sugg, patt

    if ext == ".pdf" or mime == "application/pdf":
        text = _pdf_extract_text(str(path))
        if len(text) >= MIN_TEXT_CHARS_TO_SKIP_VL:
            raw = (await normalize_lab_report_from_text(text[:50_000])).strip()
            sugg, patt, body = split_lab_headers_from_extraction(raw)
            return body, "text", sugg, patt
        pngs = _pdf_pages_as_png(str(path), MAX_PDF_PAGES_FOR_VL)
        if not pngs:
            raise ValueError("PDF has no pages to read")
        chunks: list[str] = []
        for i, png in enumerate(pngs):
            part = await extract_lab_report_with_vl(png, "image/png")
            chunks.append(f"--- PDF page {i + 1} ---\n{part.strip()}")
        joined = "\n\n".join(chunks)
        sugg, patt, body = split_lab_headers_from_extraction(joined)
        return body, "vl", sugg, patt

    raise ValueError(f"Unsupported lab file type: {original_filename}")
