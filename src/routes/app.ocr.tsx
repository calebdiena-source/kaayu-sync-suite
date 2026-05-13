import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ScanLine,
  Sparkles,
  Loader2,
  FileDown,
  Upload,
  FileText,
  FolderOpen,
  Save,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { uploadDocumentToDrive, driveAvailable } from "@/lib/drive.functions";

export const Route = createFileRoute("/app/ocr")({
  head: () => ({ meta: [{ title: "OCR & IA — Kaayu" }] }),
  component: OcrPage,
});

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function buildDocxBlob(title: string, content: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const paragraphs = content
    .split(/\n+/)
    .map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: title, bold: true })],
          }),
          ...paragraphs,
        ],
      },
    ],
  });
  return await Packer.toBlob(doc);
}

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      res(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function OcrPage() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanFileName, setScanFileName] = useState<string>("");
  const [savingDoc, setSavingDoc] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadDrive = useServerFn(uploadDocumentToDrive);
  const checkDrive = useServerFn(driveAvailable);

  const callAi = async (messages: any[]) => {
    const { data, error } = await supabase.functions.invoke("ai-chat", { body: { messages } });
    if (error) throw error;
    return (data?.reply as string) ?? "";
  };

  const handleScan = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 20 Mo).");
      return;
    }
    setScanning(true);
    setScanFileName(file.name);
    setSavedDocId(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const reply = await callAi([
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Tu es un OCR expert. Transcris fidèlement TOUT le texte visible dans ce document scanné (manuscrit ou imprimé) en français. Conserve les paragraphes, listes, titres et la structure. Renvoie uniquement le texte transcrit, sans commentaire.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ]);
      setText(reply);
      setResult(reply);
      toast.success("Document transcrit");
    } catch (e: any) {
      toast.error(e.message ?? "Échec de la transcription");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const process = async (mode: "ocr" | "rewrite" | "translate" | "summary") => {
    if (!text) return;
    setLoading(true);
    setSavedDocId(null);
    const prompts: Record<string, string> = {
      ocr: `Tu es un assistant OCR. Corrige et structure ce texte (issu d'écriture manuscrite ou OCR) en français, en respectant les paragraphes :\n\n${text}`,
      rewrite: `Réécris ce texte de manière professionnelle en français :\n\n${text}`,
      translate: `Traduis ce texte en anglais :\n\n${text}`,
      summary: `Résume ce texte en français avec les points clés :\n\n${text}`,
    };
    try {
      setResult(await callAi([{ role: "user", content: prompts[mode] }]));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const baseTitle = () =>
    (
      scanFileName.replace(/\.[^.]+$/, "") ||
      `Transcription IA ${new Date().toLocaleDateString("fr-FR")}`
    ).slice(0, 120);

  const saveAsDocument = async () => {
    if (!user || !result.trim()) return;
    setSavingDoc(true);
    try {
      const title = baseTitle();
      const filename = `${title}.docx`;
      const blob = await buildDocxBlob(title, result);
      const size = blob.size;

      // Try Google Drive first if connected, otherwise Supabase Storage.
      let drv = { available: false } as { available: boolean };
      try {
        drv = await checkDrive();
      } catch {
        /* ignore */
      }

      if (drv.available) {
        const dataB64 = await blobToB64(blob);
        const r = await uploadDrive({
          data: { name: filename, mimeType: DOCX_MIME, dataB64, folderId: null },
        });
        setSavedDocId(r.id);
        toast.success("Enregistré dans Documents (Google Drive)");
      } else {
        const path = `${user.id}/${Date.now()}-${filename}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, blob, { contentType: DOCX_MIME });
        if (upErr) throw upErr;
        const { data: docRow, error: dbErr } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            name: filename,
            storage_path: path,
            mime_type: DOCX_MIME,
            size_bytes: size,
            folder_id: null,
          })
          .select("id")
          .single();
        if (dbErr) throw dbErr;
        await supabase.from("document_versions").insert({
          document_id: docRow.id,
          version_number: 1,
          storage_path: path,
          size_bytes: size,
          mime_type: DOCX_MIME,
          created_by: user.id,
          comment: "Transcription IA",
        });
        setSavedDocId(docRow.id);
        toast.success("Enregistré dans Documents");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Échec de l'enregistrement");
    } finally {
      setSavingDoc(false);
    }
  };

  const exportDocx = async () => {
    if (!result) return;
    try {
      const blob = await buildDocxBlob(baseTitle(), result);
      downloadBlob(blob, `${baseTitle()}.docx`);
      toast.success("Fichier .docx téléchargé");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur export DOCX");
    }
  };

  const exportPdf = async () => {
    if (!result) return;
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(baseTitle(), 14, 18);
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(result, 180);
      doc.text(lines, 14, 28);
      doc.save(`${baseTitle()}.pdf`);
      toast.success("Fichier .pdf téléchargé");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur export PDF");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">OCR & Outils IA</h2>
        <p className="text-sm text-muted-foreground">
          Téléversez un document scanné ou collez du texte — l'IA le transcrit, le corrige, le
          traduit ou le résume.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ScanLine className="h-4 w-4 text-primary" />
          Téléverser un document scanné (image ou PDF)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={scanning}>
            {scanning ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {scanning ? "Transcription IA…" : "Choisir un fichier"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleScan(e.target.files)}
          />
          {scanFileName && (
            <span className="text-xs text-muted-foreground">
              <FileText className="mr-1 inline h-3.5 w-3.5" />
              {scanFileName}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          L'IA Gemini extrait fidèlement le texte (manuscrit ou imprimé). Vous pouvez ensuite
          l'enregistrer dans Documents ou l'exporter.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ScanLine className="h-4 w-4 text-primary" /> Texte source
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder="Collez ici du texte, ou téléversez un document scanné ci-dessus…"
            className="w-full rounded-md border bg-background p-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => process("ocr")} disabled={loading || !text}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Corriger / structurer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => process("rewrite")}
              disabled={loading || !text}
            >
              Réécrire pro
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => process("summary")}
              disabled={loading || !text}
            >
              Résumer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => process("translate")}
              disabled={loading || !text}
            >
              Traduire (EN)
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Résultat IA
          </div>
          {loading || scanning ? (
            <div className="flex min-h-[20rem] items-center gap-2 rounded-md border bg-background p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Traitement IA…
            </div>
          ) : result ? (
            <textarea
              value={result}
              onChange={(e) => {
                setResult(e.target.value);
                setSavedDocId(null);
              }}
              rows={14}
              className="w-full rounded-md border bg-background p-3 text-sm"
            />
          ) : (
            <div className="min-h-[20rem] rounded-md border bg-background p-3 text-sm text-muted-foreground">
              Le résultat apparaîtra ici.
            </div>
          )}

          {result && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={saveAsDocument} disabled={savingDoc}>
                  {savingDoc ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Enregistrer dans Documents (.docx)
                </Button>
                <Button size="sm" variant="outline" onClick={exportPdf}>
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  Exporter PDF
                </Button>
                <Button size="sm" variant="outline" onClick={exportDocx}>
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  Exporter DOCX
                </Button>
              </div>
              {savedDocId && (
                <div className="flex items-center gap-2 text-xs text-emerald-600">
                  <Check className="h-3.5 w-3.5" /> Enregistré dans Documents.
                  <Button asChild size="sm" variant="ghost" className="h-6 px-2">
                    <Link to="/app/documents">
                      <FolderOpen className="mr-1 h-3 w-3" />
                      Ouvrir Documents
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
