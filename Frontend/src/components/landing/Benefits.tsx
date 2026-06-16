import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Clock,
  Heart,
  LineChart,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const benefits: {
  icon: LucideIcon;
  title: string;
  description: string;
  stat?: string;
  accent: string;
  iconBg: string;
  visualBg: string;
  visualAccent: string;
}[] = [
  {
    icon: Clock,
    title: "Save 30–40% of time on every patient",
    description:
      "Stop losing 15 minutes per visit to typing. Reclaim 2+ hours a day for medicine — or for going home on time.",
    stat: "2+ hrs/day back",
    accent: "border-teal-200 bg-gradient-to-br from-white to-teal-50/40",
    iconBg: "bg-teal-100 text-teal-700",
    visualBg: "from-teal-100 via-teal-50 to-white",
    visualAccent: "text-teal-600/20",
  },
  {
    icon: Wallet,
    title: "Grow your income without longer days",
    description:
      "See more patients in the same clinic hours. Documentation no longer caps how many people you can care for each day.",
    stat: "More visits, same schedule",
    accent: "border-amber-200 bg-gradient-to-br from-white to-amber-50/40",
    iconBg: "bg-amber-100 text-amber-700",
    visualBg: "from-amber-100 via-amber-50 to-white",
    visualAccent: "text-amber-500/20",
  },
  {
    icon: Heart,
    title: "Understand patients more deeply",
    description:
      "Walk into every visit prepared. Health history, lab trends, and follow-ups in one dashboard — so you focus on the person, not hunting through records.",
    stat: "Full picture before you enter the room",
    accent: "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40",
    iconBg: "bg-emerald-100 text-emerald-700",
    visualBg: "from-emerald-100 via-emerald-50 to-white",
    visualAccent: "text-emerald-500/20",
  },
  {
    icon: ShieldCheck,
    title: "Catch what you might miss",
    description:
      "AI reminders flag allergies, drug interactions, dosage gaps, and incomplete documentation before you sign off — protecting your patients and your practice.",
    stat: "Fewer costly oversights",
    accent: "border-violet-200 bg-gradient-to-br from-white to-violet-50/40",
    iconBg: "bg-violet-100 text-violet-700",
    visualBg: "from-violet-100 via-violet-50 to-white",
    visualAccent: "text-violet-500/20",
  },
  {
    icon: Users,
    title: "Patients who feel truly heard",
    description:
      "When you're not staring at a screen, trust builds. Physicians report higher satisfaction scores and stronger long-term patient relationships.",
    stat: "Better bedside presence",
    accent: "border-blue-200 bg-gradient-to-br from-white to-blue-50/40",
    iconBg: "bg-blue-100 text-blue-700",
    visualBg: "from-blue-100 via-blue-50 to-white",
    visualAccent: "text-blue-500/20",
  },
  {
    icon: BookOpen,
    title: "Stay current without sacrificing care",
    description:
      "Use reclaimed hours for CME, emerging treatments, and new clinical tools — not for catching up on charts after dinner.",
    stat: "Learn more, chart less",
    accent: "border-indigo-200 bg-gradient-to-br from-white to-indigo-50/40",
    iconBg: "bg-indigo-100 text-indigo-700",
    visualBg: "from-indigo-100 via-indigo-50 to-white",
    visualAccent: "text-indigo-500/20",
  },
  {
    icon: TrendingUp,
    title: "End pajama charting forever",
    description:
      "Finish notes before you leave the clinic. No more evenings lost to documentation — reclaim your personal time and reduce burnout.",
    stat: "Leave when your patients do",
    accent: "border-rose-200 bg-gradient-to-br from-white to-rose-50/40",
    iconBg: "bg-rose-100 text-rose-700",
    visualBg: "from-rose-100 via-rose-50 to-white",
    visualAccent: "text-rose-500/20",
  },
  {
    icon: LineChart,
    title: "Spot trends before they become crises",
    description:
      "Recurring lab charts and follow-up tracking help you intervene earlier on chronic conditions — better outcomes with less reactive firefighting.",
    stat: "Proactive, not reactive care",
    accent: "border-slate-200 bg-gradient-to-br from-white to-slate-50/40",
    iconBg: "bg-slate-100 text-slate-700",
    visualBg: "from-slate-200 via-slate-50 to-white",
    visualAccent: "text-slate-500/20",
  },
];

function BenefitVisual({
  icon: Icon,
  visualBg,
  visualAccent,
  iconBg,
}: {
  icon: LucideIcon;
  visualBg: string;
  visualAccent: string;
  iconBg: string;
}) {
  return (
    <div
      className={`relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br ${visualBg}`}
    >
      <Icon className={`absolute -right-4 -top-4 h-28 w-28 ${visualAccent}`} strokeWidth={1} />
      <Icon className={`absolute -bottom-6 -left-6 h-20 w-20 ${visualAccent}`} strokeWidth={1} />
      <div
        className={`relative flex h-16 w-16 items-center justify-center rounded-2xl ${iconBg} shadow-lg transition-transform duration-300 group-hover:scale-110`}
      >
        <Icon className="h-8 w-8" />
      </div>
    </div>
  );
}

export function LandingBenefits() {
  return (
    <section id="benefits" className="relative py-20 sm:py-28">
      <div className="landing-noise pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center lg:mx-0 lg:text-left">
          <Badge variant="secondary" className="mb-4 border-teal-200 bg-teal-50 text-teal-800">
            Why physicians switch
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl lg:text-5xl">
            What you get when{" "}
            <span className="text-teal-700">documentation isn't your job</span>
          </h2>
          <p className="mt-4 text-lg text-[hsl(210_12%_38%)]">
            ClinFlow AI doesn't just generate notes — it gives you back time, income, focus, and
            peace of mind. Here's what changes when the charting burden lifts.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => (
            <Card
              key={benefit.title}
              className={`group overflow-hidden border-2 ${benefit.accent} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
            >
              <BenefitVisual
                icon={benefit.icon}
                visualBg={benefit.visualBg}
                visualAccent={benefit.visualAccent}
                iconBg={benefit.iconBg}
              />
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-lg leading-snug">
                  {benefit.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed text-[hsl(210_12%_40%)]">
                  {benefit.description}
                </p>
                {benefit.stat && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    {benefit.stat}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
