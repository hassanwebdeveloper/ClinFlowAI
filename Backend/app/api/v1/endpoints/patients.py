import asyncio
import json
from datetime import datetime, timezone

import os
import tempfile

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from starlette.datastructures import UploadFile
from pymongo import ReturnDocument

from app.api.deps import get_current_doctor_id
from app.core.config import settings
from app.core.database import get_database
from app.schemas.patient import (
    AiSuggestion,
    AiSuggestionsResponse,
    ExtractLabReportsResponse,
    LabPreviewItem,
    LabReportRecord,
    PatientCreate,
    PatientOut,
    PrepareVisitAudioResponse,
    RegenerateSoapRequest,
    VisitIn,
    VisitPatch,
    VisitReference,
    VisitSoapPatch,
)
from app.services.lab_reports import extract_lab_from_image_group, extract_lab_from_saved_file
from app.services.upload_cleanup import (
    collect_lab_file_url,
    collect_visit_file_urls,
    remove_upload_files,
)
from app.services.together import (
    cosine_similarity,
    generate_ai_suggestions,
    generate_embedding,
    generate_soap_from_transcript,
    transcribe_visit_audio,
)

router = APIRouter()

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

    return PatientOut(
        id=str(doc["_id"]),
        ui_id=doc["ui_id"],
        name=doc["name"],
        age=doc["age"],
        gender=doc["gender"],
        visits=visits,
        lab_reports=lab_all,
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
                details, method, sugg, patt = await extract_lab_from_saved_file(
                    segment[0][0], segment[0][1], segment[0][2]
                )
            else:
                details, method, sugg, patt = await extract_lab_from_image_group(segment)
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
        return ExtractLabReportsResponse(lab_previews=previews)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
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

        return PrepareVisitAudioResponse(
            transcript=transcript,
            lab_previews=lab_previews,
            transcript_segments=transcript_segments,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        for p in (*audio_tmp_paths, *(x[0] for x in lab_disk)):
            try:
                os.remove(p)
            except OSError:
                pass


@router.post("/{patient_id}/visits/from-audio", response_model=PatientOut)
async def create_visit_from_audio(
    patient_id: str,
    request: Request,
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

        async def run_labs() -> tuple[str, list[tuple[str, str, str, str, str, list[int]]]]:
            if not lab_disk:
                return "", []
            blocks: list[str] = []
            meta: list[tuple[str, str, str, str, str, list[int]]] = []
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
                if not details:
                    if len(segment) == 1:
                        details, method, sug2, pat2 = await extract_lab_from_saved_file(
                            segment[0][0], segment[0][1], segment[0][2]
                        )
                    else:
                        details, method, sug2, pat2 = await extract_lab_from_image_group(segment)
                    if not sugg:
                        sugg = sug2
                    if not lab_pat:
                        lab_pat = pat2.strip()
                user_n = lab_names[gi] if gi < len(lab_names) else ""
                final_name = user_n.strip() or sugg.strip() or _fallback_lab_title(display_fname, gi)
                blocks.append(f"--- Lab: {final_name} ({display_fname}, {method}) ---\n{details}")
                meta.append((details, method, display_fname, final_name, lab_pat, indices))
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
        llm = await generate_soap_from_transcript(transcript, patient_info, lab_ctx)
        soap = llm.get("soap") or {}

        visit_date = date.strip() or datetime.now(timezone.utc).date().isoformat()
        title = (llm.get("visit_title") or "").strip()
        summary_rep = (llm.get("visit_summary_report") or "").strip()
        fallback_diag = diagnosis.strip() or "Visit"

        embedding: list[float] | None = None
        if summary_rep:
            try:
                embedding = await generate_embedding(summary_rep)
            except Exception:
                pass

        recorded_at = datetime.now(timezone.utc).isoformat()
        base_lr = int(datetime.now(timezone.utc).timestamp() * 1000)
        bucket = AsyncIOMotorGridFSBucket(db, bucket_name=LAB_FILES_BUCKET)
        new_lab_records: list[dict] = []
        for i, (details, method, display_fname, test_name, lab_pat, indices) in enumerate(lab_meta_list):
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
            })

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
            "prescriptions": [],
        }
        if embedding is not None:
            visit_doc["visit_summary_embedding"] = embedding

        push_ops: dict = {"visits": {"$each": [visit_doc], "$position": 0}}
        if new_lab_records:
            push_ops["lab_reports"] = {"$each": new_lab_records}

        updated = await db[PATIENTS_COLLECTION].find_one_and_update(
            {"_id": oid, "doctor_id": doctor_id},
            {"$push": push_ops},
            return_document=ReturnDocument.AFTER,
        )
        return _doc_to_out(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
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
    return _doc_to_out(updated)


@router.post("/{patient_id}/visits/{visit_id}/regenerate-soap", response_model=PatientOut)
async def regenerate_visit_soap(
    patient_id: str,
    visit_id: str,
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
    lab_ctx = (v.get("lab_report_details") or "").strip() or None
    try:
        llm = await generate_soap_from_transcript(transcript, patient_info, lab_ctx)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    title = (llm.get("visit_title") or "").strip()
    summary_rep = (llm.get("visit_summary_report") or "").strip()

    embedding: list[float] | None = None
    if summary_rep:
        try:
            embedding = await generate_embedding(summary_rep)
        except Exception:
            pass

    merged = {
        **v,
        "symptoms": llm.get("symptoms") or [],
        "duration": llm.get("duration") or "",
        "medical_history": llm.get("medical_history") or [],
        "allergies": llm.get("allergies") or [],
        "prescribed_medicines": llm.get("prescribed_medicines") or [],
        "prescribed_lab_tests": llm.get("prescribed_lab_tests") or [],
        "soap": llm.get("soap") or v.get("soap", {}),
        "visit_title": title,
        "visit_summary_report": summary_rep,
    }
    if embedding is not None:
        merged["visit_summary_embedding"] = embedding
    if title:
        merged["diagnosis"] = title
    visits[idx] = merged
    await col.update_one({"_id": oid}, {"$set": {"visits": visits}})
    updated = await col.find_one({"_id": oid})
    return _doc_to_out(updated)


SIMILARITY_TOP_K = 5
SIMILARITY_THRESHOLD = 0.3


@router.post(
    "/{patient_id}/visits/{visit_id}/ai-suggestions",
    response_model=AiSuggestionsResponse,
)
async def get_ai_suggestions(
    patient_id: str,
    visit_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    col = db[PATIENTS_COLLECTION]
    doc = await col.find_one({"_id": oid, "doctor_id": doctor_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    visits = list(doc.get("visits") or [])
    current = next((v for v in visits if v.get("id") == visit_id), None)
    if current is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")

    transcript = (current.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visit has no transcript to analyse",
        )

    try:
        query_vec = await generate_embedding(transcript)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}") from e

    scored: list[tuple[float, dict]] = []
    for v in visits:
        if v.get("id") == visit_id:
            continue
        emb = v.get("visit_summary_embedding")
        if not emb or not isinstance(emb, list):
            continue
        sim = cosine_similarity(query_vec, emb)
        if sim >= SIMILARITY_THRESHOLD:
            scored.append((sim, v))

    scored.sort(key=lambda t: t[0], reverse=True)
    top_history = scored[:SIMILARITY_TOP_K]

    relevant_history = [
        {
            "visit_id": v.get("id", ""),
            "visit_date": v.get("date", ""),
            "visit_title": v.get("visit_title") or v.get("diagnosis", ""),
            "visit_summary_report": v.get("visit_summary_report", ""),
        }
        for _, v in top_history
    ]

    patient_info = {
        "name": doc.get("name", ""),
        "age": doc.get("age", ""),
        "gender": doc.get("gender", ""),
    }
    current_summary = (current.get("visit_summary_report") or "").strip()

    try:
        raw = await generate_ai_suggestions(transcript, patient_info, current_summary, relevant_history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    suggestions = [
        AiSuggestion(
            suggestion=s["suggestion"],
            references=[
                VisitReference(**r)
                for r in s.get("references", [])
                if r.get("visit_id")
            ],
        )
        for s in raw
    ]
    return AiSuggestionsResponse(suggestions=suggestions)


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
