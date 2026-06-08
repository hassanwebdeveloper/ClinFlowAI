import logging
import hashlib
import secrets
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.database import get_database, get_redis
from app.core.security import create_access_token, hash_password, verify_password
from app.schemas.doctor import (
    AccessRequestDecisionRequest,
    AccessRequestReviewResponse,
    AuthTokenResponse,
    DEFAULT_LICENSE_TYPE,
    DoctorLogin,
    DoctorResponse,
    DoctorSignup,
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
)
from app.services.email import (
    send_access_request_email,
    send_request_decision_email,
    send_request_submitted_email,
    send_reset_email,
)

router = APIRouter()
logger = logging.getLogger(__name__)

DOCTORS_COLLECTION = "doctors"
ACCESS_REQUESTS_COLLECTION = "access_requests"
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
        license_type=doc.get("license_type", DEFAULT_LICENSE_TYPE),
    )


def _request_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _request_review_response(doc: dict) -> AccessRequestReviewResponse:
    return AccessRequestReviewResponse(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc["name"],
        country=doc["country"],
        city=doc["city"],
        specialty=doc["specialty"],
        years_of_experience=doc["years_of_experience"],
        practice_name=doc.get("practice_name"),
        license_number=doc.get("license_number"),
        status=doc.get("status", "pending"),
        decided_at=doc.get("decided_at").isoformat() if doc.get("decided_at") else None,
        created_at=doc["created_at"].isoformat(),
    )


def _issue_reset_token(doctor_id: ObjectId) -> str:
    token = secrets.token_urlsafe(32)
    redis = get_redis()
    redis.setex(
        f"{RESET_KEY_PREFIX}{token}",
        settings.PASSWORD_RESET_TOKEN_EXPIRE_SECONDS,
        str(doctor_id),
    )
    return token


@router.post("/signup", response_model=MessageResponse)
async def signup(body: DoctorSignup, db: AsyncIOMotorDatabase = Depends(get_db)):
    email = body.email.lower().strip()
    doctors_col = db[DOCTORS_COLLECTION]
    if await doctors_col.find_one({"email": email}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    now = datetime.now(timezone.utc)
    review_token = secrets.token_urlsafe(32)
    request_doc = {
        "email": email,
        "name": body.name.strip(),
        "country": body.country.strip(),
        "city": body.city.strip(),
        "specialty": body.specialty.strip(),
        "years_of_experience": body.years_of_experience,
        "practice_name": (body.practice_name or "").strip() or None,
        "license_number": (body.license_number or "").strip() or None,
        "token_hash": _request_token_hash(review_token),
        "status": "pending",
        "created_at": now,
        "decided_at": None,
    }
    requests_col = db[ACCESS_REQUESTS_COLLECTION]
    insert = await requests_col.insert_one(request_doc)
    request_doc["_id"] = insert.inserted_id
    try:
        await send_access_request_email(
            requester_email=email,
            review_token=review_token,
            requester_name=body.name.strip(),
            country=body.country.strip(),
            city=body.city.strip(),
            specialty=body.specialty.strip(),
            years_of_experience=body.years_of_experience,
            practice_name=body.practice_name,
            license_number=body.license_number,
        )
    except Exception:
        await requests_col.delete_one({"_id": insert.inserted_id})
        logger.exception("Failed to send access request email for %s", email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to submit access request right now. Please try again shortly.",
        )
    try:
        await send_request_submitted_email(email, body.name.strip())
    except Exception:
        logger.exception("Failed to send request confirmation email to %s", email)
    return MessageResponse(message="Access request submitted. We'll contact you by email.")


@router.get("/access-requests/review", response_model=AccessRequestReviewResponse)
async def review_access_request(token: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    token = token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing review token")
    doc = await db[ACCESS_REQUESTS_COLLECTION].find_one({"token_hash": _request_token_hash(token)})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")
    return _request_review_response(doc)


@router.post("/access-requests/review", response_model=MessageResponse)
async def decide_access_request(
    token: str,
    body: AccessRequestDecisionRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    token = token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing review token")

    requests_col = db[ACCESS_REQUESTS_COLLECTION]
    doc = await requests_col.find_one({"token_hash": _request_token_hash(token)})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")
    if doc.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request is already {doc.get('status', 'processed')}.",
        )

    email = doc["email"]
    name = doc["name"]
    now = datetime.now(timezone.utc)

    if body.decision == "approve":
        doctors_col = db[DOCTORS_COLLECTION]
        existing_doctor = await doctors_col.find_one({"email": email})
        if existing_doctor:
            doctor_id = existing_doctor["_id"]
        else:
            created = await doctors_col.insert_one(
                {
                    "email": email,
                    "name": name,
                    "password_hash": hash_password(secrets.token_urlsafe(24)),
                    "created_at": now,
                    "country": doc.get("country"),
                    "city": doc.get("city"),
                    "specialty": doc.get("specialty"),
                    "years_of_experience": doc.get("years_of_experience"),
                    "practice_name": doc.get("practice_name"),
                    "license_number": doc.get("license_number"),
                    "license_type": DEFAULT_LICENSE_TYPE,
                }
            )
            doctor_id = created.inserted_id

        reset_token = _issue_reset_token(doctor_id)
        reset_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={reset_token}"
        try:
            await send_request_decision_email(
                to_email=email,
                doctor_name=name,
                approved=True,
                set_password_link=reset_link,
            )
        except Exception:
            logger.exception("Failed to send approval email to %s", email)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Request approved, but could not send email. Please retry.",
            )
        await requests_col.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "approved", "decided_at": now}},
        )
        return MessageResponse(message="Access request approved and notification sent.")

    try:
        await send_request_decision_email(
            to_email=email,
            doctor_name=name,
            approved=False,
        )
    except Exception:
        logger.exception("Failed to send rejection email to %s", email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Request rejected, but could not send email. Please retry.",
        )
    await requests_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "rejected", "decided_at": now}},
    )
    return MessageResponse(message="Access request rejected and notification sent.")


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
        redis.setex(f"{RESET_KEY_PREFIX}{token}", settings.PASSWORD_RESET_TOKEN_EXPIRE_SECONDS, str(doc["_id"]))
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
