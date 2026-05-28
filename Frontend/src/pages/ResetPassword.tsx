import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Lock, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { resetPasswordApi } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";
import { clinicsPath, signInPath } from "@/lib/routes";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={clinicsPath()} replace />;
  }

  if (!token) {
    return <Navigate to={signInPath()} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await resetPasswordApi(token, password);
      toast({ title: "Password updated. You can sign in now." });
      navigate(signInPath(), { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="h-6 w-6 text-primary" />
          </div>
          <span className="text-2xl font-bold text-foreground tracking-tight">{APP_NAME}</span>
        </div>

        <Card className="rounded-2xl border-border shadow-lg">
          <CardContent className="p-8">
            <h1 className="text-xl font-semibold text-foreground text-center mb-1">Set new password</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Choose a new password for your account
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password" className="text-xs text-muted-foreground">
                  New password <span className="font-normal">(min. 8 characters)</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reset-password"
                    type="password"
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-confirm" className="text-xs text-muted-foreground">
                  Confirm password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reset-confirm"
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl text-sm font-medium"
              >
                Update password
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to={signInPath()}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
