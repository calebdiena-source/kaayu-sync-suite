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
    let initialSessionLoaded = false;

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

    // Subscribe first, but don't let an early null INITIAL_SESSION redirect
    // protected pages before storage restoration has completed.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!initialSessionLoaded && event === "INITIAL_SESSION") return;
      apply(s);
    });

    supabase.auth.getSession()
      .then(({ data }) => {
        initialSessionLoaded = true;
        apply(data.session);
      })
      .catch(() => {
        initialSessionLoaded = true;
        apply(null);
      });

    // Safety net: never block UI indefinitely on auth restore.
    const t = setTimeout(() => {
      if (active && !initialSessionLoaded) {
        initialSessionLoaded = true;
        apply(null);
      }
    }, 4000);

    return () => {
      active = false;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, roles, loading, isAdmin: roles.includes("admin") };
}
