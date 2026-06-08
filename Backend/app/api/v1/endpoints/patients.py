import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import os
import tempfile

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from starlette.datastructures import UploadFile
from pymongo import ReturnDocument

from app.api.deps import get_current_doctor_id
from app.core.config import settings
from app.core.database import get_database
from app.core.debug_log import feature_log, mask_id
from app.schemas.patient import (
    ExtractLabReportsResponse,
    HealthProfile,
    HealthProfileAllergy,
    HealthProfileCondition,
    HealthProfileMedication,
    HealthProfilePatch,
    LabAnalyteValue,
    LabPreviewItem,
    LabReportPatch,
    LabReportRecord,
    PatientCreate,
    PatientOut,
    PrepareVisitAudioResponse,
    RegenerateSoapRequest,
    VisitIn,
    VisitPatch,
    VisitSoapPatch,
)
from app.services.api_analytics import (
    bind_api_analytics_context,
    reset_api_analytics_context,
)
from app.services.health_profile import (
    reconcile_health_profile_patch,
    refresh_health_profile,
)
from app.services.lab_reports import (
    extract_lab_from_image_group,
    extract_lab_from_saved_file,
    extract_transcript_lab_reports,
    refresh_transcript_lab_reports_for_visit,
    transcript_lab_report_records,
)
from app.services.upload_cleanup import (
    collect_lab_file_url,
    collect_visit_file_urls,
    remove_upload_files,
)
from app.services.together import (
    cosine_similarity,
    extract_prescriptions_from_transcript,
    generate_ai_reminders_llm,
    generate_embedding,
    generate_soap_from_transcript,
    transcribe_visit_audio,
)

router = APIRouter()
_log = feature_log("patients")

PATIENTS_COLLECTION = "patients"
LAB_FILES_BUCKET = "lab_files"


def get_db() -> AsyncIOMotorDatabase:
    return get_database()


def _parse_patient_oid(patient_id: str) -> ObjectId:
    try:
        return ObjectId(patient_id)
    except InvalidId as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        ) from e


def _lab_reports_from_doc(doc: dict) -> list[LabReportRecord]:
    raw = doc.get("lab_reports") or []
    out: list[LabReportRecord] = []
    for item in raw:
        if isinstance(item, dict):
            try:
                out.append(LabReportRecord.model_validate(item))
            except Exception:
                continue
    return out


def _hp_str(v: Any) -> str:
    return "" if v is None else str(v)


def _hp_bool(v: Any) -> bool:
    return False if v is None else bool(v)


def _hp_str_list(v: Any) -> list[str]:
    if v is None:
        return []
    if not isinstance(v, list):
        return []
    out: list[str] = []
    for x in v:
        if x is None:
            continue
        s = str(x).strip()
        if s:
            out.append(s)
    return out


def _health_profile_allergy_from_row(d: dict) -> HealthProfileAllergy | None:
    try:
        return HealthProfileAllergy.model_validate(
            {
                "id": _hp_str(d.get("id")),
                "name": _hp_str(d.get("name")),
                "severity": _hp_str(d.get("severity")),
                "reaction": _hp_str(d.get("reaction")),
                "source_visit_ids": _hp_str_list(d.get("source_visit_ids")),
                "is_doctor_edited": _hp_bool(d.get("is_doctor_edited")),
                "dismissed": _hp_bool(d.get("dismissed")),
                "updated_at": _hp_str(d.get("updated_at")),
            }
        )
    except Exception:
        return None


def _health_profile_med_from_row(d: dict) -> HealthProfileMedication | None:
    try:
        return HealthProfileMedication.model_validate(
            {
                "id": _hp_str(d.get("id")),
                "name": _hp_str(d.get("name")),
                "dosage": _hp_str(d.get("dosage")),
                "frequency": _hp_str(d.get("frequency")),
                "indication": _hp_str(d.get("indication")),
                "source_visit_ids": _hp_str_list(d.get("source_visit_ids")),
                "is_doctor_edited": _hp_bool(d.get("is_doctor_edited")),
                "dismissed": _hp_bool(d.get("dismissed")),
                "updated_at": _hp_str(d.get("updated_at")),
            }
        )
    except Exception:
        return None


def _health_profile_condition_from_row(d: dict) -> HealthProfileCondition | None:
    try:
        return HealthProfileCondition.model_validate(
            {
                "id": _hp_str(d.get("id")),
                "name": _hp_str(d.get("name")),
                "category": _hp_str(d.get("category")),
                "evidence": _hp_str(d.get("evidence")),
                "source_visit_ids": _hp_str_list(d.get("source_visit_ids")),
                "source_lab_report_ids": _hp_str_list(d.get("source_lab_report_ids")),
                "is_doctor_edited": _hp_bool(d.get("is_doctor_edited")),
                "dismissed": _hp_bool(d.get("dismissed")),
                "updated_at": _hp_str(d.get("updated_at")),
            }
        )
    except Exception:
        return None


def _health_profile_from_doc(raw: Any) -> HealthProfile:
    """Parse Mongo health_profile without dropping the whole document on one bad row."""
    if not isinstance(raw, dict):
        return HealthProfile()
    allergies: list[HealthProfileAllergy] = []
    for a in raw.get("allergies") or []:
        if isinstance(a, dict):
            row = _health_profile_allergy_from_row(a)
            if row is not None:
                allergies.append(row)
    meds: list[HealthProfileMedication] = []
    for m in raw.get("long_term_medications") or []:
        if isinstance(m, dict):
            row = _health_profile_med_from_row(m)
            if row is not None:
                meds.append(row)
    conds: list[HealthProfileCondition] = []
    for c in raw.get("conditions") or []:
        if isinstance(c, dict):
            row = _health_profile_condition_from_row(c)
            if row is not None:
                conds.append(row)
    return HealthProfile(
        allergies=allergies,
        long_term_medications=meds,
        conditions=conds,
        last_generated_at=_hp_str(raw.get("last_generated_at")),
        last_visit_id=_hp_str(raw.get("last_visit_id")),
    )


def _doc_to_out(doc: dict) -> PatientOut:
    visits_raw = doc.get("visits") or []
    lab_all = _lab_reports_from_doc(doc)
    by_vid: dict[str, list[LabReportRecord]] = {}
    orphans: list[LabReportRecord] = []
    for lr in lab_all:
        vid = (lr.visit_id or "").strip()
        if vid:
            by_vid.setdefault(vid, []).append(lr)
        else:
            orphans.append(lr)
    # Legacy rows without visit_id: attribute to the only visit when unambiguous.
    if len(visits_raw) == 1 and orphans:
        only_id = (visits_raw[0].get("id") or "").strip()
        if only_id:
            by_vid.setdefault(only_id, []).extend(orphans)

    visits: list[VisitIn] = []
    for v in visits_raw:
        if not isinstance(v, dict):
            continue
        vid = (v.get("id") or "").strip()
        base = {k: val for k, val in v.items() if k != "lab_reports"}
        nested = list(by_vid.get(vid, []))
        visits.append(VisitIn.model_validate({**base, "lab_reports": nested}))

    health_profile = _health_profile_from_doc(doc.get("health_profile"))

    return PatientOut(
        id=str(doc["_id"]),
        ui_id=doc["ui_id"],
        name=doc["name"],
        age=doc["age"],
        gender=doc["gender"],
        visits=visits,
        lab_reports=lab_all,
        health_profile=health_profile,
    )


@router.get("", response_model=list[PatientOut])
async def list_patients(
    clinic_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = (
        db[PATIENTS_COLLECTION]
        .find({"doctor_id": doctor_id, "clinic_id": clinic_id})
        .sort("created_at", -1)
    )
    docs = await cursor.to_list(10000)
    _log.debug(
        doctor_id=mask_id(doctor_id),
        clinic_id=mask_id(clinic_id),
        count=len(docs),
    )
    return [_doc_to_out(d) for d in docs]


CLINICS_COLLECTION = "clinics"


@router.post("", response_model=PatientOut)
async def create_patient(
    body: PatientCreate,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    ui_id = body.ui_id.strip()
    if not ui_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="UI id cannot be empty",
        )
    clinic_id = body.clinic_id.strip()
    try:
        clinic_oid = ObjectId(clinic_id)
    except InvalidId as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid clinic_id",
        ) from e
    clinic = await db[CLINICS_COLLECTION].find_one({"_id": clinic_oid, "doctor_id": doctor_id})
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found",
        )
    col = db[PATIENTS_COLLECTION]
    if await col.find_one({"clinic_id": clinic_id, "ui_id": ui_id}):
        _log.warning(
            doctor_id=mask_id(doctor_id),
            clinic_id=mask_id(clinic_id),
            ui_id=ui_id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A patient with this reference ID already exists in this clinic",
        )
    now = datetime.now(timezone.utc)
    doc = {
        "doctor_id": doctor_id,
        "clinic_id": clinic_id,
        "ui_id": ui_id,
        "name": body.name.strip(),
        "age": body.age,
        "gender": body.gender.strip(),
        "visits": [],
        "created_at": now,
    }
    result = await col.insert_one(doc)
    doc["_id"] = result.inserted_id
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(str(result.inserted_id)),
        clinic_id=mask_id(clinic_id),
        ui_id=ui_id,
    )
    return _doc_to_out(doc)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    # Best-effort cleanup:
    # - legacy audio/lab files stored under /uploads
    # - GridFS lab files referenced by file_id
    urls: list[str] = []
    for v in doc.get("visits") or []:
        if isinstance(v, dict):
            urls.extend(collect_visit_file_urls(v))
    lab_bucket = AsyncIOMotorGridFSBucket(db, bucket_name=LAB_FILES_BUCKET)
    for lr in doc.get("lab_reports") or []:
        if not isinstance(lr, dict):
            continue
        u = collect_lab_file_url(lr)
        if u:
            urls.append(u)
        extras = lr.get("extra_file_ids") or []
        if not isinstance(extras, list):
            extras = []
        for fid in [lr.get("file_id"), *extras]:
            if isinstance(fid, str) and fid.strip():
                try:
                    await lab_bucket.delete(ObjectId(fid.strip()))
                except Exception:
                    pass
    remove_upload_files(*urls)
    await col.delete_one({"_id": oid, "doctor_id": doctor_id})
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(patient_id),
        visit_count=len(doc.get("visits") or []),
    )


@router.post("/{patient_id}/visits", response_model=PatientOut)
async def add_visit(
    patient_id: str,
    body: VisitIn,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    visit_dict = body.model_dump()
    visit_dict.pop("lab_reports", None)
    result = await col.find_one_and_update(
        {"_id": oid, "doctor_id": doctor_id},
        {"$push": {"visits": {"$each": [visit_dict], "$position": 0}}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(patient_id),
        visit_id=(visit_dict.get("id") or "-"),
    )
    return _doc_to_out(result)


MAX_AUDIO_FILES_PER_VISIT = 20
MAX_LAB_FILES_PER_VISIT = 12


def _upload_files_from_form(form, field_name: str) -> list[UploadFile]:
    """All multipart parts with this name (duplicate keys). Use Starlette UploadFile — not fastapi.UploadFile (different class)."""
    return [v for v in form.getlist(field_name) if isinstance(v, UploadFile)]


def _str_form_field(form, name: str, default: str = "") -> str:
    v = form.get(name)
    if v is None:
        return default
    if isinstance(v, str):
        return v
    return str(v)


def _fallback_lab_title(filename: str, index: int) -> str:
    stem = os.path.splitext(os.path.basename(filename or ""))[0].strip()
    return stem if stem else f"Lab report {index + 1}"


def _rebuild_visit_lab_context(doc: dict, visit_id: str) -> str:
    """Recompose the combined `--- Lab: ... ---` context for a visit from the
    patient's current `lab_reports` list, mirroring the format used at
    `create_visit_from_audio` time. Used so doctor-side edits to individual lab
    report `details` flow into SOAP regeneration.
    """
    if not visit_id:
        return ""
    blocks: list[str] = []
    for lr in (doc.get("lab_reports") or []):
        if not isinstance(lr, dict):
            continue
        if (lr.get("visit_id") or "").strip() != visit_id:
            continue
        details = (lr.get("details") or "").strip()
        if not details:
            continue
        test_name = (lr.get("test_name") or "").strip() or (lr.get("filename") or "lab-report")
        filename = (lr.get("filename") or "").strip() or test_name
        method = (lr.get("extraction_method") or "").strip() or "text"
        blocks.append(f"--- Lab: {test_name} ({filename}, {method}) ---\n{details}")
    return "\n\n".join(blocks).strip()


SIMILARITY_TOP_K = 5
SIMILARITY_THRESHOLD = 0.3


def _text_for_visit_similarity_embedding(summary: str, transcript: str, visit_title: str) -> str:
    t = summary.strip()
    if t:
        return t[:8000]
    parts: list[str] = []
    if visit_title.strip():
        parts.append(visit_title.strip())
    tx = transcript.strip()
    if tx:
        parts.append(tx[:6000])
    return "\n\n".join(parts).strip()


def _rank_similar_visits_by_embeddings(
    *,
    current_visit_id: str,
    query_embedding: list[float] | None,
    visits: list[dict],
    top_k: int = SIMILARITY_TOP_K,
    threshold: float = SIMILARITY_THRESHOLD,
) -> list[dict[str, Any]]:
    if not query_embedding:
        return []
    scored: list[tuple[float, dict]] = []
    for v in visits:
        if not isinstance(v, dict) or v.get("id") == current_visit_id:
            continue
        emb = v.get("visit_summary_embedding")
        if not emb or not isinstance(emb, list):
            continue
        sim = cosine_similarity(query_embedding, emb)
        if sim >= threshold:
            scored.append((sim, v))
    scored.sort(key=lambda item: item[0], reverse=True)
    out: list[dict[str, Any]] = []
    for sim, v in scored[:top_k]:
        vid = str(v.get("id", "")).strip()
        if not vid:
            continue
        out.append({
            "visit_id": vid,
            "visit_date": str(v.get("date", "")),
            "visit_title": str(v.get("visit_title") or v.get("diagnosis") or "").strip(),
            "similarity": round(float(sim), 4),
        })
    return out


def _lab_timeline_snippet_for_llm(doc: dict, pending_new: list[dict] | None, max_rows: int = 48) -> list[dict[str, Any]]:
    combined: list[dict] = list(doc.get("lab_reports") or [])
    combined = [x for x in combined if isinstance(x, dict)]
    if pending_new:
        combined = combined + [x for x in pending_new if isinstance(x, dict)]

    def _sort_rx(lr: dict) -> tuple[str, str]:
        return (str(lr.get("recorded_at") or "").strip(), str(lr.get("id") or "").strip())

    rows = sorted(combined, key=_sort_rx, reverse=True)[:max_rows]
    out: list[dict[str, Any]] = []
    for lr in rows:
        excerpt = str(lr.get("details") or "").strip()
        if len(excerpt) > 560:
            excerpt = excerpt[:560] + "…"
        analyte_chunks: list[str] = []
        for a in (lr.get("analytes") or [])[:10]:
            if not isinstance(a, dict):
                continue
            nm = str(a.get("name", "")).strip()
            if not nm:
                continue
            vl = a.get("value")
            unit = str(a.get("unit", "") or "").strip()
            analyte_chunks.append(f"{nm}={vl} {unit}".strip())
        out.append({
            "id": str(lr.get("id") or ""),
            "recorded_at": str(lr.get("recorded_at") or ""),
            "visit_id": str(lr.get("visit_id") or "").strip(),
            "test_name": str(lr.get("test_name") or "").strip(),
            "lab_test_pattern": str(lr.get("lab_test_pattern") or "").strip(),
            "details_excerpt": excerpt,
            "analytes_preview": "; ".join(analyte_chunks),
        })
    return out


async def build_ai_reminders_for_visit_after_soap(
    *,
    current_visit_id: str,
    current_visit_date: str,
    patient_doc: dict,
    transcript: str,
    soap_llm_bundle: dict[str, Any],
    visit_lab_context: str,
    visits_similarity_pool: list[dict],
    pending_lab_timeline_records: list[dict] | None,
) -> tuple[list[float] | None, dict[str, Any]]:
    """Compute embedding-for-similarity, cosine-ranked peer visits, and LLM reminders."""
    summary = str(soap_llm_bundle.get("visit_summary_report") or "").strip()
    title = str(soap_llm_bundle.get("visit_title") or "").strip()
    embed_txt = _text_for_visit_similarity_embedding(summary, transcript, title)

    query_vec: list[float] | None = None
    if embed_txt:
        try:
            query_vec = await generate_embedding(embed_txt)
        except Exception:
            query_vec = None

    similar = _rank_similar_visits_by_embeddings(
        current_visit_id=current_visit_id,
        query_embedding=query_vec,
        visits=visits_similarity_pool,
    )
    embedding_hints = list(similar)

    patient_info = {
        "name": patient_doc.get("name", ""),
        "age": patient_doc.get("age", ""),
        "gender": patient_doc.get("gender", ""),
    }
    structured = {
        "visit_title": title,
        "visit_summary_report": summary,
        "symptoms": soap_llm_bundle.get("symptoms") or [],
        "duration": soap_llm_bundle.get("duration") or "",
        "medical_history": soap_llm_bundle.get("medical_history") or [],
        "allergies": soap_llm_bundle.get("allergies") or [],
        "prescriptions": soap_llm_bundle.get("prescriptions") or [],
        "prescribed_medicines": soap_llm_bundle.get("prescribed_medicines") or [],
        "prescribed_lab_tests": soap_llm_bundle.get("prescribed_lab_tests") or [],
        "soap": soap_llm_bundle.get("soap") or {},
    }
    labs_rows = _lab_timeline_snippet_for_llm(patient_doc, pending_lab_timeline_records)
    ctx = visit_lab_context.strip() or ""

    try:
        llm_part = await generate_ai_reminders_llm(
            transcript,
            patient_info,
            summary,
            structured,
            ctx,
            labs_rows,
            embedding_hints,
            current_visit_date,
        )
    except Exception:
        llm_part = {"documentation_gaps": [], "repeat_lab_reminders": []}

    reminders: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "similar_visits": similar,
        "documentation_gaps": llm_part.get("documentation_gaps") or [],
        "repeat_lab_reminders": llm_part.get("repeat_lab_reminders") or [],
    }
    return query_vec, reminders


def _parse_optional_json_array(form, field: str) -> list | None:
    raw = _str_form_field(form, field, "").strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON for {field}",
        ) from e
    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field} must be a JSON array",
        )
    return parsed


def _parse_lab_report_groups(file_count: int, form) -> list[list[int]]:
    """
    Optional JSON field lab_report_groups: [[0,1,2],[3]] means files 0–2 are one logical report, file 3 another.
    Omitted or empty means each file is its own report (same as [[0],[1],...]).
    """
    raw = _str_form_field(form, "lab_report_groups", "").strip()
    if not raw:
        return [[i] for i in range(file_count)]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON for lab_report_groups",
        ) from e
    if not isinstance(data, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lab_report_groups must be a JSON array",
        )
    groups: list[list[int]] = []
    seen: set[int] = set()
    for g in data:
        if not isinstance(g, list) or not g:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each lab_report_groups entry must be a non-empty array of indices",
            )
        idxs: list[int] = []
        for x in g:
            if not isinstance(x, int) or x < 0 or x >= file_count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="lab_report_groups index out of range",
                )
            if x in seen:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Duplicate index in lab_report_groups",
                )
            seen.add(x)
            idxs.append(x)
        groups.append(idxs)
    if seen != set(range(file_count)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lab_report_groups must include each lab file index exactly once",
        )
    return groups


async def _extract_lab_previews_from_disk_grouped(
    lab_disk: list[tuple[str, str, str | None]],
    groups: list[list[int]],
) -> list[LabPreviewItem]:
    """Extract lab previews; each group is one logical report (multi-image groups use combined VL)."""
    out: list[LabPreviewItem] = []
    for indices in groups:
        segment = [lab_disk[i] for i in indices]
        first_fname = segment[0][1] or "lab-report"
        display_fname = first_fname if len(segment) == 1 else f"{first_fname} (+{len(segment) - 1} more)"
        try:
            if len(segment) == 1:
                details, method, sugg, patt, analytes = await extract_lab_from_saved_file(
                    segment[0][0], segment[0][1], segment[0][2]
                )
            else:
                details, method, sugg, patt, analytes = await extract_lab_from_image_group(segment)
            st = sugg.strip()
            out.append(
                LabPreviewItem(
                    filename=display_fname,
                    extraction_method=method,
                    details=details,
                    suggested_test_name=st,
                    needs_test_name=not bool(st),
                    lab_test_pattern=patt.strip(),
                    extraction_error=None,
                    analytes=[LabAnalyteValue.model_validate(a) for a in analytes],
                )
            )
        except Exception as e:
            out.append(
                LabPreviewItem(
                    filename=display_fname,
                    extraction_method="",
                    details="",
                    suggested_test_name="",
                    needs_test_name=True,
                    lab_test_pattern="",
                    extraction_error=str(e)[:800],
                    analytes=[],
                )
            )
    return out


async def _extract_lab_previews_from_disk_partial(
    lab_disk: list[tuple[str, str, str | None]],
) -> list[LabPreviewItem]:
    """One preview per file (no grouping)."""
    groups = [[i] for i in range(len(lab_disk))]
    return await _extract_lab_previews_from_disk_grouped(lab_disk, groups)


@router.post("/{patient_id}/visits/extract-lab-reports", response_model=ExtractLabReportsResponse)
async def extract_lab_reports(
    patient_id: str,
    request: Request,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Run vision/text lab extraction on uploaded files only (no visit, no transcript)."""
    form = await request.form()
    labs = _upload_files_from_form(form, "lab_report")

    oid = _parse_patient_oid(patient_id)
    patient = await db[PATIENTS_COLLECTION].find_one({"_id": oid, "doctor_id": doctor_id})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not labs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one lab_report file is required",
        )
    if len(labs) > MAX_LAB_FILES_PER_VISIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {MAX_LAB_FILES_PER_VISIT} lab report files per visit",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    lab_disk: list[tuple[str, str, str | None]] = []
    analytics_token = bind_api_analytics_context(
        doctor_id=doctor_id,
        patient_id=patient_id,
        feature="extract_lab_reports",
    )

    try:
        for upload in labs:
            ext = os.path.splitext(upload.filename or "")[1] or ".bin"
            safe_ext = ext if len(ext) <= 10 else ".bin"
            with tempfile.NamedTemporaryFile(delete=False, suffix=safe_ext, dir=settings.UPLOAD_DIR) as tmp:
                tmp_path = tmp.name
                content = await upload.read()
                tmp.write(content)
            lab_disk.append((tmp_path, upload.filename or "lab-report", upload.content_type))

        groups = _parse_lab_report_groups(len(lab_disk), form)
        previews = await _extract_lab_previews_from_disk_grouped(lab_disk, groups)
        _log.info(
            doctor_id=mask_id(doctor_id),
            patient_id=mask_id(patient_id),
            file_count=len(lab_disk),
            preview_count=len(previews),
        )
        return ExtractLabReportsResponse(lab_previews=previews)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        reset_api_analytics_context(analytics_token)
        for p in (x[0] for x in lab_disk):
            try:
                os.remove(p)
            except OSError:
                pass


@router.post("/{patient_id}/visits/prepare-audio", response_model=PrepareVisitAudioResponse)
async def prepare_visit_from_audio(
    patient_id: str,
    request: Request,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Transcribe audio and extract lab documents without creating a visit (for review before SOAP)."""
    form = await request.form()
    audio_list = _upload_files_from_form(form, "audio")
    labs = _upload_files_from_form(form, "lab_report")

    oid = _parse_patient_oid(patient_id)
    patient = await db[PATIENTS_COLLECTION].find_one({"_id": oid, "doctor_id": doctor_id})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not audio_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one audio file is required",
        )
    if len(audio_list) > MAX_AUDIO_FILES_PER_VISIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {MAX_AUDIO_FILES_PER_VISIT} audio files per visit",
        )
    if len(labs) > MAX_LAB_FILES_PER_VISIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {MAX_LAB_FILES_PER_VISIT} lab report files per visit",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    audio_tmp_paths: list[str] = []
    lab_disk: list[tuple[str, str, str | None]] = []
    analytics_token = bind_api_analytics_context(
        doctor_id=doctor_id,
        patient_id=patient_id,
        feature="prepare_visit_from_audio",
    )

    try:
        for upload in audio_list:
            ext = os.path.splitext(upload.filename or "")[1] or ".webm"
            safe_ext = ext if len(ext) <= 10 else ".webm"
            with tempfile.NamedTemporaryFile(delete=False, suffix=safe_ext, dir=settings.UPLOAD_DIR) as tmp:
                tmp_path = tmp.name
                content = await upload.read()
                tmp.write(content)
            audio_tmp_paths.append(tmp_path)

        for upload in labs:
            ext = os.path.splitext(upload.filename or "")[1] or ".bin"
            safe_ext = ext if len(ext) <= 10 else ".bin"
            with tempfile.NamedTemporaryFile(delete=False, suffix=safe_ext, dir=settings.UPLOAD_DIR) as tmp:
                tmp_path = tmp.name
                content = await upload.read()
                tmp.write(content)
            lab_disk.append((tmp_path, upload.filename or "lab-report", upload.content_type))

        async def run_transcripts() -> tuple[str, list[str]]:
            segments: list[str] = []
            for path in audio_tmp_paths:
                t = await transcribe_visit_audio(path)
                segments.append((t or "").strip())
            combined = "\n\n".join(s for s in segments if s)
            return combined, segments

        async def run_lab_previews() -> list[LabPreviewItem]:
            if not lab_disk:
                return []
            groups = _parse_lab_report_groups(len(lab_disk), form)
            return await _extract_lab_previews_from_disk_grouped(lab_disk, groups)

        (transcript, transcript_segments), lab_previews = await asyncio.gather(
            run_transcripts(),
            run_lab_previews(),
        )

        _log.info(
            doctor_id=mask_id(doctor_id),
            patient_id=mask_id(patient_id),
            audio_count=len(audio_tmp_paths),
            lab_count=len(lab_disk),
            transcript_chars=len(transcript),
            lab_preview_count=len(lab_previews),
        )
        return PrepareVisitAudioResponse(
            transcript=transcript,
            lab_previews=lab_previews,
            transcript_segments=transcript_segments,
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.error(
            doctor_id=mask_id(doctor_id),
            patient_id=mask_id(patient_id),
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        reset_api_analytics_context(analytics_token)
        for p in (*audio_tmp_paths, *(x[0] for x in lab_disk)):
            try:
                os.remove(p)
            except OSError:
                pass


@router.post("/{patient_id}/visits/from-audio", response_model=PatientOut)
async def create_visit_from_audio(
    patient_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    form = await request.form()
    audio_list = _upload_files_from_form(form, "audio")
    labs = _upload_files_from_form(form, "lab_report")
    diagnosis = _str_form_field(form, "diagnosis", "Visit").strip() or "Visit"
    date = _str_form_field(form, "date", "").strip()
    transcript_override = _str_form_field(form, "transcript", "").strip()
    lab_cache_entries = _parse_optional_json_array(form, "lab_cache")
    lab_names_raw = _parse_optional_json_array(form, "lab_test_names")
    lab_names: list[str] = []
    if lab_names_raw is not None:
        lab_names = [str(x).strip() if x is not None else "" for x in lab_names_raw]

    lab_groups = _parse_lab_report_groups(len(labs), form) if labs else []

    oid = _parse_patient_oid(patient_id)
    patient = await db[PATIENTS_COLLECTION].find_one({"_id": oid, "doctor_id": doctor_id})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not audio_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one audio file is required",
        )
    if len(audio_list) > MAX_AUDIO_FILES_PER_VISIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {MAX_AUDIO_FILES_PER_VISIT} audio files per visit",
        )
    if len(labs) > MAX_LAB_FILES_PER_VISIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {MAX_LAB_FILES_PER_VISIT} lab report files per visit",
        )
    if labs and lab_names and len(lab_names) != len(lab_groups):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lab_test_names must include one string per logical lab report (same order as lab_report_groups)",
        )
    if labs and lab_cache_entries is not None and len(lab_cache_entries) != len(lab_groups):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lab_cache must include one object per logical lab report (same order as lab_report_groups)",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    audio_tmp_paths: list[str] = []
    lab_disk: list[tuple[str, str, str | None]] = []
    visit_id = f"v-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    analytics_token = bind_api_analytics_context(
        doctor_id=doctor_id,
        patient_id=patient_id,
        feature="create_visit_from_audio",
    )
    try:
        for upload in audio_list:
            ext = os.path.splitext(upload.filename or "")[1] or ".webm"
            safe_ext = ext if len(ext) <= 10 else ".webm"
            with tempfile.NamedTemporaryFile(delete=False, suffix=safe_ext, dir=settings.UPLOAD_DIR) as tmp:
                tmp_path = tmp.name
                content = await upload.read()
                tmp.write(content)
            audio_tmp_paths.append(tmp_path)

        for upload in labs:
            ext = os.path.splitext(upload.filename or "")[1] or ".bin"
            safe_ext = ext if len(ext) <= 10 else ".bin"
            with tempfile.NamedTemporaryFile(delete=False, suffix=safe_ext, dir=settings.UPLOAD_DIR) as tmp:
                tmp_path = tmp.name
                content = await upload.read()
                tmp.write(content)
            lab_disk.append((tmp_path, upload.filename or "lab-report", upload.content_type))

        async def run_transcripts() -> str:
            if transcript_override:
                return transcript_override
            parts: list[str] = []
            for path in audio_tmp_paths:
                t = await transcribe_visit_audio(path)
                parts.append((t or "").strip())
            return "\n\n".join(p for p in parts if p)

        async def run_labs() -> tuple[
            str,
            list[tuple[str, str, str, str, str, list[int], list[dict], str]],
        ]:
            if not lab_disk:
                return "", []
            blocks: list[str] = []
            meta: list[tuple[str, str, str, str, str, list[int], list[dict], str]] = []
            for gi, indices in enumerate(lab_groups):
                segment = [lab_disk[i] for i in indices]
                first_fname = segment[0][1] or "lab-report"
                display_fname = (
                    first_fname if len(segment) == 1 else f"{first_fname} (+{len(segment) - 1} more)"
                )
                details = ""
                method = "text"
                sugg = ""
                lab_pat = ""
                cached_analytes: list[dict] = []
                use_cache = (
                    lab_cache_entries is not None
                    and gi < len(lab_cache_entries)
                    and isinstance(lab_cache_entries[gi], dict)
                )
                if use_cache:
                    ce = lab_cache_entries[gi]
                    details = (ce.get("details") or "").strip()
                    method = (ce.get("extraction_method") or "text").strip() or "text"
                    sugg = (ce.get("suggested_test_name") or "").strip()
                    lab_pat = (ce.get("lab_test_pattern") or "").strip()
                    raw_an = ce.get("analytes")
                    if isinstance(raw_an, list):
                        for a in raw_an:
                            if not isinstance(a, dict):
                                continue
                            try:
                                cached_analytes.append(
                                    LabAnalyteValue.model_validate(a).model_dump()
                                )
                            except Exception:
                                continue
                analytes_list: list[dict] = list(cached_analytes)
                if not details:
                    if len(segment) == 1:
                        details, method, sug2, pat2, an2 = await extract_lab_from_saved_file(
                            segment[0][0], segment[0][1], segment[0][2]
                        )
                    else:
                        details, method, sug2, pat2, an2 = await extract_lab_from_image_group(segment)
                    if not sugg:
                        sugg = sug2
                    if not lab_pat:
                        lab_pat = pat2.strip()
                    if not analytes_list:
                        analytes_list = list(an2)
                user_n = lab_names[gi] if gi < len(lab_names) else ""
                clean_name = user_n.strip() or sugg.strip()
                final_name = clean_name or _fallback_lab_title(display_fname, gi)
                blocks.append(f"--- Lab: {final_name} ({display_fname}, {method}) ---\n{details}")
                meta.append((
                    details, method, display_fname, final_name, lab_pat,
                    indices, analytes_list, clean_name,
                ))
            return "\n\n".join(blocks), meta

        transcript, (lab_context, lab_meta_list) = await asyncio.gather(
            run_transcripts(),
            run_labs(),
        )

        patient_info = {
            "name": patient.get("name", ""),
            "age": patient.get("age", ""),
            "gender": patient.get("gender", ""),
        }
        lab_ctx = lab_context.strip() or None

        # Doctor-spoken lab values: extract structured lab reports from the
        # transcript so they appear alongside uploaded reports (chartable, on the
        # same patient timeline). Uploaded files take priority — only real test
        # names (user-typed or LLM-suggested from the document) are passed as
        # exclusions, so a fallback filename stem doesn't shadow a spoken test.
        uploaded_test_names = [m[7] for m in lab_meta_list if m[7]]

        async def run_transcript_labs() -> list[dict]:
            if not transcript.strip():
                return []
            try:
                return await extract_transcript_lab_reports(transcript, uploaded_test_names)
            except Exception:
                return []

        llm, transcript_lab_items = await asyncio.gather(
            generate_soap_from_transcript(transcript, patient_info, lab_ctx),
            run_transcript_labs(),
        )
        soap = llm.get("soap") or {}

        visit_date = date.strip() or datetime.now(timezone.utc).date().isoformat()
        title = (llm.get("visit_title") or "").strip()
        summary_rep = (llm.get("visit_summary_report") or "").strip()
        fallback_diag = diagnosis.strip() or "Visit"

        recorded_at = datetime.now(timezone.utc).isoformat()
        base_lr = int(datetime.now(timezone.utc).timestamp() * 1000)
        bucket = AsyncIOMotorGridFSBucket(db, bucket_name=LAB_FILES_BUCKET)
        new_lab_records: list[dict] = []
        for i, (details, method, display_fname, test_name, lab_pat, indices, analytes, _clean) in enumerate(lab_meta_list):
            extra_ids: list[str] = []
            extra_urls: list[str] = []
            file_id: str | None = None
            file_url: str | None = None
            for j, idx in enumerate(indices):
                path, original_name, content_type = lab_disk[idx]
                try:
                    with open(path, "rb") as f:
                        gid = await bucket.upload_from_stream(
                            original_name or display_fname or "lab-report",
                            f,
                            metadata={
                                "doctor_id": doctor_id,
                                "patient_id": str(oid),
                                "visit_id": visit_id,
                                "original_filename": original_name or display_fname or "lab-report",
                                "content_type": content_type,
                            },
                        )
                    fid_str = str(gid)
                    u = f"/api/v1/lab-files/{fid_str}"
                    if j == 0:
                        file_id, file_url = fid_str, u
                    else:
                        extra_ids.append(fid_str)
                        extra_urls.append(u)
                except Exception:
                    pass
            new_lab_records.append({
                "id": f"lr-{base_lr}-{i}",
                "recorded_at": recorded_at,
                "filename": display_fname,
                "extraction_method": method,
                "details": details,
                "test_name": test_name,
                "lab_test_pattern": lab_pat,
                "visit_id": visit_id,
                "file_id": file_id,
                "file_url": file_url,
                "extra_file_ids": extra_ids,
                "extra_file_urls": extra_urls,
                "analytes": list(analytes or []),
            })

        # Append any lab reports the doctor verbally described (no uploaded file).
        # These already have uploaded test names filtered out, so uploads keep priority.
        new_lab_records.extend(
            transcript_lab_report_records(
                transcript_lab_items, visit_id, id_base_ms=base_lr
            )
        )

        visit_doc: dict = {
            "id": visit_id,
            "date": visit_date,
            "visit_title": title,
            "visit_summary_report": summary_rep,
            "diagnosis": title or fallback_diag,
            "audio_url": None,
            "audio_urls": [],
            "transcript": transcript,
            "lab_report_details": (lab_context or "").strip(),
            "symptoms": llm.get("symptoms") or [],
            "duration": llm.get("duration") or "",
            "medical_history": llm.get("medical_history") or [],
            "allergies": llm.get("allergies") or [],
            "prescribed_medicines": llm.get("prescribed_medicines") or [],
            "prescribed_lab_tests": llm.get("prescribed_lab_tests") or [],
            "soap": soap,
            "prescriptions": llm.get("prescriptions") or [],
            # Reminders (+ summary embedding for similarity) are generated on first open
            # so peer-visit embeddings and DB state are stable.
            "ai_reminders_pending": True,
        }

        push_ops: dict = {"visits": {"$each": [visit_doc], "$position": 0}}
        if new_lab_records:
            push_ops["lab_reports"] = {"$each": new_lab_records}

        updated = await db[PATIENTS_COLLECTION].find_one_and_update(
            {"_id": oid, "doctor_id": doctor_id},
            {"$push": push_ops},
            return_document=ReturnDocument.AFTER,
        )

        background_tasks.add_task(refresh_health_profile, db, doctor_id, oid)

        _log.info(
            doctor_id=mask_id(doctor_id),
            patient_id=mask_id(patient_id),
            visit_id=visit_id,
            audio_count=len(audio_tmp_paths),
            lab_count=len(lab_disk),
            lab_record_count=len(new_lab_records),
            transcript_chars=len(transcript),
            ai_reminders_pending=True,
        )
        return _doc_to_out(updated)
    except HTTPException:
        raise
    except Exception as e:
        _log.error(
            doctor_id=mask_id(doctor_id),
            patient_id=mask_id(patient_id),
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        reset_api_analytics_context(analytics_token)
        # Audio is only needed to generate transcript/notes; remove it always.
        for p in audio_tmp_paths:
            try:
                os.remove(p)
            except OSError:
                pass
        # Lab files are uploaded to GridFS; remove disk temp files always.
        for p, _, _ in lab_disk:
            try:
                os.remove(p)
            except OSError:
                pass


def _apply_visit_patch(visit: dict, body: VisitPatch) -> dict:
    data = body.model_dump(exclude_unset=True)
    out = {**visit}
    for k, v in data.items():
        out[k] = v
    return out


@router.patch("/{patient_id}/visits/{visit_id}", response_model=PatientOut)
async def patch_visit(
    patient_id: str,
    visit_id: str,
    body: VisitPatch,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    visits = list(doc.get("visits") or [])
    found = False
    for i, v in enumerate(visits):
        if v.get("id") == visit_id:
            visits[i] = _apply_visit_patch(v, body)
            found = True
            break
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found",
        )
    await col.update_one({"_id": oid}, {"$set": {"visits": visits}})
    updated = await col.find_one({"_id": oid})
    return _doc_to_out(updated)


@router.post("/{patient_id}/visits/{visit_id}/hydrate-prescriptions", response_model=PatientOut)
async def hydrate_visit_prescriptions(
    patient_id: str,
    visit_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Backfill structured prescriptions (with dosage/frequency when spoken) from the visit transcript.

    No-op when the visit already has any prescription row with dosage or frequency saved.
    Does not clear legacy medicine names when extraction returns nothing.
    """
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    visits = list(doc.get("visits") or [])
    idx = next((i for i, v in enumerate(visits) if v.get("id") == visit_id), None)
    if idx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found",
        )
    v = visits[idx]
    transcript = str(v.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visit has no transcript",
        )
    existing_rx = v.get("prescriptions") or []
    if isinstance(existing_rx, list):
        for row in existing_rx:
            if isinstance(row, dict):
                if str(row.get("dosage") or "").strip() or str(row.get("frequency") or "").strip():
                    return _doc_to_out(doc)

    analytics_token = bind_api_analytics_context(
        doctor_id=doctor_id,
        patient_id=patient_id,
        feature="hydrate_prescriptions",
    )
    try:
        new_rx = await extract_prescriptions_from_transcript(transcript)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        reset_api_analytics_context(analytics_token)
    if not new_rx:
        _log.info(
            doctor_id=mask_id(doctor_id),
            patient_id=mask_id(patient_id),
            visit_id=visit_id,
        )
        return _doc_to_out(doc)

    names = [r["medicine"] for r in new_rx]
    visits[idx] = {**v, "prescriptions": new_rx, "prescribed_medicines": names}
    await col.update_one({"_id": oid, "doctor_id": doctor_id}, {"$set": {"visits": visits}})
    updated = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(patient_id),
        visit_id=visit_id,
        prescription_count=len(new_rx),
    )
    return _doc_to_out(updated)


@router.delete("/{patient_id}/visits/{visit_id}", response_model=PatientOut)
async def delete_visit(
    patient_id: str,
    visit_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    visits = list(doc.get("visits") or [])
    n_before = len(visits)
    visits = [v for v in visits if v.get("id") != visit_id]
    if len(visits) == n_before:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found",
        )
    lab_reports = list(doc.get("lab_reports") or [])
    for i, lr in enumerate(lab_reports):
        if (lr.get("visit_id") or "").strip() == visit_id:
            lab_reports[i] = {**lr, "visit_id": ""}
    await col.update_one(
        {"_id": oid},
        {"$set": {"visits": visits, "lab_reports": lab_reports}},
    )
    updated = await col.find_one({"_id": oid})
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(patient_id),
        visit_id=visit_id,
    )
    return _doc_to_out(updated)


@router.post("/{patient_id}/visits/{visit_id}/regenerate-soap", response_model=PatientOut)
async def regenerate_visit_soap(
    patient_id: str,
    visit_id: str,
    background_tasks: BackgroundTasks,
    body: RegenerateSoapRequest = RegenerateSoapRequest(),
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    visits = list(doc.get("visits") or [])
    idx = next((i for i, v in enumerate(visits) if v.get("id") == visit_id), None)
    if idx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found",
        )
    v = visits[idx]
    if body.transcript is not None:
        v = {**v, "transcript": body.transcript.strip()}
        visits[idx] = v
    transcript = (v.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visit has no transcript to regenerate from",
        )
    patient_info = {
        "name": doc.get("name", ""),
        "age": doc.get("age", ""),
        "gender": doc.get("gender", ""),
    }
    analytics_token = bind_api_analytics_context(
        doctor_id=doctor_id,
        patient_id=patient_id,
        feature="regenerate_visit_soap",
    )
    try:
        lab_reports = await refresh_transcript_lab_reports_for_visit(
            list(doc.get("lab_reports") or []),
            visit_id,
            transcript,
        )
        doc = {**doc, "lab_reports": lab_reports}
        rebuilt_lab_ctx = _rebuild_visit_lab_context(doc, visit_id)
        if rebuilt_lab_ctx != (v.get("lab_report_details") or ""):
            v = {**v, "lab_report_details": rebuilt_lab_ctx}
            visits[idx] = v
        lab_ctx = rebuilt_lab_ctx.strip() or None
        try:
            llm = await generate_soap_from_transcript(transcript, patient_info, lab_ctx)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

        title = (llm.get("visit_title") or "").strip()
        summary_rep = (llm.get("visit_summary_report") or "").strip()

        merged = {
            **v,
            "symptoms": llm.get("symptoms") or [],
            "duration": llm.get("duration") or "",
            "medical_history": llm.get("medical_history") or [],
            "allergies": llm.get("allergies") or [],
            "prescribed_medicines": llm.get("prescribed_medicines") or [],
            "prescriptions": llm.get("prescriptions") or [],
            "prescribed_lab_tests": llm.get("prescribed_lab_tests") or [],
            "soap": llm.get("soap") or v.get("soap", {}),
            "visit_title": title,
            "visit_summary_report": summary_rep,
            "lab_report_details": rebuilt_lab_ctx,
        }
        if title:
            merged["diagnosis"] = title

        emb_vec, reminders_raw = await build_ai_reminders_for_visit_after_soap(
            current_visit_id=visit_id,
            current_visit_date=str(v.get("date") or ""),
            patient_doc=dict(doc),
            transcript=transcript,
            soap_llm_bundle=dict(llm),
            visit_lab_context=rebuilt_lab_ctx,
            visits_similarity_pool=list(visits),
            pending_lab_timeline_records=None,
        )
        merged["ai_reminders"] = reminders_raw
        merged["ai_reminders_pending"] = False
        if emb_vec:
            merged["visit_summary_embedding"] = emb_vec

        visits[idx] = merged
        await col.update_one(
            {"_id": oid, "doctor_id": doctor_id},
            {"$set": {"visits": visits, "lab_reports": lab_reports}},
        )

        background_tasks.add_task(refresh_health_profile, db, doctor_id, oid)

        updated = await col.find_one({"_id": oid, "doctor_id": doctor_id})
        _log.info(
            doctor_id=mask_id(doctor_id),
            patient_id=mask_id(patient_id),
            visit_id=visit_id,
            transcript_chars=len(transcript),
            has_embedding=bool(emb_vec),
        )
        return _doc_to_out(updated)
    finally:
        reset_api_analytics_context(analytics_token)


@router.post(
    "/{patient_id}/visits/{visit_id}/refresh-ai-reminders",
    response_model=PatientOut,
)
async def refresh_visit_ai_reminders(
    patient_id: str,
    visit_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Rebuild AI reminders and visit summary embedding — fully awaited (no background split).

    Clients should call this when `ai_reminders_pending` is True (new audio visit). The response
    returns only after embeddings and the reminder LLM finish and are persisted.
    """
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    visits = list(doc.get("visits") or [])
    idx = next((i for i, x in enumerate(visits) if x.get("id") == visit_id), None)
    if idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")

    v = visits[idx]
    transcript = str(v.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visit has no transcript to analyse",
        )
    rebuilt_lab_ctx = _rebuild_visit_lab_context(doc, visit_id)

    merged_bundle = {
        "visit_title": str(v.get("visit_title") or ""),
        "visit_summary_report": str(v.get("visit_summary_report") or ""),
        "symptoms": v.get("symptoms") or [],
        "duration": str(v.get("duration") or ""),
        "medical_history": v.get("medical_history") or [],
        "allergies": v.get("allergies") or [],
        "prescriptions": v.get("prescriptions") or [],
        "prescribed_medicines": v.get("prescribed_medicines") or [],
        "prescribed_lab_tests": v.get("prescribed_lab_tests") or [],
        "soap": v.get("soap") or {},
    }

    analytics_token = bind_api_analytics_context(
        doctor_id=doctor_id,
        patient_id=patient_id,
        feature="refresh_visit_ai_reminders",
    )
    try:
        emb_vec, reminders_raw = await build_ai_reminders_for_visit_after_soap(
            current_visit_id=visit_id,
            current_visit_date=str(v.get("date") or ""),
            patient_doc=dict(doc),
            transcript=transcript,
            soap_llm_bundle=merged_bundle,
            visit_lab_context=rebuilt_lab_ctx,
            visits_similarity_pool=list(visits),
            pending_lab_timeline_records=None,
        )
    finally:
        reset_api_analytics_context(analytics_token)
    patched = dict(v)
    patched["ai_reminders"] = reminders_raw
    patched["ai_reminders_pending"] = False
    if emb_vec:
        patched["visit_summary_embedding"] = emb_vec
    if rebuilt_lab_ctx != (v.get("lab_report_details") or ""):
        patched["lab_report_details"] = rebuilt_lab_ctx
    visits[idx] = patched

    await col.update_one({"_id": oid, "doctor_id": doctor_id}, {"$set": {"visits": visits}})
    updated = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(patient_id),
        visit_id=visit_id,
        reminder_count=len(reminders_raw or []),
        has_embedding=bool(emb_vec),
    )
    return _doc_to_out(updated)


@router.patch("/{patient_id}/visits/{visit_id}/soap", response_model=PatientOut)
async def patch_visit_soap(
    patient_id: str,
    visit_id: str,
    body: VisitSoapPatch,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    visits = list(doc.get("visits") or [])
    found = False
    for i, v in enumerate(visits):
        if v.get("id") == visit_id:
            visits[i] = {**v, "soap": body.model_dump()}
            found = True
            break
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found",
        )
    await col.update_one({"_id": oid}, {"$set": {"visits": visits}})
    updated = await col.find_one({"_id": oid})
    return _doc_to_out(updated)


@router.patch("/{patient_id}/health-profile", response_model=PatientOut)
async def patch_health_profile(
    patient_id: str,
    body: HealthProfilePatch,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Doctor-side full replacement of the three profile lists.

    Items whose content differs from what is stored (or are brand new) are marked
    is_doctor_edited=true so subsequent LLM regenerations preserve them. Items
    omitted from the patch are tombstoned (dismissed=true) so the LLM stops
    re-introducing them.
    """
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    existing = doc.get("health_profile") or {}
    incoming = body.model_dump()
    merged = reconcile_health_profile_patch(existing, incoming)
    await col.update_one(
        {"_id": oid, "doctor_id": doctor_id},
        {"$set": {"health_profile": merged}},
    )
    updated = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(patient_id),
        conditions=len(merged.get("conditions") or []),
        medications=len(merged.get("medications") or []),
        allergies=len(merged.get("allergies") or []),
    )
    return _doc_to_out(updated)


@router.patch(
    "/{patient_id}/lab-reports/{lab_report_id}",
    response_model=PatientOut,
)
async def patch_lab_report(
    patient_id: str,
    lab_report_id: str,
    body: LabReportPatch,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Doctor-side edit of a single lab report's extracted text (`details`).

    Only updates fields that were sent. The visit's combined `lab_report_details`
    cache is intentionally NOT rebuilt here — it's recomposed lazily by
    `regenerate_visit_soap` so any further edits before regeneration are picked
    up in one shot.
    """
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    lab_reports = list(doc.get("lab_reports") or [])
    idx = next(
        (i for i, lr in enumerate(lab_reports) if isinstance(lr, dict) and lr.get("id") == lab_report_id),
        None,
    )
    if idx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lab report not found",
        )
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        return _doc_to_out(doc)
    updated_lr = {**lab_reports[idx]}
    if "details" in patch:
        updated_lr["details"] = (patch["details"] or "").strip()
    lab_reports[idx] = updated_lr
    await col.update_one({"_id": oid}, {"$set": {"lab_reports": lab_reports}})
    updated = await col.find_one({"_id": oid})
    _log.info(
        doctor_id=mask_id(doctor_id),
        patient_id=mask_id(patient_id),
        lab_report_id=lab_report_id,
        fields=list(patch.keys()),
    )
    return _doc_to_out(updated)
