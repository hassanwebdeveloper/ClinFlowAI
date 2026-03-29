import { useCallback, useState } from "react";
import { signinDoctor, signupDoctor } from "@/lib/api";

const USER_KEY = "medscribe_user";
const TOKEN_KEY = "medscribe_token";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

function loadStoredUser(): AuthUser | null {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<AuthUser>;
    if (parsed?.email && parsed?.name && parsed?.id) {
      return { id: parsed.id, email: parsed.email, name: parsed.name };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());

  const persistSession = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const data = await signinDoctor(email, password);
      persistSession(data.access_token, data.user);
    },
    [persistSession]
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const data = await signupDoctor(email, password, name);
      persistSession(data.access_token, data.user);
    },
    [persistSession]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return { user, signIn, signUp, signOut, isAuthenticated: !!user };
}
