import { useState } from "react";
import {
  Stethoscope,
  Mail,
  Lock,
  User,
  ArrowRight,
  MapPin,
  Building2,
  Briefcase,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME } from "@/lib/branding";
import { forgotPasswordApi, type DoctorSignupPayload } from "@/lib/api";

type AuthMode = "signin" | "signup" | "forgot";

interface AuthProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (payload: DoctorSignupPayload) => Promise<void>;
  initialMode?: AuthMode;
}

export default function Auth({ onSignIn, onSignUp, initialMode = "signin" }: AuthProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [yearsExperience, setYearsExperience] = useState("0");
  const [practiceName, setPracticeName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const isSignUp = mode === "signup";
  const isForgot = mode === "forgot";

  const resetDoctorFields = () => {
    setCountry("");
    setCity("");
    setSpecialty("");
    setYearsExperience("0");
    setPracticeName("");
    setLicenseNumber("");
  };

  const goToSignIn = () => {
    setMode("signin");
    setForgotSent(false);
    setPassword("");
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Please enter your email", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await forgotPasswordApi(email.trim());
      setForgotSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || (!isSignUp && !password)) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (isSignUp) {
      if (!name.trim()) {
        toast({ title: "Please enter your name", variant: "destructive" });
        return;
      }
      if (!country.trim() || !city.trim() || !specialty.trim()) {
        toast({ title: "Please enter country, city, and specialty", variant: "destructive" });
        return;
      }
      const years = Number.parseInt(yearsExperience, 10);
      if (Number.isNaN(years) || years < 0 || years > 80) {
        toast({
          title: "Years of experience must be a number between 0 and 80",
          variant: "destructive",
        });
        return;
      }
    }
    setSubmitting(true);
    try {
      if (isSignUp) {
        const years = Number.parseInt(yearsExperience, 10);
        await onSignUp({
          email,
          name: name.trim(),
          country: country.trim(),
          city: city.trim(),
          specialty: specialty.trim(),
          years_of_experience: years,
          practice_name: practiceName.trim() || undefined,
          license_number: licenseNumber.trim() || undefined,
        });
        toast({ title: "Access request submitted ✓" });
        goToSignIn();
      } else {
        await onSignIn(email, password);
        toast({ title: "Welcome back ✓" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    isForgot ? "Reset your password" : isSignUp ? "Request account access" : "Welcome back";
  const subtitle = isForgot
    ? forgotSent
      ? "We sent a link if that email is registered"
      : "Enter your email and we'll send a reset link"
    : isSignUp
      ? "Share your details and we will review your request"
      : "Sign in to continue";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className={`w-full animate-fade-in ${isSignUp ? "max-w-lg" : "max-w-md"}`}>
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="h-6 w-6 text-primary" />
          </div>
          <span className="text-2xl font-bold text-foreground tracking-tight">{APP_NAME}</span>
        </div>

        <Card className="rounded-2xl border-border shadow-lg">
          <CardContent className="p-8">
            <h1 className="text-xl font-semibold text-foreground text-center mb-1">{title}</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">{subtitle}</p>

            {isForgot ? (
              forgotSent ? (
                <div className="space-y-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Check your email for a reset link. It expires in about an hour. If you don't see
                    it, check spam or try again.
                  </p>
                  <Button type="button" variant="outline" className="w-full h-11 rounded-xl" onClick={goToSignIn}>
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="auth-email-forgot" className="text-xs text-muted-foreground">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="auth-email-forgot"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 rounded-xl text-sm font-medium"
                  >
                    Send reset link
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={goToSignIn}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Back to sign in
                    </button>
                  </div>
                </form>
              )
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="auth-name" className="text-xs text-muted-foreground">
                          Full name
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="auth-name"
                            placeholder="Dr. Jane Smith"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="pl-10 h-11 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="auth-country" className="text-xs text-muted-foreground">
                            Country
                          </Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="auth-country"
                              placeholder="e.g. United States"
                              value={country}
                              onChange={(e) => setCountry(e.target.value)}
                              className="pl-10 h-11 rounded-xl"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="auth-city" className="text-xs text-muted-foreground">
                            City
                          </Label>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="auth-city"
                              placeholder="e.g. Boston"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              className="pl-10 h-11 rounded-xl"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="auth-specialty" className="text-xs text-muted-foreground">
                          Specialty
                        </Label>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="auth-specialty"
                            placeholder="e.g. Family medicine, Cardiology"
                            value={specialty}
                            onChange={(e) => setSpecialty(e.target.value)}
                            className="pl-10 h-11 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="auth-years" className="text-xs text-muted-foreground">
                          Years of experience
                        </Label>
                        <div className="relative">
                          <Award className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="auth-years"
                            type="number"
                            min={0}
                            max={80}
                            placeholder="0"
                            value={yearsExperience}
                            onChange={(e) => setYearsExperience(e.target.value)}
                            className="pl-10 h-11 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="auth-practice" className="text-xs text-muted-foreground">
                            Practice / clinic name{" "}
                            <span className="text-muted-foreground/70">(optional)</span>
                          </Label>
                          <Input
                            id="auth-practice"
                            placeholder="e.g. City Health Clinic"
                            value={practiceName}
                            onChange={(e) => setPracticeName(e.target.value)}
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="auth-license" className="text-xs text-muted-foreground">
                            License / registration #{" "}
                            <span className="text-muted-foreground/70">(optional)</span>
                          </Label>
                          <Input
                            id="auth-license"
                            placeholder="e.g. state medical ID"
                            value={licenseNumber}
                            onChange={(e) => setLicenseNumber(e.target.value)}
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="auth-email" className="text-xs text-muted-foreground">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="auth-email"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                      />
                    </div>
                  </div>
                  {!isSignUp && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="auth-password" className="text-xs text-muted-foreground">
                          Password
                        </Label>
                        <button
                          type="button"
                          onClick={() => {
                            setMode("forgot");
                            setForgotSent(false);
                            setPassword("");
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="auth-password"
                          type="password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 h-11 rounded-xl"
                        />
                      </div>
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 rounded-xl text-sm font-medium"
                  >
                    {isSignUp ? "Request Access" : "Sign In"}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSignUp) {
                        goToSignIn();
                        resetDoctorFields();
                      } else {
                        setMode("signup");
                        setForgotSent(false);
                        setEmail("");
                        setPassword("");
                      }
                    }}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
