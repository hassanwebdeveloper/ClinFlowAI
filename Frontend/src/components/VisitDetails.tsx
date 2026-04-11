import { useCallback, useEffect, useState } from "react";
import type { Visit } from "@/hooks/usePatientStore";
import type { ApiAiSuggestion, VisitPatchPayload } from "@/lib/api";
import { fetchAiSuggestionsApi } from "@/lib/api";
import { FileText, Pill, Pencil, Mic, Sparkles, Loader2, Lightbulb, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface VisitDetailsProps {
  visit: Visit;
  patientId: string;
  onUpdateSoap: (soap: Visit["soap"]) => Promise<void>;
  onSaveVisit: (patch: VisitPatchPayload) => Promise<void>;
  onRegenerateSoap: (transcript: string) => Promise<void>;
  onSelectVisit: (visitId: string) => void;
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

function ReadonlyBlock({ text, emptyLabel }: { text: string; emptyLabel?: string }) {
  const t = text.trim();
  return (
    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap rounded-lg bg-muted/30 border border-border/60 px-3 py-2 min-h-[2.5rem]">
      {t || <span className="text-muted-foreground italic">{emptyLabel ?? "—"}</span>}
    </p>
  );
}

export function VisitDetails({
  visit,
  patientId,
  onUpdateSoap,
  onSaveVisit,
  onRegenerateSoap,
  onSelectVisit,
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
  const [medicinesText, setMedicinesText] = useState(listToLines(visit.prescribedMedicines));
  const [labTestsText, setLabTestsText] = useState(listToLines(visit.prescribedLabTests));

  const [editingMeta, setEditingMeta] = useState<Record<string, boolean>>({});
  const [editingExtra, setEditingExtra] = useState<Record<string, boolean>>({});

  const [regenerating, setRegenerating] = useState(false);

  const [suggestions, setSuggestions] = useState<ApiAiSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    if (!patientId || !visit.id) return;
    setLoadingSuggestions(true);
    try {
      const resp = await fetchAiSuggestionsApi(patientId, visit.id);
      setSuggestions(resp.suggestions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load AI suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  }, [patientId, visit.id]);

  useEffect(() => {
    setSuggestions([]);
  }, [visit.id]);

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
    setMedicinesText(listToLines(visit.prescribedMedicines));
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
    JSON.stringify(visit.prescribedMedicines),
    JSON.stringify(visit.prescribedLabTests),
  ]);

  const handleRegenerate = async () => {
    if (!transcript.trim()) {
      toast.error("Add a transcript before regenerating");
      return;
    }
    setRegenerating(true);
    try {
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
        prescribed_medicines: linesToList(medicinesText),
        prescribed_lab_tests: linesToList(labTestsText),
      });
      await onRegenerateSoap(transcript);
      toast.success("Saved and regenerated structured notes");
      fetchSuggestions();
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
                  ? { prescribed_medicines: linesToList(medicinesText) }
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
    if (key === "medicines") setMedicinesText(listToLines(visit.prescribedMedicines));
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
      {/* 1. SOAP Notes */}
      <div className="bg-card rounded-2xl border border-border card-shadow p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">SOAP Notes</h3>
        </div>
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
      </div>

      {/* 2. AI Suggestions */}
      <div className="bg-card rounded-2xl border border-border card-shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="font-semibold text-foreground text-sm">AI Suggestions</h3>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loadingSuggestions || !(visit.transcript?.trim())}
            onClick={fetchSuggestions}
          >
            {loadingSuggestions ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            {loadingSuggestions ? "Analysing..." : "Refresh Suggestions"}
          </Button>
        </div>

        {loadingSuggestions && suggestions.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysing visit history...
          </div>
        )}

        {!loadingSuggestions && suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            No suggestions yet — regenerate structured notes or click Refresh to generate.
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((s, idx) => (
              <div
                key={idx}
                className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl p-4"
              >
                <p className="text-sm text-foreground leading-relaxed">{s.suggestion}</p>
                {s.references.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.references.map((ref, ri) => (
                      <button
                        key={ri}
                        type="button"
                        onClick={() => onSelectVisit(ref.visit_id)}
                        className="inline-flex items-center gap-1 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors text-left"
                        title={ref.relevance_snippet}
                      >
                        <ExternalLink className="h-3 w-3 text-primary shrink-0" />
                        <span className="font-medium text-primary">{ref.visit_title || "Visit"}</span>
                        {ref.visit_date && (
                          <span className="text-muted-foreground">· {ref.visit_date}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Additional information */}
      <div className="bg-card rounded-2xl border border-border card-shadow p-5">
        <h3 className="font-semibold text-foreground text-sm mb-1">Additional information</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Symptoms, duration, relevant history, allergies, prescribed medicines, and lab tests from the transcript.
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
              <Label className="text-xs">Prescribed medicines</Label>
              {!editingExtra.medicines && penBtn(() => setEditingExtra((p) => ({ ...p, medicines: true })))}
            </div>
            {editingExtra.medicines ? (
              <div className="space-y-2">
                <textarea
                  value={medicinesText}
                  onChange={(e) => setMedicinesText(e.target.value)}
                  placeholder="One medicine per line (as stated in the transcript)"
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
            ) : (
              <ReadonlyBlock text={medicinesText} emptyLabel="None extracted" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Lab tests and investigations</Label>
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
              <ReadonlyBlock text={labTestsText} emptyLabel="None extracted" />
            )}
          </div>
        </div>
      </div>

      {/* 4. Visit summary */}
      <div className="bg-card rounded-2xl border border-border card-shadow p-5">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Visit summary</h3>
        </div>

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
              Short narrative with patient demographics and visit gist (generated with structured notes; editable).
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
              <ReadonlyBlock text={summaryReport} emptyLabel="Regenerate structured notes to generate this report" />
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

          {visit.labReportDetails?.trim() ? (
            <div className="mt-6">
              <Label className="text-xs">Lab / document extraction (used for structured notes)</Label>
              <p className="text-xs text-muted-foreground mb-1.5 mt-1">
                From uploads during visit creation; included again when you regenerate notes from the transcript. The
                overall ordered lab test may be tagged [one-time] or [monitoring] when the source document supported that
                inference (whole test, not each result line).
              </p>
              <ReadonlyBlock text={visit.labReportDetails} emptyLabel="No lab data" />
            </div>
          ) : null}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <Button type="button" size="sm" disabled={regenerating || !transcript.trim()} onClick={handleRegenerate}>
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            Regenerate structured notes
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Saves transcript, date, visit title, summary report, and additional fields, then regenerates SOAP,
            visit title, summary report, medicines, lab tests, and other structured extraction from the transcript
            {visit.labReportDetails?.trim() ? " (lab document text for this visit is included automatically)." : "."}
          </p>
        </div>
      </div>

      {visit.prescriptions.length > 0 && (
        <div className="bg-card rounded-2xl border border-border card-shadow p-5">
          <div className="flex items-center gap-2 mb-4">
            <Pill className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Prescriptions</h3>
          </div>
          <div className="space-y-2">
            {visit.prescriptions.map((rx, i) => (
              <div key={i} className="flex items-center gap-4 bg-accent/50 rounded-xl p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{rx.medicine}</p>
                  <p className="text-xs text-muted-foreground">
                    {rx.dosage} · {rx.frequency}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
