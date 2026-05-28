import { Navigate, useLocation } from "react-router-dom";
import Auth from "@/pages/Auth";
import { useAuth } from "@/hooks/useAuth";
import { clinicsPath, signUpPath } from "@/lib/routes";

export default function SignInPage() {
  const location = useLocation();
  const { signIn, signUp, isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={clinicsPath()} replace />;
  }
  const initialMode = location.pathname === signUpPath() ? "signup" : "signin";
  return <Auth onSignIn={signIn} onSignUp={signUp} initialMode={initialMode} />;
}
