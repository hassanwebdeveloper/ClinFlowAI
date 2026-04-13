import { Navigate } from "react-router-dom";
import Auth from "@/pages/Auth";
import { useAuth } from "@/hooks/useAuth";
import { clinicsPath } from "@/lib/routes";

export default function SignInPage() {
  const { signIn, signUp, isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={clinicsPath()} replace />;
  }
  return <Auth onSignIn={signIn} onSignUp={signUp} />;
}
