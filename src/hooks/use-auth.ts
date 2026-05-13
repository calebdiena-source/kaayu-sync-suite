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
      applySession(s);
    });

    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, roles, loading, isAdmin: roles.includes("admin") };
}
