import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { signinDoctor, signupDoctor, type AuthUserDto, type DoctorSignupPayload } from "@/lib/api";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearAuthStorage } from "@/lib/authStorage";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  country?: string;
  city?: string;
  specialty?: string;
  years_of_experience?: number;
  practice_name?: string;
  license_number?: string;
}

function userFromDto(d: AuthUserDto): AuthUser {
  return {
    id: d.id,
    email: d.email,
    name: d.name,
    ...(d.country ? { country: d.country } : {}),
    ...(d.city ? { city: d.city } : {}),
    ...(d.specialty ? { specialty: d.specialty } : {}),
    ...(d.years_of_experience != null ? { years_of_experience: d.years_of_experience } : {}),
    ...(d.practice_name ? { practice_name: d.practice_name } : {}),
    ...(d.license_number ? { license_number: d.license_number } : {}),
  };
}

function loadStoredUser(): AuthUser | null {
  const stored = localStorage.getItem(AUTH_USER_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<AuthUser>;
    if (parsed?.email && parsed?.name && parsed?.id) {
      return {
        id: parsed.id,
        email: parsed.email,
        name: parsed.name,
        country: parsed.country,
        city: parsed.city,
        specialty: parsed.specialty,
        years_of_experience: parsed.years_of_experience,
        practice_name: parsed.practice_name,
        license_number: parsed.license_number,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

interface AuthContextValue {
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: DoctorSignupPayload) => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());

  const persistSession = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const data = await signinDoctor(email, password);
      persistSession(data.access_token, userFromDto(data.user));
    },
    [persistSession]
  );

  const signUp = useCallback(
    async (payload: DoctorSignupPayload) => {
      const data = await signupDoctor(payload);
      persistSession(data.access_token, userFromDto(data.user));
    },
    [persistSession]
  );

  const signOut = useCallback(() => {
    clearAuthStorage();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      signIn,
      signUp,
      signOut,
      isAuthenticated: !!user,
    }),
    [user, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
