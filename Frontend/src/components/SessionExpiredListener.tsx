import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setUnauthorizedHandler } from "@/lib/api";
import { signInPath } from "@/lib/routes";
import { useAuth } from "@/hooks/useAuth";

/** Wires API 401 handling to sign-out and a clean `/signin` URL. */
export function SessionExpiredListener() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
      navigate(signInPath(), { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, signOut]);

  return null;
}
