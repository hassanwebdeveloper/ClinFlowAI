import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInPath } from "@/lib/routes";

export function LandingFinalCTA() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-br from-teal-700 via-teal-600 to-teal-800" />
      <div className="landing-noise pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-teal-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
          <Mic className="h-8 w-8 text-white" />
        </div>

        <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Your patients deserve your full attention.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-teal-100 sm:text-xl">
          Join physicians who've eliminated the documentation burden. Speak your summary —
          ClinFlow AI handles the rest.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
          <div className="flex items-center gap-2 text-teal-100">
            <CheckCircle className="h-5 w-5 text-amber-300" />
            <span>Free trial available</span>
          </div>
          <div className="flex items-center gap-2 text-teal-100">
            <CheckCircle className="h-5 w-5 text-amber-300" />
            <span>No credit card required</span>
          </div>
          <div className="flex items-center gap-2 text-teal-100">
            <CheckCircle className="h-5 w-5 text-amber-300" />
            <span>Setup in minutes</span>
          </div>
        </div>

        <Button
          size="lg"
          className="mt-10 rounded-full bg-white px-10 py-7 text-lg font-semibold text-teal-800 shadow-2xl transition-all hover:scale-[1.03] hover:bg-teal-50"
          asChild
        >
          <Link to={signInPath()}>
            Start Your Free Trial
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
