import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Download, Bold, Italic, List, ListOrdered, Heading1, Heading2, Undo, Redo, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { exportTextToPDF } from "@/lib/exports";
import HTMLtoDOCX from "html-to-docx-buffer";

export const Route = createFileRoute("/app/notes")({
  head: () => ({ meta: [{ title: "Prise de notes — Kaayu" }] }),
  component: NotesPage,
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function htmlToDocxBlob(title: string, html: string): Promise<Blob> {
  const wrapped = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>${html}</body></html>`;
  const result: any = await HTMLtoDOCX(wrapped, null, { table: { row: { cantSplit: true } } });
  return result instanceof Blob ? result : new Blob([result], { type: DOCX_MIME });
}

function NotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("Nouvelle note");
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Commencez à écrire votre note ici…</p>",
    editorProps: { attributes: { class: "prose prose-sm dark:prose-invert max-w-none min-h-[60vh] focus:outline-none p-4" } },
  });

  const saveToCloud = async () => {
    if (!editor || !user) return;
    setSaving(true);
    try {
      const safeTitle = (title || "Note").trim();
      const name = `${safeTitle}.docx`;
      const path = `${user.id}/${Date.now()}-${name}`;
      const blob = await htmlToDocxBlob(safeTitle, editor.getHTML());
      const { error: upErr } = await supabase.storage.from("documents").upload(path, blob, { contentType: DOCX_MIME });
      if (upErr) throw upErr;
      const { data, error } = await supabase.from("documents").insert({
        user_id: user.id, name, storage_path: path, mime_type: DOCX_MIME, size_bytes: blob.size,
      }).select().single();
      if (error) throw error;
      toast.success("Note enregistrée en .docx dans Documents");
      navigate({ to: "/app/documents/$id", params: { id: data.id } });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const downloadDocx = async () => {
    if (!editor) return;
    const safeTitle = (title || "Note").trim();
    const blob = await htmlToDocxBlob(safeTitle, editor.getHTML());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${safeTitle}.docx`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    exportTextToPDF(`${title || "Note"}.pdf`, title || "Note", editor?.getText() ?? "");
  };

  if (!editor) return null;

  const ToolbarBtn = ({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className={`rounded-md p-2 text-sm hover:bg-accent ${active ? "bg-accent text-accent-foreground" : ""}`}>
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NotebookPen className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">Prise de notes</h2>
        <p className="text-sm text-muted-foreground">Tapez directement, puis enregistrez en Word (.docx). Vous pourrez rouvrir et modifier le document dans l'application.</p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la note" className="max-w-sm" />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={saveToCloud} disabled={saving}>
              <Save className="mr-1 h-4 w-4" />{saving ? "…" : "Enregistrer (.docx)"}
            </Button>
            <Button size="sm" variant="outline" onClick={downloadDocx}>
              <Download className="mr-1 h-4 w-4" />Word (DOCX)
            </Button>
            <Button size="sm" variant="outline" onClick={downloadPdf}>
              <Download className="mr-1 h-4 w-4" />PDF
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b bg-muted/30 p-2">
          <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}><Heading1 className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}><Heading2 className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List className="h-4 w-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered className="h-4 w-4" /></ToolbarBtn>
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
