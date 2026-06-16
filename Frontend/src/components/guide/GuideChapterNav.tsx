import { Link } from "react-router-dom";
import type { GuideSection } from "@/lib/guideContent";
import { guideChapterPath } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface GuideChapterNavProps {
  prev?: GuideSection;
  next?: GuideSection;
}

export function GuideChapterNav({ prev, next }: GuideChapterNavProps) {
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Chapter navigation"
      className="mt-16 flex flex-col gap-3 border-t border-teal-900/8 pt-10 sm:flex-row sm:justify-between"
    >
      {prev ? (
        <Button variant="outline" className="h-auto justify-start rounded-xl px-4 py-3 sm:max-w-[48%]" asChild>
          <Link to={guideChapterPath(prev.id)}>
            <span className="flex flex-col items-start gap-1 text-left">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowLeft className="h-3.5 w-3.5" />
                Previous
              </span>
              <span className="font-display text-sm font-semibold text-[hsl(210_25%_15%)] sm:text-base">
                {prev.title}
              </span>
            </span>
          </Link>
        </Button>
      ) : (
        <div className="hidden sm:block sm:flex-1" />
      )}

      {next ? (
        <Button variant="outline" className="h-auto justify-end rounded-xl px-4 py-3 sm:max-w-[48%]" asChild>
          <Link to={guideChapterPath(next.id)}>
            <span className="flex flex-col items-end gap-1 text-right">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <span className="font-display text-sm font-semibold text-[hsl(210_25%_15%)] sm:text-base">
                {next.title}
              </span>
            </span>
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
