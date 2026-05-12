import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Trash2, Download, Pin, Cloud, CloudOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportTextToPDF } from "@/lib/exports";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { RichTextEditor } from "@/components/rich-text-editor";

export const Route = createFileRoute("/app/notes/$id")({
  head: () => ({ meta: [{ title: "Note — Kaayu" }] }),
  component: NoteEditorPage,
});

type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
};

const cacheKey = (id: string) => `note-cache:${id}`;
const pendingKey = (id: string) => `note-pending:${id}`;

function htmlToText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

async function htmlToDocxBlob(title: string, html: string): Promise<Blob> {
  const container = document.createElement("div");
  container.innerHTML = html;
  const paragraphs: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, bold: true })] }),
  ];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (text) paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    const text = node.textContent ?? "";
    switch (tag) {
      case "h1": paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] })); break;
      case "h2": paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] })); break;
      case "h3": paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true })] })); break;
      case "li": paragraphs.push(new Paragraph({ text, bullet: { level: 0 } })); break;
      case "ul": case "ol": node.childNodes.forEach(walk); break;
      case "p": case "div": case "blockquote":
        if (text.trim()) paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
        else node.childNodes.forEach(walk);
        break;
      case "br": paragraphs.push(new Paragraph({ children: [] })); break;
      default: node.childNodes.forEach(walk);
    }
  };
  container.childNodes.forEach(walk);
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return await Packer.toBlob(doc);
}

function NoteEditorPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState<string>("<p></p>");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);
  const titleRef = useRef(title);
  const htmlRef = useRef(html);
  titleRef.current = title;
  htmlRef.current = html;

  // Online/offline listeners
  useEffect(() => {
    const on = () => { setOnline(true); flushPending(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // eslint-disable-next-line
  }, [id]);

  // Load note
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cached = localStorage.getItem(cacheKey(id));
      if (cached) {
        try {
          const c = JSON.parse(cached) as Note;
          if (!cancelled) { setNote(c); setTitle(c.title); setHtml(c.content || "<p></p>"); }
        } catch {}
      }
      const { data, error } = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error) { toast.error(error.message); setLoading(false); return; }
      if (!data) { toast.error("Note introuvable"); navigate({ to: "/app/notes" }); return; }
      const n = data as Note;
      setNote(n); setTitle(n.title); setHtml(n.content || "<p></p>");
      lastSavedRef.current = { title: n.title, content: n.content };
      localStorage.setItem(cacheKey(id), JSON.stringify(n));
      setLoading(false);
      flushPending();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [id, user?.id]);

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(); }, 1200);
  };

  const save = async () => {
    if (!note) return;
    const content = htmlRef.current;
    const newTitle = titleRef.current.trim() || "Sans titre";
    if (lastSavedRef.current && lastSavedRef.current.title === newTitle && lastSavedRef.current.content === content) return;
    setStatus("saving");
    const updated = { ...note, title: newTitle, content, updated_at: new Date().toISOString() };
    localStorage.setItem(cacheKey(id), JSON.stringify(updated));
    if (!navigator.onLine) {
      localStorage.setItem(pendingKey(id), JSON.stringify({ title: newTitle, content }));
      setStatus("offline");
      return;
    }
    const { error } = await supabase.from("notes").update({ title: newTitle, content }).eq("id", id);
    if (error) {
      localStorage.setItem(pendingKey(id), JSON.stringify({ title: newTitle, content }));
      setStatus("offline");
      toast.error("Sauvegarde locale (hors-ligne)");
      return;
    }
    lastSavedRef.current = { title: newTitle, content };
    localStorage.removeItem(pendingKey(id));
    setStatus("saved");
    setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
  };

  const flushPending = async () => {
    const pending = localStorage.getItem(pendingKey(id));
    if (!pending || !navigator.onLine) return;
    try {
      const p = JSON.parse(pending);
      const { error } = await supabase.from("notes").update(p).eq("id", id);
      if (!error) {
        localStorage.removeItem(pendingKey(id));
        lastSavedRef.current = p;
        toast.success("Modifications synchronisées");
      }
    } catch {}
  };

  // Save on title or content change
  useEffect(() => { if (!loading) scheduleSave(); /* eslint-disable-next-line */ }, [title, html]);

  // Save on unmount
  useEffect(() => () => { void save(); /* eslint-disable-next-line */ }, []);

  const remove = async () => {
    if (!confirm("Supprimer cette note ?")) return;
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    localStorage.removeItem(cacheKey(id));
    localStorage.removeItem(pendingKey(id));
    toast.success("Note supprimée");
    navigate({ to: "/app/notes" });
  };

  const togglePin = async () => {
    if (!note) return;
    const { error } = await supabase.from("notes").update({ pinned: !note.pinned }).eq("id", id);
    if (error) return toast.error(error.message);
    setNote({ ...note, pinned: !note.pinned });
  };

  const downloadDocx = async () => {
    const blob = await htmlToDocxBlob(title || "Note", html);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title || "Note"}.docx`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    exportTextToPDF(`${title || "Note"}.pdf`, title || "Note", htmlToText(html));
  };

  if (loading || !note) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…</div>;
  }

  const StatusBadge = () => {
    if (!online || status === "offline") return <span className="flex items-center gap-1 text-xs text-amber-600"><CloudOff className="h-3.5 w-3.5" /> Hors-ligne</span>;
    if (status === "saving") return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…</span>;
    if (status === "saved") return <span className="flex items-center gap-1 text-xs text-emerald-600"><Cloud className="h-3.5 w-3.5" /> Enregistré</span>;
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Cloud className="h-3.5 w-3.5" /> À jour</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/app/notes" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Notes
        </Button>
        <StatusBadge />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={togglePin}>
            <Pin className={`mr-1 h-4 w-4 ${note.pinned ? "text-primary" : ""}`} /> {note.pinned ? "Désépingler" : "Épingler"}
          </Button>
          <Button size="sm" variant="outline" onClick={downloadDocx}><Download className="mr-1 h-4 w-4" /> DOCX</Button>
          <Button size="sm" variant="outline" onClick={downloadPdf}><Download className="mr-1 h-4 w-4" /> PDF</Button>
          <Button size="sm" variant="destructive" onClick={remove}><Trash2 className="mr-1 h-4 w-4" /> Supprimer</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la note"
            className="border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
          />
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Créé le {new Date(note.created_at).toLocaleString("fr-FR")}</span>
            <span>Modifié le {new Date(note.updated_at).toLocaleString("fr-FR")}</span>
          </div>
        </div>
        <RichTextEditor value={html} onChange={setHtml} placeholder="Commencez à écrire votre note…" />
      </div>
    </div>
  );
}
