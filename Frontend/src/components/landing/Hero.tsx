import { Link } from "react-router-dom";
import { ArrowRight, Mic, Monitor, User, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signInPath } from "@/lib/routes";

function StarRating() {
  return (
    <div className="flex gap-0.5" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className="h-4 w-4 fill-amber-500" viewBox="0 0 20 20">
          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
        </svg>
      ))}
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-12 sm:pb-24 sm:pt-20">
      <div className="landing-noise pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-teal-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-40 h-80 w-80 rounded-full bg-amber-100/40 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="space-y-8">
            <Badge
              variant="secondary"
              className="animate-landing-fade-in w-fit border-teal-200 bg-teal-50 px-4 py-1.5 text-teal-800"
              style={{ animationDelay: "0ms" }}
            >
              <Mic className="mr-1.5 inline h-3.5 w-3.5" />
              Voice-first clinical documentation
            </Badge>

            <h1
              className="animate-landing-fade-in font-display text-[2.75rem] font-bold leading-[1.08] tracking-tight text-[hsl(210_25%_12%)] sm:text-5xl lg:text-[3.75rem]"
              style={{ animationDelay: "100ms" }}
            >
              Documentation at{" "}
              <span className="relative whitespace-nowrap text-teal-700">
                zero effort
                <span className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-amber-400/60" />
              </span>
              . Full attention on your patient.
            </h1>

            <p
              className="animate-landing-fade-in max-w-xl text-lg leading-relaxed text-[hsl(210_12%_38%)] sm:text-xl"
              style={{ animationDelay: "200ms" }}
            >
              Stop turning between your screen and your patient. After the visit, speak your
              summary — ClinFlow AI generates SOAP notes, prescriptions, lab orders, and patient
              dashboards automatically.
            </p>

            <div
              className="animate-landing-fade-in flex flex-col gap-4 sm:flex-row"
              style={{ animationDelay: "350ms" }}
            >
              <Button
                size="lg"
                className="rounded-full bg-teal-600 px-8 py-6 text-base shadow-xl shadow-teal-600/30 transition-all hover:scale-[1.02] hover:bg-teal-700 hover:shadow-teal-600/40"
                asChild
              >
                <Link to={signInPath()}>
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-teal-200 px-8 py-6 text-base text-teal-800 hover:bg-teal-50"
                asChild
              >
                <a href="#demo">Watch Demo</a>
              </Button>
            </div>

            <div
              className="animate-landing-fade-in flex flex-col gap-6 border-t border-teal-900/5 pt-8 sm:flex-row sm:items-center"
              style={{ animationDelay: "500ms" }}
            >
              <div className="flex items-center gap-3">
                <StarRating />
                <span className="text-sm font-medium text-[hsl(210_12%_38%)]">
                  4.9 from early adopters
                </span>
              </div>
              <div className="hidden h-5 w-px bg-teal-900/10 sm:block" />
              <div className="flex items-center gap-2 text-sm text-[hsl(210_12%_38%)]">
                <Users className="h-4 w-4 text-teal-600" />
                <span>
                  <strong className="font-semibold text-[hsl(210_25%_15%)]">2+ hours</strong> saved
                  per physician daily
                </span>
              </div>
            </div>
          </div>

          <div
            className="animate-landing-fade-in relative"
            style={{ animationDelay: "300ms" }}
          >
            <ProblemSolutionVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSolutionVisual() {
  return (
    <div className="animate-landing-float space-y-4">
      {/* Problem */}
      <div className="rounded-3xl border border-red-200/60 bg-white p-5 shadow-xl shadow-red-900/5">
        <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-red-500/80">
          The problem
        </p>
        <div className="relative flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-200">
              <Monitor className="h-7 w-7 text-slate-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-500">Screen left</span>
          </div>

          <div className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center justify-between px-1">
              <ArrowRight className="h-4 w-4 rotate-180 text-red-400" />
              <ArrowRight className="h-4 w-4 text-red-400" />
            </div>
            <p className="text-center text-xs font-semibold text-red-500">
              Constant head-turning
            </p>
            <div className="h-1 w-full rounded-full bg-red-200">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-red-400" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-100">
              <User className="h-7 w-7 text-teal-600" />
            </div>
            <span className="text-[11px] font-medium text-teal-700">Patient right</span>
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-slate-500">
          Typing while examining divides your attention every few seconds
        </p>
      </div>

      {/* Arrow connector */}
      <div className="flex justify-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 shadow-lg shadow-teal-600/30">
          <ArrowRight className="h-5 w-5 rotate-90 text-white" />
        </div>
      </div>

      {/* Solution */}
      <div className="rounded-3xl border-2 border-teal-300 bg-gradient-to-br from-teal-50 to-white p-5 shadow-xl shadow-teal-900/10">
        <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-teal-700">
          The ClinFlow AI solution
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100">
              <User className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-teal-900">During the visit</p>
              <p className="text-xs text-teal-700/70">Full eye contact. Zero typing.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Mic className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-teal-900">After the visit</p>
              <p className="text-xs text-teal-700/70">Speak a 2-minute summary.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-teal-600 p-3 shadow-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">ClinFlow AI handles the rest</p>
              <p className="text-xs text-teal-100">Notes, labs, prescriptions — done.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
