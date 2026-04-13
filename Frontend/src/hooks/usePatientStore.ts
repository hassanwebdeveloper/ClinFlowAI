import { useCallback, useState } from "react";
import type { ApiLabReportRecord, ApiPatient } from "@/lib/api";
import {
  addPatientVisitApi,
  createVisitFromAudioApi,
  createPatientApi,
  deletePatientApi,
  deleteVisitApi,
  fetchPatients,
  patchVisitApi,
  patchVisitSoapApi,
  prepareVisitFromAudioApi,
  regenerateVisitSoapApi,
  visitToApi,
} from "@/lib/api";
import type { LabCacheEntry, VisitPatchPayload, VisitFromAudioLabFile, LabReportGroupsPayload } from "@/lib/api";

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
}

/** Prefer visit-scoped lab reports from the API; fall back to filtering patient-level list. */
export function labReportsForVisit(visit: Visit, patientLabs: LabReportRecord[]): LabReportRecord[] {
  if (visit.labReports?.length) return visit.labReports;
  return patientLabs.filter((r) => (r.visitId ?? "").trim() === visit.id);
}

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
  });
  const labReports: LabReportRecord[] = (p.lab_reports ?? []).map(mapRow);
  return {
    id: p.id,
    uiId: p.ui_id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    labReports,
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
  };
}
