from pydantic import BaseModel, Field


class SoapBlock(BaseModel):
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""


class Prescription(BaseModel):
    medicine: str = ""
    dosage: str = ""
    frequency: str = ""


class VisitIn(BaseModel):
    id: str
    date: str
    diagnosis: str
    soap: SoapBlock
    prescriptions: list[Prescription] = Field(default_factory=list)


class PatientCreate(BaseModel):
    ui_id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=200)
    age: int = Field(ge=0, le=150)
    gender: str = Field(..., min_length=1, max_length=50)


class PatientOut(BaseModel):
    id: str
    ui_id: str
    name: str
    age: int
    gender: str
    visits: list[VisitIn]


class VisitSoapPatch(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str
