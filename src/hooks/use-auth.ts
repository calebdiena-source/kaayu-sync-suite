import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "employee";

const AUTH_TIMEOUT_MS = 3000;

const timeout = <T,>(promise: Promise<T>, ms = AUTH_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise<"timeout">((resolve) => window.setTimeout(() => resolve("timeout"), ms)),
  ]);

const getStoredSession = (): Session | null => {
  if (typeof window === "undefined") return null;

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;

    try {
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
      if (value?.access_token && value?.refresh_token && value?.user) return value as Session;
    } catch {
      return null;
    }
  }

  return null;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let initialSessionChecked = false;
    let currentUserId: string | null = null;

    const loadRoles = async (userId: string) => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (active && currentUserId === userId) {
        setRoles((data ?? []).map((r) => r.role as AppRole));
      }
    };

    const applySession = (s: Session | null) => {
      if (!active) return;
      setSession(s);
      setUser(s?.user ?? null);
      currentUserId = s?.user?.id ?? null;
      if (s?.user) {
        void loadRoles(s.user.id);
      } else {
        setRoles([]);
      }
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (_e === "INITIAL_SESSION" && !initialSessionChecked && !s) return;
      applySession(s);
    });

    const initializeSession = async () => {
      try {
        if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
          const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const result = await timeout(supabase.auth.setSession({ access_token, refresh_token }));
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
            if (result !== "timeout") {
              initialSessionChecked = true;
              applySession(result.data.session);
              return;
            }
          }
        }
        const result = await timeout(supabase.auth.getSession());
        initialSessionChecked = true;
        applySession(result === "timeout" ? getStoredSession() : result.data.session);
      } catch {
        initialSessionChecked = true;
        applySession(getStoredSession());
      }
    };

    void initializeSession();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, roles, loading, isAdmin: roles.includes("admin") };
}
