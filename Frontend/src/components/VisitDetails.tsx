import { useEffect, useState } from "react";
import type { Visit } from "@/hooks/usePatientStore";
import { FileText, Pill, Paperclip, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface VisitDetailsProps {
  visit: Visit;
  onUpdateSoap: (soap: Visit["soap"]) => Promise<void>;
}

const soapLabels = [
  { key: "subjective" as const, label: "Subjective", color: "text-primary" },
  { key: "objective" as const, label: "Objective", color: "text-success" },
  { key: "assessment" as const, label: "Assessment", color: "text-warning" },
  { key: "plan" as const, label: "Plan", color: "text-destructive" },
];

export function VisitDetails({ visit, onUpdateSoap }: VisitDetailsProps) {
  const [editingSoap, setEditingSoap] = useState<Record<string, boolean>>({});
  const [soapValues, setSoapValues] = useState(visit.soap);

  useEffect(() => {
    setSoapValues(visit.soap);
  }, [visit.id, JSON.stringify(visit.soap)]);

  const toggleEdit = async (key: string) => {
    if (editingSoap[key]) {
      try {
        await onUpdateSoap(soapValues);
      } catch {
        return;
      }
    }
    setEditingSoap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* SOAP Notes */}
      <div className="bg-card rounded-2xl border border-border card-shadow p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">SOAP Notes</h3>
        </div>
        <div className="space-y-4">
          {soapLabels.map(({ key, label, color }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn("text-xs font-semibold uppercase tracking-wider", color)}>
                  {label}
                </span>
                <button
                  onClick={() => toggleEdit(key)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {editingSoap[key] ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
              </div>
              {editingSoap[key] ? (
                <textarea
                  value={soapValues[key]}
                  onChange={(e) => setSoapValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full text-sm bg-accent/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground"
                  rows={3}
                />
              ) : (
                <p className="text-sm text-foreground/80 leading-relaxed">{soapValues[key]}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Prescriptions */}
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

      {/* Attachments placeholder */}
      <div className="bg-card rounded-2xl border border-border card-shadow p-5">
        <div className="flex items-center gap-2 mb-3">
          <Paperclip className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Attachments</h3>
        </div>
        <p className="text-sm text-muted-foreground">No attachments yet</p>
      </div>
    </div>
  );
}
