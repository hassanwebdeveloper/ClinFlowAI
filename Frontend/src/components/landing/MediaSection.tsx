import { ArrowDown, Mic, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScreenshotFrame } from "@/components/landing/ScreenshotFrame";
import {
  landingScreenshots,
  visitOutputScreenshots,
} from "@/lib/landingAssets";

export function LandingMediaSection() {
  return (
    <section id="how-it-works" className="relative bg-white py-20 sm:py-28">
      <div className="landing-noise pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4 border-teal-200 bg-teal-50 text-teal-800">
            How it works
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl lg:text-5xl">
            Speak once.{" "}
            <span className="text-teal-700">Documentation done.</span>
          </h2>
          <p className="mt-4 text-lg text-[hsl(210_12%_38%)]">
            After your patient leaves, describe the visit in your own words. ClinFlow AI
            transforms your speech into structured clinical records in seconds.
          </p>
        </div>

        {/* Step 1 — the only step */}
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white shadow-md shadow-teal-600/30">
              <Mic className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-xl font-semibold text-[hsl(210_25%_15%)]">
                Step 1 — Record your visit summary
              </p>
              <p className="mt-1 text-sm text-[hsl(210_12%_45%)]">
                Speak naturally after the patient leaves. No templates, no typing.
              </p>
            </div>
          </div>
          <ScreenshotFrame
            src={landingScreenshots.newVisitRecording.src}
            alt={landingScreenshots.newVisitRecording.alt}
            uniform
            priority
          />
        </div>

        {/* Generated outputs — not steps */}
        <div className="mx-auto mt-14 max-w-4xl">
          <div className="mb-10 flex flex-col items-center gap-3">
            <ArrowDown className="h-6 w-6 text-teal-500" />
            <div className="flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-5 py-2">
              <Sparkles className="h-4 w-4 text-teal-600" />
              <span className="text-sm font-semibold text-teal-800">
                ClinFlow AI generates automatically
              </span>
            </div>
            <p className="max-w-lg text-center text-sm text-[hsl(210_12%_45%)]">
              From that single voice summary, every clinical record below is created for you —
              no extra steps required.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            {visitOutputScreenshots.map((output) => (
              <div key={output.title}>
                <div className="mb-4">
                  <p className="font-display text-lg font-semibold text-[hsl(210_25%_15%)]">
                    {output.title}
                  </p>
                  <p className="mt-1 text-sm text-[hsl(210_12%_45%)]">{output.description}</p>
                </div>
                <ScreenshotFrame
                  src={output.src}
                  alt={output.alt}
                  uniform
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
