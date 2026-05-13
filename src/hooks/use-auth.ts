import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "employee";

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
            await supabase.auth.setSession({ access_token, refresh_token });
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        }
        const { data } = await supabase.auth.getSession();
        initialSessionChecked = true;
        applySession(data.session);
      } catch {
        initialSessionChecked = true;
        applySession(null);
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
