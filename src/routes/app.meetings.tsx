import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Sparkles, Calendar as CalIcon, Loader2, FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportTextToDOCX, exportTextToPDF } from "@/lib/exports";

export const Route = createFileRoute("/app/meetings")({
  head: () => ({ meta: [{ title: "Réunions — Kaayu" }] }),
  component: MeetingsPage,
});

type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  participants: string[] | null;
  notes: string | null;
  summary: string | null;
};

function MeetingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<Meeting[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [summarizing, setSummarizing] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .eq("user_id", user.id)
      .order("meeting_date", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.id]);

  const create = async () => {
    if (!user || !title) return;
    const { error } = await supabase.from("meetings").insert({
      user_id: user.id,
      title,
      meeting_date: date,
      participants: participants
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notes,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Réunion créée");
      setShowNew(false);
      setTitle("");
      setNotes("");
      setParticipants("");
      load();
    }
  };

  const summarize = async (m: Meeting) => {
    setSummarizing(m.id);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: [
            {
              role: "user",
              content: `Résume professionnellement cette réunion en français avec points clés et actions :\n\nTitre : ${m.title}\nParticipants : ${(m.participants ?? []).join(", ")}\nNotes :\n${m.notes ?? ""}`,
            },
          ],
        },
      });
      if (error) throw error;
      await supabase.from("meetings").update({ summary: data.reply }).eq("id", m.id);
      toast.success("Résumé généré");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSummarizing(null);
    }
  };

  const openInEditor = (m: Meeting) => {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");
    const parts = (m.participants ?? []).join(", ");
    const dateStr = new Date(m.meeting_date).toLocaleDateString("fr-FR", { dateStyle: "full" });
    const html =
      `<h1>${esc(m.title)}</h1>` +
      `<p><strong>Date :</strong> ${esc(dateStr)}</p>` +
      (parts ? `<p><strong>Participants :</strong> ${esc(parts)}</p>` : "") +
      (m.notes ? `<h2>Notes</h2><p>${nl2br(m.notes)}</p>` : "") +
      (m.summary ? `<h2>Résumé</h2><p>${nl2br(m.summary)}</p>` : "") +
      "<p></p>";
    try {
      sessionStorage.setItem("kaayu:editor:initial", html);
    } catch {
      toast.error("Impossible d'ouvrir l'éditeur");
      return;
    }
    const safeName = m.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "Réunion";
    navigate({
      to: "/app/documents/editor/$id",
      params: { id: "new" },
      search: { name: `${safeName}.docx` },
    });
  };

  const grouped = list.reduce<Record<string, Meeting[]>>((acc, m) => {
    (acc[m.meeting_date] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Réunions</h2>
          <p className="text-sm text-muted-foreground">Organisées automatiquement par jour</p>
        </div>
        <Button onClick={() => setShowNew(!showNew)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle réunion
        </Button>
      </div>

      {showNew && (
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="Participants (séparés par des virgules)"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes…"
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Annuler
            </Button>
            <Button onClick={create}>Créer</Button>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([day, items]) => (
        <div key={day}>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CalIcon className="h-3.5 w-3.5" />{" "}
            {new Date(day).toLocaleDateString("fr-FR", { dateStyle: "full" })}
          </div>
          <div className="space-y-3">
            {items.map((m) => (
              <div key={m.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{m.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {(m.participants ?? []).length} participant(s) ·{" "}
                      {(m.participants ?? []).join(", ")}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => summarize(m)}
                      disabled={summarizing === m.id}
                    >
                      {summarizing === m.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Résumer
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openInEditor(m)}>
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      Éditeur
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        exportTextToDOCX(
                          `reunion-${m.id}.docx`,
                          m.title,
                          [m.notes ?? "", m.summary ?? ""].filter(Boolean),
                        )
                      }
                    >
                      <FileDown className="mr-1 h-3.5 w-3.5" />
                      DOCX
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        exportTextToPDF(
                          `reunion-${m.id}.pdf`,
                          m.title,
                          `${m.notes ?? ""}\n\n${m.summary ?? ""}`,
                        )
                      }
                    >
                      <FileDown className="mr-1 h-3.5 w-3.5" />
                      PDF
                    </Button>
                  </div>
                </div>
                {m.notes && (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {m.notes}
                  </div>
                )}
                {m.summary && (
                  <div className="mt-3 rounded-md border-l-2 border-primary bg-primary/5 p-3 text-sm">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
                      Résumé IA
                    </div>
                    <div className="whitespace-pre-wrap">{m.summary}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {list.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          Aucune réunion. Créez-en une pour commencer.
        </div>
      )}
    </div>
  );
}
