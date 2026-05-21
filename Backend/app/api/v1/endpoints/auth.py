import logging
import secrets
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.database import get_database, get_redis
from app.core.security import create_access_token, hash_password, verify_password
from app.schemas.doctor import (
    AuthTokenResponse,
    DoctorLogin,
    DoctorResponse,
    DoctorSignup,
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
)
from app.services.email import send_reset_email

router = APIRouter()
logger = logging.getLogger(__name__)

DOCTORS_COLLECTION = "doctors"
RESET_KEY_PREFIX = "reset:"


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


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    email = body.email.lower().strip()
    doc = await db[DOCTORS_COLLECTION].find_one({"email": email})
    if doc:
        token = secrets.token_urlsafe(32)
        redis = get_redis()
        redis.setex(
            f"{RESET_KEY_PREFIX}{token}",
            settings.PASSWORD_RESET_TOKEN_EXPIRE_SECONDS,
            str(doc["_id"]),
        )
        try:
            await send_reset_email(email, doc.get("name", ""), token)
        except Exception:
            logger.exception("Failed to send password reset email to %s", email)
    return MessageResponse(message="If an account exists, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    redis = get_redis()
    key = f"{RESET_KEY_PREFIX}{body.token}"
    doctor_id = redis.get(key)
    if not doctor_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired reset link",
        )
    try:
        oid = ObjectId(doctor_id)
    except Exception:
        redis.delete(key)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired reset link",
        )
    result = await db[DOCTORS_COLLECTION].update_one(
        {"_id": oid},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    redis.delete(key)
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired reset link",
        )
    return MessageResponse(message="Password updated. You can now sign in.")
