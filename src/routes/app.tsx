import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";

function AppLayout() {
  const [hashHandled, setHashHandled] = useState(
    typeof window === "undefined" ? true : !window.location.hash.includes("access_token"),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.includes("access_token")) {
      setHashHandled(true);
      return;
    }
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .catch((e) => console.error("[oauth] setSession failed", e))
        .finally(() => {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setHashHandled(true);
        });
    } else {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setHashHandled(true);
    }
  }, []);

  if (!hashHandled) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Connexion en cours…</div>;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/app")({
  component: AppLayout,
});
