import { useCallback, useState } from "react";
import type {
  ApiHealthProfile,
  ApiHealthProfileAllergy,
  ApiHealthProfileCondition,
  ApiHealthProfileMedication,
  ApiLabAnalyteValue,
  ApiLabReportRecord,
  ApiPatient,
} from "@/lib/api";

/** Coalesce concurrent refresh-ai-reminders for the same visit (e.g. React StrictMode). */
const reminderRefreshPromises = new Map<string, Promise<void>>();
import type { ApiAiReminders } from "@/lib/api";
import {
  addPatientVisitApi,
  createVisitFromAudioApi,
  createPatientApi,
  deletePatientApi,
  deleteVisitApi,
  fetchPatients,
  patchHealthProfileApi,
  patchLabReportApi,
  patchVisitApi,
  patchVisitSoapApi,
  prepareVisitFromAudioApi,
  regenerateVisitSoapApi,
  refreshVisitAiRemindersApi,
  hydrateVisitPrescriptionsApi,
  visitToApi,
} from "@/lib/api";
import type {
  HealthProfilePatchPayload,
  LabCacheEntry,
  VisitPatchPayload,
  VisitFromAudioLabFile,
  LabReportGroupsPayload,
} from "@/lib/api";

export interface LabAnalyteValue {
  name: string;
  value: number | null;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  /** "", "H", "L", or "critical" */
  abnormalFlag: string;
}

export interface LabReportRecord {
  id: string;
  recordedAt: string;
  filename: string;
  extractionMethod: string;
  details: string;
  testName: string;
  /** Stored for future use; not shown in UI */
  labTestPattern: string;
  visitId?: string;
  fileUrl?: string | null;
  /** Additional pages when one report is multiple photos */
  extraFileUrls?: string[];
  /** Structured analytes parsed from the LLM extraction (may be empty for older labs). */
  analytes: LabAnalyteValue[];
}

export interface Visit {
  id: string;
  date: string;
  diagnosis: string;
  visitTitle: string;
  visitSummaryReport: string;
  transcript?: string;
  audioUrl?: string | null;
  /** All saved audio paths for this visit (same order as recording/upload). */
  audioUrls?: string[];
  /** Extracted lab text used when generating this visit’s notes. */
  labReportDetails?: string;
  symptoms: string[];
  duration: string;
  medicalHistory: string[];
  allergies: string[];
  prescribedMedicines: string[];
  prescribedLabTests: string[];
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  prescriptions: { medicine: string; dosage: string; frequency: string }[];
  /** Lab files linked to this visit (from API aggregation or visit_id filter). */
  labReports?: LabReportRecord[];
  aiReminders?: AiReminders | null;
  /** Server asks client to call refresh-ai-reminders on first open (new audio visit). */
  aiRemindersPending?: boolean;
}

export interface AiReminderSimilarVisit {
  visitId: string;
  visitDate: string;
  visitTitle: string;
  similarity: number;
}

export interface AiReminderDocGap {
  category: string;
  message: string;
}

export interface AiReminderRepeatLab {
  testName: string;
  rationale: string;
}

export interface AiReminders {
  generatedAt: string;
  similarVisits: AiReminderSimilarVisit[];
  documentationGaps: AiReminderDocGap[];
  repeatLabReminders: AiReminderRepeatLab[];
}

function mapApiAiReminders(raw: ApiAiReminders | null | undefined): AiReminders | null {
  if (!raw || typeof raw !== "object") return null;
  const similar =
    raw.similar_visits?.filter((x): x is NonNullable<typeof x> => Boolean(x?.visit_id)).map((x) => ({
      visitId: x.visit_id,
      visitDate: (x.visit_date ?? "").trim(),
      visitTitle: (x.visit_title ?? "").trim(),
      similarity: typeof x.similarity === "number" && Number.isFinite(x.similarity) ? x.similarity : 0,
    })) ?? [];
  const gaps =
    raw.documentation_gaps
      ?.filter((g): g is NonNullable<typeof g> => Boolean(g?.category && g.message))
      .map((g) => ({ category: g.category, message: g.message })) ?? [];
  const repeat =
    raw.repeat_lab_reminders
      ?.filter((r): r is NonNullable<typeof r> => Boolean(r?.test_name && r.rationale))
      .map((r) => ({ testName: r.test_name, rationale: r.rationale })) ?? [];
  return {
    generatedAt: (raw.generated_at ?? "").trim(),
    similarVisits: similar,
    documentationGaps: gaps,
    repeatLabReminders: repeat,
  };
}

/** Prefer visit-scoped lab reports from the API; fall back to filtering patient-level list. */
export function labReportsForVisit(visit: Visit, patientLabs: LabReportRecord[]): LabReportRecord[] {
  if (visit.labReports?.length) return visit.labReports;
  return patientLabs.filter((r) => (r.visitId ?? "").trim() === visit.id);
}

export interface HealthProfileAllergy {
  id: string;
  name: string;
  severity: string;
  reaction: string;
  sourceVisitIds: string[];
  isDoctorEdited: boolean;
  dismissed: boolean;
  updatedAt: string;
}

export interface HealthProfileMedication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  indication: string;
  sourceVisitIds: string[];
  isDoctorEdited: boolean;
  dismissed: boolean;
  updatedAt: string;
}

export interface HealthProfileCondition {
  id: string;
  name: string;
  category: string;
  evidence: string;
  sourceVisitIds: string[];
  sourceLabReportIds: string[];
  isDoctorEdited: boolean;
  dismissed: boolean;
  updatedAt: string;
}

export interface HealthProfile {
  allergies: HealthProfileAllergy[];
  longTermMedications: HealthProfileMedication[];
  conditions: HealthProfileCondition[];
  lastGeneratedAt: string;
  lastVisitId: string;
}

export const emptyHealthProfile = (): HealthProfile => ({
  allergies: [],
  longTermMedications: [],
  conditions: [],
  lastGeneratedAt: "",
  lastVisitId: "",
});

export interface Patient {
  /** MongoDB document id (API routes and React keys). */
  id: string;
  /** User-defined reference id (only editable when adding a patient). */
  uiId: string;
  name: string;
  age: number;
  gender: string;
  visits: Visit[];
  labReports: LabReportRecord[];
  healthProfile: HealthProfile;
}

function mapHealthProfile(hp: ApiHealthProfile | null | undefined): HealthProfile {
  if (!hp) return emptyHealthProfile();
  const mapAllergy = (a: ApiHealthProfileAllergy): HealthProfileAllergy => ({
    id: a.id ?? "",
    name: a.name ?? "",
    severity: a.severity ?? "",
    reaction: a.reaction ?? "",
    sourceVisitIds: a.source_visit_ids ?? [],
    isDoctorEdited: Boolean(a.is_doctor_edited),
    dismissed: Boolean(a.dismissed),
    updatedAt: a.updated_at ?? "",
  });
  const mapMed = (m: ApiHealthProfileMedication): HealthProfileMedication => ({
    id: m.id ?? "",
    name: m.name ?? "",
    dosage: m.dosage ?? "",
    frequency: m.frequency ?? "",
    indication: m.indication ?? "",
    sourceVisitIds: m.source_visit_ids ?? [],
    isDoctorEdited: Boolean(m.is_doctor_edited),
    dismissed: Boolean(m.dismissed),
    updatedAt: m.updated_at ?? "",
  });
  const mapCond = (c: ApiHealthProfileCondition): HealthProfileCondition => ({
    id: c.id ?? "",
    name: c.name ?? "",
    category: c.category ?? "",
    evidence: c.evidence ?? "",
    sourceVisitIds: c.source_visit_ids ?? [],
    sourceLabReportIds: c.source_lab_report_ids ?? [],
    isDoctorEdited: Boolean(c.is_doctor_edited),
    dismissed: Boolean(c.dismissed),
    updatedAt: c.updated_at ?? "",
  });
  return {
    allergies: (hp.allergies ?? []).map(mapAllergy),
    longTermMedications: (hp.long_term_medications ?? []).map(mapMed),
    conditions: (hp.conditions ?? []).map(mapCond),
    lastGeneratedAt: hp.last_generated_at ?? "",
    lastVisitId: hp.last_visit_id ?? "",
  };
}

export function healthProfileToApi(hp: HealthProfile): HealthProfilePatchPayload {
  return {
    allergies: hp.allergies.map((a) => ({
      id: a.id,
      name: a.name,
      severity: a.severity,
      reaction: a.reaction,
      source_visit_ids: a.sourceVisitIds,
      is_doctor_edited: a.isDoctorEdited,
      dismissed: a.dismissed,
    })),
    long_term_medications: hp.longTermMedications.map((m) => ({
      id: m.id,
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      indication: m.indication,
      source_visit_ids: m.sourceVisitIds,
      is_doctor_edited: m.isDoctorEdited,
      dismissed: m.dismissed,
    })),
    conditions: hp.conditions.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      evidence: c.evidence,
      source_visit_ids: c.sourceVisitIds,
      source_lab_report_ids: c.sourceLabReportIds,
      is_doctor_edited: c.isDoctorEdited,
      dismissed: c.dismissed,
    })),
  };
}

function mapApiAnalyte(a: ApiLabAnalyteValue): LabAnalyteValue {
  return {
    name: a.name ?? "",
    value: typeof a.value === "number" && Number.isFinite(a.value) ? a.value : null,
    unit: a.unit ?? "",
    refLow: typeof a.ref_low === "number" && Number.isFinite(a.ref_low) ? a.ref_low : null,
    refHigh: typeof a.ref_high === "number" && Number.isFinite(a.ref_high) ? a.ref_high : null,
    abnormalFlag: a.abnormal_flag ?? "",
  };
}

function mapApiPatient(p: ApiPatient): Patient {
  const mapRow = (r: ApiLabReportRecord): LabReportRecord => ({
    id: r.id,
    recordedAt: r.recorded_at,
    filename: r.filename,
    extractionMethod: r.extraction_method,
    details: r.details,
    testName: r.test_name ?? "",
    labTestPattern: r.lab_test_pattern ?? "",
    visitId: r.visit_id,
    fileUrl: r.file_url ?? null,
    extraFileUrls: (r.extra_file_urls ?? []).filter(Boolean),
    analytes: (r.analytes ?? []).map(mapApiAnalyte),
  });
  const labReports: LabReportRecord[] = (p.lab_reports ?? []).map(mapRow);
  return {
    id: p.id,
    uiId: p.ui_id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    labReports,
    healthProfile: mapHealthProfile(p.health_profile),
    visits: p.visits.map((v) => ({
      id: v.id,
      date: v.date,
      diagnosis: v.diagnosis,
      visitTitle: v.visit_title ?? "",
      visitSummaryReport: v.visit_summary_report ?? "",
      transcript: v.transcript ?? "",
      audioUrl: v.audio_url ?? null,
      audioUrls:
        v.audio_urls?.length
          ? v.audio_urls
          : v.audio_url
            ? [v.audio_url]
            : [],
      labReportDetails: v.lab_report_details ?? "",
      symptoms: v.symptoms ?? [],
      duration: v.duration ?? "",
      medicalHistory: v.medical_history ?? [],
      allergies: v.allergies ?? [],
      prescribedMedicines: v.prescribed_medicines ?? [],
      prescribedLabTests: v.prescribed_lab_tests ?? [],
      soap: { ...v.soap },
      prescriptions: v.prescriptions ?? [],
      labReports: (v.lab_reports ?? []).map(mapRow),
      aiReminders: mapApiAiReminders(v.ai_reminders ?? undefined),
      aiRemindersPending: Boolean(v.ai_reminders_pending),
    })),
  };
}

export function usePatientStore() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState("");

  const clearPatients = useCallback(() => {
    setPatients([]);
    setSelectedPatientId("");
    setSelectedVisitId("");
  }, []);

  const loadPatients = useCallback(async (clinicId: string) => {
    try {
      const list = await fetchPatients(clinicId);
      const mapped = list.map(mapApiPatient);
      setPatients(mapped);
    } catch {
      setPatients([]);
    }
  }, []);

  const selectedPatient = selectedPatientId
    ? patients.find((p) => p.id === selectedPatientId)
    : undefined;
  const selectedVisit =
    selectedPatient && selectedVisitId
      ? selectedPatient.visits.find((v) => v.id === selectedVisitId)
      : undefined;

  const addPatient = useCallback(
    async (data: { clinicId: string; uiId: string; name: string; age: number; gender: string }) => {
      const created = await createPatientApi(data);
      const p = mapApiPatient(created);
      setPatients((prev) => [p, ...prev]);
      setSelectedPatientId(p.id);
      setSelectedVisitId("");
      return p;
    },
    []
  );

  const deletePatient = useCallback(async (patientId: string) => {
    await deletePatientApi(patientId);
    setPatients((prev) => prev.filter((p) => p.id !== patientId));
    setSelectedPatientId((cur) => {
      if (cur === patientId) {
        setSelectedVisitId("");
        return "";
      }
      return cur;
    });
  }, []);

  const addVisit = useCallback(async (patientId: string, visit: Visit) => {
    const updated = await addPatientVisitApi(patientId, visitToApi(visit));
    const p = mapApiPatient(updated);
    setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
    setSelectedVisitId(visit.id);
  }, []);

  const addVisitFromAudio = useCallback(
    async (
      patientId: string,
      audios: Blob[],
      diagnosis?: string,
      labReports?: VisitFromAudioLabFile[]
    ) => {
      const updated = await createVisitFromAudioApi({
        patientId,
        audios,
        diagnosis,
        labReports: labReports?.length ? labReports : undefined,
      });
      const p = mapApiPatient(updated);
      setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
      const newVisitId = p.visits[0]?.id ?? "";
      if (newVisitId) setSelectedVisitId(newVisitId);
    },
    []
  );

  const prepareVisitFromAudio = useCallback(
    async (
      patientId: string,
      audios: Blob[],
      labReports: VisitFromAudioLabFile[],
      labReportGroups?: LabReportGroupsPayload
    ) => {
      return prepareVisitFromAudioApi({ patientId, audios, labReports, labReportGroups });
    },
    []
  );

  const finalizeVisitFromAudio = useCallback(
    async (
      patientId: string,
      audios: Blob[],
      labReports: VisitFromAudioLabFile[],
      opts: {
        transcript: string;
        labCache: LabCacheEntry[];
        labTestNames: string[];
        labReportGroups?: LabReportGroupsPayload;
      }
    ) => {
      const updated = await createVisitFromAudioApi({
        patientId,
        audios,
        diagnosis: "Visit",
        labReports,
        labReportGroups: opts.labReportGroups,
        transcript: opts.transcript,
        labCache: opts.labCache,
        labTestNames: opts.labTestNames,
      });
      const p = mapApiPatient(updated);
      setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
      const newVisitId = p.visits[0]?.id ?? "";
      if (newVisitId) setSelectedVisitId(newVisitId);
      return newVisitId;
    },
    []
  );

  const updateVisitSoap = useCallback(
    async (patientId: string, visitId: string, soap: Visit["soap"]) => {
      const updated = await patchVisitSoapApi(patientId, visitId, soap);
      const p = mapApiPatient(updated);
      setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
    },
    []
  );

  const updateVisit = useCallback(async (patientId: string, visitId: string, patch: VisitPatchPayload) => {
    const updated = await patchVisitApi(patientId, visitId, patch);
    const p = mapApiPatient(updated);
    setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
  }, []);

  const deleteVisit = useCallback(async (patientId: string, visitId: string) => {
    const updated = await deleteVisitApi(patientId, visitId);
    const p = mapApiPatient(updated);
    setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
    setSelectedVisitId((cur) => {
      if (cur !== visitId) return cur;
      return p.visits[0]?.id ?? "";
    });
    return p;
  }, []);

  const regenerateVisitSoap = useCallback(
    async (patientId: string, visitId: string, transcript?: string) => {
      const updated = await regenerateVisitSoapApi(
        patientId,
        visitId,
        transcript !== undefined ? { transcript } : undefined
      );
      const p = mapApiPatient(updated);
      setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
    },
    []
  );

  const refreshVisitAiReminders = useCallback(async (patientId: string, visitId: string) => {
    const key = `${patientId}:${visitId}`;
    const inflight = reminderRefreshPromises.get(key);
    if (inflight) {
      await inflight;
      return;
    }
    const run = (async () => {
      try {
        const updated = await refreshVisitAiRemindersApi(patientId, visitId);
        const mapped = mapApiPatient(updated);
        setPatients((prev) => prev.map((x) => (x.id === patientId ? mapped : x)));
      } finally {
        reminderRefreshPromises.delete(key);
      }
    })();
    reminderRefreshPromises.set(key, run);
    await run;
  }, []);

  const hydrateVisitPrescriptions = useCallback(async (patientId: string, visitId: string) => {
    const updated = await hydrateVisitPrescriptionsApi(patientId, visitId);
    const p = mapApiPatient(updated);
    setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
  }, []);

  const updateHealthProfile = useCallback(
    async (patientId: string, profile: HealthProfile) => {
      const updated = await patchHealthProfileApi(patientId, healthProfileToApi(profile));
      const p = mapApiPatient(updated);
      setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
      return p;
    },
    []
  );

  const updateLabReportDetails = useCallback(
    async (patientId: string, labReportId: string, details: string) => {
      const updated = await patchLabReportApi(patientId, labReportId, { details });
      const p = mapApiPatient(updated);
      setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
      return p;
    },
    []
  );

  return {
    patients,
    selectedPatient,
    selectedVisit,
    selectedPatientId,
    selectedVisitId,
    setSelectedPatientId,
    setSelectedVisitId,
    loadPatients,
    clearPatients,
    addPatient,
    addVisit,
    addVisitFromAudio,
    prepareVisitFromAudio,
    finalizeVisitFromAudio,
    updateVisitSoap,
    updateVisit,
    deleteVisit,
    deletePatient,
    regenerateVisitSoap,
    refreshVisitAiReminders,
    hydrateVisitPrescriptions,
    updateHealthProfile,
    updateLabReportDetails,
  };
}
