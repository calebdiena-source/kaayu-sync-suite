import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, FileText } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import {
  buildRateHeaderHtml,
  buildRateHeaderText,
  fetchLatestRates,
  replaceRateHeaderHtml,
} from "@/lib/rate-header";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type SearchParams = { name?: string };

export const Route = createFileRoute("/app/documents/editor/$id")({
  head: () => ({ meta: [{ title: "Éditeur — Kaayu" }] }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    name: typeof s.name === "string" ? s.name : undefined,
  }),
  component: DocumentEditor,
});

async function htmlToDocxBlob(title: string, html: string): Promise<Blob> {
  const container = document.createElement("div");
  container.innerHTML = html;
  const paragraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title, bold: true })],
    }),
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
    if (!text.trim() && tag !== "br") {
      node.childNodes.forEach(walk);
      return;
    }
    switch (tag) {
      case "h1":
        paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] }));
        break;
      case "h2":
        paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] }));
        break;
      case "h3":
        paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true })] }));
        break;
      case "li":
        paragraphs.push(new Paragraph({ text, bullet: { level: 0 } }));
        break;
      case "ul":
      case "ol":
        node.childNodes.forEach(walk);
        break;
      case "p":
      case "div":
      case "blockquote":
        paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
        break;
      case "br":
        paragraphs.push(new Paragraph({ children: [] }));
        break;
      default:
        node.childNodes.forEach(walk);
    }
  };
  container.childNodes.forEach(walk);
  const docx = new Document({ sections: [{ children: paragraphs }] });
  return await Packer.toBlob(docx);
}

function DocumentEditor() {
  const { id } = Route.useParams();
  const { name: nameParam } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isNew = id === "new";
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docId, setDocId] = useState<string | null>(isNew ? null : id);
  const [docName, setDocName] = useState<string>(() => {
    const raw = (nameParam || "Nouvelle note").trim();
    return /\.docx$/i.test(raw) ? raw : `${raw}.docx`;
  });
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [html, setHtml] = useState<string>("<p></p>");

  // Initial load
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        if (isNew) {
          const rates = await fetchLatestRates();
          setHtml(buildRateHeaderHtml(rates) + "<p></p>");
          setLoaded(true);
          return;
        }
        const { data: d, error } = await supabase
          .from("documents")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error || !d) {
          toast.error("Document introuvable");
          navigate({ to: "/app/documents" });
          return;
        }
        setDocName(d.name);
        setStoragePath(d.storage_path);
        setCanEdit(d.user_id === user.id);
        const { data: blob } = await supabase.storage
          .from("documents")
          .download(d.storage_path);
        if (blob) {
          const isDocx =
            d.mime_type === DOCX_MIME || /\.docx$/i.test(d.name);
          if (isDocx) {
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const mammoth = (await import("mammoth/mammoth.browser")).default;
              const { value } = await mammoth.convertToHtml({ arrayBuffer });
              setHtml(value || "<p></p>");
            } catch (e: any) {
              toast.error("Lecture .docx impossible: " + e.message);
              setHtml("<p></p>");
            }
          } else {
            const text = await blob.text();
            setHtml(text || "<p></p>");
          }
        }
        setLoaded(true);
      } catch (e: any) {
        toast.error(e.message ?? "Erreur de chargement");
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const rates = await fetchLatestRates();
      const now = new Date();
      const headerText = buildRateHeaderText(rates, now);
      const htmlWithHeader = replaceRateHeaderHtml(html, rates, now);
      setHtml(htmlWithHeader);
      const baseName = docName.replace(/\.docx$/i, "");
      const blob = await htmlToDocxBlob(baseName, htmlWithHeader);

      if (isNew || !docId) {
        const path = `${user.id}/${Date.now()}-${docName}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, blob, { contentType: DOCX_MIME });
        if (upErr) throw upErr;
        const { data, error } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            name: docName,
            storage_path: path,
            mime_type: DOCX_MIME,
            size_bytes: blob.size,
            folder_id: null,
          })
          .select()
          .single();
        if (error) throw error;
        await supabase.from("document_versions").insert({
          document_id: data.id,
          version_number: 1,
          storage_path: path,
          size_bytes: blob.size,
          mime_type: DOCX_MIME,
          created_by: user.id,
          comment: headerText,
        });
        setDocId(data.id);
        setStoragePath(path);
        toast.success("Note enregistrée");
        navigate({
          to: "/app/documents/editor/$id",
          params: { id: data.id },
          replace: true,
        });
      } else {
        const path = storagePath!;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, blob, { upsert: true, contentType: DOCX_MIME });
        if (upErr) throw upErr;
        await supabase
          .from("documents")
          .update({ size_bytes: blob.size, mime_type: DOCX_MIME })
          .eq("id", docId);
        const { data: vs } = await supabase
          .from("document_versions")
          .select("version_number")
          .eq("document_id", docId)
          .order("version_number", { ascending: false })
          .limit(1);
        const next = (vs?.[0]?.version_number ?? 0) + 1;
        await supabase.from("document_versions").insert({
          document_id: docId,
          version_number: next,
          storage_path: path,
          size_bytes: blob.size,
          mime_type: DOCX_MIME,
          created_by: user.id,
          comment: headerText,
        });
        toast.success("Document enregistré");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <div className="text-muted-foreground">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/documents">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Retour
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{docName}</h2>
        </div>
        <div className="ml-auto">
          {canEdit && (
            <Button onClick={save} disabled={saving} size="sm">
              <Save className="mr-1 h-4 w-4" />
              {saving ? "…" : "Enregistrer"}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <RichTextEditor
          value={html}
          onChange={setHtml}
          editable={canEdit}
          placeholder="Commencez à écrire votre document…"
        />
      </div>
    </div>
  );
}
