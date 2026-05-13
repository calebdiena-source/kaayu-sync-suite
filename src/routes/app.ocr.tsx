import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ScanLine, Sparkles, Loader2, FileDown, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

function OcrPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanFileName, setScanFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

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

  const exportTxt = () => {
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "kaayu-export.txt"; a.click(); URL.revokeObjectURL(url);
  };

  const exportDocx = async () => {
    if (!result) return;
    try {
      const { Document, Packer, Paragraph, TextRun } = await import("docx");
      const paragraphs = result.split(/\n+/).map(
        (line) => new Paragraph({ children: [new TextRun(line)] })
      );
      const doc = new Document({ sections: [{ children: paragraphs }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcription-${Date.now()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Fichier .docx téléchargé");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur export DOCX");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">OCR & Outils IA</h2>
        <p className="text-sm text-muted-foreground">Téléversez un document scanné ou collez du texte — l'IA le transcrit, le corrige, le traduit ou le résume.</p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ScanLine className="h-4 w-4 text-primary" />
          Téléverser un document scanné (image ou PDF)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={scanning}>
            {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            {scanning ? "Transcription IA…" : "Choisir un fichier"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleScan(e.target.files)}
          />
          {scanFileName && <span className="text-xs text-muted-foreground"><FileText className="mr-1 inline h-3.5 w-3.5" />{scanFileName}</span>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">L'IA Gemini extrait fidèlement le texte (manuscrit ou imprimé) et le place dans la zone ci-dessous. Vous pouvez ensuite l'exporter en .docx.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4 text-primary" /> Texte source</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder="Collez ici du texte, ou téléversez un document scanné ci-dessus…" className="w-full rounded-md border bg-background p-3 text-sm" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => process("ocr")} disabled={loading || !text}><Sparkles className="mr-1.5 h-3.5 w-3.5" />Corriger / structurer</Button>
            <Button size="sm" variant="outline" onClick={() => process("rewrite")} disabled={loading || !text}>Réécrire pro</Button>
            <Button size="sm" variant="outline" onClick={() => process("summary")} disabled={loading || !text}>Résumer</Button>
            <Button size="sm" variant="outline" onClick={() => process("translate")} disabled={loading || !text}>Traduire (EN)</Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Résultat IA</div>
            {result && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportTxt}><FileDown className="mr-1.5 h-3.5 w-3.5" />.txt</Button>
                <Button size="sm" onClick={exportDocx}><FileDown className="mr-1.5 h-3.5 w-3.5" />.docx</Button>
              </div>
            )}
          </div>
          <div className="min-h-[20rem] whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
            {loading || scanning ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Traitement IA…</div>
            ) : (result || <span className="text-muted-foreground">Le résultat apparaîtra ici.</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
