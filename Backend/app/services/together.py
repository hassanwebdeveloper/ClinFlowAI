import base64
import json
import math
from typing import Any

import httpx

from app.core.config import settings


TOGETHER_BASE_URL = "https://api.together.xyz/v1"


async def transcribe_whisper(file_path: str, language: str = "en") -> str:
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")
    headers = {"Authorization": f"Bearer {settings.TOGETHER_API_KEY}"}
    async with httpx.AsyncClient(timeout=180) as client:
        with open(file_path, "rb") as f:
            files = {"file": (file_path, f, "application/octet-stream")}
            data = {
                "model": settings.TOGETHER_WHISPER_MODEL,
                "language": language,
                "response_format": "json",
            }
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


LAB_VL_SYSTEM = """You extract information from medical laboratory reports shown in images.

Rules:
- On the FIRST line of your reply, output exactly one line: LAB_TEST_NAME: <name>
  Here <name> is the single overall lab test or order this report is for — the name the clinician ordered and the lab printed as the report title or main heading (e.g. "Complete Blood Count", "CBC", "Comprehensive Metabolic Panel", "Lipid Profile", "HbA1c"). A typical CBC report lists many separate result lines (WBC, RBC, hemoglobin, platelets, etc.); those are NOT the lab test name — the lab test name is the one umbrella order that covers that whole report. Use the wording from the document or a standard abbreviation if it clearly refers to the same order. If the document has only unrelated standalone tests and no clear overall ordered test name, output exactly: LAB_TEST_NAME: UNKNOWN
- Then one blank line, then exactly one line: LAB_TEST_PATTERN: <tag> where <tag> must be exactly one of: [one-time]  OR  [monitoring]  OR  [unclear — insufficient context]
  This tag applies only to the **overall ordered lab test** (the LAB_TEST_NAME), not to individual analytes. Decide from the document whether this **order** is a one-off diagnostic snapshot ([one-time]) vs repeating / serial follow-up / chronic surveillance / standing protocol ([monitoring]). Use cues such as: "serial", "repeat", "monitor", "follow-up", "standing order", "q.weekly", prior dates for the same test, multiple timepoints on one report, "recheck", interval orders. If the document does not give enough context to tell, use [unclear — insufficient context].
- Then one blank line, then the rest of the extraction.
- Transcribe every result line: analyte name, value, unit, reference range, and abnormal flags (H/L/critical) when visible. Do **not** append [one-time], [monitoring], or [unclear] to individual result lines — only the single LAB_TEST_PATTERN line above applies to the whole test.
- Include collection dates and lab facility name if shown.
- Do NOT guess missing numbers or normal ranges.
- If text is unreadable, say so briefly.
- Output plain English or standard lab line format; no JSON."""


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
                "Follow the LAB_TEST_NAME and LAB_TEST_PATTERN header rules in the system message "
                "(pattern applies to the whole ordered test, not each result line)."
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
- Then one blank line, then the bullet/list summary.
- List each result line with analyte name, value, unit, reference range if given, and abnormal flags when present. Do **not** add [one-time], [monitoring], or [unclear] tags to individual lines.
- Do NOT invent values; if unclear write \"unclear\".
- Prefer bullet lines; omit clinic letterhead and boilerplate when possible.
- If the text is not a lab report, summarize only factual test-like content you find."""


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


def _norm_str_list(val: Any) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    if isinstance(val, str) and val.strip():
        return [val.strip()]
    return []


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
- Do NOT make definitive diagnoses — only reflect what the doctor implied"""

    user = f"""Convert the following doctor summary into a structured clinical note.

The summary may come from multiple sequential recordings of the same visit, separated by lines like "--- Recording N ---". Treat them as one continuous encounter and produce a single unified note (do not duplicate or contradict; merge related information).

-----------------------------------
DOCTOR SUMMARY:
{transcript}
-----------------------------------

LAB / INVESTIGATION DATA (from uploaded lab documents for this visit; may be empty):
{(lab_report_context or "").strip() or "(No lab documents provided)"}

Each extracted lab line may end with a tag: [one-time] (single/episodic test), [monitoring] (repeating/serial/surveillance), or [unclear — insufficient context]. Preserve that distinction in Objective when summarizing labs; in Plan, reflect ongoing monitoring only when supported by [monitoring] tags or the doctor summary.

- Patient information: 
    name: {patient_info.get("name", "")}
    age: {patient_info.get("age", "")}
    gender: {patient_info.get("gender", "")}

Extract the following information from the doctor summary:

- Symptoms
- Duration
- Relevant history
- Allergies
- Medicines explicitly prescribed or ordered by the doctor in this visit (drug names only or short phrases; empty if none mentioned)
- Lab tests, imaging, or investigations explicitly ordered or requested (e.g. CBC, X-ray, HbA1c); empty if none mentioned

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
  "prescribed_medicines": [],
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
- prescribed_medicines: list of medicines the doctor prescribed or ordered in the transcript only; use [] if none.
- prescribed_lab_tests: list of labs/imaging/investigations ordered; use [] if none.

------------------------------------
RULES:
- Expand abbreviations (e.g., "HTN" → "hypertension")
- Normalize mixed Urdu/English into clear English
- Do NOT hallucinate
- Use "Not mentioned" where needed
- Keep output clean and structured
------------------------------------
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

    return {
        "visit_title": str(parsed.get("visit_title", "")).strip(),
        "visit_summary_report": str(parsed.get("visit_summary_report", "")).strip(),
        "symptoms": _norm_str_list(parsed.get("symptoms")),
        "duration": str(parsed.get("duration", "")).strip(),
        "medical_history": _norm_str_list(parsed.get("medical_history")),
        "allergies": _norm_str_list(parsed.get("allergies")),
        "prescribed_medicines": _norm_str_list(parsed.get("prescribed_medicines")),
        "prescribed_lab_tests": _norm_str_list(parsed.get("prescribed_lab_tests")),
        "soap": soap,
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


async def generate_ai_suggestions(
    transcript: str,
    patient_info: dict[str, Any],
    current_summary: str,
    relevant_history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not settings.TOGETHER_API_KEY:
        raise ValueError("TOGETHER_API_KEY is not configured")

    history_block = ""
    for h in relevant_history:
        history_block += (
            f"\n--- Visit ID: {h['visit_id']} | Date: {h['visit_date']} "
            f"| Title: {h['visit_title']} ---\n"
            f"{h['visit_summary_report']}\n"
        )

    system = (
        "You are an AI clinical advisor. You review the current visit transcript "
        "alongside relevant past visit summaries for the same patient.\n\n"
        "Your job:\n"
        "1. Identify anything the doctor may have MISSED or overlooked compared to known history "
        "(e.g. a known allergy not accounted for, a recurring symptom pattern, a medication conflict).\n"
        "2. Flag any CONFLICTS between the current plan and past records.\n"
        "3. Do NOT repeat information the doctor already covered.\n"
        "4. If there is nothing noteworthy, return an empty suggestions array.\n"
        "5. Each suggestion MUST reference the specific past visit(s) it is based on."
    )

    user = f"""CURRENT VISIT TRANSCRIPT:
{transcript}

CURRENT VISIT SUMMARY:
{current_summary}

PATIENT: {patient_info.get("name", "")}, {patient_info.get("age", "")} years, {patient_info.get("gender", "")}

RELEVANT PAST VISITS:
{history_block if history_block.strip() else "(No relevant history available)"}

Return a JSON object with a single key "suggestions" whose value is an array.
Each element: {{ "suggestion": "...", "references": [{{ "visit_id": "...", "visit_title": "...", "visit_date": "...", "relevance_snippet": "..." }}] }}
- "suggestion": a concise clinical suggestion.
- "references": the past visit(s) supporting this suggestion. "relevance_snippet" is a short quote from that visit's summary explaining why it is relevant.
- Only include genuinely useful suggestions. An empty array is valid.
"""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    content = await _chat_completion(messages, force_json=True)
    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError:
        return []

    raw = parsed.get("suggestions")
    if not isinstance(raw, list):
        return []

    suggestions: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        text = str(item.get("suggestion", "")).strip()
        if not text:
            continue
        refs_raw = item.get("references") or []
        refs = []
        for r in refs_raw:
            if not isinstance(r, dict):
                continue
            refs.append({
                "visit_id": str(r.get("visit_id", "")).strip(),
                "visit_title": str(r.get("visit_title", "")).strip(),
                "visit_date": str(r.get("visit_date", "")).strip(),
                "relevance_snippet": str(r.get("relevance_snippet", "")).strip(),
            })
        suggestions.append({"suggestion": text, "references": refs})

    return suggestions

