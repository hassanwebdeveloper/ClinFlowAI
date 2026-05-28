import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Eye,
  FileText,
  LineChart,
  Mic,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const benefits: {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  iconBg: string;
  visualBg: string;
  visualAccent: string;
}[] = [
  {
    icon: Eye,
    title: "Eyes on the patient, not the screen",
    description:
      "Give your full attention during the visit. No more turning left and right between your computer and your patient.",
    accent: "border-teal-200 bg-gradient-to-br from-white to-teal-50/40",
    iconBg: "bg-teal-100 text-teal-700",
    visualBg: "from-teal-100 via-teal-50 to-white",
    visualAccent: "text-teal-600/20",
  },
  {
    icon: Mic,
    title: "Document with your voice alone",
    description:
      "After the visit, speak a natural summary. ClinFlow AI handles structuring, formatting, and filing — zero typing required.",
    accent: "border-amber-200 bg-gradient-to-br from-white to-amber-50/40",
    iconBg: "bg-amber-100 text-amber-700",
    visualBg: "from-amber-100 via-amber-50 to-white",
    visualAccent: "text-amber-500/20",
  },
  {
    icon: FileText,
    title: "Complete visit records instantly",
    description:
      "SOAP notes, allergies, prescriptions, lab orders, and visit summaries — all generated from a single voice summary.",
    accent: "border-blue-200 bg-gradient-to-br from-white to-blue-50/40",
    iconBg: "bg-blue-100 text-blue-700",
    visualBg: "from-blue-100 via-blue-50 to-white",
    visualAccent: "text-blue-500/20",
  },
  {
    icon: Brain,
    title: "AI that catches what you might miss",
    description:
      "Smart reminders for similar past visits, dosage checks, drug interactions, and documentation gaps before you sign off.",
    accent: "border-violet-200 bg-gradient-to-br from-white to-violet-50/40",
    iconBg: "bg-violet-100 text-violet-700",
    visualBg: "from-violet-100 via-violet-50 to-white",
    visualAccent: "text-violet-500/20",
  },
  {
    icon: LineChart,
    title: "Living patient health profiles",
    description:
      "Every patient gets a dashboard with health history, follow-up labs, and trend charts for recurring lab results over time.",
    accent: "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40",
    iconBg: "bg-emerald-100 text-emerald-700",
    visualBg: "from-emerald-100 via-emerald-50 to-white",
    visualAccent: "text-emerald-500/20",
  },
  {
    icon: Shield,
    title: "Built for clinical trust",
    description:
      "Secure, structured documentation designed for busy practices. Spend less time on admin, more time on care.",
    accent: "border-slate-200 bg-gradient-to-br from-white to-slate-50/40",
    iconBg: "bg-slate-100 text-slate-700",
    visualBg: "from-slate-200 via-slate-50 to-white",
    visualAccent: "text-slate-500/20",
  },
];

function FeatureVisual({
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
    <section id="features" className="relative py-20 sm:py-28">
      <div className="landing-noise pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center lg:mx-0 lg:text-left">
          <Badge variant="secondary" className="mb-4 border-teal-200 bg-teal-50 text-teal-800">
            Features
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl lg:text-5xl">
            Everything a visit needs —{" "}
            <span className="text-teal-700">from one spoken summary</span>
          </h2>
          <p className="mt-4 text-lg text-[hsl(210_12%_38%)]">
            ClinFlow AI replaces the documentation burden so you can practice medicine the way
            it was meant to be practiced: face to face.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <Card
              key={benefit.title}
              className={`group overflow-hidden border-2 ${benefit.accent} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
            >
              <FeatureVisual
                icon={benefit.icon}
                visualBg={benefit.visualBg}
                visualAccent={benefit.visualAccent}
                iconBg={benefit.iconBg}
              />
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-xl leading-snug">
                  {benefit.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed text-[hsl(210_12%_40%)]">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
