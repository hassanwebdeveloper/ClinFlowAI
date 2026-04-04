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
    visit_title: str = ""
    visit_summary_report: str = ""
    transcript: str = ""
    audio_url: str | None = None
    symptoms: list[str] = Field(default_factory=list)
    duration: str = ""
    medical_history: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
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


class VisitPatch(BaseModel):
    transcript: str | None = None
    diagnosis: str | None = None
    visit_title: str | None = None
    visit_summary_report: str | None = None
    date: str | None = None
    symptoms: list[str] | None = None
    duration: str | None = None
    medical_history: list[str] | None = None
    allergies: list[str] | None = None


class RegenerateSoapRequest(BaseModel):
    """If transcript is set, it replaces the visit transcript before regeneration."""
    transcript: str | None = None


class VisitReference(BaseModel):
    visit_id: str
    visit_title: str
    visit_date: str
    relevance_snippet: str


class AiSuggestion(BaseModel):
    suggestion: str
    references: list[VisitReference] = Field(default_factory=list)


class AiSuggestionsResponse(BaseModel):
    suggestions: list[AiSuggestion] = Field(default_factory=list)
