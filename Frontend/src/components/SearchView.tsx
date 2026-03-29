import { useState } from "react";
import { Search as SearchIcon, User, CalendarDays } from "lucide-react";
import type { Patient } from "@/hooks/usePatientStore";
import { cn } from "@/lib/utils";

interface SearchViewProps {
  patients: Patient[];
  onSelectPatient: (id: string) => void;
}

export function SearchView({ patients, onSelectPatient }: SearchViewProps) {
  const [query, setQuery] = useState("");

  const results = query.trim()
    ? patients.flatMap((p) => {
        const items: { type: "patient" | "visit"; patient: Patient; label: string; sub: string }[] = [];
        if (p.name.toLowerCase().includes(query.toLowerCase())) {
          items.push({ type: "patient", patient: p, label: p.name, sub: `${p.age}y · ${p.gender}` });
        }
        p.visits.forEach((v) => {
          if (v.diagnosis.toLowerCase().includes(query.toLowerCase())) {
            items.push({ type: "visit", patient: p, label: v.diagnosis, sub: `${p.name} · ${v.date}` });
          }
        });
        return items;
      })
    : [];

  return (
    <div className="max-w-2xl mx-auto py-8 animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground mb-5">Search</h2>
      <div className="relative mb-6">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search patients, visits…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground"
          autoFocus
        />
      </div>

      {query.trim() && (
        <div className="space-y-1">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No results found</p>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => onSelectPatient(r.patient.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent transition-colors text-left"
              >
                {r.type === "patient" ? (
                  <User className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.sub}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
