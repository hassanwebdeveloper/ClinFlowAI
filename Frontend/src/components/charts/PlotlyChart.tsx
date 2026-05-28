import { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
// `plotly.js-basic-dist-min` is the small (~600 KB) build that supports
// scatter / bar / pie which is all the dashboard charts need.
import Plotly from "plotly.js-basic-dist-min";
import type { Data, Layout, Config } from "plotly.js";
import { cn } from "@/lib/utils";

const Plot = createPlotlyComponent(Plotly as unknown as Parameters<typeof createPlotlyComponent>[0]);

const DEFAULT_CONFIG: Partial<Config> = {
  displayModeBar: false,
  responsive: true,
  displaylogo: false,
};

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;
  // Tailwind/shadcn stores HSL parts (e.g. "240 10% 3.9%"); convert to hsl(...) for Plotly.
  return /^[\d.\s%]+$/.test(v) ? `hsl(${v})` : v;
}

interface PlotlyChartProps {
  data: Data[];
  layout?: Partial<Layout>;
  className?: string;
  height?: number | string;
  /** Pass through any extra plotly config; merged onto sensible defaults. */
  config?: Partial<Config>;
}

/**
 * Theme-aware Plotly wrapper. Reads `--foreground`, `--muted-foreground`,
 * and `--border` so charts blend with the shadcn light/dark theme.
 */
export function PlotlyChart({ data, layout, className, height = 280, config }: PlotlyChartProps) {
  const themedLayout = useMemo<Partial<Layout>>(() => {
    const fg = readCssVar("--foreground", "#0f172a");
    const muted = readCssVar("--muted-foreground", "#64748b");
    const border = readCssVar("--border", "#e2e8f0");

    return {
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 44, r: 16, t: 24, b: 36 },
      font: { color: fg, size: 12, family: "inherit" },
      hoverlabel: { bgcolor: "rgba(15, 23, 42, 0.9)", font: { color: "#fff" } },
      legend: {
        orientation: "h",
        y: -0.18,
        x: 0,
        font: { size: 11, color: muted },
      },
      xaxis: {
        gridcolor: border,
        linecolor: border,
        zerolinecolor: border,
        tickfont: { color: muted, size: 11 },
        automargin: true,
      },
      yaxis: {
        gridcolor: border,
        linecolor: border,
        zerolinecolor: border,
        tickfont: { color: muted, size: 11 },
        automargin: true,
      },
      ...layout,
    };
  }, [layout]);

  const mergedConfig = useMemo<Partial<Config>>(
    () => ({ ...DEFAULT_CONFIG, ...(config ?? {}) }),
    [config],
  );

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <Plot
        data={data}
        layout={themedLayout}
        config={mergedConfig}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
