import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotebookPen, Plus, Search, Pin, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/notes")({
  head: () => ({ meta: [{ title: "Notes — Kaayu" }] }),
  component: NotesListPage,
});

type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

function stripHtml(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

function NotesListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setNotes((data ?? []) as Note[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const createNote = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: user.id, title: "Sans titre", content: "" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    navigate({ to: "/app/notes/$id", params: { id: data.id } });
  };

  const togglePin = async (n: Note) => {
    const { error } = await supabase.from("notes").update({ pinned: !n.pinned }).eq("id", n.id);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette note ?")) return;
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Note supprimée"); load(); }
  };

  const filtered = notes.filter((n) => {
    const q = query.toLowerCase();
    return !q || n.title.toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NotebookPen className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">Notes</h2>
        <p className="text-sm text-muted-foreground">Créez, modifiez et organisez vos notes.</p>
        <Button size="sm" className="ml-auto" onClick={createNote}>
          <Plus className="mr-1 h-4 w-4" /> Nouvelle note
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans les notes…" className="pl-9" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Aucune note. Créez votre première note.</p>
          <Button className="mt-3" onClick={createNote}><Plus className="mr-1 h-4 w-4" /> Nouvelle note</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((n) => (
            <div key={n.id} className="group relative rounded-xl border bg-card p-4 transition hover:shadow-md">
              <Link to="/app/notes/$id" params={{ id: n.id }} className="block">
                <div className="flex items-start gap-2">
                  {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  <h3 className="line-clamp-1 flex-1 font-medium">{n.title || "Sans titre"}</h3>
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                  {stripHtml(n.content) || "Note vide…"}
                </p>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Modifié le {new Date(n.updated_at).toLocaleString("fr-FR")}
                </p>
              </Link>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => togglePin(n)} className="rounded p-1 hover:bg-accent" title="Épingler">
                  <Pin className={`h-3.5 w-3.5 ${n.pinned ? "text-primary" : ""}`} />
                </button>
                <button onClick={() => remove(n.id)} className="rounded p-1 hover:bg-destructive/10" title="Supprimer">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
