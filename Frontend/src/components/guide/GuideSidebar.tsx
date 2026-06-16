import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { GuideSection } from "@/lib/guideContent";
import { guideChapterPath, guidePath } from "@/lib/routes";
import { ChevronDown, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface GuideSidebarProps {
  sections: GuideSection[];
  currentSectionId?: string;
  className?: string;
}

export function GuideSidebar({ sections, currentSectionId, className }: GuideSidebarProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHub = location.pathname === guidePath();

  const navList = (
    <nav aria-label="Guide chapters">
      <ul className="space-y-1">
        <li>
          <Link
            to={guidePath()}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "block rounded-lg px-3 py-2 text-sm transition-colors",
              isHub
                ? "bg-teal-100 font-medium text-teal-900"
                : "text-[hsl(210_12%_40%)] hover:bg-teal-50 hover:text-teal-800",
            )}
          >
            All chapters
          </Link>
        </li>
        {sections.map((section, index) => {
          const isActive = currentSectionId === section.id;
          return (
            <li key={section.id}>
              <Link
                to={guideChapterPath(section.id)}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-teal-100 font-medium text-teal-900"
                    : "text-[hsl(210_12%_40%)] hover:bg-teal-50 hover:text-teal-800",
                )}
              >
                <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-teal-600/80">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{section.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <>
      <div className={cn("lg:hidden", className)}>
        <Button
          type="button"
          variant="outline"
          className="mb-6 w-full justify-between rounded-xl border-teal-200 bg-white"
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Guide chapters
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", mobileOpen && "rotate-180")} />
        </Button>
        {mobileOpen && (
          <div className="mb-8 rounded-2xl border border-teal-900/8 bg-white p-4 shadow-sm">
            {navList}
          </div>
        )}
      </div>

      <aside className={cn("hidden lg:block", className)}>
        <div className="sticky top-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(210_12%_50%)]">
            Chapters
          </p>
          {navList}
        </div>
      </aside>
    </>
  );
}
