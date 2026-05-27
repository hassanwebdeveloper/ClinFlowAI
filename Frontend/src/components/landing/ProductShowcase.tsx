import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScreenshotFrame } from "@/components/landing/ScreenshotFrame";
import {
  dashboardScreenshots,
  landingScreenshots,
  visitOutputScreenshots,
} from "@/lib/landingAssets";

type Tab = "visit" | "dashboard";

export function ProductShowcase() {
  const [activeTab, setActiveTab] = useState<Tab>("visit");
  const [activeIndex, setActiveIndex] = useState(0);

  const tabs: { id: Tab; label: string; description: string }[] = [
    {
      id: "visit",
      label: "Visit Documentation",
      description: "From voice recording to complete clinical records",
    },
    {
      id: "dashboard",
      label: "Patient Dashboard",
      description: "Living health profiles with lab trend tracking",
    },
  ];

  const visitItems = [
    landingScreenshots.newVisitRecording,
    ...visitOutputScreenshots,
  ];
  const dashboardItems = dashboardScreenshots;
  const items = activeTab === "visit" ? visitItems : dashboardItems;
  const activeItem = items[activeIndex] ?? items[0];

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setActiveIndex(0);
  };

  return (
    <section id="product" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4 border-teal-200 bg-teal-50 text-teal-800">
            Product Screenshots
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl lg:text-5xl">
            Built for the way{" "}
            <span className="text-teal-700">physicians actually work</span>
          </h2>
          <p className="mt-4 text-lg text-[hsl(210_12%_38%)]">
            Explore every part of ClinFlow AI — from voice capture to patient dashboards — in
            a workflow designed around your exam room.
          </p>
        </div>

        <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "rounded-2xl border-2 px-6 py-4 text-left transition-all duration-300 sm:text-center",
                activeTab === tab.id
                  ? "border-teal-500 bg-teal-50 shadow-lg shadow-teal-500/10"
                  : "border-teal-900/8 bg-white hover:border-teal-300 hover:bg-teal-50/30",
              )}
            >
              <p
                className={cn(
                  "font-display text-base font-semibold",
                  activeTab === tab.id ? "text-teal-800" : "text-[hsl(210_25%_15%)]",
                )}
              >
                {tab.label}
              </p>
              <p className="mt-0.5 text-xs text-[hsl(210_12%_45%)]">{tab.description}</p>
            </button>
          ))}
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-row gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {items.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 lg:w-full",
                  activeIndex === index
                    ? "border-teal-500 bg-teal-50 shadow-md"
                    : "border-teal-900/8 bg-white hover:border-teal-200 hover:bg-teal-50/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    activeIndex === index
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    activeIndex === index ? "text-teal-800" : "text-[hsl(210_20%_30%)]",
                  )}
                >
                  {item.title}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-display text-2xl font-bold text-[hsl(210_25%_12%)]">
                {activeItem.title}
              </h3>
              <p className="mt-2 text-base text-[hsl(210_12%_40%)]">{activeItem.description}</p>
            </div>
            <ScreenshotFrame
              src={activeItem.src}
              alt={activeItem.alt}
              uniform
              priority={activeIndex === 0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
