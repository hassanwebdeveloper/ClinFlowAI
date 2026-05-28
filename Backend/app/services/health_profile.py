"""Maintain each patient's longitudinal health profile via a separate LLM call.

This runs as a fire-and-forget background task after a new visit is created or a SOAP
note is regenerated. It reads recent visits + patient lab reports, asks the LLM to
produce updated allergies / long-term medications / conditions lists, and merges the
result against the stored profile so doctor-edited entries (is_doctor_edited=True) are
preserved verbatim and dismissed entries are not re-introduced.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.together import generate_health_profile_update

logger = logging.getLogger(__name__)

PATIENTS_COLLECTION = "patients"

MAX_VISITS_IN_CONTEXT = 10
MAX_TRANSCRIPT_CHARS = 2000
MAX_LAB_DETAILS_CHARS = 600


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{int(datetime.now(timezone.utc).timestamp() * 1000_000)}"


def _truncate(text: str, limit: int) -> str:
    if not text:
        return ""
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + " …[truncated]"


def _visits_context(doc: dict[str, Any]) -> list[dict[str, Any]]:
    visits = list(doc.get("visits") or [])
    # Already stored newest-first by current write path; defensive sort by date.
    visits.sort(key=lambda v: str(v.get("date", "")), reverse=True)
    out: list[dict[str, Any]] = []
    for v in visits[:MAX_VISITS_IN_CONTEXT]:
        if not isinstance(v, dict):
            continue
        soap = v.get("soap") or {}
        out.append({
            "visit_id": v.get("id", ""),
            "date": v.get("date", ""),
            "visit_title": v.get("visit_title") or v.get("diagnosis", ""),
            "transcript": _truncate(v.get("transcript", "") or "", MAX_TRANSCRIPT_CHARS),
            "soap_assessment": (soap.get("assessment") or "").strip(),
            "soap_plan": (soap.get("plan") or "").strip(),
            "prescriptions": v.get("prescriptions") or [],
            "prescribed_medicines": v.get("prescribed_medicines") or [],
            "allergies_mentioned": v.get("allergies") or [],
            "medical_history": v.get("medical_history") or [],
        })
    return out


def _lab_reports_context(doc: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for lr in doc.get("lab_reports") or []:
        if not isinstance(lr, dict):
            continue
        out.append({
            "lab_report_id": lr.get("id", ""),
            "visit_id": lr.get("visit_id", ""),
            "recorded_at": lr.get("recorded_at", ""),
            "test_name": lr.get("test_name", ""),
            "lab_test_pattern": lr.get("lab_test_pattern", ""),
            "details": _truncate(lr.get("details", "") or "", MAX_LAB_DETAILS_CHARS),
        })
    return out


def _profile_for_prompt(profile: dict[str, Any]) -> dict[str, Any]:
    """Strip internal-only fields the model does not need to see."""
    def shape(rows: list[Any]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            if r.get("dismissed"):
                continue
            out.append({k: v for k, v in r.items() if k not in ("dismissed", "updated_at")})
        return out

    return {
        "allergies": shape(profile.get("allergies", [])),
        "long_term_medications": shape(profile.get("long_term_medications", [])),
        "conditions": shape(profile.get("conditions", [])),
    }


def _suppressed_from(profile: dict[str, Any]) -> dict[str, list[str]]:
    def names(rows: list[Any]) -> list[str]:
        out: list[str] = []
        for r in rows or []:
            if isinstance(r, dict) and r.get("dismissed"):
                n = (r.get("name") or "").strip()
                if n:
                    out.append(n)
        return out

    return {
        "allergies": names(profile.get("allergies", [])),
        "long_term_medications": names(profile.get("long_term_medications", [])),
        "conditions": names(profile.get("conditions", [])),
    }


def _norm_name(s: Any) -> str:
    return (str(s or "")).strip().lower()


def _merge_list(
    existing: list[dict[str, Any]],
    proposed: list[dict[str, Any]],
    *,
    id_prefix: str,
    allowed_keys: set[str],
) -> list[dict[str, Any]]:
    """Merge LLM-proposed rows into existing ones.

    - Locked rows (is_doctor_edited=true) are kept verbatim.
    - Dismissed rows are kept (so the LLM keeps avoiding them) but not modified.
    - Proposed rows match existing by id when given, otherwise by case-insensitive name.
    - Brand-new proposed rows get a fresh id and updated_at.
    """
    by_id: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}
    locked_or_dismissed: list[dict[str, Any]] = []
    other_existing: list[dict[str, Any]] = []
    for row in existing or []:
        if not isinstance(row, dict):
            continue
        if row.get("is_doctor_edited") or row.get("dismissed"):
            locked_or_dismissed.append(row)
        else:
            other_existing.append(row)
        rid = (row.get("id") or "").strip()
        if rid:
            by_id[rid] = row
        nm = _norm_name(row.get("name"))
        if nm and nm not in by_name:
            by_name[nm] = row

    suppressed_names = {
        _norm_name(r.get("name")) for r in (existing or [])
        if isinstance(r, dict) and r.get("dismissed")
    }

    merged: list[dict[str, Any]] = list(locked_or_dismissed)
    seen_ids = {r.get("id") for r in merged if isinstance(r, dict)}

    for prop in proposed or []:
        if not isinstance(prop, dict):
            continue
        nm = _norm_name(prop.get("name"))
        if not nm:
            continue
        if nm in suppressed_names:
            continue

        prop_id = (prop.get("id") or "").strip()
        match: dict[str, Any] | None = None
        if prop_id and prop_id in by_id:
            match = by_id[prop_id]
        elif nm in by_name:
            match = by_name[nm]

        if match is not None and (match.get("is_doctor_edited") or match.get("dismissed")):
            continue
        if match is not None and match.get("id") in seen_ids:
            continue

        base: dict[str, Any] = dict(match) if match else {}
        for k in allowed_keys:
            if k in prop:
                base[k] = prop[k]
        if not base.get("id"):
            base["id"] = _new_id(id_prefix)
        base.setdefault("is_doctor_edited", False)
        base.setdefault("dismissed", False)
        base["updated_at"] = _now_iso()
        merged.append(base)
        seen_ids.add(base["id"])

    # Drop non-locked, non-dismissed existing rows that the LLM no longer proposes.
    return merged


ALLERGY_KEYS = {"name", "severity", "reaction", "source_visit_ids"}
MED_KEYS = {"name", "dosage", "frequency", "indication", "source_visit_ids"}
CONDITION_KEYS = {
    "name",
    "category",
    "evidence",
    "source_visit_ids",
    "source_lab_report_ids",
}


def _merge_profile(
    existing: dict[str, Any],
    llm_output: dict[str, Any],
    *,
    last_visit_id: str,
) -> dict[str, Any]:
    return {
        "allergies": _merge_list(
            existing.get("allergies", []),
            llm_output.get("allergies", []),
            id_prefix="hpa",
            allowed_keys=ALLERGY_KEYS,
        ),
        "long_term_medications": _merge_list(
            existing.get("long_term_medications", []),
            llm_output.get("long_term_medications", []),
            id_prefix="hpm",
            allowed_keys=MED_KEYS,
        ),
        "conditions": _merge_list(
            existing.get("conditions", []),
            llm_output.get("conditions", []),
            id_prefix="hpc",
            allowed_keys=CONDITION_KEYS,
        ),
        "last_generated_at": _now_iso(),
        "last_visit_id": last_visit_id or existing.get("last_visit_id", ""),
    }


async def refresh_health_profile(
    db: AsyncIOMotorDatabase,
    doctor_id: str,
    patient_oid: ObjectId,
) -> None:
    """Best-effort background refresh of patient.health_profile. Never raises."""
    try:
        col = db[PATIENTS_COLLECTION]
        doc = await col.find_one({"_id": patient_oid, "doctor_id": doctor_id})
        if not doc:
            return

        patient_info = {
            "name": doc.get("name", ""),
            "age": doc.get("age", ""),
            "gender": doc.get("gender", ""),
        }
        existing_profile: dict[str, Any] = doc.get("health_profile") or {}
        visits = _visits_context(doc)
        labs = _lab_reports_context(doc)

        if not visits and not labs:
            return

        prompt_profile = _profile_for_prompt(existing_profile)
        suppressed = _suppressed_from(existing_profile)

        llm_output = await generate_health_profile_update(
            patient_info=patient_info,
            current_profile=prompt_profile,
            visits_context=visits,
            lab_reports_context=labs,
            suppressed_items=suppressed,
        )

        last_visit_id = visits[0]["visit_id"] if visits else ""
        merged = _merge_profile(existing_profile, llm_output, last_visit_id=last_visit_id)

        await col.update_one(
            {"_id": patient_oid, "doctor_id": doctor_id},
            {"$set": {"health_profile": merged}},
        )
    except Exception:
        logger.exception("refresh_health_profile failed for patient %s", patient_oid)


def reconcile_health_profile_patch(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any],
) -> dict[str, Any]:
    """Reconcile a doctor PATCH against the stored profile.

    Any item whose user-visible content differs from what is stored (or is brand new)
    is marked is_doctor_edited=True so the next LLM run preserves it. Items missing
    from the patch are removed (the doctor explicitly deleted them) — when the matched
    existing row was not already dismissed and the doctor removed it, we keep a
    dismissed=true tombstone so the LLM does not re-add the same thing.
    """
    existing = existing or {}
    out: dict[str, Any] = {}

    sections: list[tuple[str, set[str], str]] = [
        ("allergies", ALLERGY_KEYS, "hpa"),
        ("long_term_medications", MED_KEYS, "hpm"),
        ("conditions", CONDITION_KEYS, "hpc"),
    ]
    now = _now_iso()

    for key, content_keys, id_prefix in sections:
        existing_rows: list[dict[str, Any]] = list(existing.get(key) or [])
        existing_by_id = {(r.get("id") or ""): r for r in existing_rows if isinstance(r, dict)}
        seen_ids: set[str] = set()
        new_rows: list[dict[str, Any]] = []

        for raw in incoming.get(key) or []:
            if not isinstance(raw, dict):
                continue
            name = (raw.get("name") or "").strip()
            if not name:
                continue
            rid = (raw.get("id") or "").strip()
            stored = existing_by_id.get(rid) if rid else None

            row: dict[str, Any] = {}
            if stored:
                row.update(stored)
            for k in content_keys:
                if k in raw:
                    row[k] = raw[k]

            content_changed = False
            if not stored:
                content_changed = True
            else:
                for k in content_keys:
                    if (raw.get(k) if k in raw else stored.get(k)) != stored.get(k):
                        content_changed = True
                        break

            row["id"] = rid or _new_id(id_prefix)
            row["dismissed"] = bool(raw.get("dismissed", row.get("dismissed", False)))
            already_locked = bool(stored.get("is_doctor_edited")) if stored else False
            row["is_doctor_edited"] = bool(
                already_locked
                or content_changed
                or row["dismissed"] != bool(stored.get("dismissed", False) if stored else False)
            )
            row["updated_at"] = now
            new_rows.append(row)
            seen_ids.add(row["id"])

        # Tombstone rows the doctor removed in the patch (so the LLM stops re-adding them).
        for r in existing_rows:
            if not isinstance(r, dict):
                continue
            rid = r.get("id") or ""
            if rid and rid in seen_ids:
                continue
            tomb = dict(r)
            tomb["dismissed"] = True
            tomb["is_doctor_edited"] = True
            tomb["updated_at"] = now
            new_rows.append(tomb)

        out[key] = new_rows

    out["last_generated_at"] = existing.get("last_generated_at", "")
    out["last_visit_id"] = existing.get("last_visit_id", "")
    return out
