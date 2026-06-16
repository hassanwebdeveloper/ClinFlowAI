import { cn } from "@/lib/utils";
import type { GuideSection } from "@/lib/guideContent";
import { renderInlineMarkdown } from "@/lib/guideMarkdown";
import { GuideContentRow } from "@/components/guide/GuideContentRow";
import { CheckCircle2, Lightbulb } from "lucide-react";

interface GuideSectionProps {
  section: GuideSection;
  className?: string;
}

export function GuideSectionBlock({ section, className }: GuideSectionProps) {
  const rows = section.blocks
    ? section.blocks.map((block, index) => ({
        steps: block.steps,
        image: block.image,
        startStepNumber:
          section.blocks!.slice(0, index).reduce((n, b) => n + b.steps.length, 0) + 1,
      }))
    : (() => {
        const images = section.images ?? [];
        const pairCount = Math.max(section.steps.length, images.length);
        const paired: {
          steps: (typeof section.steps)[number][];
          image?: (typeof images)[number];
          startStepNumber: number;
        }[] = [];
        for (let i = 0; i < pairCount; i += 1) {
          paired.push({
            steps: section.steps[i] ? [section.steps[i]] : [],
            image: images[i],
            startStepNumber: i + 1,
          });
        }
        return paired;
      })();

  return (
    <article className={cn("min-w-0", className)}>
      <p className="text-base leading-relaxed text-[hsl(210_12%_38%)] sm:text-lg">{section.intro}</p>

      {rows.length > 0 && (
        <div className="mt-10 space-y-12 sm:space-y-16">
          {rows.map((row, index) => (
            <GuideContentRow
              key={`${row.startStepNumber}-${row.image?.src ?? "text"}-${index}`}
              steps={row.steps}
              startStepNumber={row.startStepNumber}
              image={row.image}
              imageOnRight={index % 2 === 0}
            />
          ))}
        </div>
      )}

      {section.tips && section.tips.length > 0 && (
        <div className="mt-12 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Lightbulb className="h-4 w-4" />
            Tips
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-amber-950/80 sm:text-base">
            {section.tips.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="text-amber-600">•</span>
                <span>{renderInlineMarkdown(tip)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {section.successCheck && (
        <div className="mt-8 flex gap-3 rounded-2xl border border-teal-200 bg-teal-50/50 p-5 sm:p-6">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
          <div>
            <p className="text-sm font-semibold text-teal-900">Success check</p>
            <p className="mt-1 text-sm leading-relaxed text-teal-800/90 sm:text-base">
              {renderInlineMarkdown(section.successCheck)}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
