import { cn } from "@/lib/utils";

interface ScreenshotFrameProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  caption?: string;
  /** Fixed aspect ratio with full image visible — use in step grids */
  uniform?: boolean;
}

export function ScreenshotFrame({
  src,
  alt,
  className,
  priority = false,
  caption,
  uniform = false,
}: ScreenshotFrameProps) {
  return (
    <figure className={cn("group", className)}>
      <div className="overflow-hidden rounded-2xl border border-teal-900/10 bg-white shadow-2xl shadow-teal-900/10 ring-1 ring-teal-900/5 transition-all duration-500 group-hover:shadow-teal-900/15 group-hover:-translate-y-1">
        <div className="flex items-center gap-1.5 border-b border-teal-900/5 bg-slate-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 text-[10px] font-medium text-slate-400">ClinFlow AI</span>
        </div>
        <div className="relative w-full overflow-hidden bg-white">
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className={cn(
              "w-full",
              uniform
                ? "h-auto object-contain object-top"
                : "object-contain object-top",
            )}
          />
        </div>
      </div>
      {caption && (
        <figcaption className="mt-3 text-center text-sm text-[hsl(210_12%_45%)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
