from pydantic import BaseModel, EmailStr, Field


class DoctorSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
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
