import { useState } from "react";
import { Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisitTimeline } from "@/components/VisitTimeline";
import { VisitDetails } from "@/components/VisitDetails";
import { NewVisitFlow } from "@/components/NewVisitFlow";
import type { Patient, Visit } from "@/hooks/usePatientStore";
import { cn } from "@/lib/utils";

interface PatientViewProps {
  patient: Patient;
  selectedVisitId: string;
  onSelectVisit: (id: string) => void;
  onAddVisit: (visit: Visit) => Promise<void>;
  onUpdateSoap: (visitId: string, soap: Visit["soap"]) => Promise<void>;
}

export function PatientView({
  patient,
  selectedVisitId,
  onSelectVisit,
  onAddVisit,
  onUpdateSoap,
}: PatientViewProps) {
  const [showNewVisit, setShowNewVisit] = useState(false);
  const selectedVisit = patient.visits.find((v) => v.id === selectedVisitId) || patient.visits[0];

  if (showNewVisit) {
    return (
      <NewVisitFlow
        patientName={patient.name}
        onSave={async (visit) => {
          await onAddVisit(visit);
          setShowNewVisit(false);
        }}
        onCancel={() => setShowNewVisit(false)}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Patient Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{patient.name}</h2>
            <p className="text-sm text-muted-foreground">
              Ref. {patient.uiId} · {patient.age} years · {patient.gender}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowNewVisit(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Visit
        </Button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-1">
          <VisitTimeline
            visits={patient.visits}
            selectedVisitId={selectedVisitId}
            onSelectVisit={onSelectVisit}
          />
        </div>

        {/* Details */}
        <div className="lg:col-span-2">
          {selectedVisit && (
            <VisitDetails
              visit={selectedVisit}
              onUpdateSoap={async (soap) => onUpdateSoap(selectedVisit.id, soap)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
