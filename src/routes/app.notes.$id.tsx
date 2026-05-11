import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Heading1, Heading2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo, Redo, Trash2, Download, Pin, Cloud, CloudOff, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { exportTextToPDF } from "@/lib/exports";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

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
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontSize,
      FontFamily,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "",
    editorProps: { attributes: { class: "prose prose-sm dark:prose-invert max-w-none min-h-[60vh] focus:outline-none p-4" } },
    onUpdate: () => scheduleSave(),
  });

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
    if (!user || !editor) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Hydrate from cache first
      const cached = localStorage.getItem(cacheKey(id));
      if (cached) {
        try {
          const c = JSON.parse(cached) as Note;
          if (!cancelled) {
            setNote(c); setTitle(c.title); editor.commands.setContent(c.content || "<p></p>");
          }
        } catch {}
      }
      const { data, error } = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error) { toast.error(error.message); setLoading(false); return; }
      if (!data) { toast.error("Note introuvable"); navigate({ to: "/app/notes" }); return; }
      const n = data as Note;
      setNote(n); setTitle(n.title);
      editor.commands.setContent(n.content || "<p></p>");
      lastSavedRef.current = { title: n.title, content: n.content };
      localStorage.setItem(cacheKey(id), JSON.stringify(n));
      setLoading(false);
      // Flush any pending offline edits
      flushPending();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [id, user?.id, editor]);

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(); }, 1200);
  };

  const save = async () => {
    if (!editor || !note) return;
    const content = editor.getHTML();
    const newTitle = title.trim() || "Sans titre";
    if (lastSavedRef.current && lastSavedRef.current.title === newTitle && lastSavedRef.current.content === content) return;
    setStatus("saving");
    // Update cache immediately
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

  // Save on title change
  useEffect(() => { if (!loading) scheduleSave(); /* eslint-disable-next-line */ }, [title]);

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
    if (!editor) return;
    const blob = await htmlToDocxBlob(title || "Note", editor.getHTML());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title || "Note"}.docx`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    exportTextToPDF(`${title || "Note"}.pdf`, title || "Note", editor?.getText() ?? "");
  };

  if (!editor || loading || !note) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…</div>;
  }

  const ToolbarBtn = ({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className={`rounded-md p-2 text-sm hover:bg-accent ${active ? "bg-accent text-accent-foreground" : ""}`}>
      {children}
    </button>
  );

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

      <div className="rounded-xl border bg-card">
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

        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2 backdrop-blur">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={
              editor.isActive("heading", { level: 1 }) ? "h1" :
              editor.isActive("heading", { level: 2 }) ? "h2" :
              editor.isActive("heading", { level: 3 }) ? "h3" : "p"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "p") editor.chain().focus().setParagraph().run();
              else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">Paragraphe</option>
            <option value="h1">Titre 1</option>
            <option value="h2">Titre 2</option>
            <option value="h3">Titre 3</option>
          </select>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={(editor.getAttributes("textStyle").fontSize as string) || ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) (editor.chain().focus() as any).unsetFontSize().run();
              else (editor.chain().focus() as any).setFontSize(v).run();
            }}
          >
            <option value="">Taille</option>
            {["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px", "48px"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={(editor.getAttributes("textStyle").fontFamily as string) || ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(v).run();
            }}
          >
            <option value="">Police</option>
            <option value="Inter, sans-serif">Inter</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="Times New Roman, serif">Times</option>
            <option value="Courier New, monospace">Courier</option>
            <option value="Arial, sans-serif">Arial</option>
          </select>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><UnderlineIcon className="h-4 w-4" /></ToolbarBtn>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered className="h-4 w-4" /></ToolbarBtn>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}><AlignLeft className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}><AlignCenter className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}><AlignRight className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })}><AlignJustify className="h-4 w-4" /></ToolbarBtn>
          <div className="ml-auto flex gap-1">
            <ToolbarBtn onClick={() => editor.chain().focus().undo().run()}><Undo className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().redo().run()}><Redo className="h-4 w-4" /></ToolbarBtn>
          </div>
        </div>

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
