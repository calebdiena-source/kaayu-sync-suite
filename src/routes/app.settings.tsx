import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startGoogleConnect, getGoogleStatus, disconnectGoogle } from "@/lib/google.functions";

import { Button } from "@/components/ui/button";
import { CalendarDays, Check, Link2Off } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Paramètres — Kaayu" }] }),
  component: SettingsPage,
});

type GoogleStatus = { google_email?: string | null; sync_enabled?: boolean } | null;

function SettingsPage() {
  const start = useServerFn(startGoogleConnect);
  const status = useServerFn(getGoogleStatus);
  const disc = useServerFn(disconnectGoogle);
  const [info, setInfo] = useState<GoogleStatus>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setInfo((await status({})) as GoogleStatus);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "ok") toast.success("Google Calendar connecté");
    else if (params.get("google") === "err") toast.error(`Échec : ${params.get("msg")}`);
    if (params.has("google")) window.history.replaceState({}, "", "/app/settings");
  }, [refresh]);

  const connect = async () => {
    try {
      const { url, redirectUri } = await start({});
      console.info("Google Calendar OAuth redirect_uri:", redirectUri);
      console.info("Google Calendar OAuth complete URL:", url);
      window.location.href = url;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur");
    }
  };

  const disconnect = async () => {
    await disc({});
    toast.success("Déconnecté");
    refresh();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Paramètres</h2>
        <p className="text-sm text-muted-foreground">Intégrations et préférences du compte</p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Google Calendar</h3>
              {info && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">
                  <Check className="h-3 w-3" />
                  Connecté
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Synchronisez automatiquement vos événements Kaayu avec votre Google Calendar (PC &
              téléphone).
            </p>
            {info?.google_email && (
              <p className="mt-2 text-xs text-muted-foreground">
                Compte : <span className="font-medium text-foreground">{info.google_email}</span>
              </p>
            )}
            <div className="mt-4 flex gap-2">
              {loading ? (
                <div className="text-sm text-muted-foreground">Chargement…</div>
              ) : info ? (
                <Button variant="outline" onClick={disconnect}>
                  <Link2Off className="mr-2 h-4 w-4" />
                  Déconnecter
                </Button>
              ) : (
                <Button onClick={connect}>Connecter Google Calendar</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
