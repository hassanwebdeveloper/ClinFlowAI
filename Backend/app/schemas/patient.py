from pydantic import BaseModel, Field


class LabReportRecord(BaseModel):
    id: str = ""
    recorded_at: str = ""
    filename: str = ""
    extraction_method: str = ""
    details: str = ""
    test_name: str = ""  # overall ordered lab test (e.g. CBC), not each result line
    lab_test_pattern: str = ""  # e.g. [one-time] / [monitoring]; stored only, not shown in UI
    visit_id: str = ""
    file_id: str | None = None
    file_url: str | None = None
    extra_file_ids: list[str] = Field(default_factory=list)
    extra_file_urls: list[str] = Field(default_factory=list)


class LabPreviewItem(BaseModel):
    filename: str
    extraction_method: str
    details: str
    suggested_test_name: str = ""  # overall lab test / order name from the report heading
    needs_test_name: bool = True  # true when the model could not read that name from the document
    lab_test_pattern: str = ""  # stored for DB / cache; do not display in UI
    extraction_error: str | None = None  # set when this file failed to extract (upload-time preview only)


class ExtractLabReportsResponse(BaseModel):
    lab_previews: list[LabPreviewItem] = Field(default_factory=list)


class PrepareVisitAudioResponse(BaseModel):
    transcript: str
    lab_previews: list[LabPreviewItem] = Field(default_factory=list)
    transcript_segments: list[str] = Field(
        default_factory=list,
        description="One segment per audio file in order; plain text, no recording headers.",
    )


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
    audio_urls: list[str] = Field(default_factory=list)
    symptoms: list[str] = Field(default_factory=list)
    duration: str = ""
    medical_history: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    prescribed_medicines: list[str] = Field(default_factory=list)
    prescribed_lab_tests: list[str] = Field(default_factory=list)
    soap: SoapBlock
    prescriptions: list[Prescription] = Field(default_factory=list)
    lab_report_details: str = ""
    # Populated on read from patient-level lab_reports by visit_id; not stored on visit subdocuments.
    lab_reports: list[LabReportRecord] = Field(default_factory=list)


class PatientCreate(BaseModel):
    clinic_id: str = Field(..., min_length=1)
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
    lab_reports: list[LabReportRecord] = Field(default_factory=list)


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
    prescribed_medicines: list[str] | None = None
    prescribed_lab_tests: list[str] | None = None


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
