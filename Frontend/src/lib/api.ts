import { AUTH_TOKEN_KEY, clearAuthStorage } from "@/lib/authStorage";

/** Base URL for API (empty = same origin; use VITE_API_BASE_URL when UI and API differ). */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  country?: string | null;
  city?: string | null;
  specialty?: string | null;
  years_of_experience?: number | null;
  practice_name?: string | null;
  license_number?: string | null;
}

export interface DoctorSignupPayload {
  email: string;
  password: string;
  name: string;
  country: string;
  city: string;
  specialty: string;
  years_of_experience: number;
  practice_name?: string;
  license_number?: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  user: AuthUserDto;
}

let unauthorizedHandler: (() => void) | null = null;

/** Register from a component under `<BrowserRouter>` to clear auth state and navigate to sign-in on 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function hadAuthorizationHeader(init?: RequestInit): boolean {
  const h = init?.headers;
  if (h == null) return false;
  if (h instanceof Headers) return h.has("Authorization");
  if (Array.isArray(h))
    return h.some(([k]) => String(k).toLowerCase() === "authorization");
  return Object.keys(h as Record<string, unknown>).some((k) => k.toLowerCase() === "authorization");
}

async function authAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && hadAuthorizationHeader(init)) {
    clearAuthStorage();
    unauthorizedHandler?.();
  }
  return res;
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    const d = data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const parts = d
        .map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: unknown }).msg) : ""))
        .filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
    return res.statusText || "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

/**
 * Opens a stored lab file. `/api/...` paths require Bearer auth — a plain `<a href>` does not send the token (403).
 * Legacy `/uploads/...` is served as static files and can open without auth.
 */
export async function openStoredLabFileInNewTab(fileUrl: string): Promise<void> {
  const u = fileUrl.trim();
  if (!u) return;
  if (u.startsWith("/uploads/")) {
    window.open(apiUrl(u), "_blank", "noopener,noreferrer");
    return;
  }
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) throw new Error("Not signed in");
  const res = await authAwareFetch(apiUrl(u), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}

export async function signupDoctor(payload: DoctorSignupPayload): Promise<AuthTokenResponse> {
  const res = await fetch(apiUrl("/api/v1/auth/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      name: payload.name,
      country: payload.country,
      city: payload.city,
      specialty: payload.specialty,
      years_of_experience: payload.years_of_experience,
      practice_name: payload.practice_name?.trim() || null,
      license_number: payload.license_number?.trim() || null,
    }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<AuthTokenResponse>;
}

export async function signinDoctor(email: string, password: string): Promise<AuthTokenResponse> {
  const res = await fetch(apiUrl("/api/v1/auth/signin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<AuthTokenResponse>;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) throw new Error("Not signed in");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ─── Clinics ───────────────────────────────────────────────

export interface ApiClinic {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  specialty?: string | null;
  description?: string | null;
}

export interface ClinicCreatePayload {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  specialty?: string;
  description?: string;
}

export async function fetchClinics(): Promise<ApiClinic[]> {
  const res = await authAwareFetch(apiUrl("/api/v1/clinics"), { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiClinic[]>;
}

export async function createClinicApi(payload: ClinicCreatePayload): Promise<ApiClinic> {
  const res = await authAwareFetch(apiUrl("/api/v1/clinics"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiClinic>;
}

export async function updateClinicApi(clinicId: string, payload: Partial<ClinicCreatePayload>): Promise<ApiClinic> {
  const res = await authAwareFetch(apiUrl(`/api/v1/clinics/${clinicId}`), {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiClinic>;
}

export async function deleteClinicApi(clinicId: string): Promise<void> {
  const res = await authAwareFetch(apiUrl(`/api/v1/clinics/${clinicId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

/** API shape for patients (snake_case from backend). */
export interface ApiLabReportRecord {
  id: string;
  recorded_at: string;
  filename: string;
  extraction_method: string;
  details: string;
  test_name?: string;
  lab_test_pattern?: string;
  visit_id?: string;
  file_id?: string | null;
  file_url?: string | null;
  extra_file_ids?: string[];
  extra_file_urls?: string[];
}

export interface ApiLabPreviewItem {
  filename: string;
  extraction_method: string;
  details: string;
  suggested_test_name: string;
  needs_test_name: boolean;
  lab_test_pattern?: string;
  extraction_error?: string | null;
}

export interface LabPreviewMapped {
  filename: string;
  extractionMethod: string;
  details: string;
  suggestedTestName: string;
  needsTestName: boolean;
  /** Stored in DB only; not shown in UI */
  labTestPattern: string;
  extractionError?: string | null;
}

export interface ApiPrepareVisitAudioResponse {
  transcript: string;
  lab_previews: ApiLabPreviewItem[];
  /** One per audio file, same order; plain text (no recording headers). */
  transcript_segments?: string[];
}

export interface ApiExtractLabReportsResponse {
  lab_previews: ApiLabPreviewItem[];
}

export interface PrepareVisitAudioResult {
  transcript: string;
  labPreviews: LabPreviewMapped[];
  transcriptSegments: string[];
}

export interface ExtractLabReportsResult {
  labPreviews: LabPreviewMapped[];
}

function mapLabPreviewFromApi(p: ApiLabPreviewItem): LabPreviewMapped {
  return {
    filename: p.filename,
    extractionMethod: p.extraction_method,
    details: p.details,
    suggestedTestName: p.suggested_test_name ?? "",
    needsTestName: p.needs_test_name ?? true,
    labTestPattern: p.lab_test_pattern ?? "",
    extractionError: p.extraction_error ?? null,
  };
}

export interface LabCacheEntry {
  details: string;
  extraction_method: string;
  suggested_test_name: string;
  lab_test_pattern: string;
}

export interface ApiPatient {
  id: string;
  ui_id: string;
  name: string;
  age: number;
  gender: string;
  visits: ApiVisit[];
  lab_reports?: ApiLabReportRecord[];
}

export interface ApiVisit {
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
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  prescriptions: { medicine: string; dosage: string; frequency: string }[];
  /** Filled by API from patient-level lab_reports; omit when saving a new visit. */
  lab_reports?: ApiLabReportRecord[];
}

/** PATCH body for `/patients/{id}/visits/{visitId}` (matches backend). */
export interface VisitPatchPayload {
  transcript?: string;
  diagnosis?: string;
  visit_title?: string;
  visit_summary_report?: string;
  date?: string;
  symptoms?: string[];
  duration?: string;
  medical_history?: string[];
  allergies?: string[];
  prescribed_medicines?: string[];
  prescribed_lab_tests?: string[];
}

export async function fetchPatients(clinicId: string): Promise<ApiPatient[]> {
  const url = apiUrl(`/api/v1/patients?clinic_id=${encodeURIComponent(clinicId)}`);
  const res = await authAwareFetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient[]>;
}

export async function createPatientApi(payload: {
  clinicId: string;
  uiId: string;
  name: string;
  age: number;
  gender: string;
}): Promise<ApiPatient> {
  const res = await authAwareFetch(apiUrl("/api/v1/patients"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      clinic_id: payload.clinicId,
      ui_id: payload.uiId,
      name: payload.name,
      age: payload.age,
      gender: payload.gender,
    }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient>;
}

export async function deletePatientApi(patientId: string): Promise<void> {
  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${patientId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function addPatientVisitApi(patientId: string, visit: ApiVisit): Promise<ApiPatient> {
  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${patientId}/visits`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(visit),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient>;
}

/** Build API payload from app `Visit` (camelCase medicalHistory → medical_history). */
export function visitToApi(visit: {
  id: string;
  date: string;
  diagnosis: string;
  visitTitle?: string;
  visitSummaryReport?: string;
  transcript?: string;
  audioUrl?: string | null;
  labReportDetails?: string;
  symptoms: string[];
  duration: string;
  medicalHistory: string[];
  allergies: string[];
  prescribedMedicines: string[];
  prescribedLabTests: string[];
  soap: ApiVisit["soap"];
  prescriptions: ApiVisit["prescriptions"];
}): ApiVisit {
  return {
    id: visit.id,
    date: visit.date,
    diagnosis: visit.diagnosis,
    visit_title: visit.visitTitle ?? "",
    visit_summary_report: visit.visitSummaryReport ?? "",
    transcript: visit.transcript ?? "",
    audio_url: visit.audioUrl ?? null,
    lab_report_details: visit.labReportDetails ?? "",
    symptoms: visit.symptoms,
    duration: visit.duration,
    medical_history: visit.medicalHistory,
    allergies: visit.allergies,
    prescribed_medicines: visit.prescribedMedicines,
    prescribed_lab_tests: visit.prescribedLabTests,
    soap: visit.soap,
    prescriptions: visit.prescriptions,
  };
}

/** Label for visit list / timeline (LLM title preferred). */
export function visitListLabel(visit: { visitTitle?: string; diagnosis: string }): string {
  const t = visit.visitTitle?.trim();
  return t || visit.diagnosis;
}

export async function patchVisitSoapApi(
  patientId: string,
  visitId: string,
  soap: ApiVisit["soap"]
): Promise<ApiPatient> {
  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${patientId}/visits/${visitId}/soap`), {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(soap),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient>;
}

export async function patchVisitApi(
  patientId: string,
  visitId: string,
  patch: VisitPatchPayload
): Promise<ApiPatient> {
  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${patientId}/visits/${visitId}`), {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient>;
}

export async function deleteVisitApi(patientId: string, visitId: string): Promise<ApiPatient> {
  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${patientId}/visits/${visitId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient>;
}

export async function regenerateVisitSoapApi(
  patientId: string,
  visitId: string,
  payload?: { transcript?: string }
): Promise<ApiPatient> {
  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${patientId}/visits/${visitId}/regenerate-soap`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient>;
}

export interface ApiVisitReference {
  visit_id: string;
  visit_title: string;
  visit_date: string;
  relevance_snippet: string;
}

export interface ApiAiSuggestion {
  suggestion: string;
  references: ApiVisitReference[];
}

export interface ApiAiSuggestionsResponse {
  suggestions: ApiAiSuggestion[];
}

export async function fetchAiSuggestionsApi(
  patientId: string,
  visitId: string
): Promise<ApiAiSuggestionsResponse> {
  const res = await authAwareFetch(
    apiUrl(`/api/v1/patients/${patientId}/visits/${visitId}/ai-suggestions`),
    { method: "POST", headers: authHeaders() },
  );
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiAiSuggestionsResponse>;
}

function extForBlob(blob: Blob, index: number): string {
  const t = blob.type || "";
  if (t.includes("webm")) return "webm";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("wav")) return "wav";
  if (t.includes("mp4") || t.includes("m4a")) return "m4a";
  if (t.includes("ogg")) return "ogg";
  return "webm";
}

export type VisitFromAudioLabFile = { blob: Blob; filename: string };

/** Optional JSON for multipart: [[0,1,2],[3]] = first three files are one logical report. */
export type LabReportGroupsPayload = number[][];

function appendLabReportGroups(form: FormData, files: VisitFromAudioLabFile[], groups?: LabReportGroupsPayload): void {
  if (!groups?.length || files.length === 0) return;
  const singleton = groups.length === files.length && groups.every((g) => g.length === 1);
  if (singleton) return;
  form.append("lab_report_groups", JSON.stringify(groups));
}

function mapPrepareResponse(data: ApiPrepareVisitAudioResponse): PrepareVisitAudioResult {
  return {
    transcript: data.transcript,
    labPreviews: (data.lab_previews ?? []).map(mapLabPreviewFromApi),
    transcriptSegments: data.transcript_segments ?? [],
  };
}

export async function prepareVisitFromAudioApi(payload: {
  patientId: string;
  audios: Blob[];
  labReports?: VisitFromAudioLabFile[];
  labReportGroups?: LabReportGroupsPayload;
}): Promise<PrepareVisitAudioResult> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) throw new Error("Not signed in");
  if (!payload.audios.length) throw new Error("At least one audio clip is required");

  const form = new FormData();
  payload.audios.forEach((blob, i) => {
    const ext = extForBlob(blob, i);
    form.append("audio", blob, `visit-${i + 1}.${ext}`);
  });
  (payload.labReports ?? []).forEach((f) => {
    form.append("lab_report", f.blob, f.filename || "lab-report");
  });
  appendLabReportGroups(form, payload.labReports ?? [], payload.labReportGroups);

  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${payload.patientId}/visits/prepare-audio`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = (await res.json()) as ApiPrepareVisitAudioResponse;
  return mapPrepareResponse(data);
}

export async function extractLabReportsApi(payload: {
  patientId: string;
  labReports: VisitFromAudioLabFile[];
  labReportGroups?: LabReportGroupsPayload;
}): Promise<ExtractLabReportsResult> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) throw new Error("Not signed in");
  if (!payload.labReports.length) throw new Error("At least one lab file is required");

  const form = new FormData();
  payload.labReports.forEach((f) => {
    form.append("lab_report", f.blob, f.filename || "lab-report");
  });
  appendLabReportGroups(form, payload.labReports, payload.labReportGroups);

  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${payload.patientId}/visits/extract-lab-reports`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = (await res.json()) as ApiExtractLabReportsResponse;
  return {
    labPreviews: (data.lab_previews ?? []).map(mapLabPreviewFromApi),
  };
}

export async function createVisitFromAudioApi(payload: {
  patientId: string;
  /** One or more clips, in order; combined into one visit transcript and notes. */
  audios: Blob[];
  /** Optional lab reports (images, PDFs, text, Word). Same field name repeated for multipart. */
  labReports?: VisitFromAudioLabFile[];
  labReportGroups?: LabReportGroupsPayload;
  diagnosis?: string;
  date?: string;
  /** When set, Whisper is skipped and this transcript is stored and used for SOAP. */
  transcript?: string;
  /** One entry per logical lab report (same order as lab_report_groups). */
  labCache?: LabCacheEntry[];
  /** Final display name per logical lab report (same order as lab_report_groups). */
  labTestNames?: string[];
}): Promise<ApiPatient> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) throw new Error("Not signed in");
  if (!payload.audios.length) throw new Error("At least one audio clip is required");

  const form = new FormData();
  payload.audios.forEach((blob, i) => {
    const ext = extForBlob(blob, i);
    form.append("audio", blob, `visit-${i + 1}.${ext}`);
  });
  (payload.labReports ?? []).forEach((f) => {
    form.append("lab_report", f.blob, f.filename || "lab-report");
  });
  appendLabReportGroups(form, payload.labReports ?? [], payload.labReportGroups);
  form.append("diagnosis", payload.diagnosis ?? "Visit");
  if (payload.date) form.append("date", payload.date);
  if (payload.transcript?.trim()) form.append("transcript", payload.transcript.trim());
  if (payload.labCache?.length)
    form.append("lab_cache", JSON.stringify(payload.labCache));
  if (payload.labTestNames?.length)
    form.append("lab_test_names", JSON.stringify(payload.labTestNames));

  const res = await authAwareFetch(apiUrl(`/api/v1/patients/${payload.patientId}/visits/from-audio`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ApiPatient>;
}
