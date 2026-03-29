import { cn } from "@/lib/utils";
import type { Visit } from "@/hooks/usePatientStore";

interface VisitTimelineProps {
  visits: Visit[];
  selectedVisitId: string;
  onSelectVisit: (id: string) => void;
}

export function VisitTimeline({ visits, selectedVisitId, onSelectVisit }: VisitTimelineProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-3">
        Visit History
      </h3>
      {visits.map((visit, i) => (
        <button
          key={visit.id}
          onClick={() => onSelectVisit(visit.id)}
          className={cn(
            "w-full text-left px-3 py-3 rounded-xl transition-all duration-150 group relative",
            selectedVisitId === visit.id
              ? "bg-primary/10 border border-primary/20"
              : "hover:bg-accent border border-transparent"
          )}
        >
          {/* Timeline connector */}
          {i < visits.length - 1 && (
            <div className="absolute left-[22px] top-[42px] w-px h-[calc(100%-20px)] bg-border" />
          )}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ring-2 ring-card",
                selectedVisitId === visit.id ? "bg-primary" : "bg-muted-foreground/30"
              )}
            />
            <div>
              <p className="text-xs text-muted-foreground">
                {new Date(visit.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p
                className={cn(
                  "text-sm font-medium mt-0.5",
                  selectedVisitId === visit.id ? "text-primary" : "text-foreground"
                )}
              >
                {visit.diagnosis}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
