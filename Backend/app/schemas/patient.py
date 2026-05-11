from pydantic import BaseModel, Field


class LabAnalyteValue(BaseModel):
    name: str = ""
    value: float | None = None
    unit: str = ""
    ref_low: float | None = None
    ref_high: float | None = None
    abnormal_flag: str = ""  # "", "H", "L", "critical"


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
    analytes: list[LabAnalyteValue] = Field(default_factory=list)


class LabPreviewItem(BaseModel):
    filename: str
    extraction_method: str
    details: str
    suggested_test_name: str = ""  # overall lab test / order name from the report heading
    needs_test_name: bool = True  # true when the model could not read that name from the document
    lab_test_pattern: str = ""  # stored for DB / cache; do not display in UI
    extraction_error: str | None = None  # set when this file failed to extract (upload-time preview only)
    analytes: list[LabAnalyteValue] = Field(default_factory=list)


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


class AiReminderSimilarVisit(BaseModel):
    visit_id: str
    visit_date: str = ""
    visit_title: str = ""
    similarity: float = 0.0


class AiReminderDocumentationGap(BaseModel):
    category: str  # medicine_dosage | lab_discussed_no_value | allergy_incomplete
    message: str


class AiReminderRepeatLab(BaseModel):
    test_name: str
    rationale: str


class AiReminders(BaseModel):
    generated_at: str = ""
    similar_visits: list[AiReminderSimilarVisit] = Field(default_factory=list)
    documentation_gaps: list[AiReminderDocumentationGap] = Field(default_factory=list)
    repeat_lab_reminders: list[AiReminderRepeatLab] = Field(default_factory=list)


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
    ai_reminders: AiReminders | None = None
    ai_reminders_pending: bool = False
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


class HealthProfileAllergy(BaseModel):
    id: str = ""
    name: str = ""
    severity: str = ""  # mild / moderate / severe / unclear
    reaction: str = ""  # rash, anaphylaxis, etc.
    source_visit_ids: list[str] = Field(default_factory=list)
    is_doctor_edited: bool = False
    dismissed: bool = False
    updated_at: str = ""


class HealthProfileMedication(BaseModel):
    id: str = ""
    name: str = ""
    dosage: str = ""
    frequency: str = ""
    indication: str = ""  # e.g. "for hypertension"
    source_visit_ids: list[str] = Field(default_factory=list)
    is_doctor_edited: bool = False
    dismissed: bool = False
    updated_at: str = ""


class HealthProfileCondition(BaseModel):
    id: str = ""
    name: str = ""
    category: str = ""  # endocrine / cardiac / renal / hepatic / pulmonary / other
    evidence: str = ""  # e.g. "HbA1c 8.2 (2026-03-12); FBS 178 (2026-03-12)"
    source_visit_ids: list[str] = Field(default_factory=list)
    source_lab_report_ids: list[str] = Field(default_factory=list)
    is_doctor_edited: bool = False
    dismissed: bool = False
    updated_at: str = ""


class HealthProfile(BaseModel):
    allergies: list[HealthProfileAllergy] = Field(default_factory=list)
    long_term_medications: list[HealthProfileMedication] = Field(default_factory=list)
    conditions: list[HealthProfileCondition] = Field(default_factory=list)
    last_generated_at: str = ""
    last_visit_id: str = ""


class HealthProfilePatch(BaseModel):
    allergies: list[HealthProfileAllergy] = Field(default_factory=list)
    long_term_medications: list[HealthProfileMedication] = Field(default_factory=list)
    conditions: list[HealthProfileCondition] = Field(default_factory=list)


class PatientOut(BaseModel):
    id: str
    ui_id: str
    name: str
    age: int
    gender: str
    visits: list[VisitIn]
    lab_reports: list[LabReportRecord] = Field(default_factory=list)
    health_profile: HealthProfile = Field(default_factory=HealthProfile)


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
    prescriptions: list[Prescription] | None = None
    prescribed_lab_tests: list[str] | None = None


class LabReportPatch(BaseModel):
    """Doctor-side edit for a single stored lab report's extracted text."""
    details: str | None = None


class RegenerateSoapRequest(BaseModel):
    """If transcript is set, it replaces the visit transcript before regeneration."""
    transcript: str | None = None
