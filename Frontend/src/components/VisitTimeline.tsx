import { useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Visit } from "@/hooks/usePatientStore";
import { visitListLabel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface VisitTimelineProps {
  visits: Visit[];
  selectedVisitId: string;
  onSelectVisit: (id: string) => void;
  onDeleteVisit: (visitId: string) => Promise<void>;
}

export function VisitTimeline({
  visits,
  selectedVisitId,
  onSelectVisit,
  onDeleteVisit,
}: VisitTimelineProps) {
  const [pendingDelete, setPendingDelete] = useState<Visit | null>(null);
  const [deleting, setDeleting] = useState(false);

  const runDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDeleteVisit(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-3">
          Visit History
        </h3>
        {visits.map((visit, i) => (
          <div
            key={visit.id}
            className={cn(
              "group relative flex items-stretch gap-0.5 rounded-xl border transition-all duration-150",
              selectedVisitId === visit.id
                ? "bg-primary/10 border-primary/20"
                : "border-transparent hover:bg-accent"
            )}
          >
            <button
              type="button"
              onClick={() => onSelectVisit(visit.id)}
              className="min-w-0 flex-1 text-left px-3 py-3 rounded-l-xl"
            >
              {i < visits.length - 1 && (
                <div className="absolute left-[22px] top-[42px] w-px h-[calc(100%-20px)] bg-border pointer-events-none" />
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
                    {visitListLabel(visit)}
                  </p>
                </div>
              </div>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-auto shrink-0 rounded-l-none rounded-r-xl text-muted-foreground hover:text-destructive"
              title="Delete visit"
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(visit);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this visit?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the visit from the chart. Lab files stay on the patient but are unlinked from this visit.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void runDelete()}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
