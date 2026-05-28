import base64
import json
import math
from typing import Any

import httpx

from app.core.config import settings


TOGETHER_BASE_URL = "https://api.together.xyz/v1"


async def transcribe_whisper(
    file_path: str,
    language: str = "en",
    *,
    translate_to_english: bool = False,
) -> str:
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    headers = {"Authorization": f"Bearer {settings.TOGETHER_API_KEY}"}
    async with httpx.AsyncClient(timeout=180) as client:
        with open(file_path, "rb") as f:
            files = {"file": (file_path, f, "application/octet-stream")}
            data: dict[str, Any] = {
                "model": settings.TOGETHER_WHISPER_MODEL,
                "response_format": "json",
                "task": "translate" if translate_to_english else "transcribe",
            }
            if not translate_to_english and language:
                data["language"] = language
            resp = await client.post(
                f"{TOGETHER_BASE_URL}/audio/transcriptions",
                headers=headers,
                data=data,
                files=files,
            )
    resp.raise_for_status()
    payload = resp.json()
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Whisper returned empty transcript")
    return text.strip()


async def transcribe_visit_audio(file_path: str, language: str = "en") -> str:
    """Route visit audio to Together Whisper or Soniox based on TRANSCRIPTION_PROVIDER."""
    translate = settings.TRANSCRIBE_TRANSLATE_TO_ENGLISH
    if settings.TRANSCRIPTION_PROVIDER == "together":
        return await transcribe_whisper(
            file_path,
            language,
            translate_to_english=translate,
        )
    from app.services.soniox_stt import transcribe_audio_file

    return await transcribe_audio_file(
        file_path,
        language,
        translate_to_english=translate,
    )


SOAP_SCHEMA_HINT = {
    "subjective": "string",
    "objective": "string",
    "assessment": "string",
    "plan": "string",
}

def _extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


async def _chat_completion(messages: list[dict[str, str]], *, force_json: bool) -> str:
    headers = {
        "Authorization": f"Bearer {settings.TOGETHER_API_KEY}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": settings.TOGETHER_LLM_MODEL,
        "messages": messages,
        "temperature": 0.2,
    }
    # Together supports OpenAI-compatible request fields; prefer JSON mode when available.
    if force_json:
        body["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{TOGETHER_BASE_URL}/chat/completions",
            headers=headers,
            json=body,
        )
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    choice0 = (data.get("choices") or [{}])[0] or {}
    content = ((choice0.get("message", {}) or {}).get("content", "")) or ""
    if not isinstance(content, str) or not content.strip():
        content = choice0.get("text", "") or ""
    if not isinstance(content, str) or not content.strip():
        raise ValueError("LLM returned empty response")
    return content.strip()


async def _chat_completion_multimodal(
    messages: list[dict[str, Any]],
    *,
    model: str,
    temperature: float = 0.1,
) -> str:
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    headers = {
        "Authorization": f"Bearer {settings.TOGETHER_API_KEY}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            f"{TOGETHER_BASE_URL}/chat/completions",
            headers=headers,
            json=body,
        )
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    choice0 = (data.get("choices") or [{}])[0] or {}
    content = ((choice0.get("message", {}) or {}).get("content", "")) or ""
    if not isinstance(content, str) or not content.strip():
        content = choice0.get("text", "") or ""
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Vision model returned empty response")
    return content.strip()


LAB_VL_SYSTEM = """You extract information from medical laboratory or pathology reports shown in images into a clear clinical summary.

Rules:
- On the FIRST line of your reply, output exactly one line: LAB_TEST_NAME: <name> for the single overall lab test or order this report represents (e.g. the prescribed test such as Complete Blood Count / CBC, CMP, lipid profile, HbA1c) as printed in the report title, requisition, or main heading — not the individual analyte lines inside the report. Use the wording from the document or a standard abbreviation if it clearly refers to the same order. If there is no clear overall ordered test name, output exactly: LAB_TEST_NAME: UNKNOWN
- Then one blank line, then exactly one line: LAB_TEST_PATTERN: <tag> where <tag> is exactly [one-time] OR [monitoring] OR [unclear — insufficient context]. This classifies the **whole ordered lab test** (LAB_TEST_NAME), not each analyte line: one-off diagnostic draw vs repeating / serial / monitoring order. Use document cues (e.g. repeat, recheck, monitor, follow-up, standing order, multiple timepoints, interval language). If insufficient context, use [unclear — insufficient context].
- Then one blank line, then exactly one line: LAB_ANALYTES_JSON: <minified JSON object on a single line>
  The JSON object must have exactly one key "analytes" whose value is an array of analyte objects. Each analyte object has these keys: name (string), value (number or null), unit (string), ref_low (number or null), ref_high (number or null), abnormal_flag (string, one of "", "H", "L", "critical"), qualitative_value (string or null).
  Rules for analyte objects:
  - Use one entry per result line in the report, whether numeric or qualitative. Use the analyte name as printed.
  - "value" must be the numeric result as a number when present (e.g. 12.5). For qualitative results ("Negative", "Positive", "Trace", "Present", "Not Detected", etc) or if no numeric value is given, set value to null and capture the qualitative result in "qualitative_value" as the literal string (e.g. "Positive", "Negative", "Trace", etc). If both exist, set both appropriately.
  - "ref_low" and "ref_high" come from the printed reference range (e.g. "13.0 - 17.0" → ref_low 13.0, ref_high 17.0). If only one side is shown (e.g. "<200" or ">40"), set the other side to null. If no range or unparseable, both null.
  - Always set "abnormal_flag" to "" in this JSON — do not copy letter flags, asterisks, or words like High/Low from the image; a separate step infers abnormality from values vs references.
  - Do NOT skip qualitative-only lines; extract those as well using "qualitative_value".
  - If you cannot extract any analytes (image unreadable, no result lines), output: LAB_ANALYTES_JSON: {"analytes":[]}
  - The line must be valid JSON; no newlines inside the JSON; no code fences.
- Then one blank line, then the bullet/list summary.
- List each result line with analyte name, value, qualitative value (if present), unit, and reference range if given. Do **not** append [one-time], [monitoring], or [unclear] to individual result lines — only the single LAB_TEST_PATTERN line above applies to the whole test.
- Include collection dates and lab facility name if shown.
- Do NOT invent values or normal ranges; if unclear write "unclear".
- If the image is unreadable, say so briefly.
- Prefer bullet lines; omit clinic letterhead and boilerplate when possible. Output plain English or standard lab line format; no JSON in the body (the JSON belongs only on the LAB_ANALYTES_JSON header line)."""


async def extract_lab_report_with_vl(image_bytes: bytes, mime_type: str) -> str:
    if not mime_type.startswith("image/"):
        mime_type = "image/png"
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    data_uri = f"data:{mime_type};base64,{b64}"
    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                "Extract all laboratory results and relevant identifiers from this image. "
                "Follow the LAB_TEST_NAME, LAB_TEST_PATTERN, and LAB_ANALYTES_JSON header rules "
                "in the system message (pattern applies to the whole ordered test, not each result "
                "line; analytes JSON must be a single minified line with numeric values when present)."
            ),
        },
        {"type": "image_url", "image_url": {"url": data_uri}},
    ]
    messages = [
        {"role": "system", "content": LAB_VL_SYSTEM},
        {"role": "user", "content": user_content},
    ]
    return await _chat_completion_multimodal(
        messages,
        model=settings.TOGETHER_VL_MODEL,
        temperature=0.1,
    )


LAB_TEXT_SYSTEM = """You normalize raw text from laboratory or pathology reports into a clear clinical summary.

Rules:
- On the FIRST line of your reply, output exactly one line: LAB_TEST_NAME: <name> for the single overall lab test or order this document represents (e.g. the prescribed test such as Complete Blood Count / CBC, CMP, lipid profile, HbA1c) as printed in the report title, requisition, or main heading — not the individual analyte lines inside the report. If there is no clear overall ordered test name, output exactly: LAB_TEST_NAME: UNKNOWN
- Then one blank line, then exactly one line: LAB_TEST_PATTERN: <tag> where <tag> is exactly [one-time] OR [monitoring] OR [unclear — insufficient context]. This classifies the **whole ordered lab test** (LAB_TEST_NAME), not each analyte line: one-off diagnostic draw vs repeating / serial / monitoring order. Use document cues (e.g. repeat, recheck, monitor, follow-up, standing order, multiple timepoints, interval language). If insufficient context, use [unclear — insufficient context].
- Then one blank line, then exactly one line: LAB_ANALYTES_JSON: <minified JSON object on a single line>
  The JSON object must have exactly one key "analytes" whose value is an array of analyte objects. Each analyte object has these keys: name (string), value (number or null), unit (string), ref_low (number or null), ref_high (number or null), abnormal_flag (string, one of "", "H", "L", "critical"), qualitative_value (string or null).
  Rules for analyte objects:
  - Use one entry per result line in the document, whether numeric or qualitative.
  - "value" must be the numeric result as a number when present. For qualitative results ("Negative", "Positive", "Trace", "Present", etc) or if no numeric value is given, set value to null and capture the qualitative result in "qualitative_value" as the literal string (e.g. "Positive", "Negative", "Trace", etc). If both exist, set both appropriately.
  - "ref_low" and "ref_high" come from the printed reference range. If only one side is shown (e.g. "<200" or ">40"), set the other side to null. If no range or unparseable, both null.
  - Always set "abnormal_flag" to "" in this JSON — do not transcribe H/L symbols or panic markers from the document; a separate step infers abnormality from numeric vs reference interval.
  - Do NOT skip qualitative-only lines; extract those as well using "qualitative_value".
  - If you cannot extract any analytes, output: LAB_ANALYTES_JSON: {"analytes":[]}
  - The line must be valid JSON; no newlines inside the JSON; no code fences.
- Then one blank line, then the bullet/list summary.
- List each result line with analyte name, value, qualitative value (if present), unit, and reference range if given. Do **not** add [one-time], [monitoring], or [unclear] tags to individual lines.
- Do NOT invent values; if unclear write \"unclear\".
- Prefer bullet lines; omit clinic letterhead and boilerplate when possible.
- If the text is not a lab report, summarize only factual test-like content you find."""


LAB_TRANSCRIPT_SYSTEM = """You extract structured laboratory results that the doctor EXPLICITLY DESCRIBES IN SPEECH during a clinic visit.

Inputs you will receive:
- TRANSCRIPT: the visit transcript text.
- EXCLUDE_TESTS: a JSON array of overall lab test names that are already on file as uploaded reports for this visit. Those uploaded reports are authoritative — do NOT emit any test that overlaps with this list.

Output ONLY a single minified JSON object on one line, no code fences, no commentary:
{"lab_reports":[ ... ]}

Each element of "lab_reports" is an object with these keys:
- "test_name" (string): the overall ordered lab test (e.g. "CBC", "HbA1c", "Lipid Profile", "TSH"). Use the spoken name or a standard short name for the same order.
- "lab_test_pattern" (string): exactly one of "[one-time]", "[monitoring]", or "[unclear — insufficient context]". Use cues such as "repeat", "recheck", "monitor", "follow-up", "standing order", interval mentions to decide.
- "details" (string): a short summary (1-3 short lines max) of what the doctor said about THIS lab only. Do NOT include LAB_TEST_NAME / LAB_TEST_PATTERN / LAB_ANALYTES_JSON header lines here — that header format is only for the file-based extractor.
- "analytes" (array): each item has keys: name (string), value (number or null), unit (string), ref_low (number or null), ref_high (number or null), abnormal_flag (string, one of "", "H", "L", "critical"), qualitative_value (string or null). Same schema as the file-based lab extraction prompts.

One lab per distinct test (critical):
- When the doctor reads results for multiple different labs in one stretch (e.g. "HbA1c was 7.9, fasting sugar 170, creatinine 1.0, CBC normal"), emit ONE separate object per distinct test/panel — never bundle HbA1c, glucose, creatinine, CBC, TSH, lipids, etc. into a single lab_reports entry.
- Each object's "test_name" is that test only (e.g. "HbA1c", "Fasting Blood Sugar", "Creatinine", "CBC"). Do not prefix with numbers like "1.".
- Each object's "details" and "analytes" must refer only to that test — do not list other tests' results in the same entry.
- Multiple analytes belong in one entry only when they are components of the same panel the doctor discussed as one result (e.g. several CBC line items for one CBC discussion).

Strict rules:
- ONLY emit a lab when the doctor states a SPECIFIC RESULT or VALUE — numeric (e.g. "HbA1c was 8.2") or qualitative (e.g. "TSH came back low", "urine culture positive for E. coli"). A bare mention like "we did a CBC" with no values is NOT enough — skip it.
- DO NOT include any test whose name (case-insensitively, allowing common aliases like CBC ↔ Complete Blood Count, CMP ↔ Comprehensive Metabolic Panel, BMP ↔ Basic Metabolic Panel) matches any item in EXCLUDE_TESTS. Uploaded files take priority over speech.
- DO NOT include lab tests the doctor only ORDERED or REQUESTED for future testing — those belong in the visit's prescribed_lab_tests, not here.
- DO NOT invent values, units, reference ranges, or abnormal flags. Use null / "" when not stated. Omit any analyte you cannot anchor to something the doctor actually said.
- For qualitative findings ("Positive", "Negative", "Trace", "Present", "Not detected", etc.), set value=null and put the literal string in qualitative_value; always set abnormal_flag to "" here — a follow-up step infers flags from the structured row.
- If nothing qualifies, output exactly: {"lab_reports":[]}
- The output MUST be valid minified JSON on a single line."""


async def extract_lab_reports_from_transcript(
    transcript: str,
    excluded_test_names: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Extract lab results the doctor verbally described in the visit transcript.

    Returns a list of raw dicts: {test_name, lab_test_pattern, details, analytes}.
    Tests whose name (case-insensitively) appears in `excluded_test_names` are
    skipped client-side as well as via the prompt — uploaded files always take
    priority. Analyte normalization is the caller's responsibility (so the same
    pipeline as file-based extraction is used).
    """
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    text = (transcript or "").strip()
    if not text:
        return []
    cap = 48_000
    if len(text) > cap:
        text = text[:cap] + "\n\n[truncated]"
    excludes = sorted(
        {n.strip() for n in (excluded_test_names or []) if n and n.strip()},
        key=str.lower,
    )
    user = (
        "EXCLUDE_TESTS:\n"
        f"{json.dumps(excludes, ensure_ascii=False)}\n\n"
        "TRANSCRIPT:\n"
        f"{text}"
    )
    messages = [
        {"role": "system", "content": LAB_TRANSCRIPT_SYSTEM},
        {"role": "user", "content": user},
    ]
    content = await _chat_completion(messages, force_json=True)
    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError:
        return []
    raw = parsed.get("lab_reports")
    if not isinstance(raw, list):
        return []
    excluded_lower = {n.lower() for n in excludes}
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("test_name", "")).strip()
        if not name or name.lower() in excluded_lower:
            continue
        details = str(item.get("details", "")).strip()
        pattern = str(item.get("lab_test_pattern", "")).strip()
        analytes_raw = item.get("analytes")
        analytes: list[Any] = analytes_raw if isinstance(analytes_raw, list) else []
        out.append({
            "test_name": name,
            "lab_test_pattern": pattern,
            "details": details,
            "analytes": analytes,
        })
    return out


async def normalize_lab_report_from_text(raw_document_text: str) -> str:
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    text = raw_document_text.strip()
    if not text:
        raise ValueError("Empty lab document text")
    cap = 48_000
    if len(text) > cap:
        text = text[:cap] + "\n\n[truncated]"
    messages = [
        {"role": "system", "content": LAB_TEXT_SYSTEM},
        {"role": "user", "content": f"Document text:\n\n{text}"},
    ]
    return await _chat_completion(messages, force_json=False)


LAB_ABNORMAL_FLAG_JUDGE_SYSTEM = """You decide whether each structured laboratory **row** is abnormal.

You always receive two pieces of input:

1) **FULL LAB REPORT TEXT** — the complete extracted narrative/summary for this report (may be prose-only, qualitative-only lines, mixed narrative with numbers, interpretive wording, or fragments). This is your **primary source** for understanding context, especially when rows lack numeric values or reference intervals.

2) **STRUCTURED ANALYTE ROWS** — JSON objects in **fixed order** matching stored chart rows. Fields may be partially empty (null value, missing refs, text-only qualitative fields).

For EACH structured row (same index order), assign **abnormal_flag**:

- "" — Normal/benign for the described context; clearly within range when ranges apply; routine negative qualitative results; or insufficient evidence to call abnormal (prefer conservative "" when ambiguous).
- "H" — High / above upper reference / hyper- pattern when supported by the **full report text** and/or numeric comparison.
- "L" — Low / below lower reference / hypo- pattern when supported by text and/or numbers.
- "critical" — Severe, panic-level, or clinically urgent abnormality suggested by values and/or report wording.

Rules:
- Read the **FULL LAB REPORT TEXT** carefully — abnormalities may appear **only** in free text (e.g. interpretive sentences, "positive", "marked elevation") without usable structured numbers.
- When structured fields include numeric `value` and plausible `ref_low`/`ref_high`, use them together with the text.
- When rows are **text/qualitative-only**, infer abnormality only from the report text and structured `qualitative_value` — do not invent numeric cutoffs.
- Do not fabricate values or reference ranges. When uncertain, use "".

Output ONLY JSON: {"flags":["",...]} — exactly as many strings as structured analyte rows, each one of "", "H", "L", "critical"."""


_ABNORMAL_FLAG_JUDGE_BATCH = 48
_ABNORMAL_JUDGE_TEXT_CAP = 36_000


async def _infer_abnormal_flags_chunk(
    analytes_slice: list[dict[str, Any]],
    full_lab_report_text: str,
) -> list[str]:
    if not analytes_slice:
        return []
    payload: list[dict[str, Any]] = []
    for i, a in enumerate(analytes_slice):
        payload.append({
            "index": i,
            "name": (a.get("name") or "").strip(),
            "value": a.get("value"),
            "unit": (a.get("unit") or "").strip(),
            "ref_low": a.get("ref_low"),
            "ref_high": a.get("ref_high"),
            "qualitative_value": (a.get("qualitative_value") or "").strip() or None,
        })
    text_block = (full_lab_report_text or "").strip()
    if len(text_block) > _ABNORMAL_JUDGE_TEXT_CAP:
        text_block = text_block[: _ABNORMAL_JUDGE_TEXT_CAP].rstrip() + "\n\n[truncated]"
    user = (
        "FULL LAB REPORT TEXT (use entirely for context; may be qualitative-only or mixed):\n---\n"
        f"{text_block if text_block else '(none — rely on structured rows only)'}\n"
        "---\n\nSTRUCTURED ANALYTE ROWS (emit exactly one flag per row, same order):\n"
        f"{json.dumps({'analytes': payload}, ensure_ascii=False)}"
    )
    messages = [
        {"role": "system", "content": LAB_ABNORMAL_FLAG_JUDGE_SYSTEM},
        {"role": "user", "content": user},
    ]
    content = await _chat_completion(messages, force_json=True)
    parsed = _extract_json_object(content)
    raw_flags = parsed.get("flags")
    n = len(analytes_slice)
    out = [""] * n
    _allowed = frozenset({"", "H", "L", "critical"})
    if isinstance(raw_flags, list):
        for i in range(min(n, len(raw_flags))):
            f = str(raw_flags[i] or "").strip()
            out[i] = f if f in _allowed else ""
    return out


async def infer_abnormal_flags_for_analytes(
    analytes: list[dict[str, Any]],
    full_lab_report_text: str = "",
) -> list[str]:
    """Infer abnormal_flag per row using full report narrative plus structured rows. Same length as input."""
    if not analytes:
        return []
    if not settings.TOGETHER_API_KEY:
        return [""] * len(analytes)
    all_flags: list[str] = []
    for start in range(0, len(analytes), _ABNORMAL_FLAG_JUDGE_BATCH):
        chunk = analytes[start : start + _ABNORMAL_FLAG_JUDGE_BATCH]
        part = await _infer_abnormal_flags_chunk(chunk, full_lab_report_text)
        if len(part) < len(chunk):
            part = [*part, *([""] * (len(chunk) - len(part)))]
        all_flags.extend(part[: len(chunk)])
    while len(all_flags) < len(analytes):
        all_flags.append("")
    return all_flags[: len(analytes)]


def _norm_str_list(val: Any) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    if isinstance(val, str) and val.strip():
        return [val.strip()]
    return []


def _norm_prescription_rows(parsed: dict[str, Any]) -> tuple[list[dict[str, str]], list[str]]:
    """Build prescriptions + medicine names from LLM JSON.

    Prefers `prescriptions` (objects). Falls back to legacy `prescribed_medicines` strings.
    """
    rows: list[dict[str, str]] = []
    raw_rx = parsed.get("prescriptions")
    if isinstance(raw_rx, list):
        for item in raw_rx:
            if isinstance(item, dict):
                med = str(item.get("medicine") or "").strip()
                if not med:
                    continue
                rows.append({
                    "medicine": med,
                    "dosage": str(item.get("dosage") or "").strip(),
                    "frequency": str(item.get("frequency") or "").strip(),
                })
            elif isinstance(item, str) and item.strip():
                rows.append({"medicine": item.strip(), "dosage": "", "frequency": ""})
    if rows:
        return rows, [r["medicine"] for r in rows]
    for s in _norm_str_list(parsed.get("prescribed_medicines")):
        rows.append({"medicine": s, "dosage": "", "frequency": ""})
    return rows, [r["medicine"] for r in rows]


async def extract_prescriptions_from_transcript(transcript: str) -> list[dict[str, str]]:
    """Return prescribed/ordered medications with optional dosage and frequency from transcript only.

    Used to backfill structured `prescriptions` for legacy visits that only stored medicine names.
    """
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    text = (transcript or "").strip()
    if not text:
        return []
    cap = 48_000
    if len(text) > cap:
        text = text[:cap] + "\n\n[truncated]"
    system = """You extract medications the doctor prescribed or ordered during this encounter from the transcript.

Rules:
- Transcript only — do not infer from assumptions or outside context.
- Output ONLY valid JSON: { "prescriptions": [ ... ] }
- Each object has "medicine" (required), "dosage" (strength or dose if stated, else ""), "frequency" (schedule if stated, else "").
- Do NOT invent dosage or frequency not clearly stated or strongly implied in speech.
- Use [] if no medications were prescribed or ordered in the transcript."""
    user = f"TRANSCRIPT:\n{text}"
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    content = await _chat_completion(messages, force_json=True)
    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError:
        retry_messages = [
            {"role": "system", "content": system + " Output must be minified JSON on a single line."},
            {"role": "user", "content": user},
        ]
        content = await _chat_completion(retry_messages, force_json=True)
        parsed = _extract_json_object(content)
    raw_rx = parsed.get("prescriptions")
    rows: list[dict[str, str]] = []
    if not isinstance(raw_rx, list):
        return []
    for item in raw_rx:
        if isinstance(item, dict):
            med = str(item.get("medicine") or "").strip()
            if not med:
                continue
            rows.append({
                "medicine": med,
                "dosage": str(item.get("dosage") or "").strip(),
                "frequency": str(item.get("frequency") or "").strip(),
            })
    return rows


async def generate_soap_from_transcript(
    transcript: str,
    patient_info: dict[str, Any],
    lab_report_context: str | None = None,
) -> dict[str, Any]:
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    system = """You are a clinical documentation assistant.

You convert doctor-spoken summaries into structured clinical notes.

The input will be a short, informal medical summary spoken by a doctor (not a full conversation).

IMPORTANT RULES:
- Do NOT add or assume information not present
- Expand shorthand into clear medical language
- Keep output concise and professional
- If something is missing, write "Not mentioned"
- Expand abbreviations (e.g., "HTN" → "hypertension")
- Keep output clean and structured
- Do NOT hallucinate
- Do NOT make definitive diagnoses — only reflect what the doctor implied"""

    user = f"""Convert the following doctor summary into a structured clinical note.

The summary may combine multiple sequential audio clips from the same visit (joined with blank lines). Treat them as one continuous encounter and produce a single unified note (do not duplicate or contradict; merge related information).

-----------------------------------
DOCTOR SUMMARY:
{transcript}
-----------------------------------

LAB / INVESTIGATION DATA (from uploaded lab documents for this visit; may be empty):
{(lab_report_context or "").strip() or "(No lab documents provided)"}

These are **results / documents**, not necessarily what the doctor ordered in speech. The doctor's spoken orders for new labs or imaging belong in prescribed_lab_tests (from transcript only).

If the extracted document metadata includes a **whole-test** pattern [one-time] vs [monitoring] vs [unclear — insufficient context] for that uploaded order, you may use it when summarizing those lab results in Objective and Plan (e.g. surveillance vs one-off). Do not invent a pattern if it is not evident from the excerpt.

- Patient information: 
    name: {patient_info.get("name", "")}
    age: {patient_info.get("age", "")}
    gender: {patient_info.get("gender", "")}

Extract the following information from the doctor summary:

- Symptoms
- Duration
- Relevant history
- Allergies
- Medicines explicitly prescribed or ordered by the doctor **in the DOCTOR SUMMARY / transcript only**. For each drug, capture **medicine** (generic or brand name), and when the doctor states them, **dosage** (strength / dose, e.g. "500 mg", "10 units") and **frequency** (e.g. "twice daily", "BID", "PRN"). Use empty strings for dosage/frequency when not stated. Do NOT fill from uploaded lab documents, past history, or inferred from lab results unless the doctor clearly states a prescription in the summary.
- Lab tests, imaging, or investigations the doctor **orders or requests in the DOCTOR SUMMARY / transcript** (e.g. "order CBC", "send for X-ray"); empty if none stated in speech. Do NOT list tests that appear only as **results** on uploaded lab reports unless the doctor also orders them in the summary.

Also write the SOAP note from the doctor summary AND the lab / investigation data above.

SOAP Note is:

Subjective:
- Symptoms reported
- Duration
- Relevant history

Objective:
- Include pertinent lab values and impressions from the LAB / INVESTIGATION DATA section when provided
- Any measurable findings from the doctor summary (vitals, exam) if mentioned

Assessment:
- Likely condition based on doctor's summary
- If unclear, say "Assessment unclear based on provided information"

Plan:
- Medications, advice, or next steps mentioned
- If missing, say "Not specified"

Output should be in json format and contains the following fields:

JSON format:
{{
  "visit_title": "",
  "visit_summary_report": "",
  "symptoms": [],
  "duration": "",
  "medical_history": [],
  "allergies": [],
  "prescriptions": [],
  "prescribed_lab_tests": [],
  "soap": {{
    "subjective": "",
    "objective": "",
    "assessment": "",
    "plan": ""
  }}
}}

- visit_title: Short title for the visit list (e.g. "Presenting with fever and chills"). No patient name required.
- visit_summary_report: 1-3 sentences summarizing the visit, starting with patient demographics using the provided name, age, and gender (e.g. "Kamran, 34-year-old male, …") then the reason for visit and key points. Use "Not mentioned" only if demographics are missing.
- prescriptions: array from **transcript only** — one object per medicine: {{"medicine": "…", "dosage": "…", "frequency": "…"}}. Use "" for dosage/frequency when not stated. Use [] if none mentioned in speech.
- prescribed_lab_tests: list from **transcript only** — investigations the doctor orders or requests in speech; use [] if none. Never copy test names from uploaded lab **result** documents into this list unless the doctor also orders them in the summary.

    """
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    # First try: JSON mode.
    content = await _chat_completion(messages, force_json=True)
    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError:
        # Retry once with stronger constraints to avoid unescaped newlines/quotes.
        retry_system = system + " Output must be minified JSON on a single line."
        retry_messages = [
            {"role": "system", "content": retry_system},
            {"role": "user", "content": user},
        ]
        content = await _chat_completion(retry_messages, force_json=True)
        parsed = _extract_json_object(content)

    soap_raw = parsed.get("soap")
    if isinstance(soap_raw, dict):
        soap = {
            "subjective": str(soap_raw.get("subjective", "")).strip(),
            "objective": str(soap_raw.get("objective", "")).strip(),
            "assessment": str(soap_raw.get("assessment", "")).strip(),
            "plan": str(soap_raw.get("plan", "")).strip(),
        }
    else:
        soap = {
            "subjective": str(parsed.get("subjective", "")).strip(),
            "objective": str(parsed.get("objective", "")).strip(),
            "assessment": str(parsed.get("assessment", "")).strip(),
            "plan": str(parsed.get("plan", "")).strip(),
        }

    rx_rows, prescribed_names = _norm_prescription_rows(parsed)

    return {
        "visit_title": str(parsed.get("visit_title", "")).strip(),
        "visit_summary_report": str(parsed.get("visit_summary_report", "")).strip(),
        "symptoms": _norm_str_list(parsed.get("symptoms")),
        "duration": str(parsed.get("duration", "")).strip(),
        "medical_history": _norm_str_list(parsed.get("medical_history")),
        "allergies": _norm_str_list(parsed.get("allergies")),
        "prescriptions": rx_rows,
        "prescribed_medicines": prescribed_names,
        "prescribed_lab_tests": _norm_str_list(parsed.get("prescribed_lab_tests")),
        "soap": soap,
    }


HEALTH_PROFILE_SYSTEM = """You are a clinical record summarizer that maintains a patient's longitudinal health profile.

You will be given:
- Patient demographics
- The CURRENT health profile (allergies, long-term medications, conditions). Some entries may be marked is_doctor_edited=true; treat them as authoritative — do not change their content. You may keep them in the output, but you must NOT modify locked fields.
- A DO_NOT_RE_ADD list of items the doctor has previously dismissed; never re-introduce these (match by case-insensitive name).
- Recent VISITS (transcripts + SOAP) and patient-level LAB REPORTS.

Your job is to produce the FULL updated health profile as JSON across three buckets:

1) allergies — substances or drugs the patient has reacted to. Include severity (mild/moderate/severe/unclear) and reaction when stated. Do NOT add allergies the doctor only "denies".
2) long_term_medications — ONLY chronic / standing / maintenance medications the patient takes ongoing (e.g. for hypertension, diabetes, thyroid, statins). EXCLUDE acute / short course meds: antibiotics, brief NSAID/analgesic courses, single-visit prescriptions, post-op short courses, PRN-only meds without an ongoing indication. If unsure, omit.
3) conditions — chronic or notable medical conditions/diagnoses with concrete evidence in transcripts or labs. Examples: "Diabetes mellitus type 2", "Hypertension", "Hypothyroidism", "Coronary artery disease", "Chronic kidney disease". Set "category" to one of: endocrine, cardiac, renal, hepatic, pulmonary, neurological, hematologic, gastrointestinal, musculoskeletal, oncologic, infectious, psychiatric, other. Put a short factual "evidence" string citing the lab values or transcript phrasing that supports the condition (e.g. "HbA1c 8.2 on 2026-03-12; FBS 178 mg/dL same date"). Do NOT diagnose without evidence.

RULES:
- Output the COMPLETE updated lists (not a diff).
- Preserve every locked (is_doctor_edited=true) item with the SAME id and unchanged user-facing fields.
- For non-locked existing items you may refine fields based on new evidence; keep the same id when it is the same item (matched by clinically equivalent name).
- For brand new items, use id "" (empty string); the server will assign one.
- Do NOT add anything in DO_NOT_RE_ADD.
- "long term only" is strict: when a medication's chronicity is unclear, omit it.
- Use plain medical English. No markdown, no commentary.
- Output ONLY a single JSON object with the exact keys: allergies, long_term_medications, conditions."""


async def generate_health_profile_update(
    patient_info: dict[str, Any],
    current_profile: dict[str, Any],
    visits_context: list[dict[str, Any]],
    lab_reports_context: list[dict[str, Any]],
    suppressed_items: dict[str, list[str]],
) -> dict[str, Any]:
    """Run the separate LLM call that proposes the updated health profile.

    Returns a dict with three keys: allergies, long_term_medications, conditions.
    Each is a list of dicts; ids may be empty for new items.
    """
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")

    user = (
        "PATIENT:\n"
        f"  name: {patient_info.get('name', '')}\n"
        f"  age: {patient_info.get('age', '')}\n"
        f"  gender: {patient_info.get('gender', '')}\n\n"
        "CURRENT HEALTH PROFILE (preserve locked items exactly):\n"
        f"{json.dumps(current_profile, ensure_ascii=False)}\n\n"
        "DO_NOT_RE_ADD (dismissed by doctor — never re-introduce):\n"
        f"{json.dumps(suppressed_items, ensure_ascii=False)}\n\n"
        "RECENT VISITS (most recent first):\n"
        f"{json.dumps(visits_context, ensure_ascii=False)}\n\n"
        "PATIENT LAB REPORTS:\n"
        f"{json.dumps(lab_reports_context, ensure_ascii=False)}\n\n"
        "Return ONLY a JSON object of the form:\n"
        "{\n"
        '  "allergies": [{"id":"","name":"","severity":"","reaction":"","source_visit_ids":[]}],\n'
        '  "long_term_medications": [{"id":"","name":"","dosage":"","frequency":"","indication":"","source_visit_ids":[]}],\n'
        '  "conditions": [{"id":"","name":"","category":"","evidence":"","source_visit_ids":[],"source_lab_report_ids":[]}]\n'
        "}\n"
    )

    messages = [
        {"role": "system", "content": HEALTH_PROFILE_SYSTEM},
        {"role": "user", "content": user},
    ]

    content = await _chat_completion(messages, force_json=True)
    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError:
        retry_system = HEALTH_PROFILE_SYSTEM + " Output must be minified JSON on a single line."
        retry_messages = [
            {"role": "system", "content": retry_system},
            {"role": "user", "content": user},
        ]
        content = await _chat_completion(retry_messages, force_json=True)
        parsed = _extract_json_object(content)

    def _list_of_dicts(val: Any) -> list[dict[str, Any]]:
        if not isinstance(val, list):
            return []
        return [x for x in val if isinstance(x, dict)]

    return {
        "allergies": _list_of_dicts(parsed.get("allergies")),
        "long_term_medications": _list_of_dicts(parsed.get("long_term_medications")),
        "conditions": _list_of_dicts(parsed.get("conditions")),
    }


async def generate_embedding(text: str) -> list[float]:
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    headers = {
        "Authorization": f"Bearer {settings.TOGETHER_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.TOGETHER_EMBEDDING_MODEL,
        "input": text,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{TOGETHER_BASE_URL}/embeddings",
            headers=headers,
            json=body,
        )
    resp.raise_for_status()
    data = resp.json()
    items = data.get("data") or []
    if not items:
        raise ValueError("Embedding API returned no data")
    return items[0]["embedding"]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


AI_REMINDERS_SYSTEM = """You are a clinical documentation reminder assistant — not a diagnostician.

You receive the doctor's dictated transcript for the CURRENT VISIT, the structured extraction and SOAP, visit lab uploads text, longitudinal lab rows with dates, and cosine-similar past visit headings (hints only).

Output ONLY valid JSON matching the schema requested in the user message. Do not hallucinate contradictions against the transcript/labs unless clearly supported."""

_VALID_GAP = frozenset({"medicine_dosage", "lab_discussed_no_value", "allergy_incomplete"})


async def generate_ai_reminders_llm(
    transcript: str,
    patient_info: dict[str, Any],
    visit_summary_report: str,
    structured: dict[str, Any],
    visit_lab_context: str,
    lab_timeline_rows: list[dict[str, Any]],
    embedding_similar_hints: list[dict[str, Any]],
    current_visit_date: str,
) -> dict[str, Any]:
    """LLM-produced slice of ai_reminders (documentation gaps + repeat-lab reminders)."""
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")

    hints_block = json.dumps(embedding_similar_hints, ensure_ascii=False, indent=2)
    labs_block = json.dumps(lab_timeline_rows, ensure_ascii=False, indent=2)
    structured_json = json.dumps(structured, ensure_ascii=False, indent=2)

    user = f"""CURRENT VISIT DATE: {current_visit_date or "(unknown)"}

PATIENT: {patient_info.get("name", "")}, age {patient_info.get("age", "")}, {patient_info.get("gender", "")}

TRANSCRIPT (doctor summary):
{transcript}

VISIT SUMMARY (model-generated):
{visit_summary_report or "(empty)"}

STRUCTURED FIELDS + SOAP (JSON):
{structured_json}

LAB / INVESTIGATION TEXT FOR THIS VISIT (uploads + excerpts; may be empty):
{(visit_lab_context or "").strip() or "(none)"}

LONGITUDINAL PATIENT LAB ROWS (recent first — id, recorded_at ISO, visit_id, test_name, pattern tag, excerpt of details/analytes):
{labs_block}

EMBEDDING-SIMILAR PAST VISITS (headings only; use for longitudinal context mentally, do NOT output visit links yourself):
{hints_block}

Return a single JSON object with exactly these keys:
{{
  "documentation_gaps": [
    {{
      "category": "medicine_dosage" | "lab_discussed_no_value" | "allergy_incomplete",
      "message": "short actionable reminder sentence"
    }}
  ],
  "repeat_lab_reminders": [
    {{ "test_name": "specific test or panel name", "rationale": "why repeating now/likely overdue, cite timing or guideline-style interval ONLY if justified by chart" }}
  ]
}}

DOCUMENTATION_GAPS RULES — only flag if clearly warranted by transcript±SOAP±visit lab section:
1) medicine_dosage — Doctor dictated prescribing/starting/continuing a medication but dosing is missing or unusably vague in structured lists or SOAP plan (no strength, dose, frequency, duration when it should be documented).
2) lab_discussed_no_value — Doctor clearly referenced a lab or result in speech but omitted the actual numeric/qualitative value that appears in LAB TEXT FOR THIS VISIT or logically should have been dictated (e.g., says \"CBC improved\" without values).
3) allergy_incomplete — Doctor mentioned allergy/intolerance wording but allergy field or narrative omits identifiable allergen, reaction type, or severity relative to how it was dictated.

repeat_lab_reminders — Use LAB ROWS dates, ordering context, transcript orders, stored pattern tags ([monitoring] etc.) and clinical common sense ONLY on this chart. Recommend repeat tests ONLY when surveillance/monitoring wording or chronic follow-up implies a result should be redrawn AND elapsed time reasonably suggests repeat is due OR no result exists despite an order/discussion suggesting it should exist. Omit if uncertain. Empty arrays are acceptable.

Return ONLY the JSON object."""

    messages = [
        {"role": "system", "content": AI_REMINDERS_SYSTEM},
        {"role": "user", "content": user},
    ]
    content = await _chat_completion(messages, force_json=True)
    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError:
        retry_messages = [
            {"role": "system", "content": AI_REMINDERS_SYSTEM + " Output must be minified JSON on a single line."},
            {"role": "user", "content": user},
        ]
        content = await _chat_completion(retry_messages, force_json=True)
        parsed = _extract_json_object(content)

    gaps_out: list[dict[str, str]] = []
    raw_gaps = parsed.get("documentation_gaps")
    if isinstance(raw_gaps, list):
        for g in raw_gaps:
            if not isinstance(g, dict):
                continue
            cat = str(g.get("category", "")).strip()
            msg = str(g.get("message", "")).strip()
            if cat not in _VALID_GAP or not msg:
                continue
            gaps_out.append({"category": cat, "message": msg})

    repeat_out: list[dict[str, str]] = []
    raw_rep = parsed.get("repeat_lab_reminders")
    if isinstance(raw_rep, list):
        for r in raw_rep:
            if not isinstance(r, dict):
                continue
            name = str(r.get("test_name", "")).strip()
            rationale = str(r.get("rationale", "")).strip()
            if not name or not rationale:
                continue
            repeat_out.append({"test_name": name, "rationale": rationale})

    return {"documentation_gaps": gaps_out, "repeat_lab_reminders": repeat_out}

