import { useState, useCallback } from "react";

export interface AuthUser {
  email: string;
  name: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem("medscribe_user");
    return stored ? JSON.parse(stored) : null;
  });

  const signIn = useCallback((email: string, _password: string) => {
    const authUser: AuthUser = { email, name: email.split("@")[0] };
    localStorage.setItem("medscribe_user", JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const signUp = useCallback((email: string, _password: string, name: string) => {
    const authUser: AuthUser = { email, name };
    localStorage.setItem("medscribe_user", JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("medscribe_user");
    setUser(null);
  }, []);

  return { user, signIn, signUp, signOut, isAuthenticated: !!user };
}
