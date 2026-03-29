import { cn } from "@/lib/utils";
import type { Patient } from "@/hooks/usePatientStore";
import { User, CalendarDays } from "lucide-react";
import { AddPatientDialog } from "@/components/AddPatientDialog";

interface PatientListProps {
  patients: Patient[];
  selectedPatientId: string;
  onSelectPatient: (id: string) => void;
  onAddPatient: (data: { uiId: string; name: string; age: number; gender: string }) => Promise<void>;
}

export function PatientList({ patients, selectedPatientId, onSelectPatient, onAddPatient }: PatientListProps) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-foreground">Patients</h2>
        <AddPatientDialog onAdd={onAddPatient} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {patients.map((patient) => (
          <button
            key={patient.id}
            onClick={() => onSelectPatient(patient.id)}
            className={cn(
              "text-left bg-card rounded-2xl border p-4 transition-all duration-150 hover:card-shadow-hover",
              selectedPatientId === patient.id
                ? "border-primary/30 card-shadow-hover"
                : "border-border card-shadow"
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{patient.name}</p>
                <p className="text-xs text-muted-foreground">
                  ID {patient.uiId} · {patient.age}y · {patient.gender}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              <span>{patient.visits.length} visit{patient.visits.length !== 1 ? "s" : ""}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
