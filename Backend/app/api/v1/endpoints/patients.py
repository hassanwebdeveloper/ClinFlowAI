from datetime import datetime, timezone

import os
import tempfile

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.api.deps import get_current_doctor_id
from app.core.config import settings
from app.core.database import get_database
from app.schemas.patient import (
    AiSuggestion,
    AiSuggestionsResponse,
    PatientCreate,
    PatientOut,
    RegenerateSoapRequest,
    VisitIn,
    VisitPatch,
    VisitReference,
    VisitSoapPatch,
)
from app.services.together import (
    cosine_similarity,
    generate_ai_suggestions,
    generate_embedding,
    generate_soap_from_transcript,
    transcribe_whisper,
)

router = APIRouter()

PATIENTS_COLLECTION = "patients"


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


def _doc_to_out(doc: dict) -> PatientOut:
    visits_raw = doc.get("visits") or []
    visits = [VisitIn.model_validate(v) for v in visits_raw]
    return PatientOut(
        id=str(doc["_id"]),
        ui_id=doc["ui_id"],
        name=doc["name"],
        age=doc["age"],
        gender=doc["gender"],
        visits=visits,
    )


@router.get("", response_model=list[PatientOut])
async def list_patients(
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db[PATIENTS_COLLECTION].find({"doctor_id": doctor_id}).sort("created_at", -1)
    docs = await cursor.to_list(10000)
    return [_doc_to_out(d) for d in docs]


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
    col = db[PATIENTS_COLLECTION]
    if await col.find_one({"doctor_id": doctor_id, "ui_id": ui_id}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A patient with this UI id already exists",
        )
    now = datetime.now(timezone.utc)
    doc = {
        "doctor_id": doctor_id,
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


@router.post("/{patient_id}/visits/from-audio", response_model=PatientOut)
async def create_visit_from_audio(
    patient_id: str,
    audio: UploadFile = File(...),
    diagnosis: str = Form("Visit"),
    date: str = Form(""),
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_patient_oid(patient_id)
    patient = await db[PATIENTS_COLLECTION].find_one({"_id": oid, "doctor_id": doctor_id})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    ext = os.path.splitext(audio.filename or "")[1] or ".webm"
    safe_ext = ext if len(ext) <= 10 else ".webm"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(delete=False, suffix=safe_ext, dir=settings.UPLOAD_DIR) as tmp:
        tmp_path = tmp.name
        content = await audio.read()
        tmp.write(content)

    try:
        transcript = await transcribe_whisper(tmp_path)
        patient_info = {
            "name": patient.get("name", ""),
            "age": patient.get("age", ""),
            "gender": patient.get("gender", ""),
        }
        llm = await generate_soap_from_transcript(transcript, patient_info)
        soap = llm.get("soap") or {}
    except Exception as e:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=str(e)) from e

    visit_id = f"v-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    visit_date = date.strip() or datetime.now(timezone.utc).date().isoformat()
    audio_url = f"/uploads/{os.path.basename(tmp_path)}"
    title = (llm.get("visit_title") or "").strip()
    summary_rep = (llm.get("visit_summary_report") or "").strip()
    fallback_diag = diagnosis.strip() or "Visit"

    embedding: list[float] | None = None
    if summary_rep:
        try:
            embedding = await generate_embedding(summary_rep)
        except Exception:
            pass

    visit_doc: dict = {
        "id": visit_id,
        "date": visit_date,
        "visit_title": title,
        "visit_summary_report": summary_rep,
        "diagnosis": title or fallback_diag,
        "audio_url": audio_url,
        "transcript": transcript,
        "symptoms": llm.get("symptoms") or [],
        "duration": llm.get("duration") or "",
        "medical_history": llm.get("medical_history") or [],
        "allergies": llm.get("allergies") or [],
        "soap": soap,
        "prescriptions": [],
    }
    if embedding is not None:
        visit_doc["visit_summary_embedding"] = embedding

    updated = await db[PATIENTS_COLLECTION].find_one_and_update(
        {"_id": oid, "doctor_id": doctor_id},
        {"$push": {"visits": {"$each": [visit_doc], "$position": 0}}},
        return_document=ReturnDocument.AFTER,
    )
    return _doc_to_out(updated)


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
    try:
        llm = await generate_soap_from_transcript(transcript, patient_info)
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
