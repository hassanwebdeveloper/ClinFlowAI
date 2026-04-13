import { useState } from "react";
import { Building2, LogOut, MapPin, Phone, Stethoscope, Trash2 } from "lucide-react";
import { APP_NAME } from "@/lib/branding";
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
import { AddClinicDialog } from "@/components/AddClinicDialog";
import { EditClinicDialog } from "@/components/EditClinicDialog";
import type { Clinic } from "@/hooks/useClinicStore";
import { useToast } from "@/hooks/use-toast";
import type { ClinicCreatePayload } from "@/lib/api";

interface ClinicListProps {
  clinics: Clinic[];
  onAddClinic: (data: ClinicCreatePayload) => Promise<unknown>;
  onUpdateClinic: (clinicId: string, data: Partial<ClinicCreatePayload>) => Promise<unknown>;
  onRemoveClinic: (clinicId: string) => Promise<unknown>;
  onSelectClinic: (clinicId: string) => void;
  onSignOut?: () => void;
}

export function ClinicList({
  clinics,
  onAddClinic,
  onUpdateClinic,
  onRemoveClinic,
  onSelectClinic,
  onSignOut,
}: ClinicListProps) {
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<Clinic | null>(null);
  const [deleting, setDeleting] = useState(false);

  const runDeleteClinic = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onRemoveClinic(pendingDelete.id);
      setPendingDelete(null);
      toast({ title: "Clinic deleted" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Could not delete clinic",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (clinics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 sm:py-24 animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">{APP_NAME}</span>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Choose a clinic after you add one — patient lists and visits are scoped per clinic.
          </p>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Welcome! Add your first clinic</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
          Create a clinic to start managing patients and visits.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <AddClinicDialog
            onAdd={onAddClinic}
            trigger={
              <Button size="lg" className="rounded-xl">
                <Building2 className="h-4 w-4 mr-2" /> Add Your First Clinic
              </Button>
            }
          />
          {onSignOut && (
            <Button type="button" variant="outline" size="lg" className="rounded-xl" onClick={onSignOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Stethoscope className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">{APP_NAME}</span>
          </div>
          <p className="text-sm text-muted-foreground">Select a clinic to open its patients and visits.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-semibold text-foreground">Your Clinics</h2>
        <div className="flex items-center gap-2">
          {onSignOut && (
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onSignOut}>
              <LogOut className="h-4 w-4 mr-1.5" /> Sign out
            </Button>
          )}
          <AddClinicDialog onAdd={onAddClinic} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clinics.map((clinic) => (
          <div
            key={clinic.id}
            className="relative text-left bg-card rounded-2xl border border-border card-shadow transition-all duration-150 hover:card-shadow-hover hover:border-primary/30"
          >
            <button
              type="button"
              onClick={() => onSelectClinic(clinic.id)}
              className="w-full text-left p-5 pr-14 rounded-2xl"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{clinic.name}</p>
                  {clinic.specialty && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Stethoscope className="h-3 w-3 shrink-0" />
                      {clinic.specialty}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                {(clinic.city || clinic.country) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[clinic.city, clinic.country].filter(Boolean).join(", ")}
                  </p>
                )}
                {clinic.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0" />
                    {clinic.phone}
                  </p>
                )}
                {clinic.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{clinic.description}</p>
                )}
              </div>
            </button>
            <div
              className="absolute top-3 right-3 flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <EditClinicDialog clinic={clinic} onUpdate={onUpdateClinic} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground hover:text-destructive"
                title="Delete clinic"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(clinic);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent className="rounded-2xl" onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &quot;{pendingDelete?.name}&quot;. You can only delete a clinic that has
              no patients. This cannot be undone.
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
              onClick={() => void runDeleteClinic()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
