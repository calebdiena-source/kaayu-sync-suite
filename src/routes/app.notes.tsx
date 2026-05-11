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
import { exportTextToDOCX, exportTextToPDF } from "@/lib/exports";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export const Route = createFileRoute("/app/notes")({
  head: () => ({ meta: [{ title: "Prise de notes — Kaayu" }] }),
  component: NotesPage,
});

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

  const paragraphs = () => (editor?.getText() ?? "").split("\n").filter(Boolean);

  const saveToCloud = async () => {
    if (!editor || !user) return;
    setSaving(true);
    try {
    const name = `${title || "Note"}.docx`;
      const path = `${user.id}/${Date.now()}-${name}`;
      const docx = new Document({
        sections: [{
          children: [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title || "Note", bold: true })] }),
            ...paragraphs().map((p) => new Paragraph({ children: [new TextRun(p)] })),
          ],
        }],
      });
      const blob = await Packer.toBlob(docx);
      const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const { error: upErr } = await supabase.storage.from("documents").upload(path, blob, { contentType: mime });
      if (upErr) throw upErr;
      const { data, error } = await supabase.from("documents").insert({
        user_id: user.id, name, storage_path: path, mime_type: mime, size_bytes: blob.size,
      }).select().single();
      if (error) throw error;
      toast.success("Note enregistrée dans Documents");
      navigate({ to: "/app/documents/$id", params: { id: data.id } });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const downloadDocx = async () => {
    await exportTextToDOCX(`${title || "Note"}.docx`, title || "Note", paragraphs());
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
        <p className="text-sm text-muted-foreground">Tapez directement, puis enregistrez en Word (DOCX), PDF ou dans vos documents.</p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la note" className="max-w-sm" />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={saveToCloud} disabled={saving}>
              <Save className="mr-1 h-4 w-4" />{saving ? "…" : "Enregistrer"}
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
