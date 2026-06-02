import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
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


export const Route = createFileRoute("/app/ocr")({
  head: () => ({ meta: [{ title: "OCR & IA — Kaayu" }] }),
  component: OcrPage,
});

const fileToDataUrl = (file: File | Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

async function pdfToImageDataUrls(file: File): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist");
  // Worker via CDN matching installed version
  const workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  const maxPages = Math.min(pdf.numPages, 10);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return out;
}

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
  const navigate = useNavigate();

  const callAi = async (messages: any[], model?: string) => {
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: { messages, model },
    });
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
      // PDF → images (Gemini ne lit pas les data:application/pdf via image_url)
      const imageUrls = file.type === "application/pdf"
        ? await pdfToImageDataUrls(file)
        : [await fileToDataUrl(file)];
      if (imageUrls.length === 0) throw new Error("Aucune page lisible");
      const reply = await callAi(
        [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Tu es un OCR expert. Transcris fidèlement TOUT le texte visible dans ce document scanné (manuscrit ou imprimé) en français. Conserve les paragraphes, listes, titres et la structure. Si plusieurs pages sont fournies, concatène-les dans l'ordre, séparées par une ligne vide. Renvoie uniquement le texte transcrit, sans commentaire.",
              },
              ...imageUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ],
          },
        ],
        "google/gemini-2.5-flash",
      );
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

  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const textToHtml = (txt: string) =>
    txt
      .split(/\n{2,}/)
      .map(
        (block) =>
          `<p>${escapeHtml(block).replace(/\n/g, "<br/>") || "&nbsp;"}</p>`,
      )
      .join("");

  const saveAsDocument = async () => {
    if (!user || !result.trim()) return;
    setSavingDoc(true);
    try {
      const title = baseTitle();
      const filename = `${title}.docx`;
      // Pré-remplit l'éditeur avec la transcription, qui se chargera ensuite
      // d'appliquer le header de taux et d'enregistrer le document .docx
      // via le pipeline standard (Supabase Storage + versions).
      const html = `<h1>${escapeHtml(title)}</h1>${textToHtml(result)}`;
      let seededOk = false;
      try {
        sessionStorage.setItem("kaayu:editor:initial", html);
        seededOk = true;
      } catch {
        /* quota / privacy mode — on retombera sur le fallback */
      }
      // Sauvegarde de secours: l'éditeur reconstruit le DOCX depuis ces
      // données si l'HTML prérempli est manquant (quota atteint, onglet
      // purgé par iOS, etc.).
      try {
        sessionStorage.setItem(
          "kaayu:editor:initial:fallback",
          JSON.stringify({ title, text: result }),
        );
      } catch {
        /* ignore */
      }
      if (!seededOk) {
        toast.message("Mode secours: la transcription sera restaurée dans l'éditeur");
      }
      setSavedDocId("pending");
      toast.success("Ouverture dans l'éditeur…");
      navigate({
        to: "/app/documents/editor/$id",
        params: { id: "new" },
        search: { name: filename },
      });
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
