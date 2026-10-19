import { useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "student";

export interface StoredAccount {
  id: string;
  email: string;
  password?: string;
  fullName: string;
  phoneNumber?: string;
  role: AppRole;
  createdAt: string;
}

export interface ActiveUserSession {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: AppRole;
}

const ACTIVE_USER_KEY = "bookbank_active_user";
const REGISTERED_ACCOUNTS_KEY = "bookbank_registered_accounts";

export function getStoredAccounts(): StoredAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REGISTERED_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredAccount(account: StoredAccount): void {
  if (typeof window === "undefined") return;
  try {
    const accounts = getStoredAccounts().filter(
      (a) => a.email.toLowerCase() !== account.email.toLowerCase(),
    );
    accounts.push(account);
    localStorage.setItem(REGISTERED_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (err) {
    console.error("Failed to save local account", err);
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper to ensure role exists in DB or fallback to metadata
  const resolveRole = useCallback(async (u: User): Promise<AppRole> => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.id)
        .maybeSingle();

      if (!error && data?.role) {
        return data.role as AppRole;
      }

      const metaRole = (u.user_metadata?.role as AppRole) || "student";

      try {
        await supabase
          .from("user_roles")
          .upsert({ user_id: u.id, role: metaRole }, { onConflict: "user_id,role" });
      } catch {
        // Ignored if RLS restricts
      }

      return metaRole;
    } catch {
      return (u.user_metadata?.role as AppRole) || "student";
    }
  }, []);

  const syncAuthState = useCallback(async () => {
    // 1. Check for active stored user session
    const activeRaw = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_USER_KEY) : null;
    if (activeRaw) {
      try {
        const active: ActiveUserSession = JSON.parse(activeRaw);
        const syntheticUser = {
          id: active.id,
          email: active.email,
          phone: active.phoneNumber,
          user_metadata: {
            full_name: active.fullName,
            phone: active.phoneNumber,
            role: active.role,
          },
          app_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
        } as unknown as User;

        setUser(syntheticUser);
        setRole(active.role);
        setSession(null);
        setLoading(false);
        return;
      } catch {
        localStorage.removeItem(ACTIVE_USER_KEY);
      }
    }

    // 2. Fall back to Supabase session
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setSession(data.session);
        setUser(data.session.user);
        const resolvedRole = await resolveRole(data.session.user);
        setRole(resolvedRole);
      } else {
        setSession(null);
        setUser(null);
        setRole(null);
      }
    } catch {
      setSession(null);
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, [resolveRole]);

  useEffect(() => {
    let mounted = true;

    syncAuthState();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!mounted) return;
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        const resolvedRole = await resolveRole(s.user);
        if (mounted) setRole(resolvedRole);
      } else {
        const activeRaw =
          typeof window !== "undefined" ? localStorage.getItem(ACTIVE_USER_KEY) : null;
        if (!activeRaw && mounted) {
          setSession(null);
          setUser(null);
          setRole(null);
        }
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [syncAuthState, resolveRole]);

  const setLocalUserSession = useCallback((sessionData: ActiveUserSession) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(sessionData));
    }
    const syntheticUser = {
      id: sessionData.id,
      email: sessionData.email,
      phone: sessionData.phoneNumber,
      user_metadata: {
        full_name: sessionData.fullName,
        phone: sessionData.phoneNumber,
        role: sessionData.role,
      },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as unknown as User;

    setUser(syntheticUser);
    setRole(sessionData.role);
  }, []);

  const updateProfile = useCallback(
    ({ fullName, phoneNumber }: { fullName?: string; phoneNumber?: string }) => {
      if (!user) return;
      const updatedName = fullName ?? user.user_metadata?.full_name ?? "";
      const updatedPhone = phoneNumber ?? user.phone ?? user.user_metadata?.phone ?? "";

      // 1. Update active session
      if (typeof window !== "undefined") {
        const activeRaw = localStorage.getItem(ACTIVE_USER_KEY);
        if (activeRaw) {
          const parsed: ActiveUserSession = JSON.parse(activeRaw);
          parsed.fullName = updatedName;
          parsed.phoneNumber = updatedPhone;
          localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(parsed));
        }

        // 2. Update in registered accounts
        const accounts = getStoredAccounts();
        const account = accounts.find((a) => a.id === user.id || a.email === user.email);
        if (account) {
          account.fullName = updatedName;
          account.phoneNumber = updatedPhone;
          saveStoredAccount(account);
        }
      }

      // 3. Update active user state
      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          phone: updatedPhone,
          user_metadata: {
            ...prev.user_metadata,
            full_name: updatedName,
            phone: updatedPhone,
          },
        } as unknown as User;
      });
    },
    [user],
  );

  const signOut = useCallback(async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_USER_KEY);
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors on signout
    }
    setUser(null);
    setRole(null);
    setSession(null);
  }, []);

  return {
    session,
    user,
    role,
    loading,
    isAdmin: role === "admin",
    setLocalUserSession,
    updateProfile,
    signOut,
    refreshAuth: syncAuthState,
  };
}
