import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Visit, LabReportRecord } from "@/hooks/usePatientStore";
import type { VisitPatchPayload } from "@/lib/api";
import { openStoredLabFileInNewTab } from "@/lib/api";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  Pill,
  Pencil,
  Mic,
  Sparkles,
  Loader2,
  BellRing,
  RefreshCw,
  ExternalLink,
  FlaskConical,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

/** Coalesce concurrent prescription hydrate for the same visit (e.g. React StrictMode). */
const hydrateRxInflight = new Map<string, Promise<void>>();

interface VisitDetailsProps {
  visit: Visit;
  /** Lab files saved for this visit (same collapsible style as new visit). */
  visitLabReports: LabReportRecord[];
  patientId: string;
  onUpdateSoap: (soap: Visit["soap"]) => Promise<void>;
  onSaveVisit: (patch: VisitPatchPayload) => Promise<void>;
  onRegenerateSoap: (transcript: string) => Promise<void>;
  onRefreshAiReminders: () => Promise<void>;
  /** Backfill structured prescriptions + dosing from transcript for legacy visits (once per open). */
  onHydratePrescriptions?: () => Promise<void>;
  onSelectVisit: (visitId: string) => void;
  /** Persist a doctor edit to a single lab report's extracted text. */
  onUpdateLabReportDetails: (labReportId: string, details: string) => Promise<unknown>;
}

const soapLabels = [
  { key: "subjective" as const, label: "Subjective", color: "text-primary" },
  { key: "objective" as const, label: "Objective", color: "text-success" },
  { key: "assessment" as const, label: "Assessment", color: "text-warning" },
  { key: "plan" as const, label: "Plan", color: "text-destructive" },
];

type MetaKey = "date" | "visitTitle" | "summaryReport" | "transcript";

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function listToLines(items: string[]): string {
  return items.join("\n");
}

/** Edit buffer: one line per medicine; optional dosage and frequency after ` | `. */
function prescriptionsToMedicinesLines(
  rx: { medicine: string; dosage?: string; frequency?: string }[],
): string {
  const rows = (rx ?? []).filter((r) => (r.medicine ?? "").trim());
  if (!rows.length) return "";
  return rows
    .map((r) => {
      const m = r.medicine.trim();
      const d = (r.dosage ?? "").trim();
      const f = (r.frequency ?? "").trim();
      if (!d && !f) return m;
      return `${m} | ${d} | ${f}`;
    })
    .join("\n");
}

function medicinesLinesFromVisit(visit: Visit): string {
  const hasRx = visit.prescriptions?.some((r) => (r.medicine ?? "").trim());
  if (hasRx) return prescriptionsToMedicinesLines(visit.prescriptions);
  return listToLines(visit.prescribedMedicines);
}

function parseMedicinesLines(text: string): {
  prescriptions: { medicine: string; dosage: string; frequency: string }[];
  prescribed_medicines: string[];
} {
  const prescriptions: { medicine: string; dosage: string; frequency: string }[] = [];
  for (const line of linesToList(text)) {
    const parts = line.split("|").map((s) => s.trim());
    const medicine = parts[0] ?? "";
    if (!medicine) continue;
    prescriptions.push({
      medicine,
      dosage: parts[1] ?? "",
      frequency: parts[2] ?? "",
    });
  }
  return {
    prescriptions,
    prescribed_medicines: prescriptions.map((p) => p.medicine),
  };
}

function ReadonlyBlock({ text, emptyLabel }: { text: string; emptyLabel?: string }) {
  const t = text.trim();
  return (
    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap rounded-lg bg-muted/30 border border-border/60 px-3 py-2 min-h-[2.5rem]">
      {t || <span className="text-muted-foreground italic">{emptyLabel ?? "—"}</span>}
    </p>
  );
}

function ReadonlyLineList({ linesText, emptyLabel }: { linesText: string; emptyLabel: string }) {
  const items = linesText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground italic rounded-lg bg-muted/30 border border-border/60 px-3 py-2 min-h-[2.5rem]">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="text-sm text-foreground/80 list-disc pl-5 space-y-1 rounded-lg bg-muted/30 border border-border/60 px-3 py-2 min-h-[2.5rem]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function reminderGapCategoryLabel(category: string): string {
  switch (category) {
    case "medicine_dosage":
      return "Medicine dosing";
    case "lab_discussed_no_value":
      return "Lab without values";
    case "allergy_incomplete":
      return "Allergy detail";
    default:
      return category.replace(/_/g, " ");
  }
}

function VisitSectionCollapsible({
  title,
  icon: Icon,
  iconClassName = "text-primary",
  defaultOpen = true,
  headerRight,
  badge,
  children,
}: {
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  defaultOpen?: boolean;
  headerRight?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/vsection bg-card rounded-2xl border border-border card-shadow overflow-hidden"
    >
      <div className="flex flex-wrap items-start gap-x-2 gap-y-2 p-5 pb-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex flex-1 min-w-[12rem] items-center gap-2 text-left rounded-xl -m-1 p-2 hover:bg-accent/30 transition-colors"
          >
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/vsection:rotate-180" />
            <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
              <h3 className="font-semibold text-foreground text-sm">{title}</h3>
              {badge}
            </span>
          </button>
        </CollapsibleTrigger>
        {headerRight ? <div className="ml-auto shrink-0">{headerRight}</div> : null}
      </div>
      <CollapsibleContent>
        <div className="px-5 pb-5 pt-1 border-t border-border/50">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function VisitDetails({
  visit,
  visitLabReports,
  patientId,
  onUpdateSoap,
  onSaveVisit,
  onRegenerateSoap,
  onRefreshAiReminders,
  onHydratePrescriptions,
  onSelectVisit,
  onUpdateLabReportDetails,
}: VisitDetailsProps) {
  const [editingSoap, setEditingSoap] = useState<Record<string, boolean>>({});
  const [soapValues, setSoapValues] = useState(visit.soap);

  const [date, setDate] = useState(visit.date);
  const [visitTitle, setVisitTitle] = useState(visit.visitTitle);
  const [summaryReport, setSummaryReport] = useState(visit.visitSummaryReport);
  const [transcript, setTranscript] = useState(visit.transcript ?? "");
  const [symptomsText, setSymptomsText] = useState(listToLines(visit.symptoms));
  const [duration, setDuration] = useState(visit.duration);
  const [historyText, setHistoryText] = useState(listToLines(visit.medicalHistory));
  const [allergiesText, setAllergiesText] = useState(listToLines(visit.allergies));
  const [medicinesText, setMedicinesText] = useState(() => medicinesLinesFromVisit(visit));
  const [labTestsText, setLabTestsText] = useState(listToLines(visit.prescribedLabTests));

  const [editingMeta, setEditingMeta] = useState<Record<string, boolean>>({});
  const [editingExtra, setEditingExtra] = useState<Record<string, boolean>>({});

  const [regenerating, setRegenerating] = useState(false);

  const [loadingReminders, setLoadingReminders] = useState(false);

  /** Per-lab-report editable copy of `details`, keyed by lab report id. */
  const [labDetailsDraft, setLabDetailsDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(visitLabReports.map((lr) => [lr.id, lr.details ?? ""])),
  );

  /** Last transcript value we treat as “already regenerated” / initial for this visit. */
  const regenerateBaselineTranscriptRef = useRef(visit.transcript ?? "");

  /** Successful POST hydrate-prescriptions calls per `patientId:visitId` this session. */
  const hydrateRxDoneRef = useRef(new Set<string>());

  useEffect(() => {
    regenerateBaselineTranscriptRef.current = visit.transcript ?? "";
  }, [visit.id]);

  // Re-seed per-report drafts whenever the visit changes or upstream lab data
  // updates (e.g. after a successful regenerate / new visit selection).
  useEffect(() => {
    setLabDetailsDraft(
      Object.fromEntries(visitLabReports.map((lr) => [lr.id, lr.details ?? ""])),
    );
  }, [visit.id, visitLabReports]);

  const handleRefreshAiReminders = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!patientId || !visit.id) return;
      setLoadingReminders(true);
      try {
        await onRefreshAiReminders();
        if (!opts?.silent) {
          toast.success("Reminders updated");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not refresh AI reminders");
      } finally {
        setLoadingReminders(false);
      }
    },
    [patientId, visit.id, onRefreshAiReminders],
  );

  useEffect(() => {
    if (!onHydratePrescriptions || !patientId || !visit.id) return;
    const tx = (visit.transcript ?? "").trim();
    if (!tx) return;
    const rx = visit.prescriptions ?? [];
    const hasStructuredDetail = rx.some(
      (r) => (r.dosage ?? "").trim() || (r.frequency ?? "").trim(),
    );
    if (hasStructuredDetail) return;

    const hasMedNames =
      (visit.prescribedMedicines ?? []).length > 0 ||
      rx.some((r) => (r.medicine ?? "").trim());
    if (!hasMedNames) return;

    const dedupeKey = `${patientId}:${visit.id}`;
    if (hydrateRxDoneRef.current.has(dedupeKey)) return;

    const inflight = hydrateRxInflight.get(dedupeKey);
    if (inflight) {
      void inflight;
      return;
    }

    const run = (async () => {
      try {
        await onHydratePrescriptions();
        hydrateRxDoneRef.current.add(dedupeKey);
      } catch {
        /* allow retry when navigating away and back */
      } finally {
        hydrateRxInflight.delete(dedupeKey);
      }
    })();
    hydrateRxInflight.set(dedupeKey, run);
    void run;
  }, [
    patientId,
    visit.id,
    visit.transcript,
    JSON.stringify(visit.prescriptions),
    JSON.stringify(visit.prescribedMedicines),
    onHydratePrescriptions,
  ]);

  useEffect(() => {
    const tx = (visit.transcript ?? "").trim();
    if (!visit.aiRemindersPending || !tx) return;
    void handleRefreshAiReminders({ silent: true });
  }, [visit.id, visit.aiRemindersPending, visit.transcript, handleRefreshAiReminders]);

  const hasReminderContent = useMemo(() => {
    const r = visit.aiReminders;
    if (!r) return false;
    return (
      r.similarVisits.length > 0 ||
      r.documentationGaps.length > 0 ||
      r.repeatLabReminders.length > 0
    );
  }, [visit.aiReminders]);

  useEffect(() => {
    setSoapValues(visit.soap);
  }, [visit.id, JSON.stringify(visit.soap)]);

  useEffect(() => {
    setDate(visit.date);
    setVisitTitle(visit.visitTitle);
    setSummaryReport(visit.visitSummaryReport);
    setTranscript(visit.transcript ?? "");
    setSymptomsText(listToLines(visit.symptoms));
    setDuration(visit.duration);
    setHistoryText(listToLines(visit.medicalHistory));
    setAllergiesText(listToLines(visit.allergies));
    setMedicinesText(medicinesLinesFromVisit(visit));
    setLabTestsText(listToLines(visit.prescribedLabTests));
  }, [
    visit.id,
    visit.date,
    visit.visitTitle,
    visit.visitSummaryReport,
    visit.transcript,
    visit.duration,
    JSON.stringify(visit.symptoms),
    JSON.stringify(visit.medicalHistory),
    JSON.stringify(visit.allergies),
    JSON.stringify(visit.prescriptions),
    JSON.stringify(visit.prescribedMedicines),
    JSON.stringify(visit.prescribedLabTests),
  ]);

  const savedTranscript = visit.transcript ?? "";
  const hasUnsavedTranscript = transcript !== savedTranscript;
  const transcriptSavedAndChangedFromBaseline =
    !hasUnsavedTranscript && savedTranscript !== regenerateBaselineTranscriptRef.current;

  /** Lab reports whose draft `details` differ from the stored `details`. */
  const dirtyLabReports = useMemo(() => {
    return visitLabReports.filter((lr) => {
      const draft = labDetailsDraft[lr.id];
      if (draft === undefined) return false;
      return draft !== (lr.details ?? "");
    });
  }, [visitLabReports, labDetailsDraft]);

  const hasLabDetailEdits = dirtyLabReports.length > 0;

  const canRegenerateStructuredNotes =
    Boolean(transcript.trim()) &&
    !hasUnsavedTranscript &&
    (transcriptSavedAndChangedFromBaseline || hasLabDetailEdits);

  const handleRegenerate = async () => {
    if (!transcript.trim()) {
      toast.error("Add a transcript before regenerating");
      return;
    }
    if (hasUnsavedTranscript) {
      toast.error("Save the transcript first (Save on the Transcript field)");
      return;
    }
    if (!transcriptSavedAndChangedFromBaseline && !hasLabDetailEdits) {
      toast.error("Save a changed transcript or edit a lab report detail first.");
      return;
    }
    setRegenerating(true);
    try {
      // Persist lab report edits first so the backend rebuilds visit context
      // from the latest stored details before regenerating SOAP.
      for (const lr of dirtyLabReports) {
        await onUpdateLabReportDetails(lr.id, labDetailsDraft[lr.id] ?? "");
      }
      await onSaveVisit({
        transcript,
        visit_title: visitTitle,
        diagnosis: visitTitle.trim() || visit.diagnosis,
        visit_summary_report: summaryReport,
        date,
        symptoms: linesToList(symptomsText),
        duration,
        medical_history: linesToList(historyText),
        allergies: linesToList(allergiesText),
        ...parseMedicinesLines(medicinesText),
        prescribed_lab_tests: linesToList(labTestsText),
      });
      await onRegenerateSoap(transcript);
      regenerateBaselineTranscriptRef.current = transcript;
      toast.success("Visit saved — notes rebuilt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  const saveSoapKey = async (key: keyof Visit["soap"]) => {
    try {
      await onUpdateSoap(soapValues);
      setEditingSoap((prev) => ({ ...prev, [key]: false }));
      toast.success("SOAP updated");
    } catch {
      toast.error("Could not save SOAP");
    }
  };

  const cancelSoapKey = (key: keyof Visit["soap"]) => {
    setSoapValues((prev) => ({ ...prev, [key]: visit.soap[key] }));
    setEditingSoap((prev) => ({ ...prev, [key]: false }));
  };

  const saveMeta = async (key: MetaKey) => {
    try {
      const patch: VisitPatchPayload =
        key === "date"
          ? { date }
          : key === "visitTitle"
            ? { visit_title: visitTitle, diagnosis: visitTitle.trim() || visit.diagnosis }
            : key === "summaryReport"
              ? { visit_summary_report: summaryReport }
              : { transcript };
      await onSaveVisit(patch);
      setEditingMeta((prev) => ({ ...prev, [key]: false }));
      toast.success("Saved");
    } catch {
      toast.error("Could not save");
    }
  };

  const cancelMeta = (key: MetaKey) => {
    if (key === "date") setDate(visit.date);
    if (key === "visitTitle") setVisitTitle(visit.visitTitle);
    if (key === "summaryReport") setSummaryReport(visit.visitSummaryReport);
    if (key === "transcript") setTranscript(visit.transcript ?? "");
    setEditingMeta((prev) => ({ ...prev, [key]: false }));
  };

  const saveExtra = async (
    key: "symptoms" | "duration" | "history" | "allergies" | "medicines" | "labTests",
  ) => {
    try {
      const patch: VisitPatchPayload =
        key === "symptoms"
          ? { symptoms: linesToList(symptomsText) }
          : key === "duration"
            ? { duration }
            : key === "history"
              ? { medical_history: linesToList(historyText) }
              : key === "allergies"
                ? { allergies: linesToList(allergiesText) }
                : key === "medicines"
                  ? parseMedicinesLines(medicinesText)
                  : { prescribed_lab_tests: linesToList(labTestsText) };
      await onSaveVisit(patch);
      setEditingExtra((prev) => ({ ...prev, [key]: false }));
      toast.success("Saved");
    } catch {
      toast.error("Could not save");
    }
  };

  const cancelExtra = (key: "symptoms" | "duration" | "history" | "allergies" | "medicines" | "labTests") => {
    if (key === "symptoms") setSymptomsText(listToLines(visit.symptoms));
    if (key === "duration") setDuration(visit.duration);
    if (key === "history") setHistoryText(listToLines(visit.medicalHistory));
    if (key === "allergies") setAllergiesText(listToLines(visit.allergies));
    if (key === "medicines") setMedicinesText(medicinesLinesFromVisit(visit));
    if (key === "labTests") setLabTestsText(listToLines(visit.prescribedLabTests));
    setEditingExtra((prev) => ({ ...prev, [key]: false }));
  };

  const penBtn = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent"
      aria-label="Edit"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <VisitSectionCollapsible title="SOAP Notes" icon={FileText}>
        <div className="space-y-4">
          {soapLabels.map(({ key, label, color }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn("text-xs font-semibold uppercase tracking-wider", color)}>{label}</span>
                {!editingSoap[key] && penBtn(() => setEditingSoap((p) => ({ ...p, [key]: true })))}
              </div>
              {editingSoap[key] ? (
                <div className="space-y-2">
                  <textarea
                    value={soapValues[key]}
                    onChange={(e) => setSoapValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full text-sm bg-accent/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground"
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => saveSoapKey(key)}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => cancelSoapKey(key)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <ReadonlyBlock text={soapValues[key]} emptyLabel="Not mentioned" />
              )}
            </div>
          ))}
        </div>
      </VisitSectionCollapsible>

      <VisitSectionCollapsible title="Additional information" icon={ClipboardList}>
        <p className="text-xs text-muted-foreground mb-4">
          From the transcript. <span className="font-medium text-foreground/80">Meds and ordered tests</span> come from
          speech only — not from uploaded lab PDFs.
        </p>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Symptoms</Label>
              {!editingExtra.symptoms && penBtn(() => setEditingExtra((p) => ({ ...p, symptoms: true })))}
            </div>
            {editingExtra.symptoms ? (
              <div className="space-y-2">
                <textarea
                  value={symptomsText}
                  onChange={(e) => setSymptomsText(e.target.value)}
                  placeholder="One symptom per line"
                  rows={3}
                  className="w-full text-sm bg-accent/30 rounded-xl p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveExtra("symptoms")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelExtra("symptoms")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyBlock text={symptomsText} emptyLabel="Not mentioned" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Duration</Label>
              {!editingExtra.duration && penBtn(() => setEditingExtra((p) => ({ ...p, duration: true })))}
            </div>
            {editingExtra.duration ? (
              <div className="space-y-2">
                <Input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 3 days"
                  className="h-10 rounded-xl"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveExtra("duration")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelExtra("duration")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyBlock text={duration} emptyLabel="Not mentioned" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Relevant history</Label>
              {!editingExtra.history && penBtn(() => setEditingExtra((p) => ({ ...p, history: true })))}
            </div>
            {editingExtra.history ? (
              <div className="space-y-2">
                <textarea
                  value={historyText}
                  onChange={(e) => setHistoryText(e.target.value)}
                  placeholder="One item per line"
                  rows={3}
                  className="w-full text-sm bg-accent/30 rounded-xl p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveExtra("history")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelExtra("history")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyBlock text={historyText} emptyLabel="Not mentioned" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Allergies</Label>
              {!editingExtra.allergies && penBtn(() => setEditingExtra((p) => ({ ...p, allergies: true })))}
            </div>
            {editingExtra.allergies ? (
              <div className="space-y-2">
                <textarea
                  value={allergiesText}
                  onChange={(e) => setAllergiesText(e.target.value)}
                  placeholder="One allergy per line"
                  rows={2}
                  className="w-full text-sm bg-accent/30 rounded-xl p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveExtra("allergies")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelExtra("allergies")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyBlock text={allergiesText} emptyLabel="Not mentioned" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Pill className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
                <Label className="text-xs">Prescribed medicines (from transcript)</Label>
              </div>
              {!editingExtra.medicines && penBtn(() => setEditingExtra((p) => ({ ...p, medicines: true })))}
            </div>
            {editingExtra.medicines ? (
              <div className="space-y-2">
                <textarea
                  value={medicinesText}
                  onChange={(e) => setMedicinesText(e.target.value)}
                  placeholder='One line per medicine. Optional: Medicine | dosage | frequency (e.g. Amoxicillin | 500 mg | three times daily)'
                  rows={3}
                  className="w-full text-sm bg-accent/30 rounded-xl p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveExtra("medicines")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelExtra("medicines")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (visit.prescriptions ?? []).some((r) => (r.medicine ?? "").trim()) ? (
              <ul className="space-y-2 rounded-lg bg-muted/30 border border-border/60 px-3 py-2 min-h-[2.5rem] list-none">
                {(visit.prescriptions ?? [])
                  .filter((r) => (r.medicine ?? "").trim())
                  .map((rx, i) => (
                    <li key={`${rx.medicine}-${i}`} className="bg-accent/50 rounded-xl p-3">
                      <p className="text-sm font-medium text-foreground">{rx.medicine.trim()}</p>
                      {(rx.dosage?.trim() || rx.frequency?.trim()) ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[rx.dosage, rx.frequency].filter((x) => (x ?? "").trim()).join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : (
              <ReadonlyLineList linesText={medicinesText} emptyLabel="None mentioned in transcript" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Ordered labs &amp; imaging (from transcript)</Label>
              {!editingExtra.labTests && penBtn(() => setEditingExtra((p) => ({ ...p, labTests: true })))}
            </div>
            {editingExtra.labTests ? (
              <div className="space-y-2">
                <textarea
                  value={labTestsText}
                  onChange={(e) => setLabTestsText(e.target.value)}
                  placeholder="One test per line (e.g. CBC, chest X-ray)"
                  rows={3}
                  className="w-full text-sm bg-accent/30 rounded-xl p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveExtra("labTests")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelExtra("labTests")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyLineList linesText={labTestsText} emptyLabel="None ordered in transcript" />
            )}
          </div>
        </div>
      </VisitSectionCollapsible>

      <VisitSectionCollapsible title="Visit summary" icon={Mic}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="visit-date" className="text-xs">
                  Date
                </Label>
                {!editingMeta.date && penBtn(() => setEditingMeta((p) => ({ ...p, date: true })))}
              </div>
              {editingMeta.date ? (
                <div className="space-y-2">
                  <Input
                    id="visit-date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => saveMeta("date")}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => cancelMeta("date")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <ReadonlyBlock text={date} />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="visit-title" className="text-xs">
                  Visit title
                </Label>
                {!editingMeta.visitTitle && penBtn(() => setEditingMeta((p) => ({ ...p, visitTitle: true })))}
              </div>
              {editingMeta.visitTitle ? (
                <div className="space-y-2">
                  <Input
                    id="visit-title"
                    value={visitTitle}
                    onChange={(e) => setVisitTitle(e.target.value)}
                    placeholder="e.g. Presenting with fever"
                    className="h-10 rounded-xl"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => saveMeta("visitTitle")}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => cancelMeta("visitTitle")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <ReadonlyBlock text={visitTitle || visit.diagnosis} emptyLabel="Not set" />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="visit-summary-report" className="text-xs">
                Visit summary report
              </Label>
              {!editingMeta.summaryReport &&
                penBtn(() => setEditingMeta((p) => ({ ...p, summaryReport: true })))}
            </div>
            <p className="text-xs text-muted-foreground mb-1.5">
              Short visit narrative (auto-filled with notes; you can edit).
            </p>
            {editingMeta.summaryReport ? (
              <div className="space-y-2">
                <textarea
                  id="visit-summary-report"
                  value={summaryReport}
                  onChange={(e) => setSummaryReport(e.target.value)}
                  placeholder="e.g. Kamran, 34-year-old male, presents with…"
                  rows={5}
                  className="w-full text-sm bg-accent/30 rounded-xl p-4 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground leading-relaxed"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveMeta("summaryReport")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelMeta("summaryReport")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyBlock text={summaryReport} emptyLabel="Run Regenerate structured notes to fill this" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="visit-transcript" className="text-xs">
                Transcript
              </Label>
              {!editingMeta.transcript && penBtn(() => setEditingMeta((p) => ({ ...p, transcript: true })))}
            </div>
            {editingMeta.transcript ? (
              <div className="space-y-2">
                <textarea
                  id="visit-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Doctor’s spoken visit summary…"
                  rows={6}
                  className="w-full text-sm bg-accent/30 rounded-xl p-4 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground leading-relaxed"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveMeta("transcript")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => cancelMeta("transcript")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ReadonlyBlock text={transcript} emptyLabel="No transcript" />
            )}
          </div>
        </div>
      </VisitSectionCollapsible>

      <VisitSectionCollapsible
        title="AI Reminders"
        icon={BellRing}
        iconClassName="text-sky-600 dark:text-sky-400"
        headerRight={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loadingReminders || !(visit.transcript?.trim())}
            onClick={(e) => {
              e.stopPropagation();
              void handleRefreshAiReminders();
            }}
          >
            {loadingReminders ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            {loadingReminders ? "Generating…" : "Refresh reminders"}
          </Button>
        }
      >
        {loadingReminders && (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-8 px-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="font-medium text-foreground">Generating AI reminders</p>
            <p className="text-xs max-w-sm leading-relaxed">
              Finding similar past visits, checking documentation, and lab follow-up — usually a few seconds.
            </p>
          </div>
        )}

        {!loadingReminders && !visit.aiReminders && (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            {visit.aiRemindersPending && !(visit.transcript ?? "").trim()
              ? "Add a transcript to generate reminders."
              : "New visits load reminders when you open them. Use Refresh after Regenerate SOAP if needed."}
          </p>
        )}

        {!loadingReminders && visit.aiReminders && !hasReminderContent && (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            Nothing flagged. Try Refresh if you changed the transcript or labs.
          </p>
        )}

        {!loadingReminders && visit.aiReminders && hasReminderContent && (
          <div className="space-y-6">
            {visit.aiReminders.similarVisits.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Similar previous visits
                </h4>
                <div className="flex flex-wrap gap-2">
                  {visit.aiReminders.similarVisits.map((sv) => (
                    <button
                      key={sv.visitId}
                      type="button"
                      onClick={() => onSelectVisit(sv.visitId)}
                      className="inline-flex items-center gap-1 text-xs bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/40 rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors text-left"
                      title={sv.similarity > 0 ? `Similarity ${(sv.similarity * 100).toFixed(1)}%` : undefined}
                    >
                      <ExternalLink className="h-3 w-3 text-primary shrink-0" />
                      <span className="font-medium text-primary">{sv.visitTitle || "Visit"}</span>
                      {sv.visitDate && <span className="text-muted-foreground">· {sv.visitDate}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visit.aiReminders.documentationGaps.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Possible documentation gaps
                </h4>
                <ul className="space-y-2">
                  {visit.aiReminders.documentationGaps.map((g, i) => (
                    <li
                      key={`${g.category}-${i}`}
                      className="rounded-xl border border-amber-200/60 dark:border-amber-800/35 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm leading-relaxed"
                    >
                      <span className="text-[11px] font-medium uppercase tracking-wide text-amber-800/90 dark:text-amber-200/85 mr-2">
                        {reminderGapCategoryLabel(g.category)}
                      </span>
                      {g.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {visit.aiReminders.repeatLabReminders.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Consider repeating labs
                </h4>
                <ul className="space-y-2">
                  {visit.aiReminders.repeatLabReminders.map((rl, i) => (
                    <li
                      key={`${rl.testName}-${i}`}
                      className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm"
                    >
                      <span className="font-medium text-foreground">{rl.testName}</span>
                      <p className="text-muted-foreground mt-1 leading-relaxed">{rl.rationale}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {visit.aiReminders.generatedAt && (
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                Generated {new Date(visit.aiReminders.generatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>
        )}
      </VisitSectionCollapsible>

      {visitLabReports.length > 0 && (
        <VisitSectionCollapsible
          title="Lab reports"
          icon={FlaskConical}
          badge={
            <span className="text-xs text-muted-foreground font-normal">({visitLabReports.length})</span>
          }
        >
          <p className="text-xs text-muted-foreground mb-4">
            Uploaded or spoken-in labs. Edit extracted text if needed, then use{" "}
            <span className="font-medium text-foreground">Regenerate structured notes</span> below.
          </p>
          <div className="space-y-3">
            {visitLabReports.map((lr, idx) => (
              <Collapsible
                key={lr.id || `${lr.filename}-${idx}`}
                className="group/labrow rounded-xl border border-border bg-accent/20 overflow-hidden"
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left border-b border-border/80 bg-accent/30 hover:bg-accent/40 transition-colors"
                  >
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5 transition-transform duration-200 group-data-[state=open]/labrow:rotate-180" />
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate" title={lr.filename || lr.testName}>
                        {idx + 1}. {lr.testName?.trim() ? lr.testName : lr.filename || "Lab result"}
                      </p>
                      {lr.testName?.trim() && lr.filename ? (
                        <p className="text-xs text-muted-foreground truncate mt-0.5" title={lr.filename}>
                          {lr.filename}
                        </p>
                      ) : lr.extractionMethod === "transcript" ? (
                        <p className="text-xs italic text-muted-foreground mt-0.5">
                          From visit transcript
                        </p>
                      ) : null}
                      <p className="text-[10px] uppercase text-muted-foreground mt-1">
                        {lr.extractionMethod === "vl"
                          ? "vision"
                          : lr.extractionMethod === "transcript"
                          ? "transcript"
                          : "text"}
                      </p>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 py-3 space-y-3 border-t border-border/60 bg-accent/10">
                    {(() => {
                      const urls = [lr.fileUrl, ...(lr.extraFileUrls ?? [])].filter((u): u is string =>
                        Boolean(u?.trim())
                      );
                      if (!urls.length) return null;
                      return (
                        <div className="flex flex-wrap gap-2">
                          {urls.map((u, i) => (
                            <button
                              key={`${u}-${i}`}
                              type="button"
                              onClick={() => {
                                void openStoredLabFileInNewTab(u).catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Could not open file")
                                );
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {urls.length > 1 ? `Open photo ${i + 1}` : "Open uploaded file"}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    {(() => {
                      const draft = labDetailsDraft[lr.id] ?? lr.details ?? "";
                      const original = lr.details ?? "";
                      const dirty = draft !== original;
                      return (
                        <div className="space-y-1.5">
                          <textarea
                            value={draft}
                            onChange={(e) =>
                              setLabDetailsDraft((prev) => ({ ...prev, [lr.id]: e.target.value }))
                            }
                            placeholder="Extracted lab text — edit if needed"
                            className={cn(
                              "w-full min-h-[140px] max-h-[320px] text-xs font-mono bg-muted/40 rounded-lg p-3 border text-foreground leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/20",
                              dirty
                                ? "border-warning/60 focus:ring-warning/30"
                                : "border-border",
                            )}
                          />
                          {dirty ? (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-warning">
                                Unsaved changes — tap <span className="font-medium">Regenerate structured notes</span> below.
                              </span>
                              <button
                                type="button"
                                className="text-[11px] text-muted-foreground hover:text-foreground underline"
                                onClick={() =>
                                  setLabDetailsDraft((prev) => ({ ...prev, [lr.id]: original }))
                                }
                              >
                                Reset
                              </button>
                            </div>
                          ) : !original.trim() ? (
                            <p className="text-[11px] text-muted-foreground">No text yet — you can type it in.</p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </VisitSectionCollapsible>
      )}

      <div className="bg-card rounded-2xl border border-border card-shadow p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={regenerating || !canRegenerateStructuredNotes}
            onClick={handleRegenerate}
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            Regenerate structured notes
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Unlocks when you save a changed transcript or edit a lab — then saves and rebuilds SOAP, summary, meds, and
          orders.
        </p>
      </div>

    </div>
  );
}
