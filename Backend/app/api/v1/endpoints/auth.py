from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.security import create_access_token, hash_password, verify_password
from app.schemas.doctor import AuthTokenResponse, DoctorLogin, DoctorResponse, DoctorSignup

router = APIRouter()

DOCTORS_COLLECTION = "doctors"


def get_db() -> AsyncIOMotorDatabase:
    return get_database()


def _doctor_response(doc: dict) -> DoctorResponse:
    return DoctorResponse(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc["name"],
        country=doc.get("country"),
        city=doc.get("city"),
        specialty=doc.get("specialty"),
        years_of_experience=doc.get("years_of_experience"),
        practice_name=doc.get("practice_name"),
        license_number=doc.get("license_number"),
    )


@router.post("/signup", response_model=AuthTokenResponse)
async def signup(body: DoctorSignup, db: AsyncIOMotorDatabase = Depends(get_db)):
    email = body.email.lower().strip()
    col = db[DOCTORS_COLLECTION]
    if await col.find_one({"email": email}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    now = datetime.now(timezone.utc)
    doc = {
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "created_at": now,
        "country": body.country.strip(),
        "city": body.city.strip(),
        "specialty": body.specialty.strip(),
        "years_of_experience": body.years_of_experience,
        "practice_name": (body.practice_name or "").strip() or None,
        "license_number": (body.license_number or "").strip() or None,
    }
    result = await col.insert_one(doc)
    doc["_id"] = result.inserted_id
    token = create_access_token(
        subject=str(result.inserted_id),
        extra={"email": email, "name": doc["name"]},
    )
    return AuthTokenResponse(access_token=token, user=_doctor_response(doc))


@router.post("/signin", response_model=AuthTokenResponse)
async def signin(body: DoctorLogin, db: AsyncIOMotorDatabase = Depends(get_db)):
    email = body.email.lower().strip()
    doc = await db[DOCTORS_COLLECTION].find_one({"email": email})
    if not doc or not verify_password(body.password, doc["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(
        subject=str(doc["_id"]),
        extra={"email": doc["email"], "name": doc["name"]},
    )
    return AuthTokenResponse(access_token=token, user=_doctor_response(doc))
