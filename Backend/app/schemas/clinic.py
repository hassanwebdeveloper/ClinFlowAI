from pydantic import BaseModel, Field


class ClinicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    specialty: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class ClinicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    specialty: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class ClinicOut(BaseModel):
    id: str
    name: str
    address: str | None = None
    city: str | None = None
    country: str | None = None
    phone: str | None = None
    specialty: str | None = None
    description: str | None = None
