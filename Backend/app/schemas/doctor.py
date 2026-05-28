from pydantic import BaseModel, EmailStr, Field


class DoctorSignup(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    country: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=120)
    specialty: str = Field(min_length=1, max_length=200)
    years_of_experience: int = Field(ge=0, le=80)
    practice_name: str | None = Field(default=None, max_length=200)
    license_number: str | None = Field(default=None, max_length=120)


class DoctorLogin(BaseModel):
    email: EmailStr
    password: str


class DoctorResponse(BaseModel):
    id: str
    email: str
    name: str
    country: str | None = None
    city: str | None = None
    specialty: str | None = None
    years_of_experience: int | None = None
    practice_name: str | None = None
    license_number: str | None = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: DoctorResponse


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    message: str


class AccessRequestReviewResponse(BaseModel):
    id: str
    email: str
    name: str
    country: str
    city: str
    specialty: str
    years_of_experience: int
    practice_name: str | None = None
    license_number: str | None = None
    status: str
    decided_at: str | None = None
    created_at: str


class AccessRequestDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
