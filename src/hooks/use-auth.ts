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

    const loadRoles = async (userId: string) => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (!active) return;
      setRoles((data ?? []).map((r) => r.role as AppRole));
    };

    const apply = (s: Session | null) => {
      if (!active) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void loadRoles(s.user.id);
      } else {
        setRoles([]);
      }
      setLoading(false);
    };

    // 1) Subscribe FIRST so we don't miss SIGNED_IN events.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      apply(s);
    });

    // 2) Then fetch the current session (restored from storage).
    supabase.auth.getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));

    // 3) Safety net: never block UI more than 2s on auth restore.
    const t = setTimeout(() => {
      if (active) setLoading(false);
    }, 2000);

    return () => {
      active = false;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, roles, loading, isAdmin: roles.includes("admin") };
}
