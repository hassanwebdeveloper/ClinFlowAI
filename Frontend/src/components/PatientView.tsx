import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LayoutDashboard, ListTree, Plus, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VisitTimeline } from "@/components/VisitTimeline";
import { VisitDetails } from "@/components/VisitDetails";
import { NewVisitFlow } from "@/components/NewVisitFlow";
import { PatientDashboard } from "@/components/PatientDashboard";
import {
  labReportsForVisit,
  type HealthProfile,
  type Patient,
  type Visit,
} from "@/hooks/usePatientStore";
import type { LabCacheEntry, LabReportGroupsPayload, PrepareVisitAudioResult, VisitPatchPayload } from "@/lib/api";
import { patientPath, patientVisitPath } from "@/lib/routes";
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

interface PatientViewProps {
  patient: Patient;
  selectedVisitId: string;
  onSelectVisit: (id: string) => void;
  onDeletePatient?: (patientId: string) => Promise<void>;
  onAddVisit: (visit: Visit) => Promise<void>;
  onPrepareVisitFromAudio: (
    audios: Blob[],
    labReports: { blob: Blob; filename: string }[],
    labReportGroups?: LabReportGroupsPayload
  ) => Promise<PrepareVisitAudioResult>;
  onFinalizeVisitFromAudio: (
    audios: Blob[],
    labReports: { blob: Blob; filename: string }[],
    opts: {
      transcript: string;
      labCache: LabCacheEntry[];
      labTestNames: string[];
      labReportGroups?: LabReportGroupsPayload;
    }
  ) => Promise<void>;
  onUpdateSoap: (visitId: string, soap: Visit["soap"]) => Promise<void>;
  onSaveVisit: (visitId: string, patch: VisitPatchPayload) => Promise<void>;
  onRegenerateSoap: (visitId: string, transcript: string) => Promise<void>;
  onRefreshAiReminders: (visitId: string) => Promise<void>;
  onHydratePrescriptions: (visitId: string) => Promise<void>;
  onDeleteVisit: (visitId: string) => Promise<void>;
  onSaveHealthProfile: (profile: HealthProfile) => Promise<unknown>;
  onUpdateLabReportDetails: (labReportId: string, details: string) => Promise<unknown>;
}

export function PatientView({
  patient,
  selectedVisitId,
  onSelectVisit,
  onDeletePatient,
  onAddVisit,
  onPrepareVisitFromAudio,
  onFinalizeVisitFromAudio,
  onUpdateSoap,
  onSaveVisit,
  onRegenerateSoap,
  onRefreshAiReminders,
  onHydratePrescriptions,
  onDeleteVisit,
  onSaveHealthProfile,
  onUpdateLabReportDetails,
}: PatientViewProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const params = useParams<{ visitId?: string }>();
  const [showNewVisit, setShowNewVisit] = useState(false);
  const [showDeletePatient, setShowDeletePatient] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);
  // Local override for the empty-patient case, where switching the tab cannot
  // change the URL (no visit to navigate to). For the normal case, the URL alone
  // drives the active tab so deep links + browser back/forward keep working.
  const [tabOverride, setTabOverride] = useState<"dashboard" | "visits" | null>(null);
  const selectedVisit = patient.visits.find((v) => v.id === selectedVisitId) || patient.visits[0];

  const activeTab: "dashboard" | "visits" =
    tabOverride ?? (params.visitId ? "visits" : "dashboard");

  const handleTabChange = (next: string) => {
    if (next !== "dashboard" && next !== "visits") return;
    if (next === activeTab) return;
    if (next === "dashboard") {
      setTabOverride(null);
      if (params.visitId) navigate(patientPath(patient.id));
    } else {
      const target = patient.visits[0]?.id;
      if (target) {
        setTabOverride(null);
        navigate(patientVisitPath(patient.id, target));
      } else {
        setTabOverride("visits");
      }
    }
  };

  const handleOpenVisit = (visitId: string) => {
    setTabOverride(null);
    navigate(patientVisitPath(patient.id, visitId));
  };

  if (showNewVisit) {
    return (
      <NewVisitFlow
        patientId={patient.id}
        patientName={patient.name}
        onSave={async (visit) => {
          await onAddVisit(visit);
          setShowNewVisit(false);
        }}
        onPrepareVisitFromAudio={onPrepareVisitFromAudio}
        onFinalizeVisitFromAudio={async (audios, labs, opts) => {
          await onFinalizeVisitFromAudio(audios, labs, opts);
          setShowNewVisit(false);
        }}
        onCancel={() => setShowNewVisit(false)}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Patient Header — stack on narrow screens so actions don’t overflow viewport */}
      <div className="mb-6 flex w-full max-w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{patient.name}</h2>
            <p className="text-sm text-muted-foreground break-words">
              Ref. {patient.uiId} · {patient.age} years · {patient.gender}
            </p>
            {patient.labReports.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {patient.labReports.length} lab report{patient.labReports.length !== 1 ? "s" : ""} on file
              </p>
            )}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-stretch gap-2 sm:w-auto sm:justify-end sm:items-center">
          {onDeletePatient && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10 min-w-0 flex-1 sm:flex-initial"
              onClick={() => setShowDeletePatient(true)}
            >
              <Trash2 className="h-4 w-4 mr-1 shrink-0" />
              <span className="sm:hidden">Delete</span>
              <span className="hidden sm:inline">Delete patient</span>
            </Button>
          )}
          <Button
            onClick={() => setShowNewVisit(true)}
            size="sm"
            className="min-w-0 flex-1 sm:flex-initial sm:shrink-0"
          >
            <Plus className="h-4 w-4 mr-1 shrink-0" /> New Visit
          </Button>
        </div>
      </div>

      {onDeletePatient && (
        <AlertDialog open={showDeletePatient} onOpenChange={(o) => !o && !deletingPatient && setShowDeletePatient(false)}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete patient?</AlertDialogTitle>
              <AlertDialogDescription>
                Deletes {patient.name} (ref. {patient.uiId}) and all visits — can’t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl" disabled={deletingPatient}>
                Cancel
              </AlertDialogCancel>
              <Button
                variant="destructive"
                className="rounded-xl"
                disabled={deletingPatient}
                onClick={() => {
                  void (async () => {
                    setDeletingPatient(true);
                    try {
                      await onDeletePatient(patient.id);
                      toast({ title: "Patient removed" });
                      setShowDeletePatient(false);
                    } catch (err) {
                      toast({
                        title: err instanceof Error ? err.message : "Could not delete patient",
                        variant: "destructive",
                      });
                    } finally {
                      setDeletingPatient(false);
                    }
                  })();
                }}
              >
                {deletingPatient ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="visits" className="gap-1.5">
            <ListTree className="h-4 w-4" />
            Visits
            {patient.visits.length > 0 && (
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                {patient.visits.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0">
          <PatientDashboard
            patient={patient}
            onOpenVisit={handleOpenVisit}
            onNewVisit={() => setShowNewVisit(true)}
            onSaveHealthProfile={onSaveHealthProfile}
          />
        </TabsContent>

        <TabsContent value="visits" className="mt-0">
          {patient.visits.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border card-shadow p-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No visits recorded yet for this patient.
              </p>
              <Button onClick={() => setShowNewVisit(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add first visit
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <VisitTimeline
                  visits={patient.visits}
                  selectedVisitId={selectedVisitId}
                  onSelectVisit={onSelectVisit}
                  onDeleteVisit={onDeleteVisit}
                />
              </div>
              <div className="lg:col-span-2">
                {selectedVisit && (
                  <VisitDetails
                    visit={selectedVisit}
                    visitLabReports={labReportsForVisit(selectedVisit, patient.labReports)}
                    patientId={patient.id}
                    onUpdateSoap={async (soap) => onUpdateSoap(selectedVisit.id, soap)}
                    onSaveVisit={(patch) => onSaveVisit(selectedVisit.id, patch)}
                    onRegenerateSoap={(t) => onRegenerateSoap(selectedVisit.id, t)}
                    onRefreshAiReminders={() => onRefreshAiReminders(selectedVisit.id)}
                    onHydratePrescriptions={() => onHydratePrescriptions(selectedVisit.id)}
                    onSelectVisit={onSelectVisit}
                    onUpdateLabReportDetails={onUpdateLabReportDetails}
                  />
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
