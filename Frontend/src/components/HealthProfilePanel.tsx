import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Heart,
  Pencil,
  Pill,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyHealthProfile,
  type HealthProfile,
  type HealthProfileAllergy,
  type HealthProfileCondition,
  type HealthProfileMedication,
  type Patient,
} from "@/hooks/usePatientStore";
import { toast } from "sonner";

interface HealthProfilePanelProps {
  patient: Patient;
  onSave: (profile: HealthProfile) => Promise<unknown>;
}

const SEVERITIES = ["", "mild", "moderate", "severe", "unclear"] as const;
const CATEGORIES = [
  "",
  "endocrine",
  "cardiac",
  "renal",
  "hepatic",
  "pulmonary",
  "neurological",
  "hematologic",
  "gastrointestinal",
  "musculoskeletal",
  "oncologic",
  "infectious",
  "psychiatric",
  "other",
] as const;

function tempId(prefix: string): string {
  return `${prefix}-tmp-${Math.random().toString(36).slice(2, 10)}`;
}

function assignStableIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const used = new Set<string>();
  // Reserve explicit ids first (even if duplicated — we'll fix duplicates deterministically).
  for (const it of items) {
    const id = (it.id ?? "").trim();
    if (id) used.add(id);
  }

  return items.map((it, idx) => {
    const id = (it.id ?? "").trim();

    // Empty ids always get a fresh stable id.
    if (!id) {
      let candidate = "";
      // Try a few times in the astronomically unlikely event of collision.
      for (let attempt = 0; attempt < 5; attempt++) {
        candidate = tempId(prefix);
        if (!used.has(candidate)) break;
      }
      used.add(candidate);
      return { ...it, id: candidate };
    }

    // Normalize whitespace-only ids as empty (handled above).
    // Duplicate ids: keep first occurrence, rewrite subsequent duplicates.
    const occurrencesBefore = items.slice(0, idx).filter((x) => (x.id ?? "").trim() === id).length;
    if (occurrencesBefore > 0) {
      let candidate = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        candidate = tempId(prefix);
        if (!used.has(candidate)) break;
      }
      used.add(candidate);
      return { ...it, id: candidate };
    }

    return { ...it, id };
  });
}

function normalizeHealthProfileIds(hp: HealthProfile): HealthProfile {
  return {
    ...hp,
    allergies: assignStableIds(hp.allergies, "hpa"),
    longTermMedications: assignStableIds(hp.longTermMedications, "hpm"),
    conditions: assignStableIds(hp.conditions, "hpc"),
  };
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString();
}

function ProfileSection({
  title,
  count,
  icon: Icon,
  iconClassName = "text-primary",
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  icon: LucideIcon;
  iconClassName?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/hpsection bg-card rounded-2xl border border-border card-shadow overflow-hidden"
    >
      <div className="flex items-center gap-2 p-4 pb-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex flex-1 min-w-0 items-center gap-2 text-left rounded-xl -m-1 p-2 hover:bg-accent/30 transition-colors"
          >
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/hpsection:rotate-180" />
            <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
            <h4 className="font-semibold text-foreground text-sm">{title}</h4>
            <span className="ml-1 text-xs text-muted-foreground font-medium">
              {count}
            </span>
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-1 border-t border-border/50">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground italic rounded-lg bg-muted/30 border border-border/60 px-3 py-2">
      {children}
    </p>
  );
}

function LockedBadge({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-muted-foreground bg-muted/60 border border-border/60 rounded px-1.5 py-0.5">
      Edited
    </span>
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover/hprow:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={onEdit}
        className="p-1 rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground"
        aria-label="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        aria-label="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface AllergyRowProps {
  item: HealthProfileAllergy;
  isEditing: boolean;
  onChange: (next: HealthProfileAllergy) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onDelete: () => void;
}

function AllergyRow({
  item,
  isEditing,
  onChange,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onDelete,
}: AllergyRowProps) {
  if (isEditing) {
    return (
      <div className="rounded-xl border border-primary/40 bg-accent/20 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Allergen</Label>
            <Input
              autoFocus
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              placeholder="e.g. Penicillin"
            />
          </div>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select
              value={item.severity || "_none"}
              onValueChange={(v) =>
                onChange({ ...item, severity: v === "_none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {SEVERITIES.filter(Boolean).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Reaction (optional)</Label>
          <Input
            value={item.reaction}
            onChange={(e) => onChange({ ...item, reaction: e.target.value })}
            placeholder="e.g. rash, anaphylaxis"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="rounded-xl"
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            size="sm"
            onClick={onCommitEdit}
            disabled={!item.name.trim()}
            className="rounded-xl"
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/hprow flex items-start justify-between gap-3 rounded-xl bg-accent/20 border border-border/60 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          <span className="break-words">{item.name}</span>
          {item.severity ? (
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 border",
                item.severity === "severe"
                  ? "text-destructive border-destructive/40 bg-destructive/10"
                  : item.severity === "moderate"
                  ? "text-warning border-warning/40 bg-warning/10"
                  : "text-muted-foreground border-border/60 bg-muted/40",
              )}
            >
              {item.severity}
            </span>
          ) : null}
          <LockedBadge shown={item.isDoctorEdited} />
        </div>
        {item.reaction ? (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {item.reaction}
          </p>
        ) : null}
      </div>
      <RowActions onEdit={onStartEdit} onDelete={onDelete} />
    </div>
  );
}

interface MedRowProps {
  item: HealthProfileMedication;
  isEditing: boolean;
  onChange: (next: HealthProfileMedication) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onDelete: () => void;
}

function MedRow({
  item,
  isEditing,
  onChange,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onDelete,
}: MedRowProps) {
  if (isEditing) {
    return (
      <div className="rounded-xl border border-primary/40 bg-accent/20 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Medication</Label>
            <Input
              autoFocus
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              placeholder="e.g. Metformin"
            />
          </div>
          <div>
            <Label className="text-xs">Dosage</Label>
            <Input
              value={item.dosage}
              onChange={(e) => onChange({ ...item, dosage: e.target.value })}
              placeholder="e.g. 500 mg"
            />
          </div>
          <div>
            <Label className="text-xs">Frequency</Label>
            <Input
              value={item.frequency}
              onChange={(e) => onChange({ ...item, frequency: e.target.value })}
              placeholder="e.g. twice daily"
            />
          </div>
          <div>
            <Label className="text-xs">Indication</Label>
            <Input
              value={item.indication}
              onChange={(e) => onChange({ ...item, indication: e.target.value })}
              placeholder="e.g. Type 2 diabetes"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="rounded-xl"
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            size="sm"
            onClick={onCommitEdit}
            disabled={!item.name.trim()}
            className="rounded-xl"
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  const meta = [item.dosage, item.frequency].filter(Boolean).join(" · ");

  return (
    <div className="group/hprow flex items-start justify-between gap-3 rounded-xl bg-accent/20 border border-border/60 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          <span className="break-words">{item.name}</span>
          <LockedBadge shown={item.isDoctorEdited} />
        </div>
        {meta ? (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{meta}</p>
        ) : null}
        {item.indication ? (
          <p className="text-xs text-muted-foreground/80 mt-0.5 break-words">
            for {item.indication}
          </p>
        ) : null}
      </div>
      <RowActions onEdit={onStartEdit} onDelete={onDelete} />
    </div>
  );
}

interface ConditionRowProps {
  item: HealthProfileCondition;
  isEditing: boolean;
  onChange: (next: HealthProfileCondition) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onDelete: () => void;
}

function ConditionRow({
  item,
  isEditing,
  onChange,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onDelete,
}: ConditionRowProps) {
  if (isEditing) {
    return (
      <div className="rounded-xl border border-primary/40 bg-accent/20 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Condition</Label>
            <Input
              autoFocus
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              placeholder="e.g. Type 2 diabetes mellitus"
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select
              value={item.category || "_none"}
              onValueChange={(v) =>
                onChange({ ...item, category: v === "_none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {CATEGORIES.filter(Boolean).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Evidence (optional)</Label>
          <Input
            value={item.evidence}
            onChange={(e) => onChange({ ...item, evidence: e.target.value })}
            placeholder="e.g. HbA1c 8.2 (2026-03-12)"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="rounded-xl"
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            size="sm"
            onClick={onCommitEdit}
            disabled={!item.name.trim()}
            className="rounded-xl"
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/hprow flex items-start justify-between gap-3 rounded-xl bg-accent/20 border border-border/60 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          <span className="break-words">{item.name}</span>
          {item.category ? (
            <span className="text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 border text-primary border-primary/30 bg-primary/5">
              {item.category}
            </span>
          ) : null}
          <LockedBadge shown={item.isDoctorEdited} />
        </div>
        {item.evidence ? (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {item.evidence}
          </p>
        ) : null}
      </div>
      <RowActions onEdit={onStartEdit} onDelete={onDelete} />
    </div>
  );
}

export function HealthProfilePanel({ patient, onSave }: HealthProfilePanelProps) {
  const initial = normalizeHealthProfileIds(patient.healthProfile ?? emptyHealthProfile());
  const [draft, setDraft] = useState<HealthProfile>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Content-based key so we don't reset local draft when `patient.healthProfile` is a new object
  // reference with the same data (which would wipe unsaved edits).
  const serverProfileSyncKey = JSON.stringify(
    normalizeHealthProfileIds(patient.healthProfile ?? emptyHealthProfile()),
  );

  useEffect(() => {
    setDraft(normalizeHealthProfileIds(patient.healthProfile ?? emptyHealthProfile()));
    setEditingId(null);
  }, [patient.id, serverProfileSyncKey]);

  const visibleAllergies = useMemo(
    () => draft.allergies.filter((a) => !a.dismissed),
    [draft.allergies],
  );
  const visibleMeds = useMemo(
    () => draft.longTermMedications.filter((m) => !m.dismissed),
    [draft.longTermMedications],
  );
  const visibleConditions = useMemo(
    () => draft.conditions.filter((c) => !c.dismissed),
    [draft.conditions],
  );

  const dirty = useMemo(() => {
    const baseline = normalizeHealthProfileIds(patient.healthProfile ?? emptyHealthProfile());
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [draft, patient.healthProfile]);

  const lastGenerated = formatRelative(draft.lastGeneratedAt);

  const persist = async (next: HealthProfile) => {
    setSaving(true);
    try {
      await onSave(normalizeHealthProfileIds(next));
      toast.success("Health profile saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save health profile",
      );
    } finally {
      setSaving(false);
    }
  };

  const onAddAllergy = () => {
    const id = tempId("hpa");
    setDraft({
      ...draft,
      allergies: [
        ...draft.allergies,
        {
          id,
          name: "",
          severity: "",
          reaction: "",
          sourceVisitIds: [],
          isDoctorEdited: true,
          dismissed: false,
          updatedAt: "",
        },
      ],
    });
    setEditingId(id);
  };

  const onAddMed = () => {
    const id = tempId("hpm");
    setDraft({
      ...draft,
      longTermMedications: [
        ...draft.longTermMedications,
        {
          id,
          name: "",
          dosage: "",
          frequency: "",
          indication: "",
          sourceVisitIds: [],
          isDoctorEdited: true,
          dismissed: false,
          updatedAt: "",
        },
      ],
    });
    setEditingId(id);
  };

  const onAddCondition = () => {
    const id = tempId("hpc");
    setDraft({
      ...draft,
      conditions: [
        ...draft.conditions,
        {
          id,
          name: "",
          category: "",
          evidence: "",
          sourceVisitIds: [],
          sourceLabReportIds: [],
          isDoctorEdited: true,
          dismissed: false,
          updatedAt: "",
        },
      ],
    });
    setEditingId(id);
  };

  const updateAllergy = (id: string, next: HealthProfileAllergy) => {
    setDraft({
      ...draft,
      allergies: draft.allergies.map((a) => (a.id === id ? next : a)),
    });
  };
  const updateMed = (id: string, next: HealthProfileMedication) => {
    setDraft({
      ...draft,
      longTermMedications: draft.longTermMedications.map((m) =>
        m.id === id ? next : m,
      ),
    });
  };
  const updateCondition = (id: string, next: HealthProfileCondition) => {
    setDraft({
      ...draft,
      conditions: draft.conditions.map((c) => (c.id === id ? next : c)),
    });
  };

  const removeAllergy = (id: string) =>
    setDraft({ ...draft, allergies: draft.allergies.filter((a) => a.id !== id) });
  const removeMed = (id: string) =>
    setDraft({
      ...draft,
      longTermMedications: draft.longTermMedications.filter((m) => m.id !== id),
    });
  const removeCondition = (id: string) =>
    setDraft({
      ...draft,
      conditions: draft.conditions.filter((c) => c.id !== id),
    });

  const cancelEdit = (id: string) => {
    const original = normalizeHealthProfileIds(patient.healthProfile ?? emptyHealthProfile());
    if (!original) return setEditingId(null);
    const orig =
      original.allergies.find((a) => a.id === id) ??
      original.longTermMedications.find((m) => m.id === id) ??
      original.conditions.find((c) => c.id === id);
    if (!orig) {
      // It was a brand-new item — discard it.
      setDraft({
        ...draft,
        allergies: draft.allergies.filter((a) => a.id !== id),
        longTermMedications: draft.longTermMedications.filter((m) => m.id !== id),
        conditions: draft.conditions.filter((c) => c.id !== id),
      });
    } else {
      setDraft({
        ...draft,
        allergies: draft.allergies.map((a) =>
          a.id === id && "severity" in orig ? (orig as HealthProfileAllergy) : a,
        ),
        longTermMedications: draft.longTermMedications.map((m) =>
          m.id === id && "dosage" in orig ? (orig as HealthProfileMedication) : m,
        ),
        conditions: draft.conditions.map((c) =>
          c.id === id && "evidence" in orig ? (orig as HealthProfileCondition) : c,
        ),
      });
    }
    setEditingId(null);
  };

  const commitEdit = (id: string) => {
    setDraft((prev) => {
      const stillEmpty =
        [
          ...prev.allergies,
          ...prev.longTermMedications,
          ...prev.conditions,
        ].find((x) => x.id === id && !x.name.trim()) != null;

      if (stillEmpty) {
        const next: HealthProfile = {
          ...prev,
          allergies: prev.allergies.filter((a) => a.id !== id),
          longTermMedications: prev.longTermMedications.filter((m) => m.id !== id),
          conditions: prev.conditions.filter((c) => c.id !== id),
        };
        return normalizeHealthProfileIds(next);
      }

      const normalized = normalizeHealthProfileIds(prev);
      queueMicrotask(() => {
        void persist(normalized);
      });
      return normalized;
    });
    setEditingId(null);
  };

  return (
    <Collapsible defaultOpen className="group/hppanel mb-6">
      <div className="bg-card rounded-2xl border border-border card-shadow overflow-hidden">
        <div className="flex items-center gap-2 p-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex flex-1 min-w-0 items-center gap-2 text-left rounded-xl -m-1 p-2 hover:bg-accent/30 transition-colors"
            >
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/hppanel:rotate-180" />
              <Activity className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">
                Health profile
              </h3>
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                refreshes after visits
              </span>
            </button>
          </CollapsibleTrigger>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {lastGenerated ? (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <RefreshCcw className="h-3 w-3" />
                {lastGenerated}
              </span>
            ) : null}
            {dirty ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                  disabled={saving}
                  onClick={() =>
                    setDraft(normalizeHealthProfileIds(patient.healthProfile ?? emptyHealthProfile()))
                  }
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  className="rounded-xl"
                  disabled={saving}
                  onClick={() => persist(draft)}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-1 border-t border-border/50 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <ProfileSection
              title="Allergies"
              count={visibleAllergies.length}
              icon={AlertTriangle}
              iconClassName="text-destructive"
            >
              <div className="space-y-2">
                {visibleAllergies.length === 0 ? (
                  <EmptyHint>No known allergies recorded yet.</EmptyHint>
                ) : (
                  visibleAllergies.map((a, idx) => (
                    <AllergyRow
                      key={`${a.id}-${idx}`}
                      item={a}
                      isEditing={editingId === a.id}
                      onChange={(next) => updateAllergy(a.id, next)}
                      onStartEdit={() => {
                        // Old records may have blank ids; editing must not activate every blank-id row.
                        if (!a.id.trim()) {
                          const nid = tempId("hpa");
                          setDraft((prev) => ({
                            ...prev,
                            allergies: prev.allergies.map((row) =>
                              row === a ? { ...row, id: nid } : row,
                            ),
                          }));
                          setEditingId(nid);
                          return;
                        }
                        setEditingId(a.id);
                      }}
                      onCancelEdit={() => cancelEdit(a.id)}
                      onCommitEdit={() => commitEdit(a.id)}
                      onDelete={() => removeAllergy(a.id)}
                    />
                  ))
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl w-full justify-start text-muted-foreground"
                  onClick={onAddAllergy}
                  disabled={editingId !== null}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add allergy
                </Button>
              </div>
            </ProfileSection>

            <ProfileSection
              title="Long-term medications"
              count={visibleMeds.length}
              icon={Pill}
              iconClassName="text-success"
            >
              <div className="space-y-2">
                {visibleMeds.length === 0 ? (
                  <EmptyHint>None listed — short-term meds aren’t shown here.</EmptyHint>
                ) : (
                  visibleMeds.map((m, idx) => (
                    <MedRow
                      key={`${m.id}-${idx}`}
                      item={m}
                      isEditing={editingId === m.id}
                      onChange={(next) => updateMed(m.id, next)}
                      onStartEdit={() => {
                        if (!m.id.trim()) {
                          const nid = tempId("hpm");
                          setDraft((prev) => ({
                            ...prev,
                            longTermMedications: prev.longTermMedications.map((row) =>
                              row === m ? { ...row, id: nid } : row,
                            ),
                          }));
                          setEditingId(nid);
                          return;
                        }
                        setEditingId(m.id);
                      }}
                      onCancelEdit={() => cancelEdit(m.id)}
                      onCommitEdit={() => commitEdit(m.id)}
                      onDelete={() => removeMed(m.id)}
                    />
                  ))
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl w-full justify-start text-muted-foreground"
                  onClick={onAddMed}
                  disabled={editingId !== null}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add medication
                </Button>
              </div>
            </ProfileSection>

            <ProfileSection
              title="Conditions"
              count={visibleConditions.length}
              icon={Heart}
              iconClassName="text-warning"
            >
              <div className="space-y-2">
                {visibleConditions.length === 0 ? (
                  <EmptyHint>No conditions added from visits or labs yet.</EmptyHint>
                ) : (
                  visibleConditions.map((c, idx) => (
                    <ConditionRow
                      key={`${c.id}-${idx}`}
                      item={c}
                      isEditing={editingId === c.id}
                      onChange={(next) => updateCondition(c.id, next)}
                      onStartEdit={() => {
                        if (!c.id.trim()) {
                          const nid = tempId("hpc");
                          setDraft((prev) => ({
                            ...prev,
                            conditions: prev.conditions.map((row) =>
                              row === c ? { ...row, id: nid } : row,
                            ),
                          }));
                          setEditingId(nid);
                          return;
                        }
                        setEditingId(c.id);
                      }}
                      onCancelEdit={() => cancelEdit(c.id)}
                      onCommitEdit={() => commitEdit(c.id)}
                      onDelete={() => removeCondition(c.id)}
                    />
                  ))
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl w-full justify-start text-muted-foreground"
                  onClick={onAddCondition}
                  disabled={editingId !== null}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add condition
                </Button>
              </div>
            </ProfileSection>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
