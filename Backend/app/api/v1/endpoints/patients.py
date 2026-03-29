from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.api.deps import get_current_doctor_id
from app.core.database import get_database
from app.schemas.patient import PatientCreate, PatientOut, VisitIn, VisitSoapPatch

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
        {"$push": {"visits": visit_dict}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return _doc_to_out(result)


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
