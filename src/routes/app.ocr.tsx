import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ScanLine, Sparkles, Loader2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ocr")({
  head: () => ({ meta: [{ title: "OCR & IA — Kaayu" }] }),
  component: OcrPage,
});

function OcrPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

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
      const { data, error } = await supabase.functions.invoke("ai-chat", { body: { messages: [{ role: "user", content: prompts[mode] }] } });
      if (error) throw error;
      setResult(data.reply);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const exportTxt = () => {
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "kaayu-export.txt"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-semibold tracking-tight">OCR & Outils IA</h2><p className="text-sm text-muted-foreground">Convertir, corriger, traduire et résumer du texte avec l'IA</p></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4 text-primary" /> Texte source</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder="Collez ici le texte issu d'OCR, d'une image, d'un document manuscrit…" className="w-full rounded-md border bg-background p-3 text-sm" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => process("ocr")} disabled={loading}><Sparkles className="mr-1.5 h-3.5 w-3.5" />Corriger / structurer</Button>
            <Button size="sm" variant="outline" onClick={() => process("rewrite")} disabled={loading}>Réécrire pro</Button>
            <Button size="sm" variant="outline" onClick={() => process("summary")} disabled={loading}>Résumer</Button>
            <Button size="sm" variant="outline" onClick={() => process("translate")} disabled={loading}>Traduire (EN)</Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Résultat IA</div>
            {result && <Button size="sm" variant="outline" onClick={exportTxt}><FileDown className="mr-1.5 h-3.5 w-3.5" />Exporter</Button>}
          </div>
          <div className="min-h-[20rem] whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
            {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Traitement IA…</div> : (result || <span className="text-muted-foreground">Le résultat apparaîtra ici.</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
