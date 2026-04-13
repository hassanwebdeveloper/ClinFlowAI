import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  Trash2,
  Upload,
  Loader2,
  ArrowLeft,
  ListMusic,
  FileText,
  Camera,
  FlaskConical,
  ChevronDown,
  RefreshCw,
  ExternalLink,
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
  type LabReportGroupsPayload,
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
  onPrepareVisitFromAudio: (
    audios: Blob[],
    labReports: { blob: Blob; filename: string }[],
    labReportGroups?: LabReportGroupsPayload
  ) => Promise<PrepareVisitAudioResult>;
  onFinalizeVisitFromAudio: (
    audios: Blob[],
    labReports: { blob: Blob; filename: string }[],
    opts: {
      transcript: string;
      labCache: LabCacheEntry[];
      labTestNames: string[];
      labReportGroups?: LabReportGroupsPayload;
    }
  ) => void | Promise<void>;
  onCancel: () => void;
}

type RecordingState = "idle" | "recording" | "paused";

type AudioClip = {
  id: string;
  blob: Blob;
  label: string;
  objectUrl: string;
  /** Filled after “Transcribe audios”; editable. */
  transcript?: string;
};

/** Legacy: split old combined transcripts that used `--- Recording N ---` markers (before transcript_segments). */
function splitRecordingSections(combined: string): string[] {
  const t = combined.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const parts = t.split(/\n--- Recording \d+ ---\s*\n/);
  return parts.map((p, i) => {
    let s = p;
    if (i === 0) s = s.replace(/^--- Recording \d+ ---\s*\n?/, "");
    return s.trim();
  });
}

/** Plain combined transcript for UI and API (no `--- Recording N ---` headings). */
function joinTranscriptSegments(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join("\n\n");
}

function openLocalLabBlob(blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}

function segmentsForClips(
  pre: Pick<PrepareVisitAudioResult, "transcript" | "transcriptSegments">,
  clipCount: number
): string[] {
  const segs = pre.transcriptSegments;
  if (segs.length === clipCount) {
    return segs.map((s) => (s ?? "").trim());
  }
  return splitRecordingSections(pre.transcript);
}

function buildCombinedTranscriptForFinalize(clips: { transcript?: string }[]): string {
  return joinTranscriptSegments(clips.map((c) => (c.transcript ?? "").trim()));
}

function clipsHaveTranscripts(clips: { transcript?: string }[]): boolean {
  return clips.some((c) => (c.transcript ?? "").trim().length > 0);
}

type LabPart = { blob: Blob; filename: string };

type LabAttachment = {
  id: string;
  blob: Blob;
  filename: string;
  /** Multiple photos merged into one extraction (e.g. camera session). */
  parts?: LabPart[];
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
  onPrepareVisitFromAudio,
  onFinalizeVisitFromAudio,
  onCancel,
}: NewVisitFlowProps) {
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [timer, setTimer] = useState(0);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [labFiles, setLabFiles] = useState<LabAttachment[]>([]);
  const [labCameraOpen, setLabCameraOpen] = useState(false);
  const [labCameraStream, setLabCameraStream] = useState<MediaStream | null>(null);
  /** Photos queued in the camera dialog before "Add to visit" (one logical report). */
  const [labCameraSessionPhotos, setLabCameraSessionPhotos] = useState<File[]>([]);
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const revokeClipUrl = useCallback((clip: AudioClip) => {
    URL.revokeObjectURL(clip.objectUrl);
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
        setClips((prev) => {
          const n = prev.length + 1;
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              blob,
              label: `Recording ${n}`,
              objectUrl: URL.createObjectURL(blob),
            },
          ];
        });
        setUploadedFileNames([]);
        setRecordingState("idle");
        setTimer(0);
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      };

      setTimer(0);
      setClips((prev) => prev.map((c) => ({ ...c, transcript: undefined })));
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
    setClips((prev) => {
      const cleared = prev.map((c) => ({ ...c, transcript: undefined }));
      const added: AudioClip[] = files.map((f) => ({
        id: crypto.randomUUID(),
        blob: f,
        label: f.name,
        objectUrl: URL.createObjectURL(f),
      }));
      return [...cleared, ...added];
    });
    setUploadedFileNames(files.map((f) => f.name));
    setTranscript("");
    setLabReviewRows(null);
    e.target.value = "";
  };

  const addLabFiles = useCallback(
    (files: File[], options?: { mergeAsOneReport?: boolean }) => {
      const ok = files.filter(isLabLikeFile);
      if (!ok.length) {
        toast.error("Add image, PDF, text, or Word (.docx) lab files");
        return;
      }
      const allImages =
        ok.length > 0 &&
        ok.every((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(f.name));
      const merge =
        Boolean(options?.mergeAsOneReport) && ok.length > 1 && allImages;

      if (merge) {
        const parts: LabPart[] = ok.map((f, i) => ({
          blob: f,
          filename: f.name || `photo-${i + 1}.jpg`,
        }));
        const newItem: LabAttachment = {
          id: crypto.randomUUID(),
          blob: parts[0].blob,
          filename: `Lab report (${parts.length} photos)`,
          parts,
          status: "loading",
        };
        const newIds = new Set([newItem.id]);
        setLabFiles((prev) => [...prev, newItem]);
        const labReports = parts.map((p) => ({ blob: p.blob, filename: p.filename }));
        const labReportGroups: LabReportGroupsPayload = [parts.map((_, i) => i)];
        void (async () => {
          try {
            const { labPreviews } = await extractLabReportsApi({
              patientId,
              labReports,
              labReportGroups,
            });
            if (labPreviews.length !== 1) {
              throw new Error("Unexpected response from lab extraction");
            }
            const p = labPreviews[0];
            setLabFiles((prev) =>
              prev.map((row) => {
                if (row.id !== newItem.id) return row;
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
          const labReports =
            row.parts?.map((p) => ({ blob: p.blob, filename: p.filename })) ?? [
              { blob: row.blob, filename: row.filename },
            ];
          const labReportGroups: LabReportGroupsPayload | undefined = row.parts?.length
            ? [row.parts.map((_, i) => i)]
            : undefined;
          const { labPreviews } = await extractLabReportsApi({
            patientId,
            labReports,
            labReportGroups,
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
    setLabCameraSessionPhotos([]);
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
      setLabCameraSessionPhotos([]);
      setLabCameraOpen(true);
      setLabCameraStream(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setLabCameraSessionPhotos([]);
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
        setLabCameraSessionPhotos((prev) => [...prev, new File([blob], name, { type: "image/jpeg" })]);
      },
      "image/jpeg",
      0.92
    );
  }, []);

  const finishCameraSession = useCallback(() => {
    if (!labCameraSessionPhotos.length) {
      toast.error("Capture at least one photo");
      return;
    }
    addLabFiles(labCameraSessionPhotos, {
      mergeAsOneReport: labCameraSessionPhotos.length > 1,
    });
    stopLabCamera();
  }, [labCameraSessionPhotos, addLabFiles, stopLabCamera]);

  const labCameraSessionThumbUrls = useMemo(
    () => labCameraSessionPhotos.map((f) => URL.createObjectURL(f)),
    [labCameraSessionPhotos]
  );
  useEffect(() => {
    return () => {
      labCameraSessionThumbUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [labCameraSessionThumbUrls]);

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
    setClips((prev) => {
      const cleared = prev.map((c) => ({ ...c, transcript: undefined }));
      const added: AudioClip[] = files.map((f) => ({
        id: crypto.randomUUID(),
        blob: f,
        label: f.name,
        objectUrl: URL.createObjectURL(f),
      }));
      return [...cleared, ...added];
    });
    setUploadedFileNames(files.map((f) => f.name));
    setTranscript("");
    setLabReviewRows(null);
  };

  const blobsToTranscribe = (): Blob[] => clips.map((c) => c.blob);

  const labBlobsPayload = (): { blob: Blob; filename: string }[] =>
    labFiles.flatMap((f) =>
      f.parts?.length
        ? f.parts.map((p) => ({ blob: p.blob, filename: p.filename }))
        : [{ blob: f.blob, filename: f.filename }]
    );

  const labReportGroupsForApi = (): LabReportGroupsPayload | undefined => {
    let offset = 0;
    const groups: number[][] = [];
    for (const f of labFiles) {
      if (f.parts?.length) {
        groups.push(f.parts.map((_, i) => offset + i));
        offset += f.parts.length;
      } else {
        groups.push([offset]);
        offset += 1;
      }
    }
    if (groups.every((g) => g.length === 1)) return undefined;
    return groups;
  };

  const runTranscribeOnly = () => {
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
          const pre = await onPrepareVisitFromAudio(blobs, labBlobsPayload(), labReportGroupsForApi());
          const parts = segmentsForClips(pre, blobs.length);
          setClips((prev) =>
            prev.map((c, i) => ({
              ...c,
              transcript: parts[i] ?? "",
            }))
          );
          setTranscript(joinTranscriptSegments(parts));
          if (pre.labPreviews.length > 0) {
            setLabReviewRows(
              pre.labPreviews.map((p) => ({
                ...p,
                testName: p.suggestedTestName.trim(),
              }))
            );
          } else {
            setLabReviewRows(null);
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not transcribe audio");
        } finally {
          setIsTranscribing(false);
        }
      })();
    }, 10);
  };

  const finalizeVisitCore = async (blobs: Blob[], rows: LabReviewRow[], transcriptText: string) => {
    const labs = labBlobsPayload();
    const labCache: LabCacheEntry[] = rows.map((r) => ({
      details: r.details,
      extraction_method: r.extractionMethod,
      suggested_test_name: r.suggestedTestName,
      lab_test_pattern: r.labTestPattern ?? "",
    }));
    const labTestNames = rows.map((r) => r.testName.trim());
    await onFinalizeVisitFromAudio(blobs, labs, {
      transcript: transcriptText,
      labCache,
      labTestNames,
      labReportGroups: labReportGroupsForApi(),
    });
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
          await finalizeVisitCore(blobs, labReviewRows, transcript);
          toast.success("Visit created with structured notes");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not create visit");
        } finally {
          setIsFinalizing(false);
        }
      })();
    }, 10);
  };

  const finalizeAudioOnlyFromServerTranscribe = () => {
    const blobs = blobsToTranscribe();
    if (!blobs.length) return;
    setIsFinalizing(true);
    setTimeout(() => {
      void (async () => {
        try {
          await onFinalizeVisitFromAudio(blobs, [], {
            transcript: "",
            labCache: [],
            labTestNames: [],
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

  const finalizeAudioOnlyWithTranscript = () => {
    const blobs = blobsToTranscribe();
    if (!blobs.length) return;
    const combined = buildCombinedTranscriptForFinalize(clipsRef.current);
    if (!combined.trim()) {
      toast.error("Transcript is empty");
      return;
    }
    setIsFinalizing(true);
    setTimeout(() => {
      void (async () => {
        try {
          await onFinalizeVisitFromAudio(blobs, [], {
            transcript: combined,
            labCache: [],
            labTestNames: [],
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

  const runGenerateNotes = () => {
    const blobs = blobsToTranscribe();
    if (!blobs.length) {
      toast.error("Add at least one recording or audio file");
      return;
    }
    if (labFiles.length > 0 && labFiles.some((f) => f.status === "loading")) {
      toast.error("Wait for lab reports to finish analyzing");
      return;
    }

    if (labReviewRows !== null) {
      finalizeVisitWithLabs();
      return;
    }

    if (labFiles.length === 0) {
      if (clipsHaveTranscripts(clipsRef.current)) {
        finalizeAudioOnlyWithTranscript();
      } else {
        finalizeAudioOnlyFromServerTranscribe();
      }
      return;
    }

    setIsFinalizing(true);
    setTimeout(() => {
      void (async () => {
        try {
          const pre = await onPrepareVisitFromAudio(blobs, labBlobsPayload(), labReportGroupsForApi());
          const parts = segmentsForClips(pre, blobs.length);
          setClips((prev) =>
            prev.map((c, i) => ({
              ...c,
              transcript: parts[i] ?? "",
            }))
          );
          const rows: LabReviewRow[] = pre.labPreviews.map((p) => ({
            ...p,
            testName: p.suggestedTestName.trim(),
          }));
          const plainTranscript = joinTranscriptSegments(parts);
          setTranscript(plainTranscript);
          const previewMatchesLabs = rows.length === labFiles.length;
          const allFilled =
            previewMatchesLabs && rows.length > 0 && rows.every((r) => r.testName.trim().length > 0);
          // Only enter review phase when the user must confirm lab names. Setting labReviewRows before finalize
          // flips inReviewPhase and hides Transcribe + the lab upload card while still loading — confusing.
          if (!allFilled) {
            setLabReviewRows(rows);
            toast.info("Confirm each lab test name, then click Generate notes again.");
            return;
          }
          await finalizeVisitCore(blobs, rows, plainTranscript);
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
  const inReviewPhase = inLabReview;
  const labsAnalyzing = labFiles.some((f) => f.status === "loading");
  const allLabNamesFilled =
    labReviewRows !== null && labReviewRows.length > 0 && labReviewRows.every((r) => r.testName.trim().length > 0);
  const showPreTranscribeActions = hasAudioToProcess && !inLabReview;

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
          Each time you stop recording, that clip is added to the list. Order is preserved. Use Transcribe audios to get a
          transcript under each clip (collapsible); Generate notes combines them into structured notes.
        </p>

        {clips.length > 0 && (
          <ul className="space-y-3 mb-5">
            {clips.map((c, idx) => (
              <li key={c.id} className="rounded-xl border border-border bg-accent/30 overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2">
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
                    disabled={inReviewPhase}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Collapsible className="group/cliptr border-t border-border/60 bg-accent/20">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-accent/50"
                    >
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/cliptr:rotate-180" />
                      Transcript
                      <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                        {(c.transcript ?? "").trim() ? "tap to expand" : "empty — transcribe audios"}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3">
                      <textarea
                        value={c.transcript ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setClips((prev) => prev.map((x) => (x.id === c.id ? { ...x, transcript: v } : x)));
                        }}
                        placeholder="Transcribe audios to fill this segment, or type here."
                        rows={5}
                        disabled={inReviewPhase}
                        className="w-full text-xs sm:text-sm bg-muted/40 rounded-lg p-3 border border-border text-foreground leading-relaxed resize-y min-h-[100px]"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
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
            disabled={inReviewPhase}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200",
              recordingState === "recording"
                ? "bg-destructive animate-pulse-recording"
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
            {recordingState === "idle" && "Tap to record. When you stop, the clip is added automatically; you can record again as many times as you need."}
            {recordingState === "recording" && "Recording…"}
            {recordingState === "paused" && "Paused — click to resume"}
          </p>

          {(recordingState === "recording" || recordingState === "paused") && (
            <div className="flex gap-2 mt-4">
              <Button variant="destructive" size="sm" type="button" onClick={stopRecording} disabled={inReviewPhase}>
                <Square className="h-3.5 w-3.5 mr-1" /> Stop
              </Button>
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
          onDrop={inReviewPhase ? undefined : handleDrop}
          onClick={() => {
            if (!inReviewPhase) fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (inReviewPhase) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={inReviewPhase ? -1 : 0}
          className={cn(
            "border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors cursor-pointer",
            inReviewPhase && "opacity-60 pointer-events-none"
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

      {!inReviewPhase && (
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
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 max-w-[min(100%,14rem)]">
                    {(f.parts?.length ? f.parts : [{ blob: f.blob, filename: f.filename }]).map((p, pi) => (
                      <Button
                        key={pi}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs text-primary shrink-0"
                        onClick={() => openLocalLabBlob(p.blob)}
                        aria-label={f.parts?.length ? `Open photo ${pi + 1}` : "Open original file"}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {f.parts?.length ? `${pi + 1}` : "Original"}
                      </Button>
                    ))}
                    {f.status === "error" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => retryLabExtraction(f.id)}
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
          >
            <Upload className="h-3.5 w-3.5 mr-1" /> Upload files
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openLabCamera()}
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
          <DialogContent
            className={cn(
              "gap-3 p-3 sm:p-6",
              "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-2xl",
              "max-h-[min(95dvh,900px)] overflow-y-auto"
            )}
          >
            <DialogHeader className="space-y-1.5 shrink-0">
              <DialogTitle>Capture lab report</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Capture each page or section of the report. Add multiple photos for one report, then tap “Add to visit”.
                On phones this uses the rear camera when available.
              </DialogDescription>
            </DialogHeader>
            {/* Tall area on mobile: aspect-video on a narrow column was ~200px tall; use dvh so preview is usable */}
            <div className="relative w-full h-[min(62dvh,560px)] sm:h-[min(420px,50dvh)] max-h-[min(72dvh,640px)] min-h-[280px] overflow-hidden rounded-lg bg-black">
              <video
                key={labCameraStream?.id ?? "preview"}
                ref={labVideoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-contain [transform:scaleX(-1)]"
                onLoadedMetadata={(e) => {
                  void e.currentTarget.play().catch(() => {});
                }}
                onCanPlay={(e) => {
                  void e.currentTarget.play().catch(() => {});
                }}
              />
            </div>
            {labCameraSessionPhotos.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
                {labCameraSessionThumbUrls.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="h-16 w-12 shrink-0 rounded-md border border-border overflow-hidden bg-muted"
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground self-center min-w-[8rem]">
                  {labCameraSessionPhotos.length} photo
                  {labCameraSessionPhotos.length !== 1 ? "s" : ""} — add more or finish.
                </p>
              </div>
            ) : null}
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end shrink-0">
              <Button type="button" variant="outline" onClick={stopLabCamera}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onClick={captureLabPhoto}>
                Add photo
              </Button>
              <Button
                type="button"
                onClick={finishCameraSession}
                disabled={labCameraSessionPhotos.length === 0}
              >
                {labCameraSessionPhotos.length > 1
                  ? `Add ${labCameraSessionPhotos.length} photos to visit`
                  : "Add to visit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleLabDrop}
            className="mt-4 border border-dashed border-border rounded-xl p-4 text-center text-xs text-muted-foreground"
          >
            Or drag lab files here (images, PDF, .txt, .csv, .docx)
          </div>
        </div>
      )}

      {showPreTranscribeActions && (
        <div className="flex flex-col items-center gap-3 mb-5">
          {nLab > 0 && labsAnalyzing && (
            <p className="text-xs text-amber-800 dark:text-amber-200 text-center">
              Finishing lab report analysis…
            </p>
          )}
          {nLab > 0 && !labsAnalyzing && (
            <p className="text-xs text-muted-foreground text-center">
              {nLab} lab file{nLab !== 1 ? "s" : ""} — use Transcribe audios to preview transcript and lab text, or Generate
              notes to create the visit in one step (you can confirm lab test names if needed).
            </p>
          )}
          {nLab === 0 && (
            <p className="text-xs text-muted-foreground text-center max-w-md">
              Transcribe audios to preview and edit the transcript first, or Generate notes to transcribe and create the
              visit in one step.
            </p>
          )}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-2 w-full max-w-md">
            <Button
              type="button"
              variant="outline"
              className="sm:flex-1"
              onClick={runTranscribeOnly}
              disabled={isTranscribing || isFinalizing || recordingBusy || (nLab > 0 && labsAnalyzing)}
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {nLab > 0 ? `Transcribing ${nPending} audio + labs…` : `Transcribing ${nPending} audio…`}
                </>
              ) : (
                "Transcribe audios"
              )}
            </Button>
            <Button
              type="button"
              className="sm:flex-1"
              onClick={runGenerateNotes}
              disabled={isTranscribing || isFinalizing || recordingBusy || (nLab > 0 && labsAnalyzing)}
            >
              {isFinalizing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating notes…
                </>
              ) : (
                "Generate notes"
              )}
            </Button>
          </div>
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
                    {labFiles[idx] ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(labFiles[idx].parts?.length
                          ? labFiles[idx].parts!
                          : [{ blob: labFiles[idx].blob, filename: labFiles[idx].filename }]
                        ).map((p, pi) => (
                          <button
                            key={pi}
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            onClick={() => openLocalLabBlob(p.blob)}
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            {labFiles[idx].parts?.length ? `Photo ${pi + 1}` : "Open original file"}
                          </button>
                        ))}
                      </div>
                    ) : null}
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
            <Button type="button" onClick={runGenerateNotes} disabled={isFinalizing || !allLabNamesFilled}>
              {isFinalizing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating notes…
                </>
              ) : (
                "Generate notes"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
