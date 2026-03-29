from pydantic import BaseModel, EmailStr, Field


class DoctorSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=200)


class DoctorLogin(BaseModel):
    email: EmailStr
    password: str


class DoctorResponse(BaseModel):
    id: str
    email: str
    name: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: DoctorResponse
