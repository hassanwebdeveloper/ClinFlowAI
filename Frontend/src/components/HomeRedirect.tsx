import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { clinicsPath, signInPath } from "@/lib/routes";

export function HomeRedirect() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? (
    <Navigate to={clinicsPath()} replace />
  ) : (
    <Navigate to={signInPath()} replace />
  );
}
