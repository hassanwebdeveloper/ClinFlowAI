"""Classify lab uploads and extract structured details (vision vs text-only path)."""

from __future__ import annotations

import mimetypes
from pathlib import Path

import fitz

from app.services.together import extract_lab_report_with_vl, normalize_lab_report_from_text

MIN_TEXT_CHARS_TO_SKIP_VL = 80
MAX_PDF_PAGES_FOR_VL = 8


def split_lab_test_name_from_extraction(details: str) -> tuple[str, str]:
    """
    Parse LAB_TEST_NAME from model output; strip header lines (LAB_TEST_NAME, LAB_TEST_PATTERN, legacy PANEL_NAME)
    from the body shown to users. LAB_TEST_PATTERN classifies the whole ordered test, not each result line.
    """
    if not details or not details.strip():
        return "", ""
    lines = details.split("\n")
    name = ""
    name_seen = False
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
            continue
        out.append(line)
    return name, "\n".join(out).strip()


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


async def extract_lab_from_saved_file(
    saved_path: str,
    original_filename: str,
    content_type: str | None,
) -> tuple[str, str, str]:
    """
    Returns (details_text, extraction_method, suggested_lab_test_name).
    suggested_lab_test_name is empty if not stated on the document (UNKNOWN) or missing from model output.
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
        sugg, body = split_lab_test_name_from_extraction(raw)
        return body, "vl", sugg

    if mime in {"text/plain", "text/csv"} or ext in {".txt", ".csv"}:
        raw_file = path.read_text(encoding="utf-8", errors="replace").strip()
        if len(raw_file) < 3:
            raise ValueError("Lab text file is empty")
        raw = (await normalize_lab_report_from_text(raw_file)).strip()
        sugg, body = split_lab_test_name_from_extraction(raw)
        return body, "text", sugg

    if ext == ".docx" or mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        raw_doc = _docx_extract_text(str(path))
        if len(raw_doc) < MIN_TEXT_CHARS_TO_SKIP_VL:
            raise ValueError("Could not extract enough text from the Word document")
        raw = (await normalize_lab_report_from_text(raw_doc)).strip()
        sugg, body = split_lab_test_name_from_extraction(raw)
        return body, "text", sugg

    if ext == ".pdf" or mime == "application/pdf":
        text = _pdf_extract_text(str(path))
        if len(text) >= MIN_TEXT_CHARS_TO_SKIP_VL:
            raw = (await normalize_lab_report_from_text(text[:50_000])).strip()
            sugg, body = split_lab_test_name_from_extraction(raw)
            return body, "text", sugg
        pngs = _pdf_pages_as_png(str(path), MAX_PDF_PAGES_FOR_VL)
        if not pngs:
            raise ValueError("PDF has no pages to read")
        chunks: list[str] = []
        for i, png in enumerate(pngs):
            part = await extract_lab_report_with_vl(png, "image/png")
            chunks.append(f"--- PDF page {i + 1} ---\n{part.strip()}")
        joined = "\n\n".join(chunks)
        sugg, body = split_lab_test_name_from_extraction(joined)
        return body, "vl", sugg

    raise ValueError(f"Unsupported lab file type: {original_filename}")
