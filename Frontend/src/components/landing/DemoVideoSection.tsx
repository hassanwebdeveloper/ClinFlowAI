import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LANDING_VIDEO } from "@/lib/landingAssets";

export function DemoVideoSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <section id="demo" className="relative bg-[hsl(210_25%_12%)] py-20 sm:py-28">
      <div className="landing-noise pointer-events-none absolute inset-0 opacity-20" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <Badge className="mb-4 border-teal-500/30 bg-teal-500/10 text-teal-300">
            2-minute demo
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Watch a physician reclaim their afternoon
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            See what happens when documentation stops eating your day — and your patients get the
            attention they came for.
          </p>
        </div>

        <div className="group relative overflow-hidden rounded-3xl border border-teal-500/20 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-1.5 border-b border-white/5 bg-slate-800/80 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs font-medium text-slate-500">
              ClinFlow AI — Feature Walkthrough
            </span>
          </div>

          <div className="relative flex min-h-[280px] items-center justify-center bg-black sm:min-h-[360px] lg:min-h-[480px]">
            <video
              ref={videoRef}
              src={LANDING_VIDEO}
              className="max-h-[70vh] w-full object-contain"
              controls
              playsInline
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            >
              Your browser does not support the video tag.
            </video>

            {!isPlaying && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Button
                  size="lg"
                  onClick={togglePlay}
                  className="pointer-events-auto h-16 w-16 rounded-full bg-teal-600 p-0 shadow-2xl shadow-teal-600/50 transition-all hover:scale-110 hover:bg-teal-500"
                  aria-label="Play demo video"
                >
                  <Play className="h-7 w-7 fill-white text-white" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          {isPlaying ? (
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex items-center gap-1.5 text-teal-400 transition-colors hover:text-teal-300"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause video
            </button>
          ) : (
            "Click play to watch the full feature walkthrough"
          )}
        </p>
      </div>
    </section>
  );
}
