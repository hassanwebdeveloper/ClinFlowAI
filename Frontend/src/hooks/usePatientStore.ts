import { useCallback, useEffect, useState } from "react";
import type { ApiPatient } from "@/lib/api";
import {
  addPatientVisitApi,
  createVisitFromAudioApi,
  createPatientApi,
  fetchPatients,
  patchVisitApi,
  patchVisitSoapApi,
  regenerateVisitSoapApi,
  visitToApi,
} from "@/lib/api";
import type { VisitPatchPayload } from "@/lib/api";

export interface Visit {
  id: string;
  date: string;
  diagnosis: string;
  visitTitle: string;
  visitSummaryReport: string;
  transcript?: string;
  audioUrl?: string | null;
  symptoms: string[];
  duration: string;
  medicalHistory: string[];
  allergies: string[];
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  prescriptions: { medicine: string; dosage: string; frequency: string }[];
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
}

function mapApiPatient(p: ApiPatient): Patient {
  return {
    id: p.id,
    uiId: p.ui_id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    visits: p.visits.map((v) => ({
      id: v.id,
      date: v.date,
      diagnosis: v.diagnosis,
      visitTitle: v.visit_title ?? "",
      visitSummaryReport: v.visit_summary_report ?? "",
      transcript: v.transcript ?? "",
      audioUrl: v.audio_url ?? null,
      symptoms: v.symptoms ?? [],
      duration: v.duration ?? "",
      medicalHistory: v.medical_history ?? [],
      allergies: v.allergies ?? [],
      soap: { ...v.soap },
      prescriptions: v.prescriptions ?? [],
    })),
  };
}

export function usePatientStore() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPatients();
        if (cancelled) return;
        const mapped = list.map(mapApiPatient);
        setPatients(mapped);
        const defaultPid = mapped[0]?.id ?? "";
        setSelectedPatientId(defaultPid);
        setSelectedVisitId(mapped[0]?.visits[0]?.id ?? "");
      } catch {
        if (!cancelled) setPatients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPatient =
    patients.find((p) => p.id === selectedPatientId) ?? patients[0];
  const selectedVisit =
    selectedPatient?.visits.find((v) => v.id === selectedVisitId) ??
    selectedPatient?.visits[0];

  const addPatient = useCallback(
    async (data: { uiId: string; name: string; age: number; gender: string }) => {
      const created = await createPatientApi(data);
      const p = mapApiPatient(created);
      setPatients((prev) => [p, ...prev]);
      setSelectedPatientId(p.id);
      setSelectedVisitId("");
      return p;
    },
    []
  );

  const addVisit = useCallback(async (patientId: string, visit: Visit) => {
    const updated = await addPatientVisitApi(patientId, visitToApi(visit));
    const p = mapApiPatient(updated);
    setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
    setSelectedVisitId(visit.id);
  }, []);

  const addVisitFromAudio = useCallback(
    async (patientId: string, audio: Blob, diagnosis?: string) => {
      const updated = await createVisitFromAudioApi({ patientId, audio, diagnosis });
      const p = mapApiPatient(updated);
      setPatients((prev) => prev.map((x) => (x.id === patientId ? p : x)));
      const newVisitId = p.visits[0]?.id ?? "";
      if (newVisitId) setSelectedVisitId(newVisitId);
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
    addPatient,
    addVisit,
    addVisitFromAudio,
    updateVisitSoap,
    updateVisit,
    regenerateVisitSoap,
  };
}
