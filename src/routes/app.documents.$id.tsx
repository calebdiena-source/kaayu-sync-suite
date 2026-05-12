import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Download, History, Share2, RotateCcw, FileText, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Type, Palette } from "lucide-react";
import { toast } from "sonner";
import { ShareDocumentDialog } from "@/components/share-document-dialog";
import { exportTextToPDF } from "@/lib/exports";
import mammoth from "mammoth/mammoth.browser";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export const Route = createFileRoute("/app/documents/$id")({
  head: () => ({ meta: [{ title: "Document — Kaayu" }] }),
  component: DocumentPage,
});

type Doc = { id: string; name: string; storage_path: string; mime_type: string | null; user_id: string; size_bytes: number | null; created_at: string };
type Version = { id: string; version_number: number; storage_path: string; created_at: string; comment: string | null; size_bytes: number | null };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXTUAL = ["text/html", "text/plain", "text/markdown"];

function isDocx(d: Doc) {
  return d.mime_type === DOCX_MIME || /\.docx$/i.test(d.name);
}
function isTextualDoc(d: Doc) {
  return TEXTUAL.includes(d.mime_type ?? "") || /\.(html|txt|md)$/i.test(d.name);
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
    if (!text.trim() && tag !== "br") { node.childNodes.forEach(walk); return; }
    switch (tag) {
      case "h1": paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] })); break;
      case "h2": paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] })); break;
      case "h3": paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true })] })); break;
      case "li": paragraphs.push(new Paragraph({ text, bullet: { level: 0 } })); break;
      case "ul": case "ol": node.childNodes.forEach(walk); break;
      case "p": case "div": case "blockquote": paragraphs.push(new Paragraph({ children: [new TextRun(text)] })); break;
      case "br": paragraphs.push(new Paragraph({ children: [] })); break;
      default: node.childNodes.forEach(walk);
    }
  };
  container.childNodes.forEach(walk);
  const docx = new Document({ sections: [{ children: paragraphs }] });
  return await Packer.toBlob(docx);
}

function DocumentPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [tab, setTab] = useState<"edit" | "versions">("edit");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: { attributes: { class: "prose prose-sm max-w-none min-h-[400px] focus:outline-none p-4" } },
  });

  const editable = !!doc && (isTextualDoc(doc) || isDocx(doc));

  const loadVersions = useCallback(async () => {
    const { data } = await supabase.from("document_versions").select("*").eq("document_id", id).order("version_number", { ascending: false });
    setVersions(data ?? []);
  }, [id]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: d, error } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
      if (error || !d) { toast.error("Document introuvable"); navigate({ to: "/app/documents" }); return; }
      setDoc(d);
      setCanEdit(d.user_id === user.id);
      const { data: blob } = await supabase.storage.from("documents").download(d.storage_path);
      if (blob) {
        if (isDocx(d)) {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const { value } = await mammoth.convertToHtml({ arrayBuffer });
            editor?.commands.setContent(value || "<p></p>");
          } catch (e: any) {
            toast.error("Impossible de lire le .docx: " + e.message);
          }
        } else if (isTextualDoc(d)) {
          const text = await blob.text();
          editor?.commands.setContent(text || "<p></p>");
        }
      }
      setLoaded(true);
      loadVersions();
    })();
  }, [user?.id, id, editor, navigate, loadVersions]);

  const save = async () => {
    if (!doc || !editor || !user) return;
    setSaving(true);
    try {
      const nextVersion = (versions[0]?.version_number ?? 0) + 1;
      const ext = isDocx(doc) ? "docx" : (doc.name.match(/\.([^.]+)$/)?.[1] ?? "html");
      const versionPath = `${user.id}/versions/${doc.id}-v${nextVersion}-${Date.now()}.${ext}`;
      const { data: currentBlob } = await supabase.storage.from("documents").download(doc.storage_path);
      if (currentBlob) {
        await supabase.storage.from("documents").upload(versionPath, currentBlob);
        await supabase.from("document_versions").insert({
          document_id: doc.id, version_number: nextVersion, storage_path: versionPath,
          size_bytes: currentBlob.size, mime_type: doc.mime_type, created_by: user.id, comment: "Avant modification",
        });
      }
      const html = editor.getHTML();
      let blob: Blob; let mime: string;
      if (isDocx(doc)) {
        blob = await htmlToDocxBlob(doc.name.replace(/\.docx$/i, ""), html);
        mime = DOCX_MIME;
      } else {
        blob = new Blob([html], { type: "text/html" });
        mime = "text/html";
      }
      const { error: upErr } = await supabase.storage.from("documents").upload(doc.storage_path, blob, { upsert: true, contentType: mime });
      if (upErr) throw upErr;
      await supabase.from("documents").update({ size_bytes: blob.size, mime_type: mime }).eq("id", doc.id);
      toast.success("Document enregistré");
      loadVersions();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const downloadDocx = async () => {
    if (!doc || !editor) return;
    const baseName = doc.name.replace(/\.[^.]+$/, "");
    const blob = await htmlToDocxBlob(baseName, editor.getHTML());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${baseName}.docx`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadVersion = async (v: Version) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(v.storage_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const restoreVersion = async (v: Version) => {
    if (!doc || !editor) return;
    if (!confirm(`Restaurer la version ${v.version_number} ?`)) return;
    const { data: blob } = await supabase.storage.from("documents").download(v.storage_path);
    if (!blob) return toast.error("Version introuvable");
    if (/\.docx$/i.test(v.storage_path)) {
      const arrayBuffer = await blob.arrayBuffer();
      const { value } = await mammoth.convertToHtml({ arrayBuffer });
      editor.commands.setContent(value || "<p></p>");
    } else {
      const text = await blob.text();
      editor.commands.setContent(text);
    }
    toast.success("Version restaurée — n'oubliez pas d'enregistrer");
    setTab("edit");
  };

  if (!loaded || !doc) return <div className="text-muted-foreground">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/app/documents"><ArrowLeft className="mr-1 h-4 w-4" />Retour</Link></Button>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{doc.name}</h2>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {editable && canEdit && (
            <Button onClick={save} disabled={saving} size="sm"><Save className="mr-1 h-4 w-4" />{saving ? "…" : "Enregistrer"}</Button>
          )}
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={downloadDocx}>
                <Download className="mr-1 h-4 w-4" />DOCX
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportTextToPDF(`${doc.name.replace(/\.[^.]+$/, "")}.pdf`, doc.name, editor?.getText() ?? "")}>
                <Download className="mr-1 h-4 w-4" />PDF
              </Button>
            </>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}><Share2 className="mr-1 h-4 w-4" />Partager</Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b">
        <button onClick={() => setTab("edit")} className={`px-4 py-2 text-sm ${tab === "edit" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>
          {editable ? "Édition" : "Aperçu"}
        </button>
        <button onClick={() => setTab("versions")} className={`px-4 py-2 text-sm ${tab === "versions" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>
          <History className="mr-1 inline h-4 w-4" />Versions ({versions.length})
        </button>
      </div>

      {tab === "edit" && (
        <div className="rounded-xl border bg-card">
          {editable ? (
            <>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-1 border-b p-2">
                  <Button size="sm" variant={editor?.isActive("bold") ? "secondary" : "ghost"} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Button>
                  <Button size="sm" variant={editor?.isActive("italic") ? "secondary" : "ghost"} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Button>
                  <div className="mx-1 h-5 w-px bg-border" />
                  <Button size="sm" variant={editor?.isActive("bulletList") ? "secondary" : "ghost"} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Button>
                  <Button size="sm" variant={editor?.isActive("orderedList") ? "secondary" : "ghost"} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Button>
                  <div className="mx-1 h-5 w-px bg-border" />
                  <Button size="sm" variant={editor?.isActive("heading", { level: 1 }) ? "secondary" : "ghost"} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Button>
                  <Button size="sm" variant={editor?.isActive("heading", { level: 2 }) ? "secondary" : "ghost"} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button>
                </div>
              )}
              <EditorContent editor={editor} />
            </>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aperçu non disponible pour ce type de fichier ({doc.mime_type ?? "inconnu"}).
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={async () => {
                  const { data } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60);
                  if (data) window.open(data.signedUrl, "_blank");
                }}><Download className="mr-1 h-4 w-4" />Télécharger</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "versions" && (
        <div className="rounded-xl border bg-card">
          {versions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucune version antérieure.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Version</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Commentaire</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-3 py-2 font-mono">v{v.version_number}</td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(v.created_at).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.comment ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => downloadVersion(v)}><Download className="h-4 w-4" /></Button>
                      {canEdit && editable && (
                        <Button size="sm" variant="ghost" onClick={() => restoreVersion(v)}><RotateCcw className="h-4 w-4" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ShareDocumentDialog open={shareOpen} onOpenChange={setShareOpen} documentId={doc.id} />
    </div>
  );
}
