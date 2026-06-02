import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Save,
  Download,
  History,
  Share2,
  RotateCcw,
  FileText,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ShareDocumentDialog } from "@/components/share-document-dialog";
import { exportTextToPDF } from "@/lib/exports";
import { RichTextEditor } from "@/components/rich-text-editor";
import mammoth from "mammoth/mammoth.browser";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { downloadDocumentFromDrive, deleteDocumentFromDrive, uploadDocumentToDrive } from "@/lib/drive.functions";
import { PdfEditor } from "@/components/pdf-editor";
import {
  buildRateHeaderHtml,
  buildRateHeaderText,
  fetchLatestRates,
  replaceRateHeaderHtml,
} from "@/lib/rate-header";

export const Route = createFileRoute("/app/documents/$id")({
  head: () => ({ meta: [{ title: "Document — Kaayu" }] }),
  component: DocumentPage,
});

type Doc = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  user_id: string;
  size_bytes: number | null;
  created_at: string;
  storage_provider?: string | null;
  google_file_id?: string | null;
};
type Version = {
  id: string;
  version_number: number;
  storage_path: string;
  created_at: string;
  comment: string | null;
  size_bytes: number | null;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXTUAL = ["text/html", "text/plain", "text/markdown"];

function isDocx(d: Doc) {
  return d.mime_type === DOCX_MIME || /\.docx$/i.test(d.name);
}
function isPdf(d: Doc) {
  return d.mime_type === "application/pdf" || /\.pdf$/i.test(d.name);
}
function isTextualDoc(d: Doc) {
  return TEXTUAL.includes(d.mime_type ?? "") || /\.(html|txt|md)$/i.test(d.name);

}

function htmlToText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

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
        paragraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text, bold: true })],
          }),
        );
        break;
      case "h2":
        paragraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text, bold: true })],
          }),
        );
        break;
      case "h3":
        paragraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text, bold: true })],
          }),
        );
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
  const [html, setHtml] = useState<string>("<p></p>");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [pdfEditing, setPdfEditing] = useState(false);

  const downloadDrive = useServerFn(downloadDocumentFromDrive);
  const deleteDrive = useServerFn(deleteDocumentFromDrive);
  const uploadDrive = useServerFn(uploadDocumentToDrive);

  const editable = !!doc && !isPdf(doc) && (isTextualDoc(doc) || isDocx(doc));
  const pdf = !!doc && isPdf(doc);

  const loadVersions = useCallback(async () => {
    const { data } = await supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", id)
      .order("version_number", { ascending: false });
    setVersions(data ?? []);
  }, [id]);

  useEffect(() => {
    if (!user) return;
    let revokeUrl: string | null = null;
    (async () => {
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
      setDoc(d);
      setCanEdit(d.user_id === user.id);

      if (isPdf(d)) {
        try {
          let blob: Blob | null = null;
          if (d.storage_provider === "drive") {
            const r = await downloadDrive({ data: { documentId: d.id } });
            const bin = atob(r.dataB64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            blob = new Blob([bytes], { type: "application/pdf" });
          } else {
            const { data: b } = await supabase.storage
              .from("documents")
              .download(d.storage_path);
            if (b) blob = new Blob([await b.arrayBuffer()], { type: "application/pdf" });
          }
          if (blob) {
            const buf = new Uint8Array(await blob.arrayBuffer());
            setPdfBytes(buf);
            const url = URL.createObjectURL(blob);
            revokeUrl = url;
            setPdfUrl(url);
          } else {
            setPdfError(true);
          }
        } catch {
          setPdfError(true);
        }
        setLoaded(true);
        loadVersions();
        return;
      }

      const { data: blob } = await supabase.storage.from("documents").download(d.storage_path);
      if (blob) {
        if (isDocx(d)) {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const { value } = await mammoth.convertToHtml({ arrayBuffer });
            setHtml(value || "<p></p>");
          } catch (e: any) {
            toast.error("Impossible de lire le .docx: " + e.message);
          }
        } else if (isTextualDoc(d)) {
          const text = await blob.text();
          const hasHeader = /data-rate-header="1"/.test(text);
          setHtml(
            hasHeader ? text : buildRateHeaderHtml(await fetchLatestRates()) + (text || "<p></p>"),
          );
        }
      }
      setLoaded(true);
      loadVersions();
    })();
    return () => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [user?.id, id, navigate, loadVersions, downloadDrive]);

  const downloadPdf = async () => {
    if (!doc) return;
    try {
      if (doc.storage_provider === "drive") {
        const r = await downloadDrive({ data: { documentId: doc.id } });
        const bin = atob(r.dataB64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: r.mimeType }));
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.name;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 60);
        if (error) throw error;
        window.open(data.signedUrl, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Téléchargement impossible");
    }
  };

  const removePdf = async () => {
    if (!doc) return;
    if (!confirm(`Supprimer "${doc.name}" ?`)) return;
    try {
      if (doc.storage_provider === "drive" && doc.google_file_id) {
        await deleteDrive({ data: { fileId: doc.google_file_id } });
      } else {
        await supabase.storage.from("documents").remove([doc.storage_path]);
      }
      await supabase.from("documents").delete().eq("id", doc.id);
      toast.success("Supprimé");
      navigate({ to: "/app/documents" });
    } catch (e: any) {
      toast.error(e.message);
    }
  };


  const save = async () => {
    if (!doc || !user) return;
    setSaving(true);
    try {
      const nextVersion = (versions[0]?.version_number ?? 0) + 1;
      const ext = isDocx(doc) ? "docx" : (doc.name.match(/\.([^.]+)$/)?.[1] ?? "html");
      const versionPath = `${user.id}/versions/${doc.id}-v${nextVersion}-${Date.now()}.${ext}`;
      const { data: currentBlob } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);
      if (currentBlob) {
        await supabase.storage.from("documents").upload(versionPath, currentBlob);
        await supabase.from("document_versions").insert({
          document_id: doc.id,
          version_number: nextVersion,
          storage_path: versionPath,
          size_bytes: currentBlob.size,
          mime_type: doc.mime_type,
          created_by: user.id,
          comment: "Avant modification",
        });
      }
      // Refresh rate-of-the-day header at the very top before persisting
      const rates = await fetchLatestRates();
      const now = new Date();
      const headerText = buildRateHeaderText(rates, now);
      const htmlWithHeader = replaceRateHeaderHtml(html, rates, now);
      setHtml(htmlWithHeader);
      let blob: Blob;
      let mime: string;
      if (isDocx(doc)) {
        blob = await htmlToDocxBlob(doc.name.replace(/\.docx$/i, ""), htmlWithHeader);
        mime = DOCX_MIME;
      } else {
        blob = new Blob([htmlWithHeader], { type: "text/html" });
        mime = "text/html";
      }
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(doc.storage_path, blob, { upsert: true, contentType: mime });
      if (upErr) throw upErr;
      await supabase
        .from("documents")
        .update({ size_bytes: blob.size, mime_type: mime })
        .eq("id", doc.id);
      // Stamp the new live version with its rate header so monthly reports can compare
      await supabase.from("document_versions").insert({
        document_id: doc.id,
        version_number: nextVersion + 1,
        storage_path: doc.storage_path,
        size_bytes: blob.size,
        mime_type: mime,
        created_by: user.id,
        comment: headerText,
      });
      toast.success("Document enregistré");
      loadVersions();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadDocx = async () => {
    if (!doc) return;
    const baseName = doc.name.replace(/\.[^.]+$/, "");
    const blob = await htmlToDocxBlob(baseName, html);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadVersion = async (v: Version) => {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(v.storage_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const restoreVersion = async (v: Version) => {
    if (!doc) return;
    if (!confirm(`Restaurer la version ${v.version_number} ?`)) return;
    const { data: blob } = await supabase.storage.from("documents").download(v.storage_path);
    if (!blob) return toast.error("Version introuvable");
    if (/\.docx$/i.test(v.storage_path)) {
      const arrayBuffer = await blob.arrayBuffer();
      const { value } = await mammoth.convertToHtml({ arrayBuffer });
      setHtml(value || "<p></p>");
    } else {
      setHtml(await blob.text());
    }
    toast.success("Version restaurée — n'oubliez pas d'enregistrer");
    setTab("edit");
  };

  if (!loaded || !doc) return <div className="text-muted-foreground">Chargement…</div>;

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
          <h2 className="text-lg font-semibold">{doc.name}</h2>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {pdf && (
            <>
              <Button variant="outline" size="sm" onClick={downloadPdf}>
                <Download className="mr-1 h-4 w-4" />
                Télécharger
              </Button>
              {canEdit && !pdfError && pdfBytes && (
                <Button
                  variant={pdfEditing ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPdfEditing((v) => !v)}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  {pdfEditing ? "Aperçu" : "Modifier le PDF"}
                </Button>
              )}
            </>
          )}
          {editable && canEdit && (
            <Button onClick={save} disabled={saving} size="sm">
              <Save className="mr-1 h-4 w-4" />
              {saving ? "…" : "Enregistrer"}
            </Button>
          )}
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={downloadDocx}>
                <Download className="mr-1 h-4 w-4" />
                DOCX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportTextToPDF(
                    `${doc.name.replace(/\.[^.]+$/, "")}.pdf`,
                    doc.name,
                    htmlToText(html),
                  )
                }
              >
                <Download className="mr-1 h-4 w-4" />
                PDF
              </Button>
            </>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="mr-1 h-4 w-4" />
              Partager
            </Button>
          )}
          {pdf && canEdit && (
            <Button variant="outline" size="sm" onClick={removePdf}>
              <Trash2 className="mr-1 h-4 w-4" />
              Supprimer
            </Button>
          )}
        </div>

      </div>

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("edit")}
          className={`px-4 py-2 text-sm ${tab === "edit" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
        >
          {editable ? "Édition" : "Aperçu"}
        </button>
        <button
          onClick={() => setTab("versions")}
          className={`px-4 py-2 text-sm ${tab === "versions" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
        >
          <History className="mr-1 inline h-4 w-4" />
          Versions ({versions.length})
        </button>
      </div>

      {tab === "edit" && (
        <div className="overflow-hidden rounded-xl border bg-card">
          {pdf ? (
            pdfError || !pdfUrl ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {pdfError
                  ? "Impossible d’afficher ce PDF. Veuillez le télécharger ou réessayer."
                  : "Chargement du PDF…"}
                {pdfError && (
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={downloadPdf}>
                      <Download className="mr-1 h-4 w-4" />
                      Télécharger
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <iframe
                src={pdfUrl}
                title={doc.name}
                className="h-[80vh] w-full"
                style={{ border: 0 }}
              />
            )
          ) : editable ? (
            <RichTextEditor
              value={html}
              onChange={setHtml}
              editable={canEdit}
              placeholder="Commencez à écrire votre document…"
            />
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aperçu non disponible pour ce type de fichier ({doc.mime_type ?? "inconnu"}).
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const { data } = await supabase.storage
                      .from("documents")
                      .createSignedUrl(doc.storage_path, 60);
                    if (data) window.open(data.signedUrl, "_blank");
                  }}
                >
                  <Download className="mr-1 h-4 w-4" />
                  Télécharger
                </Button>
              </div>
            </div>
          )}
        </div>
      )}


      {tab === "versions" && (
        <div className="rounded-xl border bg-card">
          {versions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune version antérieure.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Commentaire</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-3 py-2 font-mono">v{v.version_number}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(v.created_at).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{v.comment ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => downloadVersion(v)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {canEdit && editable && (
                        <Button size="sm" variant="ghost" onClick={() => restoreVersion(v)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
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
