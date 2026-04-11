import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  Trash2,
  Upload,
  RotateCcw,
  Loader2,
  ArrowLeft,
  ListMusic,
  FileText,
  Camera,
  FlaskConical,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Visit } from "@/hooks/usePatientStore";
import {
  extractLabReportsApi,
  type LabCacheEntry,
  type LabPreviewMapped,
  type PrepareVisitAudioResult,
} from "@/lib/api";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface NewVisitFlowProps {
  patientId: string;
  patientName: string;
  onSave: (visit: Visit) => void | Promise<void>;
  onSaveFromAudio: (
    audios: Blob[],
    labReports?: { blob: Blob; filename: string }[]
  ) => void | Promise<void>;
  onPrepareVisitFromAudio: (
    audios: Blob[],
    labReports: { blob: Blob; filename: string }[]
  ) => Promise<PrepareVisitAudioResult>;
  onFinalizeVisitFromAudio: (
    audios: Blob[],
    labReports: { blob: Blob; filename: string }[],
    opts: { transcript: string; labCache: LabCacheEntry[]; labTestNames: string[] }
  ) => void | Promise<void>;
  onCancel: () => void;
}

type RecordingState = "idle" | "recording" | "paused" | "stopped";

type AudioClip = {
  id: string;
  blob: Blob;
  label: string;
  objectUrl: string;
};

type LabAttachment = {
  id: string;
  blob: Blob;
  filename: string;
  status: "loading" | "done" | "error";
  details?: string;
  extractionMethod?: string;
  suggestedTestName?: string;
  needsTestName?: boolean;
  extractionError?: string;
};

type LabReviewRow = LabPreviewMapped & { testName: string };

const LAB_INPUT_ACCEPT =
  "image/*,application/pdf,.pdf,text/plain,.txt,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";

function isLabLikeFile(f: File): boolean {
  const n = f.name.toLowerCase();
  if (f.type.startsWith("image/")) return true;
  if (f.type === "application/pdf" || n.endsWith(".pdf")) return true;
  if (f.type.startsWith("text/") || n.endsWith(".txt") || n.endsWith(".csv")) return true;
  if (
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    n.endsWith(".docx")
  )
    return true;
  return false;
}

export function NewVisitFlow({
  patientId,
  patientName,
  onSave,
  onSaveFromAudio,
  onPrepareVisitFromAudio,
  onFinalizeVisitFromAudio,
  onCancel,
}: NewVisitFlowProps) {
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [timer, setTimer] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [labFiles, setLabFiles] = useState<LabAttachment[]>([]);
  const [labCameraOpen, setLabCameraOpen] = useState(false);
  const [labCameraStream, setLabCameraStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState("");
  const [labReviewRows, setLabReviewRows] = useState<LabReviewRow[] | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const clipsRef = useRef<AudioClip[]>(clips);
  clipsRef.current = clips;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labInputRef = useRef<HTMLInputElement>(null);
  const labVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const revokeClipUrl = useCallback((clip: AudioClip) => {
    URL.revokeObjectURL(clip.objectUrl);
  }, []);

  const addClipsFromBlobs = useCallback((items: { blob: Blob; label: string }[]) => {
    setClips((prev) => {
      const start = prev.length;
      const added: AudioClip[] = items.map((item, i) => ({
        id: crypto.randomUUID(),
        blob: item.blob,
        label: item.label || `Clip ${start + i + 1}`,
        objectUrl: URL.createObjectURL(item.blob),
      }));
      return [...prev, ...added];
    });
  }, []);

  const removeClip = useCallback(
    (id: string) => {
      setClips((prev) => {
        const clip = prev.find((c) => c.id === id);
        if (clip) revokeClipUrl(clip);
        return prev.filter((c) => c.id !== id);
      });
    },
    [revokeClipUrl]
  );

  useEffect(() => {
    return () => {
      clipsRef.current.forEach(revokeClipUrl);
    };
  }, [revokeClipUrl]);

  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [recordingState]);

  useEffect(() => {
    if (!audioBlob) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const clearDraftRecording = () => {
    setRecordingState("idle");
    setTimer(0);
    setAudioBlob(null);
    setUploadedFileNames([]);
  };

  const startRecording = async () => {
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      chunksRef.current = [];
      const recorder = new MediaRecorder(mediaStreamRef.current);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setUploadedFileNames([]);
        setRecordingState("stopped");
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      };

      setTimer(0);
      setAudioBlob(null);
      setTranscript("");
      setLabReviewRows(null);
      setRecordingState("recording");
      recorder.start();
    } catch {
      toast.error("Microphone permission denied or not available");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setRecordingState("paused");
    }
  };
  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingState("recording");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const addDraftToClips = () => {
    if (!audioBlob) return;
    const n = clips.length + 1;
    addClipsFromBlobs([{ blob: audioBlob, label: `Recording ${n}` }]);
    clearDraftRecording();
  };

  const discardDraft = () => {
    clearDraftRecording();
    setTranscript("");
    setLabReviewRows(null);
  };

  const appendRecordingToVisit = () => {
    addDraftToClips();
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("audio/") || /\.(webm|mp3|wav|m4a|ogg|mpeg)$/i.test(f.name));
    if (!files.length) {
      e.target.value = "";
      return;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    addClipsFromBlobs(files.map((f) => ({ blob: f, label: f.name })));
    setUploadedFileNames(files.map((f) => f.name));
    setTranscript("");
    setLabReviewRows(null);
    e.target.value = "";
  };

  const addLabFiles = useCallback(
    (files: File[]) => {
      const ok = files.filter(isLabLikeFile);
      if (!ok.length) {
        toast.error("Add image, PDF, text, or Word (.docx) lab files");
        return;
      }
      const newItems: LabAttachment[] = ok.map((f) => ({
        id: crypto.randomUUID(),
        blob: f,
        filename: f.name || "lab-report",
        status: "loading",
      }));
      const newIds = new Set(newItems.map((n) => n.id));
      setLabFiles((prev) => [...prev, ...newItems]);

      void (async () => {
        try {
          const { labPreviews } = await extractLabReportsApi({
            patientId,
            labReports: newItems.map((n) => ({ blob: n.blob, filename: n.filename })),
          });
          if (labPreviews.length !== newItems.length) {
            throw new Error("Unexpected response from lab extraction");
          }
          setLabFiles((prev) =>
            prev.map((row) => {
              const idx = newItems.findIndex((n) => n.id === row.id);
              if (idx === -1) return row;
              const p = labPreviews[idx];
              if (p.extractionError) {
                return { ...row, status: "error" as const, extractionError: p.extractionError };
              }
              return {
                ...row,
                status: "done" as const,
                details: p.details,
                extractionMethod: p.extractionMethod,
                suggestedTestName: p.suggestedTestName,
                needsTestName: p.needsTestName,
              };
            })
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Could not analyze lab file";
          setLabFiles((prev) =>
            prev.map((row) =>
              newIds.has(row.id) ? { ...row, status: "error" as const, extractionError: msg } : row
            )
          );
          toast.error(msg);
        }
      })();
    },
    [patientId]
  );

  const retryLabExtraction = useCallback(
    (id: string) => {
      let row: LabAttachment | undefined;
      setLabFiles((prev) => {
        row = prev.find((r) => r.id === id);
        if (!row) return prev;
        return prev.map((r) =>
          r.id === id ? { ...r, status: "loading" as const, extractionError: undefined } : r
        );
      });
      if (!row) return;

      void (async () => {
        try {
          const { labPreviews } = await extractLabReportsApi({
            patientId,
            labReports: [{ blob: row.blob, filename: row.filename }],
          });
          const p = labPreviews[0];
          setLabFiles((prev) =>
            prev.map((r) => {
              if (r.id !== id) return r;
              if (p.extractionError) {
                return { ...r, status: "error" as const, extractionError: p.extractionError };
              }
              return {
                ...r,
                status: "done" as const,
                details: p.details,
                extractionMethod: p.extractionMethod,
                suggestedTestName: p.suggestedTestName,
                needsTestName: p.needsTestName,
              };
            })
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Could not analyze lab file";
          setLabFiles((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: "error" as const, extractionError: msg } : r))
          );
          toast.error(msg);
        }
      })();
    },
    [patientId]
  );

  const stopLabCamera = useCallback(() => {
    setLabCameraStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    const v = labVideoRef.current;
    if (v) v.srcObject = null;
    setLabCameraOpen(false);
  }, []);

  const openLabCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setLabCameraOpen(true);
      setLabCameraStream(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setLabCameraOpen(true);
        setLabCameraStream(stream);
      } catch {
        toast.error("Could not open camera. Allow camera access or use Upload files to pick a photo.");
      }
    }
  }, []);

  /** Dialog mounts the <video> after state updates; ref is often null on the first layout pass. */
  useLayoutEffect(() => {
    if (!labCameraOpen || !labCameraStream) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 90;

    const attach = () => {
      if (cancelled) return;
      const video = labVideoRef.current;
      if (!video) {
        if (attempts++ < maxAttempts) {
          requestAnimationFrame(attach);
        } else {
          toast.error("Camera preview did not start. Try closing and opening again.");
        }
        return;
      }
      if (video.srcObject !== labCameraStream) {
        video.srcObject = labCameraStream;
      }
      void video.play().catch(() => {});
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(attach);
    });

    return () => {
      cancelled = true;
      const video = labVideoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
  }, [labCameraOpen, labCameraStream]);

  const captureLabPhoto = useCallback(() => {
    const video = labVideoRef.current;
    if (!video || video.videoWidth === 0) {
      toast.error("Camera preview is not ready yet");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    // Match CSS mirror correction on <video> so the saved JPEG matches the preview (readable text).
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Could not capture image");
          return;
        }
        const name = `lab-photo-${Date.now()}.jpg`;
        addLabFiles([new File([blob], name, { type: "image/jpeg" })]);
        stopLabCamera();
      },
      "image/jpeg",
      0.92
    );
  }, [addLabFiles, stopLabCamera]);

  const removeLabFile = useCallback((id: string) => {
    setLabFiles((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleLabUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) addLabFiles(files);
  };

  const handleLabDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) addLabFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("audio/") || /\.(webm|mp3|wav|m4a|ogg|mpeg)$/i.test(f.name));
    if (!files.length) return;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    addClipsFromBlobs(files.map((f) => ({ blob: f, label: f.name })));
    setUploadedFileNames(files.map((f) => f.name));
    setTranscript("");
    setLabReviewRows(null);
  };

  const blobsToTranscribe = (): Blob[] => {
    const fromClips = clips.map((c) => c.blob);
    if (recordingState === "stopped" && audioBlob) {
      return [...fromClips, audioBlob];
    }
    return fromClips;
  };

  const runTranscribeStep = () => {
    const blobs = blobsToTranscribe();
    if (!blobs.length) {
      toast.error("Add at least one recording or audio file");
      return;
    }
    if (labFiles.length > 0 && labFiles.some((f) => f.status === "loading")) {
      toast.error("Wait for lab reports to finish analyzing");
      return;
    }
    setIsTranscribing(true);
    setTimeout(() => {
      void (async () => {
        try {
          if (labFiles.length > 0) {
            const labs = labFiles.map((f) => ({ blob: f.blob, filename: f.filename }));
            const pre = await onPrepareVisitFromAudio(blobs, labs);
            setTranscript(pre.transcript);
            setLabReviewRows(
              pre.labPreviews.map((p) => ({
                ...p,
                testName: p.suggestedTestName.trim(),
              }))
            );
          } else {
            await onSaveFromAudio(blobs, undefined);
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not transcribe audio");
        } finally {
          setIsTranscribing(false);
        }
      })();
    }, 10);
  };

  const backFromLabReview = () => {
    setLabReviewRows(null);
    setTranscript("");
  };

  const finalizeVisitWithLabs = () => {
    if (!labReviewRows?.length) return;
    const blobs = blobsToTranscribe();
    if (!blobs.length) {
      toast.error("Add at least one recording or audio file");
      return;
    }
    if (!labReviewRows.every((r) => r.testName.trim())) {
      toast.error("Enter a lab test name for each report (e.g. Complete Blood Count, CBC)");
      return;
    }
    setIsFinalizing(true);
    setTimeout(() => {
      void (async () => {
        try {
          const labs = labFiles.map((f) => ({ blob: f.blob, filename: f.filename }));
          const labCache: LabCacheEntry[] = labReviewRows.map((r) => ({
            details: r.details,
            extraction_method: r.extractionMethod,
            suggested_test_name: r.suggestedTestName,
          }));
          const labTestNames = labReviewRows.map((r) => r.testName.trim());
          await onFinalizeVisitFromAudio(blobs, labs, {
            transcript,
            labCache,
            labTestNames,
          });
          toast.success("Visit created with structured notes");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not create visit");
        } finally {
          setIsFinalizing(false);
        }
      })();
    }, 10);
  };

  const nPending = blobsToTranscribe().length;
  const nLab = labFiles.length;
  const hasAudioToProcess = nPending > 0;
  const recordingBusy = recordingState === "recording" || recordingState === "paused";
  const inLabReview = labReviewRows !== null;
  const labsAnalyzing = labFiles.some((f) => f.status === "loading");
  const allLabNamesFilled =
    labReviewRows !== null && labReviewRows.length > 0 && labReviewRows.every((r) => r.testName.trim().length > 0);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">New Visit</h2>
          <p className="text-sm text-muted-foreground">{patientName}</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border card-shadow p-6 mb-5">
        <h3 className="font-semibold text-sm text-foreground mb-2">Audio clips</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Record multiple segments and/or upload several files. Order is preserved; all clips are transcribed and combined into one structured note.
        </p>

        {clips.length > 0 && (
          <ul className="space-y-2 mb-5">
            {clips.map((c, idx) => (
              <li
                key={c.id}
                className="flex items-center gap-3 bg-accent/30 rounded-xl border border-border px-3 py-2"
              >
                <ListMusic className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                  {idx + 1}. {c.label}
                </span>
                <audio src={c.objectUrl} controls className="h-8 max-w-[200px] sm:max-w-[240px]" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={() => removeClip(c.id)}
                  aria-label="Remove clip"
                  disabled={inLabReview}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="font-semibold text-sm text-foreground mb-4">Record</h3>

        <div className="flex flex-col items-center py-4">
          <button
            type="button"
            onClick={() => {
              if (recordingState === "idle") startRecording();
              else if (recordingState === "recording") pauseRecording();
              else if (recordingState === "paused") resumeRecording();
            }}
            disabled={recordingState === "stopped" || inLabReview}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200",
              recordingState === "recording"
                ? "bg-destructive animate-pulse-recording"
                : recordingState === "stopped"
                  ? "bg-muted cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 hover:scale-105"
            )}
          >
            {recordingState === "recording" ? (
              <Pause className="h-8 w-8 text-destructive-foreground" />
            ) : recordingState === "paused" ? (
              <Play className="h-8 w-8 text-primary-foreground" />
            ) : (
              <Mic className="h-8 w-8 text-primary-foreground" />
            )}
          </button>

          {recordingState !== "idle" && (
            <p className="mt-3 text-lg font-mono font-medium text-foreground">{formatTime(timer)}</p>
          )}

          <p className="mt-1 text-sm text-muted-foreground text-center px-2">
            {recordingState === "idle" && "Start a new recording, then add it to the visit. You can record again as many times as you need."}
            {recordingState === "recording" && "Recording…"}
            {recordingState === "paused" && "Paused — click to resume"}
            {recordingState === "stopped" && "Preview below, then add to the visit or discard."}
          </p>

          {(recordingState === "recording" || recordingState === "paused") && (
            <div className="flex gap-2 mt-4">
              <Button variant="destructive" size="sm" type="button" onClick={stopRecording} disabled={inLabReview}>
                <Square className="h-3.5 w-3.5 mr-1" /> Stop
              </Button>
            </div>
          )}

          {recordingState === "stopped" && audioBlob && (
            <div className="flex flex-col items-center gap-4 mt-4 w-full max-w-md">
              <div className="w-full bg-accent/40 rounded-xl p-3 border border-border">
                <audio ref={audioRef} src={audioUrl || undefined} controls className="w-full" />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" size="sm" onClick={appendRecordingToVisit} disabled={inLabReview}>
                  Add to visit
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={discardDraft} disabled={inLabReview}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Discard
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={startRecording} disabled={inLabReview}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Re-record
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or upload</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={inLabReview ? undefined : handleDrop}
          onClick={() => {
            if (!inLabReview) fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (inLabReview) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={inLabReview ? -1 : 0}
          className={cn(
            "border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors cursor-pointer",
            inLabReview && "opacity-60 pointer-events-none"
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Drag & drop one or more audio files, or click to browse
          </p>
          {uploadedFileNames.length > 0 && (
            <p className="text-xs text-primary mt-2">{uploadedFileNames.length} file(s) added</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border card-shadow p-6 mb-5">
        <h3 className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          Lab reports (optional)
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload photos or scans, PDFs, text exports, or Word documents. Each file is analyzed as soon as you add it;
          open a report below to read the extracted text. Images and scanned PDFs use a vision model; text-based files do
          not. The overall lab test may be classified as one-time vs monitoring when the document supports that. Extractions
          are used
          again when you generate structured notes for the visit.
        </p>

        {labFiles.length > 0 && (
          <div className="space-y-3 mb-4">
            {labFiles.map((f, idx) => (
              <div
                key={f.id}
                className="rounded-xl border border-border bg-accent/20 overflow-hidden"
              >
                <div className="flex items-start gap-2 px-3 py-2.5 border-b border-border/80 bg-accent/30">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={f.filename}>
                      {idx + 1}. {f.filename}
                    </p>
                    {f.status === "loading" && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        Analyzing report…
                      </p>
                    )}
                    {f.status === "done" && f.suggestedTestName?.trim() && (
                      <p className="text-xs text-primary mt-1 truncate" title={f.suggestedTestName}>
                        Lab test: {f.suggestedTestName}
                      </p>
                    )}
                    {f.status === "done" && !f.suggestedTestName?.trim() && (
                      <p className="text-xs text-muted-foreground mt-1">Lab test name not read from document</p>
                    )}
                    {f.status === "error" && (
                      <p className="text-xs text-destructive mt-1 break-words">{f.extractionError ?? "Extraction failed"}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {f.status === "error" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => retryLabExtraction(f.id)}
                        disabled={inLabReview}
                        aria-label="Retry lab extraction"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeLabFile(f.id)}
                      aria-label="Remove lab file"
                      disabled={inLabReview}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {f.status === "done" && f.details?.trim() ? (
                  <Collapsible className="group">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-accent/50"
                      >
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        Extracted details
                        <span className="ml-auto text-[10px] font-normal uppercase text-muted-foreground">
                          {f.extractionMethod === "vl" ? "vision" : "text"}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3">
                        <textarea
                          readOnly
                          value={f.details}
                          className="w-full min-h-[140px] max-h-[320px] text-xs font-mono bg-muted/40 rounded-lg p-3 border border-border text-foreground leading-relaxed resize-y"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : f.status === "done" && !f.details?.trim() ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No text extracted from this file.</p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => labInputRef.current?.click()}
            disabled={inLabReview}
          >
            <Upload className="h-3.5 w-3.5 mr-1" /> Upload files
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openLabCamera()}
            disabled={inLabReview}
          >
            <Camera className="h-3.5 w-3.5 mr-1" /> Take photo
          </Button>
        </div>
        <input
          ref={labInputRef}
          type="file"
          accept={LAB_INPUT_ACCEPT}
          multiple
          className="hidden"
          onChange={handleLabUpload}
        />

        <Dialog
          open={labCameraOpen}
          onOpenChange={(open) => {
            if (!open) stopLabCamera();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Capture lab report</DialogTitle>
              <DialogDescription>
                Allow camera access, frame the document, then tap Capture. On phones this uses the rear camera when
                available.
              </DialogDescription>
            </DialogHeader>
            <video
              key={labCameraStream?.id ?? "preview"}
              ref={labVideoRef}
              playsInline
              muted
              className="w-full min-h-[200px] rounded-lg bg-black aspect-video object-contain max-h-[60vh] [transform:scaleX(-1)]"
              onLoadedMetadata={(e) => {
                void e.currentTarget.play().catch(() => {});
              }}
              onCanPlay={(e) => {
                void e.currentTarget.play().catch(() => {});
              }}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={stopLabCamera}>
                Cancel
              </Button>
              <Button type="button" onClick={captureLabPhoto}>
                Capture
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div
          onDragOver={(e) => !inLabReview && e.preventDefault()}
          onDrop={inLabReview ? undefined : handleLabDrop}
          className={cn(
            "mt-4 border border-dashed border-border rounded-xl p-4 text-center text-xs text-muted-foreground",
            inLabReview && "opacity-60 pointer-events-none"
          )}
        >
          Or drag lab files here (images, PDF, .txt, .csv, .docx)
        </div>
      </div>

      {hasAudioToProcess && labReviewRows === null && (
        <div className="flex flex-col items-center gap-2 mb-5">
          {recordingState === "stopped" && audioBlob && (
            <p className="text-xs text-muted-foreground text-center">
              Current preview will be included when you transcribe ({nPending} clip{nPending !== 1 ? "s" : ""} total).
            </p>
          )}
          {nLab > 0 && labsAnalyzing && (
            <p className="text-xs text-amber-800 dark:text-amber-200 text-center">
              Finishing lab report analysis…
            </p>
          )}
          {nLab > 0 && !labsAnalyzing && (
            <p className="text-xs text-muted-foreground text-center">
              {nLab} lab file{nLab !== 1 ? "s" : ""} will be combined with audio next; you can confirm each lab test name
              before notes are generated.
            </p>
          )}
          <Button
            type="button"
            onClick={runTranscribeStep}
            disabled={isTranscribing || recordingBusy || (nLab > 0 && labsAnalyzing)}
          >
            {isTranscribing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {nLab > 0
                  ? `Processing ${nPending} audio + ${nLab} lab…`
                  : `Processing ${nPending} audio…`}
              </>
            ) : nLab > 0 ? (
              `Transcribe & extract labs (${nPending} audio, ${nLab} lab)`
            ) : (
              `Transcribe & generate notes (${nPending} audio)`
            )}
          </Button>
        </div>
      )}

      {labReviewRows !== null && (
        <div className="space-y-5 mb-5 animate-fade-in">
          <div className="bg-card rounded-2xl border border-border card-shadow p-5">
            <h3 className="font-semibold text-sm text-foreground mb-3">Transcript</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Edit if needed. Structured notes will use this text together with the lab extractions below.
            </p>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full text-sm bg-accent/30 rounded-xl p-4 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground leading-relaxed"
              rows={8}
            />
          </div>

          <div className="bg-card rounded-2xl border border-border card-shadow p-5">
            <h3 className="font-semibold text-sm text-foreground mb-1 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              Lab reports ({labReviewRows.length})
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Each file is one report. The lab test name is the overall ordered test on the report (e.g. Complete Blood
              Count / CBC) — not each separate result line (WBC, hemoglobin, etc.). If that name was not on the document,
              enter it before generating notes.
            </p>
            <div className="space-y-4">
              {labReviewRows.map((row, idx) => (
                <div
                  key={`${row.filename}-${idx}`}
                  className="rounded-xl border border-border bg-accent/20 p-4 space-y-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor={`lab-test-name-${idx}`} className="text-xs">
                      Lab test name
                    </Label>
                    <Input
                      id={`lab-test-name-${idx}`}
                      value={row.testName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLabReviewRows((prev) =>
                          prev ? prev.map((r, i) => (i === idx ? { ...r, testName: v } : r)) : prev
                        );
                      }}
                      placeholder="e.g. Complete Blood Count (CBC)"
                      className="text-sm"
                    />
                    {row.needsTestName && !row.suggestedTestName.trim() ? (
                      <p className="text-xs text-amber-700 dark:text-amber-500">
                        No lab test name was found on this file — enter the ordered test (e.g. CBC).
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground truncate" title={row.filename}>
                      File: {row.filename}
                    </p>
                  </div>
                  <Collapsible className="group border border-border rounded-lg bg-background/80">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent/50 rounded-lg"
                      >
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        <span>Extracted text</span>
                        <span className="text-xs font-normal text-muted-foreground ml-auto">
                          {row.extractionMethod === "vl" ? "vision" : "text"}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-0">
                        <textarea
                          readOnly
                          value={row.details}
                          className="w-full min-h-[160px] text-xs font-mono bg-muted/40 rounded-lg p-3 border border-border text-foreground leading-relaxed resize-y"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-2">
            <Button type="button" variant="outline" onClick={backFromLabReview} disabled={isFinalizing}>
              Back to edit attachments
            </Button>
            <Button
              type="button"
              onClick={finalizeVisitWithLabs}
              disabled={isFinalizing || !allLabNamesFilled}
            >
              {isFinalizing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating structured notes…
                </>
              ) : (
                "Generate structured notes"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
