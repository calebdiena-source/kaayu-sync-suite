import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileBarChart, Loader2, Download, Sparkles, History, Trash2, FileText, Pencil } from "lucide-react";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
    timeline: Array<{
      rate_date: string;
      usd_to_fc: number | null;
      eur_to_usd: number | null;
      chf_to_usd: number | null;
    }>;
  };
  tasks: { count: number; byStatus: Record<string, number> };
  meetings: { count: number };
};
type RateStat = {
  first: number;
  last: number;
  min: number;
  max: number;
  avg: number;
  variation: number;
  count: number;
};
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

type HistoryItem = { id: string; month: string; created_at: string; stats: Stats; report: Report };

function ReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>("");

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }, [month]);

  const loadHistory = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("monthly_reports")
      .select("id,month,created_at,stats,report")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      return;
    }
    setHistory((data ?? []) as any);
  };

  useEffect(() => {
    loadHistory();
  }, [user?.id]);

  const generate = async () => {
    setLoading(true);
    setReport(null);
    setStats(null);
    setActiveId(null);
    try {
      const { data, error } = await supabase.functions.invoke("monthly-report", {
        body: { month },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStats(data.stats);
      setReport(data.report);
      // On garde un brouillon en sessionStorage pour permettre l'ouverture dans l'éditeur
      try {
        sessionStorage.setItem(
          "kaayu:report:draft",
          JSON.stringify({ month, stats: data.stats, report: data.report }),
        );
      } catch {
        // ignore
      }
      toast.success("Rapport généré — cliquez sur « Ouvrir dans l'éditeur » pour l'enregistrer");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Échec de la génération");
    } finally {
      setLoading(false);
    }
  };

  const openHistory = (h: HistoryItem) => {
    setMonth(h.month);
    setStats(h.stats);
    setReport(h.report);
    setActiveId(h.id);
    navigate({ to: "/app/reports/$id", params: { id: h.id } });
  };

  const removeHistory = async (id: string) => {
    if (!confirm("Supprimer ce rapport ?")) return;
    const { error } = await supabase.from("monthly_reports").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (activeId === id) {
      setReport(null);
      setStats(null);
      setActiveId(null);
    }
    setHistory((h) => h.filter((x) => x.id !== id));
    toast.success("Rapport supprimé");
  };

  const filteredHistory = filterMonth ? history.filter((h) => h.month === filterMonth) : history;

  const monthLabelOf = (mo: string) => {
    const [y, m] = mo.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDocx = async (r: Report, s: Stats, mo: string) => {
    const para = (text: string, opts: any = {}) =>
      new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } });
    const heading = (text: string, level: any = HeadingLevel.HEADING_1) =>
      new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
    const rateRow = (label: string, st: RateStat | null) =>
      new TableRow({
        children: [
          new TableCell({ children: [para(label, { bold: true })] }),
          new TableCell({ children: [para(st ? st.first.toFixed(6) : "—")] }),
          new TableCell({ children: [para(st ? st.last.toFixed(6) : "—")] }),
          new TableCell({ children: [para(st ? `${st.variation.toFixed(2)} %` : "—")] }),
          new TableCell({ children: [para(st ? st.avg.toFixed(6) : "—")] }),
        ],
      });
    const ratesTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ["Devise", "Début", "Fin", "Variation", "Moyenne"].map(
            (t) => new TableCell({ children: [para(t, { bold: true })] }),
          ),
        }),
        rateRow("USD → FC", s.rates.usd_to_fc),
        rateRow("EUR → USD", s.rates.eur_to_usd),
        rateRow("CHF → USD", s.rates.chf_to_usd),
      ],
    });
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: `Rapport mensuel — ${monthLabelOf(mo)}`,
              heading: HeadingLevel.TITLE,
            }),
            para(`Généré le ${new Date().toLocaleString("fr-FR")} · Kaayu Workspace`),
            heading("Synthèse exécutive"),
            para(r.executive_summary),
            heading("Points clés"),
            ...r.key_points.map((p) => new Paragraph({ text: p, bullet: { level: 0 } })),
            heading("Analyse des taux de change"),
            para(r.rate_analysis),
            ratesTable,
            heading("Analyse de l'activité"),
            para(r.activity_analysis),
            heading("Indicateurs"),
            para(`Documents créés : ${s.documents.count} (${fmtBytes(s.documents.totalSize)})`),
            para(`Nouvelles versions : ${s.versions.count}`),
            para(`Tâches : ${s.tasks.count}`),
            para(`Réunions : ${s.meetings.count}`),
            heading("Recommandations"),
            ...r.recommendations.map((p) => new Paragraph({ text: p, bullet: { level: 0 } })),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `rapport-kaayu-${mo}.docx`);
    toast.success("Export .docx téléchargé");
  };

  const exportPdf = (r: Report, s: Stats, mo: string) => {
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    let y = margin;

    const ensureSpace = (h: number) => {
      if (y + h > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
    };
    const writeText = (
      text: string,
      size = 11,
      bold = false,
      color: [number, number, number] = [30, 30, 30],
    ) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      const lines = pdf.splitTextToSize(text, pageW - margin * 2);
      const lh = size * 1.3;
      for (const line of lines) {
        ensureSpace(lh);
        pdf.text(line, margin, y);
        y += lh;
      }
    };
    const heading = (text: string) => {
      y += 8;
      ensureSpace(24);
      writeText(text, 14, true, [20, 60, 120]);
      y += 4;
    };

    writeText(`Rapport mensuel — ${monthLabelOf(mo)}`, 20, true, [10, 30, 80]);
    writeText(
      `Généré le ${new Date().toLocaleString("fr-FR")} · Kaayu Workspace`,
      9,
      false,
      [120, 120, 120],
    );
    y += 8;
    heading("Synthèse exécutive");
    writeText(r.executive_summary);
    heading("Points clés");
    r.key_points.forEach((p) => writeText(`• ${p}`));
    heading("Analyse des taux de change");
    writeText(r.rate_analysis);

    const rateRow = (label: string, st: RateStat | null) =>
      st
        ? [
            label,
            st.first.toFixed(6),
            st.last.toFixed(6),
            st.min.toFixed(6),
            st.max.toFixed(6),
            st.avg.toFixed(6),
            `${st.variation.toFixed(2)} %`,
          ]
        : [label, "—", "—", "—", "—", "—", "—"];
    autoTable(pdf, {
      startY: y + 6,
      head: [["Devise", "Début", "Fin", "Min", "Max", "Moyenne", "Variation"]],
      body: [
        rateRow("USD → FC", s.rates.usd_to_fc),
        rateRow("EUR → USD", s.rates.eur_to_usd),
        rateRow("CHF → USD", s.rates.chf_to_usd),
      ],
      styles: { font: "helvetica", fontSize: 9 },
      headStyles: { fillColor: [20, 60, 120] },
      margin: { left: margin, right: margin },
    });
    y = (pdf as any).lastAutoTable.finalY + 12;

    heading("Analyse de l'activité");
    writeText(r.activity_analysis);
    heading("Indicateurs");
    writeText(`Documents : ${s.documents.count} (${fmtBytes(s.documents.totalSize)})`);
    writeText(`Versions : ${s.versions.count}`);
    writeText(`Tâches : ${s.tasks.count}`);
    writeText(`Réunions : ${s.meetings.count}`);
    heading("Recommandations");
    r.recommendations.forEach((p) => writeText(`→ ${p}`));

    pdf.save(`rapport-kaayu-${mo}.pdf`);
    toast.success("Export .pdf téléchargé");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileBarChart className="h-6 w-6 text-primary" /> Rapports mensuels IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Synthèse intelligente de votre activité et de l'évolution des taux.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mois</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button onClick={generate} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Générer
          </Button>
          {report && stats && (
            <>
              <Button variant="outline" onClick={() => exportDocx(report, stats, month)}>
                <Download className="mr-2 h-4 w-4" /> .docx
              </Button>
              <Button variant="outline" onClick={() => exportPdf(report, stats, month)}>
                <FileText className="mr-2 h-4 w-4" /> .pdf
              </Button>
            </>
          )}
        </div>
      </div>

      <section className="rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Historique des rapports
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
              placeholder="Filtrer"
            />
            {filterMonth && (
              <button
                onClick={() => setFilterMonth("")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Effacer
              </button>
            )}
          </div>
        </header>
        {filteredHistory.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Aucun rapport pour ce filtre.
          </div>
        ) : (
          <ul className="divide-y">
            {filteredHistory.map((h) => {
              const [hy, hm] = h.month.split("-").map(Number);
              const label = new Date(hy, hm - 1, 1).toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              });
              return (
                <li
                  key={h.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${activeId === h.id ? "bg-accent/50" : "hover:bg-accent/30"}`}
                >
                  <button onClick={() => openHistory(h)} className="flex-1 text-left">
                    <div className="text-sm font-medium capitalize">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      Généré le {new Date(h.created_at).toLocaleString("fr-FR")} ·{" "}
                      {h.stats?.documents?.count ?? 0} docs · {h.stats?.meetings?.count ?? 0}{" "}
                      réunions
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportPdf(h.report, h.stats, h.month)}
                    aria-label="Télécharger PDF"
                    title="Télécharger PDF"
                  >
                    <FileText className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportDocx(h.report, h.stats, h.month)}
                    aria-label="Télécharger DOCX"
                    title="Télécharger DOCX"
                  >
                    <Download className="mr-1 h-4 w-4" /> DOCX
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeHistory(h.id)}
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!report && !loading && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Sélectionnez un mois et cliquez sur « Générer », ou ouvrez un rapport de l'historique.
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
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Synthèse — {monthLabel}
            </h2>
            <p className="mt-2 text-base leading-relaxed">{report.executive_summary}</p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Documents"
              value={stats.documents.count}
              sub={fmtBytes(stats.documents.totalSize)}
            />
            <Stat label="Versions" value={stats.versions.count} />
            <Stat label="Tâches" value={stats.tasks.count} />
            <Stat label="Réunions" value={stats.meetings.count} />
          </div>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Points clés</h3>
            <ul className="space-y-1.5 text-sm">
              {report.key_points.map((k, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{k}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Évolution des taux</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Devise</th>
                    <th>Début</th>
                    <th>Fin</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Moyenne</th>
                    <th>Variation</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <RateRow label="USD → FC" s={stats.rates.usd_to_fc} />
                  <RateRow label="EUR → USD" s={stats.rates.eur_to_usd} />
                  <RateRow label="CHF → USD" s={stats.rates.chf_to_usd} />
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {report.rate_analysis}
            </p>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Analyse de l'activité</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {report.activity_analysis}
            </p>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Recommandations</h3>
            <ul className="space-y-1.5 text-sm">
              {report.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">→</span>
                  <span>{r}</span>
                </li>
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
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function RateRow({ label, s }: { label: string; s: RateStat | null }) {
  if (!s)
    return (
      <tr className="border-t">
        <td className="py-2 font-sans">{label}</td>
        <td colSpan={6} className="text-muted-foreground font-sans">
          Aucune donnée
        </td>
      </tr>
    );
  const up = s.variation >= 0;
  return (
    <tr className="border-t">
      <td className="py-2 font-sans font-medium">{label}</td>
      <td>{s.first.toFixed(6)}</td>
      <td>{s.last.toFixed(6)}</td>
      <td>{s.min.toFixed(6)}</td>
      <td>{s.max.toFixed(6)}</td>
      <td>{s.avg.toFixed(6)}</td>
      <td className={up ? "text-emerald-600" : "text-rose-600"}>
        {up ? "+" : ""}
        {s.variation.toFixed(2)} %
      </td>
    </tr>
  );
}
