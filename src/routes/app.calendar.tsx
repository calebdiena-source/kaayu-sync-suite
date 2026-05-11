import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Plus, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { syncEventToGoogle } from "@/lib/google.functions";

export const Route = createFileRoute("/app/calendar")({
  head: () => ({ meta: [{ title: "Calendrier — Kaayu" }] }),
  component: CalendarPage,
});

type Ev = { id: string; title: string; start_at: string; end_at: string | null; location: string | null };

function CalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Ev[]>([]);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [location, setLocation] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("calendar_events").select("*").eq("user_id", user.id).order("start_at");
    setEvents(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const syncFn = useServerFn(syncEventToGoogle);
  const add = async () => {
    if (!user || !title || !start) return;
    const { data, error } = await supabase.from("calendar_events")
      .insert({ user_id: user.id, title, start_at: start, location })
      .select().single();
    if (error) { toast.error(error.message); return; }
    setTitle(""); setStart(""); setLocation(""); load();
    toast.success("Événement ajouté");
    if (data) {
      try { await syncFn({ data: { eventId: data.id } }); toast.success("Synchronisé avec Google Calendar"); }
      catch { /* not connected — silent */ }
    }
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-semibold tracking-tight">Calendrier</h2><p className="text-sm text-muted-foreground">{events.length} événement(s) à venir</p></div>

      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" className="flex-1 min-w-[12rem] rounded-md border bg-background px-3 py-2 text-sm" />
        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lieu (optionnel)" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
      </div>

      <div className="space-y-2">
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-xs text-muted-foreground">{new Date(e.start_at).toLocaleString("fr-FR")} {e.location && `· ${e.location}`}</div>
            </div>
          </div>
        ))}
        {events.length === 0 && <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">Aucun événement</div>}
      </div>
    </div>
  );
}
