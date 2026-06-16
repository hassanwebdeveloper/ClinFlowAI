import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  getAdjacentGuideSections,
  getGuideSection,
  getGuideSectionIndex,
  guideSections,
} from "@/lib/guideContent";
import { guideChapterPath, guidePath } from "@/lib/routes";
import { GuideChapterNav } from "@/components/guide/GuideChapterNav";
import { GuideLayout } from "@/components/guide/GuideLayout";
import { GuideSectionBlock } from "@/components/guide/GuideSection";
import { GuideSidebar } from "@/components/guide/GuideSidebar";

const legacyChapterRedirects: Record<string, string> = {
  "request-access": "account-access",
  approval: "account-access",
  "set-password": "account-access",
};

export default function UserGuideChapter() {
  const { sectionId } = useParams<{ sectionId: string }>();

  if (sectionId && legacyChapterRedirects[sectionId]) {
    return <Navigate to={guideChapterPath(legacyChapterRedirects[sectionId])} replace />;
  }

  const section = sectionId ? getGuideSection(sectionId) : undefined;

  if (!section || !sectionId) {
    return <Navigate to={guidePath()} replace />;
  }

  const chapterNumber = getGuideSectionIndex(sectionId) + 1;
  const { prev, next } = getAdjacentGuideSections(sectionId);

  return (
    <GuideLayout>
      <section className="border-b border-teal-900/5 bg-white py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
            <Link to={guidePath()} className="text-[hsl(210_12%_45%)] transition-colors hover:text-teal-700">
              User Guide
            </Link>
            <ChevronRight className="h-4 w-4 text-[hsl(210_12%_55%)]" />
            <span className="font-medium text-[hsl(210_25%_15%)]">{section.title}</span>
          </nav>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
            Chapter {String(chapterNumber).padStart(2, "0")} of {guideSections.length}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl">
            {section.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-[hsl(210_12%_38%)] sm:text-lg">{section.summary}</p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 xl:gap-16">
            <GuideSidebar sections={guideSections} currentSectionId={sectionId} />
            <div className="min-w-0 max-w-4xl">
              <GuideSectionBlock section={section} />
              <GuideChapterNav prev={prev} next={next} />
            </div>
          </div>
        </div>
      </section>
    </GuideLayout>
  );
}
