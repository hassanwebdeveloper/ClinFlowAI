import { AUTH_TOKEN_KEY } from "@/lib/authStorage";

const API_BASE = "/api/v1";

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readErrorMessage(resp: Response): Promise<string> {
  try {
    const data = (await resp.json()) as { detail?: unknown; message?: unknown };
    if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
  } catch {
    // ignore
  }
  const t = (await resp.text().catch(() => "")) || "";
  return t.trim() || `${resp.status} ${resp.statusText}`.trim();
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...authHeader(),
      Accept: "application/json",
    },
  });
  if (resp.status === 401) unauthorizedHandler?.();
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
  return (await resp.json()) as T;
}

async function requestNoJson(path: string, init: RequestInit = {}): Promise<void> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...authHeader(),
      Accept: "application/json",
    },
  });
  if (resp.status === 401) unauthorizedHandler?.();
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
}

function jsonBody(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type DoctorSignupPayload = {
  email: string;
  name: string;
  country: string;
  city: string;
  specialty: string;
  years_of_experience: number;
  practice_name?: string;
  license_number?: string;
};

export type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  country?: string | null;
  city?: string | null;
  specialty?: string | null;
  years_of_experience?: number | null;
  practice_name?: string | null;
  license_number?: string | null;
};

export type AuthTokenResponse = {
  access_token: string;
  user: AuthUserDto;
};

export async function signupDoctor(payload: DoctorSignupPayload): Promise<void> {
  await requestNoJson("/auth/signup", {
    method: "POST",
    ...jsonBody(payload),
  });
}

export async function signinDoctor(email: string, password: string): Promise<AuthTokenResponse> {
  return requestJson<AuthTokenResponse>("/auth/signin", {
    method: "POST",
    ...jsonBody({ email, password }),
  });
}

export async function forgotPasswordApi(email: string): Promise<void> {
  await requestNoJson("/auth/forgot-password", {
    method: "POST",
    ...jsonBody({ email }),
  });
}

export async function resetPasswordApi(token: string, newPassword: string): Promise<void> {
  await requestNoJson("/auth/reset-password", {
    method: "POST",
    ...jsonBody({ token, new_password: newPassword }),
  });
}

export type AccessRequestReview = {
  id: string;
  email: string;
  name: string;
  country: string;
  city: string;
  specialty: string;
  years_of_experience: number;
  practice_name?: string | null;
  license_number?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at?: string | null;
};

export async function fetchAccessRequestReview(token: string): Promise<AccessRequestReview> {
  const qp = new URLSearchParams({ token });
  return requestJson<AccessRequestReview>(`/auth/access-requests/review?${qp.toString()}`, {
    method: "GET",
  });
}

export async function decideAccessRequest(token: string, decision: "approve" | "reject"): Promise<void> {
  const qp = new URLSearchParams({ token });
  await requestNoJson(`/auth/access-requests/review?${qp.toString()}`, {
    method: "POST",
    ...jsonBody({ decision }),
  });
}

export type ClinicCreatePayload = {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  specialty?: string;
  description?: string;
};

export type ApiClinic = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  specialty?: string | null;
  description?: string | null;
};

export async function fetchClinics(): Promise<ApiClinic[]> {
  return requestJson<ApiClinic[]>("/clinics", { method: "GET" });
}

export async function createClinicApi(payload: ClinicCreatePayload): Promise<ApiClinic> {
  return requestJson<ApiClinic>("/clinics", { method: "POST", ...jsonBody(payload) });
}

export async function updateClinicApi(
  clinicId: string,
  payload: Partial<ClinicCreatePayload>
): Promise<ApiClinic> {
  return requestJson<ApiClinic>(`/clinics/${encodeURIComponent(clinicId)}`, {
    method: "PATCH",
    ...jsonBody(payload),
  });
}

export async function deleteClinicApi(clinicId: string): Promise<void> {
  await requestNoJson(`/clinics/${encodeURIComponent(clinicId)}`, { method: "DELETE" });
}

export type ApiAiReminderSimilarVisit = {
  visit_id: string;
  visit_date?: string | null;
  visit_title?: string | null;
  similarity?: number | null;
};

export type ApiAiReminderDocGap = {
  category: string;
  message: string;
};

export type ApiAiReminderRepeatLab = {
  test_name: string;
  rationale: string;
};

export type ApiAiReminders = {
  generated_at?: string | null;
  similar_visits?: ApiAiReminderSimilarVisit[] | null;
  documentation_gaps?: ApiAiReminderDocGap[] | null;
  repeat_lab_reminders?: ApiAiReminderRepeatLab[] | null;
};

export type ApiVisit = {
  id: string;
  date: string;
  diagnosis: string;
  visit_title?: string | null;
  visit_summary_report?: string | null;
  transcript?: string | null;
  audio_url?: string | null;
  audio_urls?: string[] | null;
  lab_report_details?: string | null;
  symptoms?: string[] | null;
  duration?: string | null;
  medical_history?: string[] | null;
  allergies?: string[] | null;
  prescribed_medicines?: string[] | null;
  prescribed_lab_tests?: string[] | null;
  ai_reminders?: ApiAiReminders | null;
  ai_reminders_pending?: boolean | null;
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  prescriptions?: { medicine: string; dosage: string; frequency: string }[] | null;
  lab_reports?: ApiLabReportRecord[] | null;
};

export type ApiLabAnalyteValue = {
  name: string;
  value: number | null;
  unit?: string | null;
  ref_low?: number | null;
  ref_high?: number | null;
  abnormal_flag?: string | null;
};

export type ApiLabReportRecord = {
  id: string;
  recorded_at: string;
  filename: string;
  extraction_method: string;
  details: string;
  test_name?: string | null;
  lab_test_pattern?: string | null;
  visit_id?: string | null;
  file_url?: string | null;
  extra_file_urls?: string[] | null;
  analytes?: ApiLabAnalyteValue[] | null;
};

export type ApiHealthProfileAllergy = {
  id?: string | null;
  name: string;
  severity?: string | null;
  reaction?: string | null;
  source_visit_ids?: string[] | null;
  is_doctor_edited?: boolean | null;
  dismissed?: boolean | null;
  updated_at?: string | null;
};

export type ApiHealthProfileMedication = {
  id?: string | null;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  indication?: string | null;
  source_visit_ids?: string[] | null;
  is_doctor_edited?: boolean | null;
  dismissed?: boolean | null;
  updated_at?: string | null;
};

export type ApiHealthProfileCondition = {
  id?: string | null;
  name: string;
  category?: string | null;
  evidence?: string | null;
  source_visit_ids?: string[] | null;
  source_lab_report_ids?: string[] | null;
  is_doctor_edited?: boolean | null;
  dismissed?: boolean | null;
  updated_at?: string | null;
};

export type ApiHealthProfile = {
  allergies?: ApiHealthProfileAllergy[] | null;
  long_term_medications?: ApiHealthProfileMedication[] | null;
  conditions?: ApiHealthProfileCondition[] | null;
  last_generated_at?: string | null;
  last_visit_id?: string | null;
};

export type HealthProfilePatchPayload = {
  allergies: ApiHealthProfileAllergy[];
  long_term_medications: ApiHealthProfileMedication[];
  conditions: ApiHealthProfileCondition[];
};

export type ApiPatient = {
  id: string;
  ui_id: string;
  name: string;
  age: number;
  gender: string;
  visits: ApiVisit[];
  lab_reports?: ApiLabReportRecord[] | null;
  health_profile?: ApiHealthProfile | null;
};

export async function fetchPatients(clinicId: string): Promise<ApiPatient[]> {
  const qp = new URLSearchParams({ clinic_id: clinicId });
  return requestJson<ApiPatient[]>(`/patients?${qp.toString()}`, { method: "GET" });
}

export async function createPatientApi(payload: {
  clinicId: string;
  uiId: string;
  name: string;
  age: number;
  gender: string;
}): Promise<ApiPatient> {
  return requestJson<ApiPatient>("/patients", {
    method: "POST",
    ...jsonBody({
      clinic_id: payload.clinicId,
      ui_id: payload.uiId,
      name: payload.name,
      age: payload.age,
      gender: payload.gender,
    }),
  });
}

export async function deletePatientApi(patientId: string): Promise<void> {
  await requestNoJson(`/patients/${encodeURIComponent(patientId)}`, { method: "DELETE" });
}

export type VisitInPayload = {
  id: string;
  date: string;
  diagnosis: string;
  visit_title?: string;
  visit_summary_report?: string;
  transcript?: string;
  audio_url?: string | null;
  audio_urls?: string[];
  lab_report_details?: string;
  symptoms?: string[];
  duration?: string;
  medical_history?: string[];
  allergies?: string[];
  prescribed_medicines?: string[];
  prescribed_lab_tests?: string[];
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  prescriptions?: { medicine: string; dosage: string; frequency: string }[];
};

export function visitToApi(v: {
  id: string;
  date: string;
  diagnosis: string;
  visitTitle: string;
  visitSummaryReport: string;
  transcript?: string;
  audioUrl?: string | null;
  audioUrls?: string[];
  labReportDetails?: string;
  symptoms: string[];
  duration: string;
  medicalHistory: string[];
  allergies: string[];
  prescribedMedicines: string[];
  prescribedLabTests: string[];
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  prescriptions: { medicine: string; dosage: string; frequency: string }[];
}): VisitInPayload {
  return {
    id: v.id,
    date: v.date,
    diagnosis: v.diagnosis,
    visit_title: v.visitTitle,
    visit_summary_report: v.visitSummaryReport,
    transcript: v.transcript,
    audio_url: v.audioUrl ?? null,
    audio_urls: v.audioUrls ?? [],
    lab_report_details: v.labReportDetails,
    symptoms: v.symptoms,
    duration: v.duration,
    medical_history: v.medicalHistory,
    allergies: v.allergies,
    prescribed_medicines: v.prescribedMedicines,
    prescribed_lab_tests: v.prescribedLabTests,
    soap: v.soap,
    prescriptions: v.prescriptions,
  };
}

export async function addPatientVisitApi(patientId: string, visit: VisitInPayload): Promise<ApiPatient> {
  return requestJson<ApiPatient>(`/patients/${encodeURIComponent(patientId)}/visits`, {
    method: "POST",
    ...jsonBody(visit),
  });
}

export type VisitPatchPayload = Partial<{
  date: string;
  diagnosis: string;
  visit_title: string;
  visit_summary_report: string;
  transcript: string;
  symptoms: string[];
  duration: string;
  medical_history: string[];
  allergies: string[];
  prescribed_medicines: string[];
  prescriptions: { medicine: string; dosage: string; frequency: string }[];
  prescribed_lab_tests: string[];
}>;

export async function patchVisitApi(
  patientId: string,
  visitId: string,
  patch: VisitPatchPayload
): Promise<ApiPatient> {
  return requestJson<ApiPatient>(`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`, {
    method: "PATCH",
    ...jsonBody(patch),
  });
}

export async function patchVisitSoapApi(
  patientId: string,
  visitId: string,
  soap: { subjective: string; objective: string; assessment: string; plan: string }
): Promise<ApiPatient> {
  return requestJson<ApiPatient>(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/soap`,
    { method: "PATCH", ...jsonBody(soap) }
  );
}

export type LabReportPatchPayload = Partial<{
  details: string;
}>;

export async function patchLabReportApi(
  patientId: string,
  labReportId: string,
  patch: LabReportPatchPayload
): Promise<ApiPatient> {
  return requestJson<ApiPatient>(
    `/patients/${encodeURIComponent(patientId)}/lab-reports/${encodeURIComponent(labReportId)}`,
    { method: "PATCH", ...jsonBody(patch) }
  );
}

export async function patchHealthProfileApi(
  patientId: string,
  body: HealthProfilePatchPayload
): Promise<ApiPatient> {
  return requestJson<ApiPatient>(
    `/patients/${encodeURIComponent(patientId)}/health-profile`,
    { method: "PATCH", ...jsonBody(body) }
  );
}

export async function deleteVisitApi(patientId: string, visitId: string): Promise<ApiPatient> {
  return requestJson<ApiPatient>(`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`, {
    method: "DELETE",
  });
}

export async function regenerateVisitSoapApi(
  patientId: string,
  visitId: string,
  body?: { transcript: string }
): Promise<ApiPatient> {
  return requestJson<ApiPatient>(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/regenerate-soap`,
    {
      method: "POST",
      ...(body ? jsonBody(body) : {}),
    }
  );
}

export type VisitFromAudioLabFile = { blob: Blob; filename: string };
export type LabReportGroupsPayload = number[][];

export type LabCacheEntry = {
  details: string;
  extraction_method: string;
  suggested_test_name: string;
  lab_test_pattern?: string;
  analytes?: ApiLabAnalyteValue[];
};

export type LabPreviewMapped = {
  filename: string;
  details: string;
  extractionMethod: "vl" | "text";
  suggestedTestName: string;
  needsTestName: boolean;
  extractionError?: string;
  labTestPattern?: string;
  analytes: ApiLabAnalyteValue[];
};

type ApiLabPreviewItem = {
  filename: string;
  details: string;
  extraction_method: "vl" | "text";
  suggested_test_name: string;
  needs_test_name: boolean;
  extraction_error?: string | null;
  lab_test_pattern?: string | null;
  analytes?: ApiLabAnalyteValue[] | null;
};

function mapLabPreview(p: ApiLabPreviewItem): LabPreviewMapped {
  return {
    filename: p.filename,
    details: p.details,
    extractionMethod: p.extraction_method,
    suggestedTestName: p.suggested_test_name ?? "",
    needsTestName: Boolean(p.needs_test_name),
    extractionError: p.extraction_error ?? undefined,
    labTestPattern: p.lab_test_pattern ?? undefined,
    analytes: (p.analytes ?? []) as ApiLabAnalyteValue[],
  };
}

export async function extractLabReportsApi(args: {
  patientId: string;
  labReports: VisitFromAudioLabFile[];
  labReportGroups?: LabReportGroupsPayload;
}): Promise<{ labPreviews: LabPreviewMapped[] }> {
  const fd = new FormData();
  args.labReports.forEach((f) => fd.append("lab_report", f.blob, f.filename));
  if (args.labReportGroups) fd.append("lab_report_groups", JSON.stringify(args.labReportGroups));
  const resp = await fetch(`${API_BASE}/patients/${encodeURIComponent(args.patientId)}/visits/extract-lab-reports`, {
    method: "POST",
    headers: { ...authHeader() },
    body: fd,
  });
  if (resp.status === 401) unauthorizedHandler?.();
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
  const data = (await resp.json()) as { lab_previews: ApiLabPreviewItem[] };
  return { labPreviews: (data.lab_previews ?? []).map(mapLabPreview) };
}

export type PrepareVisitAudioResult = {
  transcript: string;
  transcriptSegments: string[];
  labPreviews: LabPreviewMapped[];
};

export async function prepareVisitFromAudioApi(args: {
  patientId: string;
  audios: Blob[];
  labReports: VisitFromAudioLabFile[];
  labReportGroups?: LabReportGroupsPayload;
}): Promise<PrepareVisitAudioResult> {
  const fd = new FormData();
  args.audios.forEach((b, i) => fd.append("audio", b, `audio-${i + 1}.webm`));
  args.labReports.forEach((f) => fd.append("lab_report", f.blob, f.filename));
  if (args.labReportGroups) fd.append("lab_report_groups", JSON.stringify(args.labReportGroups));

  const resp = await fetch(`${API_BASE}/patients/${encodeURIComponent(args.patientId)}/visits/prepare-audio`, {
    method: "POST",
    headers: { ...authHeader() },
    body: fd,
  });
  if (resp.status === 401) unauthorizedHandler?.();
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
  const data = (await resp.json()) as {
    transcript: string;
    transcript_segments?: string[];
    lab_previews: ApiLabPreviewItem[];
  };
  return {
    transcript: data.transcript ?? "",
    transcriptSegments: data.transcript_segments ?? [],
    labPreviews: (data.lab_previews ?? []).map(mapLabPreview),
  };
}

export async function createVisitFromAudioApi(args: {
  patientId: string;
  audios: Blob[];
  diagnosis?: string;
  date?: string;
  transcript?: string;
  labReports?: VisitFromAudioLabFile[];
  labReportGroups?: LabReportGroupsPayload;
  labCache?: LabCacheEntry[];
  labTestNames?: string[];
}): Promise<ApiPatient> {
  const fd = new FormData();
  args.audios.forEach((b, i) => fd.append("audio", b, `audio-${i + 1}.webm`));
  (args.labReports ?? []).forEach((f) => fd.append("lab_report", f.blob, f.filename));
  if (args.labReportGroups) fd.append("lab_report_groups", JSON.stringify(args.labReportGroups));
  if (args.diagnosis) fd.append("diagnosis", args.diagnosis);
  if (args.date) fd.append("date", args.date);
  if (args.transcript != null) fd.append("transcript", args.transcript);
  if (args.labCache) fd.append("lab_cache", JSON.stringify(args.labCache));
  if (args.labTestNames) fd.append("lab_test_names", JSON.stringify(args.labTestNames));

  const resp = await fetch(`${API_BASE}/patients/${encodeURIComponent(args.patientId)}/visits/from-audio`, {
    method: "POST",
    headers: { ...authHeader() },
    body: fd,
  });
  if (resp.status === 401) unauthorizedHandler?.();
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
  return (await resp.json()) as ApiPatient;
}

export async function refreshVisitAiRemindersApi(patientId: string, visitId: string): Promise<ApiPatient> {
  return requestJson<ApiPatient>(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/refresh-ai-reminders`,
    { method: "POST" }
  );
}

/** Backfill visit `prescriptions` (dosage/frequency) from transcript; no-op if already present. */
export async function hydrateVisitPrescriptionsApi(patientId: string, visitId: string): Promise<ApiPatient> {
  return requestJson<ApiPatient>(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/hydrate-prescriptions`,
    { method: "POST" }
  );
}

export function visitListLabel(v: { visitTitle?: string; diagnosis?: string; visitSummaryReport?: string }) {
  const title = (v.visitTitle ?? "").trim();
  if (title) return title;
  const diag = (v.diagnosis ?? "").trim();
  if (diag) return diag;
  const sum = (v.visitSummaryReport ?? "").trim();
  return sum ? sum.slice(0, 60) : "Visit";
}

export async function openStoredLabFileInNewTab(fileUrl: string): Promise<void> {
  const url = fileUrl.startsWith("http") ? fileUrl : fileUrl;
  const resp = await fetch(url, { method: "GET", headers: { ...authHeader() } });
  if (resp.status === 401) unauthorizedHandler?.();
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}

