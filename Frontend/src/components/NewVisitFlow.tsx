import { useState, useRef, useEffect } from "react";
import { Mic, Square, Pause, Play, Trash2, Upload, RotateCcw, Loader2, Sparkles, Save, X, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Visit } from "@/hooks/usePatientStore";
import { toast } from "sonner";

interface NewVisitFlowProps {
  patientName: string;
  onSave: (visit: Visit) => void | Promise<void>;
  onSaveFromAudio: (audio: Blob) => void | Promise<void>;
  onCancel: () => void;
}

type RecordingState = "idle" | "recording" | "paused" | "stopped";

export function NewVisitFlow({ patientName, onSave, onSaveFromAudio, onCancel }: NewVisitFlowProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [timer, setTimer] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [soap, setSoap] = useState<Visit["soap"] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [recordingState]);

  useEffect(() => {
    if (!audioBlob) return;
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
        setUploadedFile(null);
        setRecordingState("stopped");
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      };

      setTimer(0);
      setAudioBlob(null);
      setTranscript("");
      setSoap(null);
      setRecordingState("recording");
      recorder.start();
    } catch (e) {
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

  const deleteRecording = () => {
    setRecordingState("idle");
    setTimer(0);
    setAudioBlob(null);
    setAudioUrl("");
    setTranscript("");
    setSoap(null);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setUploadedFile(file);
      setAudioBlob(file);
      setRecordingState("stopped");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setUploadedFile(file);
      setAudioBlob(file);
      setRecordingState("stopped");
    }
  };

  const generateTranscript = () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    setTimeout(() => {
      void (async () => {
        try {
          // Backend will transcribe + generate SOAP + save visit in one call.
          await onSaveFromAudio(audioBlob);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not transcribe audio");
        } finally {
          setIsTranscribing(false);
        }
      })();
    }, 10);
  };

  const generateSoap = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setSoap({
        subjective:
          "Patient reports persistent throbbing headache for 3 days, primarily frontal, 6/10 severity. Associated nausea without vomiting. No aura or visual changes. OTC ibuprofen provides minimal relief. Reports increased work stress and disrupted sleep.",
        objective:
          "Alert and oriented. BP 128/82. HR 76. Temp 98.6°F. Neurological exam within normal limits. No papilledema. Cranial nerves intact. No neck stiffness.",
        assessment:
          "Tension-type headache, likely stress-related. Differential includes migraine without aura. No red flags for secondary headache.",
        plan: "1. Sumatriptan 50mg PRN for acute episodes\n2. Stress management counseling\n3. Sleep hygiene education\n4. Follow up in 2 weeks\n5. Return immediately if symptoms worsen or new neurological symptoms develop",
      });
      setIsGenerating(false);
    }, 2500);
  };

  const saveVisit = () => {
    if (!soap) return;
    setIsSaving(true);
    setTimeout(() => {
      void (async () => {
        const visit: Visit = {
          id: `v-${Date.now()}`,
          date: new Date().toISOString().split("T")[0],
          diagnosis: "Tension Headache",
          visitTitle: "",
          visitSummaryReport: "",
          transcript: "",
          audioUrl: null,
          symptoms: [],
          duration: "",
          medicalHistory: [],
          allergies: [],
          soap,
          prescriptions: [{ medicine: "Sumatriptan", dosage: "50mg", frequency: "As needed" }],
        };
        try {
          await onSave(visit);
          toast.success("Visit saved successfully ✓");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not save visit");
        } finally {
          setIsSaving(false);
        }
      })();
    }, 1000);
  };

  const hasAudio = audioBlob !== null;

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">New Visit</h2>
          <p className="text-sm text-muted-foreground">{patientName}</p>
        </div>
      </div>

      {/* Audio Input */}
      <div className="bg-card rounded-2xl border border-border card-shadow p-6 mb-5">
        <h3 className="font-semibold text-sm text-foreground mb-5">Audio Input</h3>

        {/* Record section */}
        <div className="flex flex-col items-center py-6">
          {/* Mic button */}
          <button
            onClick={() => {
              if (recordingState === "idle") startRecording();
              else if (recordingState === "recording") pauseRecording();
              else if (recordingState === "paused") resumeRecording();
            }}
            disabled={recordingState === "stopped"}
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

          {/* Timer */}
          {recordingState !== "idle" && (
            <p className="mt-3 text-lg font-mono font-medium text-foreground">{formatTime(timer)}</p>
          )}

          {/* State label */}
          <p className="mt-1 text-sm text-muted-foreground">
            {recordingState === "idle" && "Click to start recording"}
            {recordingState === "recording" && "Recording..."}
            {recordingState === "paused" && "Paused — click to resume"}
            {recordingState === "stopped" && "Recording complete"}
          </p>

          {/* Controls */}
          {(recordingState === "recording" || recordingState === "paused") && (
            <div className="flex gap-2 mt-4">
              <Button variant="destructive" size="sm" onClick={stopRecording}>
                <Square className="h-3.5 w-3.5 mr-1" /> Stop
              </Button>
            </div>
          )}

          {recordingState === "stopped" && (
            <div className="flex flex-col items-center gap-4 mt-4 w-full max-w-md">
              {/* Audio Playback Bar */}
              <div className="w-full bg-accent/40 rounded-xl p-3 border border-border">
                <audio
                  ref={audioRef}
                  src={audioUrl || undefined}
                  controls
                  className="w-full"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={deleteRecording}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
                <Button variant="outline" size="sm" onClick={startRecording}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Re-record
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Upload */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {uploadedFile ? uploadedFile.name : "Drag & drop audio file or click to browse"}
          </p>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Transcribe */}
      {hasAudio && !transcript && (
        <div className="flex justify-center mb-5">
          <Button onClick={generateTranscript} disabled={isTranscribing}>
            {isTranscribing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Transcribing audio…
              </>
            ) : (
              "Transcribe Audio"
            )}
          </Button>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="bg-card rounded-2xl border border-border card-shadow p-5 mb-5 animate-fade-in">
          <h3 className="font-semibold text-sm text-foreground mb-3">Transcript</h3>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full text-sm bg-accent/30 rounded-xl p-4 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground leading-relaxed"
            rows={6}
          />
        </div>
      )}

      {/* Generate SOAP */}
      {transcript && !soap && (
        <div className="flex justify-center mb-5">
          <Button onClick={generateSoap} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating notes…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Generate Notes
              </>
            )}
          </Button>
        </div>
      )}

      {/* SOAP Notes */}
      {soap && (
        <div className="bg-card rounded-2xl border border-border card-shadow p-5 mb-5 animate-fade-in">
          <h3 className="font-semibold text-sm text-foreground mb-4">Generated SOAP Notes</h3>
          {(["subjective", "objective", "assessment", "plan"] as const).map((key) => (
            <div key={key} className="mb-4 last:mb-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-primary mb-1.5 block">
                {key}
              </label>
              <textarea
                value={soap[key]}
                onChange={(e) => setSoap((prev) => (prev ? { ...prev, [key]: e.target.value } : null))}
                className="w-full text-sm bg-accent/30 rounded-xl p-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground leading-relaxed"
                rows={3}
              />
            </div>
          ))}

          <div className="flex justify-end mt-4">
            <Button onClick={saveVisit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Save Visit
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
