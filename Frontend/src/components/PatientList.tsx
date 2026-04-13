import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient } from "@/hooks/usePatientStore";
import { AddPatientDialog } from "@/components/AddPatientDialog";
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
import { useToast } from "@/hooks/use-toast";
import { patientPath } from "@/lib/routes";

interface PatientListProps {
  patients: Patient[];
  selectedPatientId: string;
  onAddPatient: (data: { uiId: string; name: string; age: number; gender: string }) => Promise<void>;
  onDeletePatient: (patientId: string) => Promise<void>;
}

export function PatientList({ patients, selectedPatientId, onAddPatient, onDeletePatient }: PatientListProps) {
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const runDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDeletePatient(pendingDelete.id);
      setPendingDelete(null);
      toast({ title: "Patient removed" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Could not delete patient",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-foreground">Patients</h2>
        <AddPatientDialog onAdd={onAddPatient} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {patients.map((patient) => (
          <div
            key={patient.id}
            className={cn(
              "relative text-left bg-card rounded-2xl border transition-all duration-150 hover:card-shadow-hover",
              selectedPatientId === patient.id
                ? "border-primary/30 card-shadow-hover"
                : "border-border card-shadow"
            )}
          >
            <Link to={patientPath(patient.id)} className="block p-4 pr-12">
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
                <span>
                  {patient.visits.length} visit{patient.visits.length !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
              title="Delete patient"
              onClick={(e) => {
                e.preventDefault();
                setPendingDelete(patient);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete patient?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {pendingDelete?.name} (ref. {pendingDelete?.uiId}) and all of their visits
              and linked data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={deleting}
              onClick={() => void runDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
