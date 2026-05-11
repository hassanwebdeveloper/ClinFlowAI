import { useMemo } from "react";
import {
  ArrowRight,
  Calendar,
  ChevronRight,
  ClipboardList,
  Clock,
  FlaskConical,
  LineChart as LineChartIcon,
  PieChart,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Data as PlotData } from "plotly.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlotlyChart } from "@/components/charts/PlotlyChart";
import { HealthProfilePanel } from "@/components/HealthProfilePanel";
import {
  type HealthProfile,
  type LabAnalyteValue,
  type LabReportRecord,
  type Patient,
  type Visit,
} from "@/hooks/usePatientStore";
import { visitListLabel } from "@/lib/api";

interface PatientDashboardProps {
  patient: Patient;
  onOpenVisit: (visitId: string) => void;
  onNewVisit: () => void;
  onSaveHealthProfile: (profile: HealthProfile) => Promise<unknown>;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function formatRelative(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(months / 12);
  return `${years} yr ago`;
}

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function lastNMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  now.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push({
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    });
  }
  return out;
}

function visitMonthKey(date: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface AnalyteSeries {
  name: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  /** Each point is a (date, value, abnormal) tuple ordered ascending by date. */
  points: { date: Date; value: number; abnormal: boolean }[];
}

interface TestSeries {
  testName: string;
  reportCount: number;
  series: AnalyteSeries[];
}

function buildAnalyteSeriesByTest(labReports: LabReportRecord[]): TestSeries[] {
  const byTest = new Map<string, LabReportRecord[]>();
  for (const r of labReports) {
    const key = (r.testName || "").trim();
    if (!key) continue;
    if (!r.analytes?.length) continue;
    const list = byTest.get(key) ?? [];
    list.push(r);
    byTest.set(key, list);
  }

  const out: TestSeries[] = [];
  byTest.forEach((reports, testName) => {
    if (reports.length < 2) return;
    // Order reports ascending by recordedAt so x is increasing.
    const ordered = [...reports].sort(
      (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
    );

    const seriesByName = new Map<string, AnalyteSeries>();
    for (const r of ordered) {
      const dateMs = Date.parse(r.recordedAt);
      if (Number.isNaN(dateMs)) continue;
      const date = new Date(dateMs);
      for (const a of r.analytes) {
        const aname = (a.name || "").trim();
        if (!aname || a.value === null) continue;
        const existing = seriesByName.get(aname) ?? {
          name: aname,
          unit: a.unit || "",
          refLow: a.refLow,
          refHigh: a.refHigh,
          points: [],
        };
        existing.unit = existing.unit || a.unit || "";
        if (existing.refLow === null && a.refLow !== null) existing.refLow = a.refLow;
        if (existing.refHigh === null && a.refHigh !== null) existing.refHigh = a.refHigh;
        existing.points.push({
          date,
          value: a.value,
          abnormal: Boolean(a.abnormalFlag && a.abnormalFlag !== ""),
        });
        seriesByName.set(aname, existing);
      }
    }

    const series = Array.from(seriesByName.values()).filter((s) => s.points.length >= 2);
    if (!series.length) return;
    out.push({
      testName,
      reportCount: reports.length,
      series,
    });
  });

  // Sort tests by recency of latest point so the most relevant chart shows first.
  out.sort((a, b) => {
    const al = Math.max(...a.series.flatMap((s) => s.points.map((p) => p.date.getTime())));
    const bl = Math.max(...b.series.flatMap((s) => s.points.map((p) => p.date.getTime())));
    return bl - al;
  });
  return out;
}

function pendingFollowUpLabs(visits: Visit[], labReports: LabReportRecord[]): string[] {
  const byDate = [...visits].sort(
    (a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""),
  );
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const v of byDate) {
    for (const raw of v.prescribedLabTests || []) {
      const t = (raw || "").trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(t);
    }
  }
  if (!dedup.length) return [];
  const covered = new Set(
    labReports.map((r) => (r.testName || "").trim().toLowerCase()).filter(Boolean),
  );
  return dedup.filter((t) => !covered.has(t.toLowerCase()));
}

/** When extraction left abnormal_flag blank but value is outside ref range. */
function inferredAbnormalFlag(a: LabAnalyteValue): string {
  const v = a.value;
  const lo = a.refLow;
  const hi = a.refHigh;
  if (v === null || typeof v !== "number" || Number.isNaN(v)) return "";
  if (
    lo !== null &&
    hi !== null &&
    Number.isFinite(lo) &&
    Number.isFinite(hi) &&
    lo <= hi
  ) {
    if (v < lo) return "L";
    if (v > hi) return "H";
  }
  return "";
}

function allergyGlanceTone(
  severity: string | undefined,
): "danger" | "warning" | "default" {
  const s = (severity || "").trim().toLowerCase();
  if (s === "severe") return "danger";
  if (s === "moderate") return "warning";
  return "default";
}

function allergyGlanceRank(severity: string | undefined): number {
  const s = (severity || "").trim().toLowerCase();
  if (s === "severe") return 0;
  if (s === "moderate") return 1;
  if (s === "mild") return 2;
  if (s === "unclear") return 3;
  return 4;
}

interface AbnormalRow {
  testName: string;
  analyteName: string;
  value: number | null;
  unit: string;
  flag: string;
  recordedAt: string;
}

function recentAbnormalAnalytes(labReports: LabReportRecord[], maxRows = 6): AbnormalRow[] {
  if (!labReports.length) return [];
  const ordered = [...labReports].sort(
    (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
  );
  const latestPerTest = new Map<string, LabReportRecord>();
  for (const r of ordered) {
    const k = (r.testName || r.id || "").toLowerCase();
    if (!latestPerTest.has(k)) latestPerTest.set(k, r);
  }
  const rows: AbnormalRow[] = [];
  latestPerTest.forEach((r) => {
    for (const a of r.analytes || []) {
      const explicit = (a.abnormalFlag || "").trim();
      const inferred = explicit ? "" : inferredAbnormalFlag(a);
      const flag = explicit || inferred;
      if (!flag) continue;
      rows.push({
        testName: r.testName || r.filename,
        analyteName: a.name,
        value: a.value,
        unit: a.unit,
        flag,
        recordedAt: r.recordedAt,
      });
    }
  });
  const rank = (f: string) =>
    f.toLowerCase() === "critical" ? 0 : f === "H" || f === "L" ? 1 : 2;
  rows.sort((x, y) => rank(x.flag) - rank(y.flag));
  return rows.slice(0, maxRows);
}

function conditionsByCategory(
  conditions: { category: string; dismissed: boolean }[],
): { labels: string[]; values: number[] } {
  const counts = new Map<string, number>();
  for (const c of conditions) {
    if (c.dismissed) continue;
    const k = (c.category || "other").trim() || "other";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const labels = Array.from(counts.keys());
  const values = labels.map((l) => counts.get(l) ?? 0);
  return { labels, values };
}

// ----------------------------------------------------------------------------
// Small UI primitives
// ----------------------------------------------------------------------------

function CardBox({
  title,
  icon: Icon,
  iconClassName = "text-primary",
  className,
  headerRight,
  children,
}: {
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  className?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border card-shadow p-4 flex flex-col gap-3 min-w-0",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
          <h3 className="font-semibold text-foreground text-sm truncate">{title}</h3>
        </div>
        {headerRight}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "text-primary",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border card-shadow p-4 flex items-start gap-3 min-w-0">
      <div className={cn("w-9 h-9 shrink-0 rounded-xl bg-muted/40 flex items-center justify-center")}>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-semibold text-foreground leading-tight truncate">{value}</p>
        {sub ? <p className="text-xs text-muted-foreground truncate mt-0.5">{sub}</p> : null}
      </div>
    </div>
  );
}

function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border",
        tone === "default" && "bg-muted/40 border-border/60 text-foreground/80",
        tone === "warning" && "bg-warning/10 border-warning/40 text-warning",
        tone === "danger" && "bg-destructive/10 border-destructive/40 text-destructive",
        tone === "success" && "bg-success/10 border-success/40 text-success",
      )}
    >
      {children}
    </span>
  );
}

// ----------------------------------------------------------------------------
// The dashboard
// ----------------------------------------------------------------------------

export function PatientDashboard({
  patient,
  onOpenVisit,
  onNewVisit,
  onSaveHealthProfile,
}: PatientDashboardProps) {
  const lastVisit: Visit | null = patient.visits[0] ?? null;

  const allergies = patient.healthProfile.allergies.filter((a) => !a.dismissed);
  const conditions = patient.healthProfile.conditions.filter((c) => !c.dismissed);

  const glanceAllergies = useMemo(() => {
    const list = patient.healthProfile.allergies.filter((a) => !a.dismissed);
    const named = list.filter((a) => a.name.trim());
    return [...named].sort(
      (a, b) => allergyGlanceRank(a.severity) - allergyGlanceRank(b.severity),
    );
  }, [patient.healthProfile.allergies]);

  const visitsBars = useMemo(() => {
    const months = lastNMonths(12);
    const counts = new Map<string, number>();
    for (const v of patient.visits) {
      const key = visitMonthKey(v.date);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      x: months.map((m) => m.label),
      y: months.map((m) => counts.get(m.key) ?? 0),
    };
  }, [patient.visits]);

  const totalVisitsLast12 = visitsBars.y.reduce((a, b) => a + b, 0);

  const followUps = useMemo(
    () => pendingFollowUpLabs(patient.visits, patient.labReports),
    [patient.visits, patient.labReports],
  );

  const abnormalRows = useMemo(
    () => recentAbnormalAnalytes(patient.labReports),
    [patient.labReports],
  );

  const labTrends = useMemo(
    () => buildAnalyteSeriesByTest(patient.labReports),
    [patient.labReports],
  );

  const condCats = useMemo(() => conditionsByCategory(conditions), [conditions]);
  const showDonut = condCats.labels.length >= 2;

  const lastVisitLabel = lastVisit ? visitListLabel(lastVisit) : "";

  const hasAlerts =
    glanceAllergies.length > 0 || abnormalRows.length > 0 || followUps.length > 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Visits"
          value={patient.visits.length}
          sub={
            lastVisit
              ? `Last ${formatRelative(lastVisit.date)}`
              : "No visits yet"
          }
          icon={Calendar}
        />
        <KpiCard
          label="Last visit"
          value={lastVisit ? formatDate(lastVisit.date) : "—"}
          sub={lastVisit ? lastVisitLabel : undefined}
          icon={Clock}
          accent="text-success"
        />
        <KpiCard
          label="Lab reports"
          value={patient.labReports.length}
          sub={
            patient.labReports.length
              ? `${labTrends.length} chartable`
              : "No labs yet"
          }
          icon={FlaskConical}
          accent="text-primary"
        />
      </div>

      {/* Health profile (single source of truth — allergies, long-term meds, conditions) */}
      <HealthProfilePanel patient={patient} onSave={onSaveHealthProfile} />

      {/* Last visit + Alerts side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardBox
          title="Last visit"
          icon={ClipboardList}
          className="lg:col-span-2"
          headerRight={
            lastVisit ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl text-xs h-8"
                onClick={() => onOpenVisit(lastVisit.id)}
              >
                Open visit <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button size="sm" className="rounded-xl h-8" onClick={onNewVisit}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New visit
              </Button>
            )
          }
        >
          {lastVisit ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{lastVisitLabel}</span>
                <Chip>{formatDate(lastVisit.date)}</Chip>
                <Chip tone="default">{formatRelative(lastVisit.date)}</Chip>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap rounded-lg bg-muted/30 border border-border/60 px-3 py-2">
                {lastVisit.visitSummaryReport?.trim() ||
                  lastVisit.soap?.assessment?.trim() ||
                  "No summary recorded."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic rounded-lg bg-muted/30 border border-border/60 px-3 py-3">
              No visits yet — add one to start the chart.
            </p>
          )}
        </CardBox>

        <CardBox
          title="At a glance"
          icon={Sparkles}
          iconClassName="text-warning"
          className="lg:col-span-1"
        >
          {hasAlerts ? (
            <div className="space-y-3">
              {glanceAllergies.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-1">
                    Allergies
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {glanceAllergies.slice(0, 8).map((a) => (
                      <Chip key={a.id} tone={allergyGlanceTone(a.severity)}>
                        {a.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              {abnormalRows.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-1">
                    Recent abnormal labs
                  </p>
                  <ul className="space-y-1 text-xs">
                    {abnormalRows.map((r, i) => (
                      <li key={i} className="flex items-center gap-1.5 min-w-0">
                        <Chip
                          tone={r.flag === "critical" ? "danger" : "warning"}
                        >
                          {r.flag.toUpperCase()}
                        </Chip>
                        <span className="truncate">
                          <span className="font-medium text-foreground">
                            {r.analyteName}
                          </span>
                          {r.value !== null ? (
                            <span className="text-muted-foreground">
                              {" "}
                              {r.value}
                              {r.unit ? ` ${r.unit}` : ""}
                            </span>
                          ) : null}
                          <span className="text-muted-foreground/70">
                            {" "}
                            · {r.testName}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {followUps.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-1">
                    Pending follow-up labs
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {followUps.slice(0, 8).map((t, i) => (
                      <Chip key={i}>{t}</Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Nothing flagged right now.
            </p>
          )}
        </CardBox>
      </div>

      {/* Visits per month + Conditions donut */}
      <div className={cn("grid grid-cols-1 gap-4", showDonut ? "lg:grid-cols-3" : "")}>
        <CardBox
          title={`Visits per month (last 12 months)`}
          icon={TrendingUp}
          className={cn(showDonut && "lg:col-span-2")}
          headerRight={
            <span className="text-xs text-muted-foreground">
              {totalVisitsLast12} visit{totalVisitsLast12 === 1 ? "" : "s"}
            </span>
          }
        >
          <PlotlyChart
            height={220}
            data={[
              {
                type: "bar",
                x: visitsBars.x,
                y: visitsBars.y,
                marker: { color: "hsl(var(--primary))" },
                hovertemplate: "%{x}: %{y} visit%{plural}<extra></extra>".replace(
                  "%{plural}",
                  "",
                ),
              },
            ]}
            layout={{
              showlegend: false,
              yaxis: { rangemode: "tozero", tickformat: ",d", dtick: 1 },
              margin: { l: 32, r: 8, t: 8, b: 30 },
            }}
          />
        </CardBox>

        {showDonut && (
          <CardBox title="Conditions by category" icon={PieChart} iconClassName="text-warning">
            <PlotlyChart
              height={220}
              data={[
                {
                  type: "pie",
                  hole: 0.55,
                  labels: condCats.labels,
                  values: condCats.values,
                  textinfo: "label+value",
                  textfont: { size: 11 },
                  hovertemplate: "%{label}: %{value}<extra></extra>",
                  marker: {
                    line: { color: "hsl(var(--background))", width: 2 },
                  },
                },
              ]}
              layout={{
                showlegend: false,
                margin: { l: 8, r: 8, t: 8, b: 8 },
              }}
            />
          </CardBox>
        )}
      </div>

      {/* Lab analyte trend charts */}
      <CardBox
        title="Lab trends"
        icon={LineChartIcon}
        iconClassName="text-primary"
        headerRight={
          <span className="text-xs text-muted-foreground">
            {labTrends.length === 0
              ? "No repeat labs yet"
              : `${labTrends.length} test${labTrends.length === 1 ? "" : "s"} with trends`}
          </span>
        }
      >
        {labTrends.length === 0 ? (
          <p className="text-sm text-muted-foreground italic rounded-lg bg-muted/30 border border-border/60 px-3 py-3">
            Needs the same test at least twice with numeric values we could read.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {labTrends.map((t) => (
              <LabTrendCard key={t.testName} test={t} />
            ))}
          </div>
        )}
      </CardBox>

      {/* Quick actions footer */}
      <div className="flex items-center justify-end gap-2">
        {lastVisit && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => onOpenVisit(lastVisit.id)}
          >
            Open latest visit <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
        <Button size="sm" className="rounded-xl" onClick={onNewVisit}>
          <Plus className="h-4 w-4 mr-1" /> New visit
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lab trend chart card
// ----------------------------------------------------------------------------

const TRACE_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(280, 65%, 60%)",
  "hsl(190, 80%, 45%)",
  "hsl(330, 75%, 55%)",
  "hsl(160, 60%, 45%)",
];

function LabTrendCard({ test }: { test: TestSeries }) {
  const traces = useMemo<PlotData[]>(() => {
    const out: PlotData[] = [];
    test.series.forEach((s, i) => {
      const color = TRACE_COLORS[i % TRACE_COLORS.length];
      out.push({
        type: "scatter",
        mode: "lines+markers",
        name: s.unit ? `${s.name} (${s.unit})` : s.name,
        x: s.points.map((p) => p.date.toISOString()),
        y: s.points.map((p) => p.value),
        line: { color, width: 2, shape: "spline" },
        marker: { color, size: 7 },
        hovertemplate:
          "%{x|%b %Y}: <b>%{y}</b>" +
          (s.unit ? ` ${s.unit}` : "") +
          "<extra>" +
          s.name +
          "</extra>",
      } as PlotData);
      const abnormalPoints = s.points.filter((p) => p.abnormal);
      if (abnormalPoints.length) {
        out.push({
          type: "scatter",
          mode: "markers",
          showlegend: false,
          x: abnormalPoints.map((p) => p.date.toISOString()),
          y: abnormalPoints.map((p) => p.value),
          marker: {
            color: "hsl(var(--destructive))",
            size: 10,
            line: { color: "hsl(var(--background))", width: 2 },
            symbol: "circle",
          },
          hovertemplate: "Abnormal: <b>%{y}</b><extra></extra>",
        } as PlotData);
      }
    });
    return out;
  }, [test]);

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-foreground truncate" title={test.testName}>
          {test.testName}
        </p>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {test.reportCount} report{test.reportCount === 1 ? "" : "s"}
        </span>
      </div>
      <PlotlyChart
        height={220}
        data={traces}
        layout={{
          showlegend: test.series.length > 1,
          legend: { orientation: "h", y: -0.22, x: 0, font: { size: 10 } },
          xaxis: { type: "date", tickformat: "%b %Y" },
          yaxis: { rangemode: "tozero", automargin: true },
          hovermode: "x unified",
          margin: { l: 40, r: 8, t: 8, b: 30 },
        }}
      />
    </div>
  );
}
