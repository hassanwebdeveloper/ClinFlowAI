import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock3, Mail, MapPin, ShieldX, Stethoscope, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME } from "@/lib/branding";
import { decideAccessRequest, fetchAccessRequestReview, type AccessRequestReview } from "@/lib/api";

type Decision = "approve" | "reject";

export default function AccessRequestReviewPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<AccessRequestReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("Review token is missing.");
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchAccessRequestReview(token);
        if (!active) return;
        setRequest(data);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load access request";
        setLoadError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const handleDecision = async (decision: Decision) => {
    if (!token || !request || request.status !== "pending") return;
    setSubmitting(true);
    try {
      await decideAccessRequest(token, decision);
      const updated = await fetchAccessRequestReview(token);
      setRequest(updated);
      toast({
        title: decision === "approve" ? "Request approved and email sent" : "Request rejected and email sent",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update request";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const statusTone = useMemo(() => {
    if (!request) return "bg-slate-100 text-slate-700";
    if (request.status === "approved") return "bg-emerald-100 text-emerald-700";
    if (request.status === "rejected") return "bg-rose-100 text-rose-700";
    return "bg-amber-100 text-amber-700";
  }, [request]);

  const statusIcon =
    request?.status === "approved" ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : request?.status === "rejected" ? (
      <ShieldX className="h-4 w-4" />
    ) : (
      <Clock3 className="h-4 w-4" />
    );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="h-6 w-6 text-primary" />
          </div>
          <span className="text-2xl font-bold text-foreground tracking-tight">{APP_NAME}</span>
        </div>

        <Card className="rounded-2xl border-border shadow-lg">
          <CardContent className="p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Access Request Review</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Review clinician details and approve or reject access.
              </p>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading request details...</p>
            ) : loadError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{loadError}</p>
              </div>
            ) : request ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${statusTone}`}>
                    {statusIcon}
                    {request.status[0].toUpperCase() + request.status.slice(1)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Submitted: {new Date(request.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoRow icon={<UserRound className="h-4 w-4" />} label="Name" value={request.name} />
                  <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={request.email} />
                  <InfoRow icon={<MapPin className="h-4 w-4" />} label="Country" value={request.country} />
                  <InfoRow icon={<MapPin className="h-4 w-4" />} label="City" value={request.city} />
                  <InfoRow icon={<Stethoscope className="h-4 w-4" />} label="Specialty" value={request.specialty} />
                  <InfoRow
                    icon={<Clock3 className="h-4 w-4" />}
                    label="Years Experience"
                    value={String(request.years_of_experience)}
                  />
                  <InfoRow label="Practice/Clinic" value={request.practice_name || "N/A"} />
                  <InfoRow label="License Number" value={request.license_number || "N/A"} />
                </div>

                {request.status === "pending" ? (
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button
                      onClick={() => handleDecision("approve")}
                      disabled={submitting}
                      className="h-11 rounded-xl flex-1"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleDecision("reject")}
                      disabled={submitting}
                      variant="outline"
                      className="h-11 rounded-xl flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This request has already been {request.status}. No further action is required.
                  </p>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-3 bg-card">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-sm text-foreground mt-1 break-words">{value}</div>
    </div>
  );
}
