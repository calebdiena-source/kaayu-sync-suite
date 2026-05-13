import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";

function AppLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        // fire and forget — onAuthStateChange in useAuth will pick up SIGNED_IN
        void supabase.auth.setSession({ access_token, refresh_token });
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      void navigate({ to: data.session ? "/app" : "/login", replace: true });
    }, 3000);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        window.clearTimeout(timeout);
        void navigate({ to: "/app", replace: true });
      }
    });

    return () => {
      window.clearTimeout(timeout);
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/app")({
  component: AppLayout,
});
