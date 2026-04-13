import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import type { Patient } from "@/hooks/usePatientStore";
import { visitListLabel } from "@/lib/api";
import { patientVisitPath } from "@/lib/routes";

interface VisitsViewProps {
  patients: Patient[];
}

export function VisitsView({ patients }: VisitsViewProps) {
  const allVisits = patients
    .flatMap((p) => p.visits.map((v) => ({ ...v, patientName: p.name, patientId: p.id })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground mb-5">Recent Visits</h2>
      <div className="space-y-2">
        {allVisits.map((visit) => (
          <Link
            key={`${visit.patientId}-${visit.id}`}
            to={patientVisitPath(visit.patientId, visit.id)}
            className="block w-full text-left bg-card rounded-2xl border border-border card-shadow p-4 hover:card-shadow-hover transition-all duration-150"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{visitListLabel(visit)}</p>
                  <p className="text-xs text-muted-foreground">{visit.patientName}</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(visit.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
