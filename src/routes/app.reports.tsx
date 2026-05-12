import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileBarChart, Loader2, Download, Sparkles, History, Trash2 } from "lucide-react";
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from "docx";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Rapports mensuels — Kaayu" }] }),
  component: ReportsPage,
});

type Stats = {
  documents: { count: number; totalSize: number; byCategory: Record<string, number> };
  versions: { count: number };
  rates: {
    usd_to_fc: RateStat | null;
    eur_to_usd: RateStat | null;
    chf_to_usd: RateStat | null;
    timeline: Array<{ rate_date: string; usd_to_fc: number | null; eur_to_usd: number | null; chf_to_usd: number | null }>;
  };
  tasks: { count: number; byStatus: Record<string, number> };
  meetings: { count: number };
};
type RateStat = { first: number; last: number; min: number; max: number; avg: number; variation: number; count: number };
type Report = {
  executive_summary: string;
  key_points: string[];
  rate_analysis: string;
  activity_analysis: string;
  recommendations: string[];
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtBytes(n: number) {
  if (!n) return "0 o";
  const u = ["o", "Ko", "Mo", "Go"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

function ReportsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }, [month]);

  const generate = async () => {
    setLoading(true);
    setReport(null);
    setStats(null);
    try {
      const { data, error } = await supabase.functions.invoke("monthly-report", { body: { month } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStats(data.stats);
      setReport(data.report);
      toast.success("Rapport généré");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Échec de la génération");
    } finally {
      setLoading(false);
    }
  };

  const exportDocx = async () => {
    if (!report || !stats) return;
    const para = (text: string, opts: any = {}) => new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } });
    const heading = (text: string, level: any = HeadingLevel.HEADING_1) => new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });

    const rateRow = (label: string, s: RateStat | null) => new TableRow({
      children: [
        new TableCell({ children: [para(label, { bold: true })] }),
        new TableCell({ children: [para(s ? s.first.toFixed(6) : "—")] }),
        new TableCell({ children: [para(s ? s.last.toFixed(6) : "—")] }),
        new TableCell({ children: [para(s ? `${s.variation.toFixed(2)} %` : "—")] }),
        new TableCell({ children: [para(s ? s.avg.toFixed(6) : "—")] }),
      ],
    });

    const ratesTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: ["Devise", "Début", "Fin", "Variation", "Moyenne"].map(t => new TableCell({ children: [para(t, { bold: true })] })) }),
        rateRow("USD → FC", stats.rates.usd_to_fc),
        rateRow("EUR → USD", stats.rates.eur_to_usd),
        rateRow("CHF → USD", stats.rates.chf_to_usd),
      ],
    });

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: `Rapport mensuel — ${monthLabel}`, heading: HeadingLevel.TITLE }),
          para(`Généré le ${new Date().toLocaleString("fr-FR")} · Kaayu Workspace`),
          heading("Synthèse exécutive"),
          para(report.executive_summary),
          heading("Points clés"),
          ...report.key_points.map(p => new Paragraph({ text: p, bullet: { level: 0 } })),
          heading("Analyse des taux de change"),
          para(report.rate_analysis),
          ratesTable,
          heading("Analyse de l'activité"),
          para(report.activity_analysis),
          heading("Indicateurs"),
          para(`Documents créés : ${stats.documents.count} (${fmtBytes(stats.documents.totalSize)})`),
          para(`Nouvelles versions : ${stats.versions.count}`),
          para(`Tâches : ${stats.tasks.count}`),
          para(`Réunions : ${stats.meetings.count}`),
          heading("Recommandations"),
          ...report.recommendations.map(p => new Paragraph({ text: p, bullet: { level: 0 } })),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-kaayu-${month}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export .docx téléchargé");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><FileBarChart className="h-6 w-6 text-primary" /> Rapports mensuels IA</h1>
          <p className="text-sm text-muted-foreground">Synthèse intelligente de votre activité et de l'évolution des taux.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mois</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
          </div>
          <Button onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Générer
          </Button>
          {report && (
            <Button variant="outline" onClick={exportDocx}>
              <Download className="mr-2 h-4 w-4" /> .docx
            </Button>
          )}
        </div>
      </div>

      {!report && !loading && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Sélectionnez un mois et cliquez sur « Générer » pour produire le rapport IA.
        </div>
      )}

      {loading && (
        <div className="rounded-lg border p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
          Analyse des données et rédaction du rapport…
        </div>
      )}

      {report && stats && (
        <div className="space-y-6">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Synthèse — {monthLabel}</h2>
            <p className="mt-2 text-base leading-relaxed">{report.executive_summary}</p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Documents" value={stats.documents.count} sub={fmtBytes(stats.documents.totalSize)} />
            <Stat label="Versions" value={stats.versions.count} />
            <Stat label="Tâches" value={stats.tasks.count} />
            <Stat label="Réunions" value={stats.meetings.count} />
          </div>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Points clés</h3>
            <ul className="space-y-1.5 text-sm">
              {report.key_points.map((k, i) => (
                <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{k}</span></li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Évolution des taux</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Devise</th><th>Début</th><th>Fin</th><th>Min</th><th>Max</th><th>Moyenne</th><th>Variation</th></tr>
                </thead>
                <tbody className="font-mono">
                  <RateRow label="USD → FC" s={stats.rates.usd_to_fc} />
                  <RateRow label="EUR → USD" s={stats.rates.eur_to_usd} />
                  <RateRow label="CHF → USD" s={stats.rates.chf_to_usd} />
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{report.rate_analysis}</p>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Analyse de l'activité</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{report.activity_analysis}</p>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Recommandations</h3>
            <ul className="space-y-1.5 text-sm">
              {report.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="text-primary">→</span><span>{r}</span></li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function RateRow({ label, s }: { label: string; s: RateStat | null }) {
  if (!s) return <tr className="border-t"><td className="py-2 font-sans">{label}</td><td colSpan={6} className="text-muted-foreground font-sans">Aucune donnée</td></tr>;
  const up = s.variation >= 0;
  return (
    <tr className="border-t">
      <td className="py-2 font-sans font-medium">{label}</td>
      <td>{s.first.toFixed(6)}</td>
      <td>{s.last.toFixed(6)}</td>
      <td>{s.min.toFixed(6)}</td>
      <td>{s.max.toFixed(6)}</td>
      <td>{s.avg.toFixed(6)}</td>
      <td className={up ? "text-emerald-600" : "text-rose-600"}>{up ? "+" : ""}{s.variation.toFixed(2)} %</td>
    </tr>
  );
}
