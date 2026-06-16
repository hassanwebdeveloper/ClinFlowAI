import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/branding";
import { guideSections } from "@/lib/guideContent";
import { guideChapterPath, signInPath, signUpPath } from "@/lib/routes";
import { GuideLayout } from "@/components/guide/GuideLayout";
import { GuideSidebar } from "@/components/guide/GuideSidebar";
import { cn } from "@/lib/utils";

export default function UserGuide() {
  return (
    <GuideLayout>
      <section className="border-b border-teal-900/5 bg-white py-14 sm:py-18">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4 border-teal-200 bg-teal-50 text-teal-800">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              User Guide
            </Badge>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl lg:text-5xl">
              Getting started with <span className="text-teal-700">{APP_NAME}</span>
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-[hsl(210_12%_38%)]">
              Ten short chapters for physicians — from requesting access to documenting visits
              with AI-generated clinical notes.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 xl:gap-16">
            <GuideSidebar sections={guideSections} />
            <div className="min-w-0">
              <div className="grid gap-4 sm:grid-cols-2">
                {guideSections.map((section, index) => (
                  <Link
                    key={section.id}
                    to={guideChapterPath(section.id)}
                    className={cn(
                      "group rounded-2xl border border-teal-900/8 bg-white p-5 shadow-sm transition-all",
                      "hover:border-teal-200 hover:shadow-md hover:shadow-teal-900/5 hover:-translate-y-0.5",
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-teal-600">
                        Chapter {String(index + 1).padStart(2, "0")}
                      </span>
                      <ArrowRight className="h-4 w-4 text-teal-600 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                    <h2 className="font-display text-lg font-semibold text-[hsl(210_25%_12%)] group-hover:text-teal-800">
                      {section.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-[hsl(210_12%_42%)]">
                      {section.summary}
                    </p>
                  </Link>
                ))}
              </div>

              <div className="mt-12 rounded-2xl border border-teal-200 bg-teal-50/50 p-6 text-center sm:p-8">
                <h2 className="font-display text-xl font-bold text-[hsl(210_25%_12%)] sm:text-2xl">
                  Ready to document your first visit?
                </h2>
                <p className="mt-2 text-sm text-[hsl(210_12%_38%)] sm:text-base">
                  Request access today or sign in if you already have an account.
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    className="rounded-full bg-teal-600 px-8 shadow-lg shadow-teal-600/25 hover:bg-teal-700"
                    asChild
                  >
                    <Link to={signUpPath()}>Request Access</Link>
                  </Button>
                  <Button variant="outline" className="rounded-full px-8" asChild>
                    <Link to={signInPath()}>Sign In</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </GuideLayout>
  );
}
