import { cn } from "@/lib/utils";
import { ScreenshotFrame } from "@/components/landing/ScreenshotFrame";
import type { GuideImage, GuideStep } from "@/lib/guideContent";
import { renderInlineMarkdown } from "@/lib/guideMarkdown";

interface GuideContentRowProps {
  steps?: GuideStep[];
  step?: GuideStep;
  startStepNumber?: number;
  stepNumber?: number;
  image?: GuideImage;
  imageOnRight?: boolean;
  className?: string;
}

function GuideStepsList({
  steps,
  startStepNumber = 1,
}: {
  steps: GuideStep[];
  startStepNumber?: number;
}) {
  return (
    <div className="space-y-8">
      {steps.map((step, index) => {
        const stepNumber = startStepNumber + index;
        return (
          <div key={step.title} className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">
                {stepNumber}
              </span>
              <h3 className="font-display text-lg font-semibold text-[hsl(210_25%_15%)] sm:text-xl">
                {step.title}
              </h3>
            </div>
            <p className="pl-11 text-sm leading-relaxed text-[hsl(210_12%_40%)] sm:text-base">
              {renderInlineMarkdown(step.body)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function GuideContentRow({
  steps,
  step,
  startStepNumber = 1,
  stepNumber,
  image,
  imageOnRight = true,
  className,
}: GuideContentRowProps) {
  const resolvedSteps = steps ?? (step ? [step] : []);
  const textBlock =
    resolvedSteps.length > 0 ? (
      <GuideStepsList steps={resolvedSteps} startStepNumber={stepNumber ?? startStepNumber} />
    ) : null;

  const imageBlock = image && (
    <ScreenshotFrame
      src={image.src}
      alt={image.alt}
      caption={image.caption}
      uniform
      className="w-full"
    />
  );

  if (textBlock && imageBlock) {
    return (
      <div
        className={cn(
          "grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12",
          className,
        )}
      >
        <div className={cn("order-1", !imageOnRight && "lg:order-2")}>{textBlock}</div>
        <div className={cn("order-2", !imageOnRight && "lg:order-1")}>{imageBlock}</div>
      </div>
    );
  }

  if (textBlock) {
    return <div className={className}>{textBlock}</div>;
  }

  if (imageBlock) {
    return <div className={cn("max-w-2xl", className)}>{imageBlock}</div>;
  }

  return null;
}
