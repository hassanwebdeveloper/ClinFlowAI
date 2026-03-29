import { useState, useCallback } from "react";

export interface Visit {
  id: string;
  date: string;
  diagnosis: string;
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  prescriptions: { medicine: string; dosage: string; frequency: string }[];
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  visits: Visit[];
}

const mockPatients: Patient[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    age: 34,
    gender: "Female",
    visits: [
      {
        id: "v1",
        date: "2026-03-28",
        diagnosis: "Seasonal Allergies",
        soap: {
          subjective: "Patient reports sneezing, runny nose, and itchy eyes for the past week. Symptoms worsen outdoors.",
          objective: "Nasal mucosa erythematous. Clear rhinorrhea. No fever. Lungs clear.",
          assessment: "Seasonal allergic rhinitis. No signs of secondary infection.",
          plan: "Cetirizine 10mg daily. Nasal saline rinse. Follow up in 2 weeks if no improvement.",
        },
        prescriptions: [
          { medicine: "Cetirizine", dosage: "10mg", frequency: "Once daily" },
        ],
      },
      {
        id: "v2",
        date: "2026-03-15",
        diagnosis: "Annual Physical",
        soap: {
          subjective: "Patient here for annual physical. No acute complaints. Reports regular exercise.",
          objective: "BP 120/78. HR 72. BMI 23.5. All systems normal.",
          assessment: "Healthy adult. All vitals within normal limits.",
          plan: "Continue current lifestyle. Routine labs ordered. Return in 1 year.",
        },
        prescriptions: [],
      },
    ],
  },
  {
    id: "2",
    name: "Michael Chen",
    age: 52,
    gender: "Male",
    visits: [
      {
        id: "v3",
        date: "2026-03-27",
        diagnosis: "Diabetes Follow-up",
        soap: {
          subjective: "Patient returns for diabetes management. Reports compliance with medication. Occasional fatigue.",
          objective: "BP 132/84. Weight stable. HbA1c 7.2%. Foot exam normal.",
          assessment: "Type 2 diabetes, moderately controlled. Slight hypertension.",
          plan: "Continue Metformin. Add lifestyle counseling. Recheck HbA1c in 3 months.",
        },
        prescriptions: [
          { medicine: "Metformin", dosage: "500mg", frequency: "Twice daily" },
        ],
      },
    ],
  },
  {
    id: "3",
    name: "Emily Davis",
    age: 28,
    gender: "Female",
    visits: [
      {
        id: "v4",
        date: "2026-03-25",
        diagnosis: "Migraine",
        soap: {
          subjective: "Recurrent headaches, throbbing, unilateral, with nausea. 3 episodes this month.",
          objective: "Neurological exam normal. No papilledema. BP 118/72.",
          assessment: "Migraine without aura, increasing frequency.",
          plan: "Sumatriptan 50mg PRN. Headache diary. Consider prophylaxis if frequency increases.",
        },
        prescriptions: [
          { medicine: "Sumatriptan", dosage: "50mg", frequency: "As needed" },
        ],
      },
    ],
  },
];

export function usePatientStore() {
  const [patients, setPatients] = useState<Patient[]>(mockPatients);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("1");
  const [selectedVisitId, setSelectedVisitId] = useState<string>("v1");

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];
  const selectedVisit = selectedPatient?.visits.find((v) => v.id === selectedVisitId) || selectedPatient?.visits[0];

  const addPatient = useCallback(
    (data: { name: string; age: number; gender: string }) => {
      const newPatient: Patient = {
        id: `p${Date.now()}`,
        name: data.name,
        age: data.age,
        gender: data.gender,
        visits: [],
      };
      setPatients((prev) => [newPatient, ...prev]);
      setSelectedPatientId(newPatient.id);
      return newPatient;
    },
    []
  );

  const addVisit = useCallback(
    (patientId: string, visit: Visit) => {
      setPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, visits: [visit, ...p.visits] } : p
        )
      );
      setSelectedVisitId(visit.id);
    },
    []
  );

  const updateVisitSoap = useCallback(
    (patientId: string, visitId: string, soap: Visit["soap"]) => {
      setPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? {
                ...p,
                visits: p.visits.map((v) => (v.id === visitId ? { ...v, soap } : v)),
              }
            : p
        )
      );
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
    updateVisitSoap,
  };
}
