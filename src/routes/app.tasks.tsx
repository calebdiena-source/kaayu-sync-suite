import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportRowsToCSV, exportRowsToPDF } from "@/lib/exports";

export const Route = createFileRoute("/app/tasks")({
  head: () => ({ meta: [{ title: "Tâches — Kaayu" }] }),
  component: TasksPage,
});

type Task = { id: string; title: string; description: string | null; due_date: string | null; priority: string; status: string };

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [due, setDue] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setTasks(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const add = async () => {
    if (!user || !title) return;
    const { error } = await supabase.from("tasks").insert({ user_id: user.id, title, priority, due_date: due || null });
    if (error) toast.error(error.message); else { setTitle(""); setDue(""); load(); }
  };

  const toggle = async (t: Task) => {
    const next = t.status === "done" ? "todo" : "done";
    await supabase.from("tasks").update({ status: next }).eq("id", t.id); load();
  };

  const remove = async (id: string) => { await supabase.from("tasks").delete().eq("id", id); load(); };

  const colors: Record<string, string> = { high: "bg-destructive/10 text-destructive", medium: "bg-warning/10 text-warning", low: "bg-muted text-muted-foreground" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xl font-semibold tracking-tight">Tâches</h2><p className="text-sm text-muted-foreground">{tasks.filter(t=>t.status!=="done").length} en cours</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportRowsToCSV(`taches-${Date.now()}.csv`, ["Titre","Priorité","Échéance","Statut"], tasks.map(t=>[t.title,t.priority,t.due_date??"",t.status]))}><FileDown className="mr-1 h-4 w-4" />CSV</Button>
          <Button size="sm" variant="outline" onClick={() => exportRowsToPDF(`taches-${Date.now()}.pdf`,"Liste des tâches",["Titre","Priorité","Échéance","Statut"], tasks.map(t=>[t.title,t.priority,t.due_date??"",t.status]))}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle tâche…" className="flex-1 min-w-[12rem] rounded-md border bg-background px-3 py-2 text-sm" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
          <option value="low">Faible</option><option value="medium">Moyenne</option><option value="high">Haute</option>
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
        <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
      </div>

      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} className="h-4 w-4" />
            <div className={`flex-1 text-sm ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>{t.title}</div>
            {t.due_date && <div className="text-xs text-muted-foreground">{new Date(t.due_date).toLocaleDateString("fr-FR")}</div>}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[t.priority] ?? colors.medium}`}>{t.priority}</span>
            <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        {tasks.length === 0 && <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">Aucune tâche</div>}
      </div>
    </div>
  );
}
