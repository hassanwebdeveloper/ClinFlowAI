import type { Patient } from "@/hooks/usePatientStore";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function patientSearchHaystack(patient: Patient): string {
  const parts: string[] = [
    patient.name,
    patient.uiId,
    String(patient.age),
    patient.gender,
  ];

  for (const visit of patient.visits) {
    parts.push(
      visit.date,
      visit.diagnosis,
      visit.visitTitle,
      visit.visitSummaryReport,
      visit.duration,
      visit.labReportDetails ?? "",
      ...visit.symptoms,
      ...visit.medicalHistory,
      ...visit.allergies,
      ...visit.prescribedMedicines,
      ...visit.prescribedLabTests,
      visit.soap.subjective,
      visit.soap.objective,
      visit.soap.assessment,
      visit.soap.plan,
      ...visit.prescriptions.map((rx) => `${rx.medicine} ${rx.dosage} ${rx.frequency}`),
    );
  }

  for (const lab of patient.labReports) {
    parts.push(lab.testName, lab.details, lab.filename);
  }

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** True when the query is one non-empty token (e.g. a reference ID lookup). */
export function isSingleTokenQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed);
}

export function patientUiIdMatchesQuery(patient: Patient, query: string): boolean {
  const q = normalize(query);
  if (!q) return false;
  return normalize(patient.uiId) === q;
}

export function patientMatchesQuery(patient: Patient, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;

  const haystack = patientSearchHaystack(patient);
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}
