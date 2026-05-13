import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NotebookPen,
  Plus,
  Search,
  Pin,
  Trash2,
  Folder,
  FolderPlus,
  FolderInput,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
  folder_id: string | null;
  created_at: string;
  updated_at: string;
};
type Folder = { id: string; name: string };

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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | "all" | "none">("all");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: n, error }, { data: f }] = await Promise.all([
      supabase
        .from("notes")
        .select("*")
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false }),
      supabase
        .from("folders")
        .select("id,name")
        .eq("user_id", user.id)
        .eq("kind", "note")
        .order("name"),
    ]);
    if (error) toast.error(error.message);
    else setNotes((n ?? []) as Note[]);
    setFolders((f ?? []) as Folder[]);
    setLoading(false);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.id]);

  const createNote = async () => {
    if (!user) return;
    const folder_id = activeFolder !== "all" && activeFolder !== "none" ? activeFolder : null;
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: user.id, title: "Sans titre", content: "", folder_id })
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
    else {
      toast.success("Note supprimée");
      load();
    }
  };

  const moveTo = async (noteId: string, folder_id: string | null) => {
    const { error } = await supabase.from("notes").update({ folder_id }).eq("id", noteId);
    if (error) toast.error(error.message);
    else {
      toast.success(folder_id ? "Note déplacée" : "Note retirée du dossier");
      load();
    }
  };

  const createFolder = async () => {
    if (!user) return;
    const name = prompt("Nom du dossier :");
    if (!name) return;
    const { error } = await supabase
      .from("folders")
      .insert({ user_id: user.id, name, kind: "note" });
    if (error) toast.error(error.message);
    else load();
  };

  const renameFolder = async (f: Folder) => {
    const name = prompt("Nouveau nom :", f.name);
    if (!name || name === f.name) return;
    const { error } = await supabase.from("folders").update({ name }).eq("id", f.id);
    if (error) toast.error(error.message);
    else load();
  };

  const deleteFolder = async (f: Folder) => {
    if (!confirm(`Supprimer le dossier « ${f.name} » ? Les notes ne seront pas supprimées.`))
      return;
    await supabase.from("notes").update({ folder_id: null }).eq("folder_id", f.id);
    const { error } = await supabase.from("folders").delete().eq("id", f.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Dossier supprimé");
      if (activeFolder === f.id) setActiveFolder("all");
      load();
    }
  };

  const filtered = notes.filter((n) => {
    if (activeFolder === "none" && n.folder_id) return false;
    if (activeFolder !== "all" && activeFolder !== "none" && n.folder_id !== activeFolder)
      return false;
    const q = query.toLowerCase();
    return (
      !q || n.title.toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q)
    );
  });

  const counts = {
    all: notes.length,
    none: notes.filter((n) => !n.folder_id).length,
  };

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

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside className="space-y-1 rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Dossiers</span>
            <button
              onClick={createFolder}
              className="rounded p-1 hover:bg-accent"
              title="Nouveau dossier"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={() => setActiveFolder("all")}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent ${activeFolder === "all" ? "bg-accent font-medium" : ""}`}
          >
            <span>Toutes</span>
            <span className="text-xs text-muted-foreground">{counts.all}</span>
          </button>
          <button
            onClick={() => setActiveFolder("none")}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent ${activeFolder === "none" ? "bg-accent font-medium" : ""}`}
          >
            <span>Sans dossier</span>
            <span className="text-xs text-muted-foreground">{counts.none}</span>
          </button>
          {folders.length > 0 && <div className="my-1 border-t" />}
          {folders.map((f) => (
            <div key={f.id} className="group flex items-center gap-1">
              <button
                onClick={() => setActiveFolder(f.id)}
                className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${activeFolder === f.id ? "bg-accent font-medium" : ""}`}
              >
                <Folder className="h-3.5 w-3.5 text-primary" />
                <span className="line-clamp-1 flex-1">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  {notes.filter((n) => n.folder_id === f.id).length}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded p-1 opacity-0 hover:bg-accent group-hover:opacity-100">
                  ⋯
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => renameFolder(f)}>Renommer</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => deleteFolder(f)} className="text-destructive">
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </aside>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans les notes…"
              className="pl-9"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">Aucune note ici.</p>
              <Button className="mt-3" onClick={createNote}>
                <Plus className="mr-1 h-4 w-4" /> Nouvelle note
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((n) => (
                <div
                  key={n.id}
                  className="group relative rounded-xl border bg-card p-4 transition hover:shadow-md"
                >
                  <Link to="/app/notes/$id" params={{ id: n.id }} className="block">
                    <div className="flex items-start gap-2">
                      {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <h3 className="line-clamp-1 flex-1 font-medium">{n.title || "Sans titre"}</h3>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                      {stripHtml(n.content) || "Note vide…"}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{new Date(n.updated_at).toLocaleDateString("fr-FR")}</span>
                      {n.folder_id && (
                        <span className="flex items-center gap-1">
                          <Folder className="h-3 w-3" />
                          {folders.find((f) => f.id === n.folder_id)?.name ?? "—"}
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1 hover:bg-accent" title="Déplacer">
                        <FolderInput className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Déplacer vers</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => moveTo(n.id, null)}>
                          Aucun dossier
                        </DropdownMenuItem>
                        {folders.map((f) => (
                          <DropdownMenuItem key={f.id} onClick={() => moveTo(n.id, f.id)}>
                            <Folder className="mr-2 h-3.5 w-3.5" />
                            {f.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={createFolder}>
                          <FolderPlus className="mr-2 h-3.5 w-3.5" />
                          Nouveau dossier…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      onClick={() => togglePin(n)}
                      className="rounded p-1 hover:bg-accent"
                      title="Épingler"
                    >
                      <Pin className={`h-3.5 w-3.5 ${n.pinned ? "text-primary" : ""}`} />
                    </button>
                    <button
                      onClick={() => remove(n.id)}
                      className="rounded p-1 hover:bg-destructive/10"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
