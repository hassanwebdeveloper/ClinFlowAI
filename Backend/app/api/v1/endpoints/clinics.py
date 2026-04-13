from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.api.deps import get_current_doctor_id
from app.core.database import get_database
from app.schemas.clinic import ClinicCreate, ClinicOut, ClinicUpdate

router = APIRouter()

CLINICS_COLLECTION = "clinics"
PATIENTS_COLLECTION = "patients"


def get_db() -> AsyncIOMotorDatabase:
    return get_database()


def _parse_clinic_oid(clinic_id: str) -> ObjectId:
    try:
        return ObjectId(clinic_id)
    except InvalidId as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found",
        ) from e


def _doc_to_out(doc: dict) -> ClinicOut:
    return ClinicOut(
        id=str(doc["_id"]),
        name=doc["name"],
        address=doc.get("address"),
        city=doc.get("city"),
        country=doc.get("country"),
        phone=doc.get("phone"),
        specialty=doc.get("specialty"),
        description=doc.get("description"),
    )


@router.get("", response_model=list[ClinicOut])
async def list_clinics(
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db[CLINICS_COLLECTION].find({"doctor_id": doctor_id}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [_doc_to_out(d) for d in docs]


@router.post("", response_model=ClinicOut, status_code=status.HTTP_201_CREATED)
async def create_clinic(
    body: ClinicCreate,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    doc = {
        "doctor_id": doctor_id,
        "name": body.name.strip(),
        "address": (body.address or "").strip() or None,
        "city": (body.city or "").strip() or None,
        "country": (body.country or "").strip() or None,
        "phone": (body.phone or "").strip() or None,
        "specialty": (body.specialty or "").strip() or None,
        "description": (body.description or "").strip() or None,
        "created_at": now,
    }
    result = await db[CLINICS_COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_out(doc)


@router.patch("/{clinic_id}", response_model=ClinicOut)
async def update_clinic(
    clinic_id: str,
    body: ClinicUpdate,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_clinic_oid(clinic_id)
    updates: dict = {}
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name cannot be empty",
            )
        updates["name"] = n
    for field in ("address", "city", "country", "phone", "specialty", "description"):
        val = getattr(body, field, None)
        if val is not None:
            s = val.strip()
            updates[field] = s if s else None
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    col = db[CLINICS_COLLECTION]
    doc = await col.find_one_and_update(
        {"_id": oid, "doctor_id": doctor_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    return _doc_to_out(doc)


@router.delete("/{clinic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clinic(
    clinic_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _parse_clinic_oid(clinic_id)
    patient_count = await db[PATIENTS_COLLECTION].count_documents({"clinic_id": str(oid)})
    if patient_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete clinic that has patients. Remove all patients first.",
        )
    result = await db[CLINICS_COLLECTION].delete_one({"_id": oid, "doctor_id": doctor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
