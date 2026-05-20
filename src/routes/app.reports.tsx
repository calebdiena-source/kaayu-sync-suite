import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FileBarChart,
  Loader2,
  Download,
  Sparkles,
  History,
  Trash2,
  FileText,
  Pencil,
  CalendarIcon,
  Files,
} from "lucide-react";
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
  head: () => ({ meta: [{ title: "Rapports IA — Kaayu" }] }),
  component: ReportsPage,
});

type RateStat = {
  first: number;
  last: number;
  min: number;
  max: number;
  avg: number;
  variation: number;
  count: number;
};
type GlobalStats = {
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
type GlobalReport = {
  executive_summary: string;
  key_points: string[];
  rate_analysis: string;
  activity_analysis: string;
  recommendations: string[];
};
type DocsStats = {
  documents: {
    count: number;
    analyzed?: number;
    totalSize: number;
    byCategory: Record<string, number>;
    byMime: Record<string, number>;
    topTags: Array<{ tag: string; count: number }>;
    timeline: Array<{ date: string; count: number }>;
  };
  versions: { count: number; totalSize: number; docsWithVersions: number };
};
type PerDoc = {
  id: string;
  name: string;
  category?: string | null;
  mime?: string | null;
  summary: string;
  key_points: string[];
};
type DocsReport = {
  executive_summary: string;
  key_points: string[];
  categories_analysis: string;
  formats_analysis: string;
  versions_analysis: string;
  tags_analysis: string;
  content_themes?: string[];
  recommendations: string[];
  per_document?: PerDoc[];
};

const DOCS_PREFIX = "docs:";

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

function stripKind(key: string) {
  return key.startsWith(DOCS_PREFIX) ? key.slice(DOCS_PREFIX.length) : key;
}
function kindOf(key: string): "global" | "documents" {
  return key.startsWith(DOCS_PREFIX) ? "documents" : "global";
}
function periodLabelOf(key: string) {
  const k = stripKind(key);
  if (/^\d{4}-\d{2}$/.test(k)) {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
  const [a, b] = k.split("→");
  if (a && b) {
    const fmtD = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("fr-FR");
    };
    return `Du ${fmtD(a)} au ${fmtD(b)}`;
  }
  return k;
}
const toIsoDate = (d: Date) => format(d, "yyyy-MM-dd");

type HistoryItem = {
  id: string;
  month: string;
  created_at: string;
  stats: any;
  report: any;
};

function ReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<"global" | "documents">("global");
  const [mode, setMode] = useState<"month" | "range">("month");
  const [month, setMonth] = useState(currentMonth());
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>("");

  const basePeriodKey = useMemo(() => {
    if (mode === "month") return month;
    if (range?.from && range?.to) return `${toIsoDate(range.from)}→${toIsoDate(range.to)}`;
    return "";
  }, [mode, month, range]);
  const storageKey = useMemo(
    () => (basePeriodKey ? (kind === "documents" ? DOCS_PREFIX + basePeriodKey : basePeriodKey) : ""),
    [basePeriodKey, kind],
  );
  const periodLabel = useMemo(
    () => (basePeriodKey ? periodLabelOf(basePeriodKey) : ""),
    [basePeriodKey],
  );

  const loadHistory = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("monthly_reports")
      .select("id,month,created_at,stats,report")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error(error);
      return;
    }
    setHistory((data ?? []) as any);
  };

  useEffect(() => {
    loadHistory();
  }, [user?.id]);

  // Reset display when switching tab
  useEffect(() => {
    setReport(null);
    setStats(null);
    setActiveId(null);
    setFilterMonth("");
  }, [kind]);

  const generate = async () => {
    if (!user) {
      toast.error("Vous devez être connecté");
      return;
    }
    if (!basePeriodKey) {
      toast.error("Sélectionnez une période");
      return;
    }
    const periodKey = storageKey;
    const body =
      mode === "month"
        ? { month }
        : { from: toIsoDate(range!.from!), to: toIsoDate(range!.to!) };
    const fnName = kind === "documents" ? "documents-report" : "monthly-report";
    setLoading(true);
    setReport(null);
    setStats(null);
    setActiveId(null);
    try {
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStats(data.stats);
      setReport(data.report);

      await supabase
        .from("monthly_reports")
        .delete()
        .eq("user_id", user.id)
        .eq("month", periodKey);
      const { data: saved, error: saveErr } = await supabase
        .from("monthly_reports")
        .insert({
          user_id: user.id,
          month: periodKey,
          stats: data.stats,
          report: data.report,
        })
        .select("id")
        .single();
      if (saveErr) throw saveErr;
      setActiveId(saved.id);

      await loadHistory();
      toast.success("Rapport généré et enregistré dans l'historique");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Échec de la génération");
    } finally {
      setLoading(false);
    }
  };

  const openHistory = (h: HistoryItem) => {
    const k = kindOf(h.month);
    setKind(k);
    const raw = stripKind(h.month);
    if (/^\d{4}-\d{2}$/.test(raw)) {
      setMode("month");
      setMonth(raw);
      setRange(undefined);
    } else {
      const [a, b] = raw.split("→");
      if (a && b) {
        setMode("range");
        const [ay, am, ad] = a.split("-").map(Number);
        const [by, bm, bd] = b.split("-").map(Number);
        setRange({ from: new Date(ay, am - 1, ad), to: new Date(by, bm - 1, bd) });
      }
    }
    setStats(h.stats);
    setReport(h.report);
    setActiveId(h.id);
    if (k === "global") {
      navigate({ to: "/app/reports/$id", params: { id: h.id } });
    }
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

  const visibleHistory = history.filter((h) => kindOf(h.month) === kind);
  const filteredHistory = filterMonth
    ? visibleHistory.filter((h) => h.month === filterMonth)
    : visibleHistory;

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== Global exporters (kept from previous version) =====
  const exportGlobalDocx = async (r: GlobalReport, s: GlobalStats, mo: string) => {
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
              text: `Rapport global — ${periodLabelOf(mo)}`,
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
            heading("Recommandations"),
            ...r.recommendations.map((p) => new Paragraph({ text: p, bullet: { level: 0 } })),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `rapport-kaayu-${stripKind(mo)}.docx`);
    toast.success("Export .docx téléchargé");
  };

  const exportGlobalPdf = (r: GlobalReport, s: GlobalStats, mo: string) => {
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
    const writeText = (text: string, size = 11, bold = false, color: [number, number, number] = [30, 30, 30]) => {
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
    writeText(`Rapport global — ${periodLabelOf(mo)}`, 20, true, [10, 30, 80]);
    writeText(`Généré le ${new Date().toLocaleString("fr-FR")} · Kaayu Workspace`, 9, false, [120, 120, 120]);
    y += 8;
    heading("Synthèse exécutive");
    writeText(r.executive_summary);
    heading("Points clés");
    r.key_points.forEach((p) => writeText(`• ${p}`));
    heading("Analyse des taux de change");
    writeText(r.rate_analysis);
    const rateRow = (label: string, st: RateStat | null) =>
      st
        ? [label, st.first.toFixed(6), st.last.toFixed(6), st.min.toFixed(6), st.max.toFixed(6), st.avg.toFixed(6), `${st.variation.toFixed(2)} %`]
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
    heading("Recommandations");
    r.recommendations.forEach((p) => writeText(`→ ${p}`));
    pdf.save(`rapport-kaayu-${stripKind(mo)}.pdf`);
    toast.success("Export .pdf téléchargé");
  };

  // ===== Documents exporters =====
  const exportDocsDocx = async (r: DocsReport, s: DocsStats, mo: string) => {
    const para = (text: string, opts: any = {}) =>
      new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } });
    const heading = (text: string) =>
      new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } });
    const catRows = Object.entries(s.documents.byCategory).map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({ children: [para(k)] }),
            new TableCell({ children: [para(String(v))] }),
          ],
        }),
    );
    const catTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ["Catégorie", "Documents"].map(
            (t) => new TableCell({ children: [para(t, { bold: true })] }),
          ),
        }),
        ...catRows,
      ],
    });
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: `Rapport documents — ${periodLabelOf(mo)}`,
              heading: HeadingLevel.TITLE,
            }),
            para(`Généré le ${new Date().toLocaleString("fr-FR")} · Kaayu Workspace`),
            heading("Synthèse exécutive"),
            para(r.executive_summary),
            heading("Points clés"),
            ...r.key_points.map((p) => new Paragraph({ text: p, bullet: { level: 0 } })),
            heading("Répartition par catégorie"),
            para(r.categories_analysis),
            catTable,
            ...(r.content_themes && r.content_themes.length
              ? [
                  heading("Thèmes détectés"),
                  ...r.content_themes.map((t) => new Paragraph({ text: t, bullet: { level: 0 } })),
                ]
              : []),
            ...(r.per_document && r.per_document.length
              ? [
                  heading("Analyse fichier par fichier"),
                  ...r.per_document.flatMap((d) => [
                    new Paragraph({
                      heading: HeadingLevel.HEADING_2,
                      children: [new TextRun({ text: d.name, bold: true })],
                      spacing: { before: 200, after: 80 },
                    }),
                    para(`${d.mime ?? "type inconnu"} · ${d.category ?? "sans catégorie"}`, {
                      italics: true,
                    }),
                    para(d.summary || "—"),
                    ...(d.key_points ?? []).map(
                      (k) => new Paragraph({ text: k, bullet: { level: 0 } }),
                    ),
                  ]),
                ]
              : []),
            heading("Recommandations"),
            ...r.recommendations.map((p) => new Paragraph({ text: p, bullet: { level: 0 } })),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `rapport-documents-kaayu-${stripKind(mo)}.docx`);
    toast.success("Export .docx téléchargé");
  };

  const exportDocsPdf = (r: DocsReport, s: DocsStats, mo: string) => {
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
    const writeText = (text: string, size = 11, bold = false, color: [number, number, number] = [30, 30, 30]) => {
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
    writeText(`Rapport documents — ${periodLabelOf(mo)}`, 20, true, [10, 30, 80]);
    writeText(`Généré le ${new Date().toLocaleString("fr-FR")} · Kaayu Workspace`, 9, false, [120, 120, 120]);
    y += 8;
    heading("Synthèse exécutive");
    writeText(r.executive_summary);
    heading("Points clés");
    r.key_points.forEach((p) => writeText(`• ${p}`));
    heading("Répartition par catégorie");
    writeText(r.categories_analysis);
    autoTable(pdf, {
      startY: y + 6,
      head: [["Catégorie", "Documents"]],
      body: Object.entries(s.documents.byCategory).map(([k, v]) => [k, String(v)]),
      styles: { font: "helvetica", fontSize: 9 },
      headStyles: { fillColor: [20, 60, 120] },
      margin: { left: margin, right: margin },
    });
    y = (pdf as any).lastAutoTable.finalY + 12;
    if (r.content_themes && r.content_themes.length) {
      heading("Thèmes détectés");
      r.content_themes.forEach((t) => writeText(`• ${t}`));
    }
    if (r.per_document && r.per_document.length) {
      heading("Analyse fichier par fichier");
      r.per_document.forEach((d) => {
        writeText(d.name, 12, true, [10, 30, 80]);
        writeText(`${d.mime ?? "type inconnu"} · ${d.category ?? "sans catégorie"}`, 9, false, [120, 120, 120]);
        writeText(d.summary || "—");
        (d.key_points ?? []).forEach((k) => writeText(`• ${k}`, 10, false, [60, 60, 60]));
        y += 4;
      });
    }
    heading("Recommandations");
    r.recommendations.forEach((p) => writeText(`→ ${p}`));
    pdf.save(`rapport-documents-kaayu-${stripKind(mo)}.pdf`);
    toast.success("Export .pdf téléchargé");
  };

  const exportCurrent = (which: "pdf" | "docx") => {
    if (!report || !stats || !storageKey) return;
    if (kind === "documents") {
      which === "pdf"
        ? exportDocsPdf(report as DocsReport, stats as DocsStats, storageKey)
        : exportDocsDocx(report as DocsReport, stats as DocsStats, storageKey);
    } else {
      which === "pdf"
        ? exportGlobalPdf(report as GlobalReport, stats as GlobalStats, storageKey)
        : exportGlobalDocx(report as GlobalReport, stats as GlobalStats, storageKey);
    }
  };

  const exportHistoryItem = (h: HistoryItem, which: "pdf" | "docx") => {
    if (kindOf(h.month) === "documents") {
      which === "pdf"
        ? exportDocsPdf(h.report as DocsReport, h.stats as DocsStats, h.month)
        : exportDocsDocx(h.report as DocsReport, h.stats as DocsStats, h.month);
    } else {
      which === "pdf"
        ? exportGlobalPdf(h.report as GlobalReport, h.stats as GlobalStats, h.month)
        : exportGlobalDocx(h.report as GlobalReport, h.stats as GlobalStats, h.month);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileBarChart className="h-6 w-6 text-primary" /> Rapports IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Choisissez le type de rapport, puis une période (mois ou intervalle).
          </p>
        </div>
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
        <TabsList>
          <TabsTrigger value="global">
            <FileBarChart className="mr-1.5 h-4 w-4" /> Rapport global
          </TabsTrigger>
          <TabsTrigger value="documents">
            <Files className="mr-1.5 h-4 w-4" /> Rapport documents
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-end gap-2">
        <div className="inline-flex rounded-md border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setMode("month")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Mois
          </button>
          <button
            type="button"
            onClick={() => setMode("range")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "range" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Intervalle
          </button>
        </div>
        {mode === "month" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mois</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Intervalle
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[260px] justify-start text-left font-normal",
                    !range?.from && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {range?.from ? (
                    range.to ? (
                      <>
                        {format(range.from, "d MMM yyyy", { locale: fr })} —{" "}
                        {format(range.to, "d MMM yyyy", { locale: fr })}
                      </>
                    ) : (
                      format(range.from, "d MMM yyyy", { locale: fr })
                    )
                  ) : (
                    <span>Choisir une plage</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  numberOfMonths={2}
                  locale={fr}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
        <Button onClick={generate} disabled={loading || !basePeriodKey}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Générer
        </Button>
        {report && stats && storageKey && (
          <>
            {kind === "global" && (
              <Button
                onClick={() =>
                  navigate({
                    to: "/app/reports/$id",
                    params: { id: activeId ?? "new" },
                  })
                }
              >
                <Pencil className="mr-2 h-4 w-4" /> Ouvrir dans l'éditeur
              </Button>
            )}
            <Button variant="outline" onClick={() => exportCurrent("docx")}>
              <Download className="mr-2 h-4 w-4" /> .docx
            </Button>
            <Button variant="outline" onClick={() => exportCurrent("pdf")}>
              <FileText className="mr-2 h-4 w-4" /> .pdf
            </Button>
          </>
        )}
      </div>

      <section className="rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Historique —{" "}
            {kind === "documents" ? "rapports documents" : "rapports globaux"}
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">Toutes les périodes</option>
              {Array.from(new Set(visibleHistory.map((h) => h.month)))
                .sort((a, b) => b.localeCompare(a))
                .map((mo) => (
                  <option key={mo} value={mo}>
                    {periodLabelOf(mo)}
                  </option>
                ))}
            </select>
          </div>
        </header>
        {filteredHistory.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Aucun rapport pour ce filtre.
          </div>
        ) : (
          <ul className="divide-y">
            {filteredHistory.map((h) => {
              const label = periodLabelOf(h.month);
              const docsCount = h.stats?.documents?.count ?? 0;
              return (
                <li
                  key={h.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${activeId === h.id ? "bg-accent/50" : "hover:bg-accent/30"}`}
                >
                  <button onClick={() => openHistory(h)} className="flex-1 text-left">
                    <div className="text-sm font-medium capitalize">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      Généré le {new Date(h.created_at).toLocaleString("fr-FR")} · {docsCount} docs
                      {kind === "global" && ` · ${h.stats?.meetings?.count ?? 0} réunions`}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportHistoryItem(h, "pdf")}
                    title="Télécharger PDF"
                  >
                    <FileText className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportHistoryItem(h, "docx")}
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
          Sélectionnez une période et cliquez sur « Générer », ou ouvrez un rapport de l'historique.
        </div>
      )}

      {loading && (
        <div className="rounded-lg border p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
          Analyse des données et rédaction du rapport…
        </div>
      )}

      {report && stats && kind === "global" && (
        <GlobalReportView report={report as GlobalReport} stats={stats as GlobalStats} periodLabel={periodLabel} />
      )}
      {report && stats && kind === "documents" && (
        <DocsReportView report={report as DocsReport} stats={stats as DocsStats} periodLabel={periodLabel} />
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

function GlobalReportView({
  report,
  stats,
  periodLabel,
}: {
  report: GlobalReport;
  stats: GlobalStats;
  periodLabel: string;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Synthèse — {periodLabel}
        </h2>
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
            <li key={i} className="flex gap-2">
              <span className="text-primary">→</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DocsReportView({
  report,
  stats,
  periodLabel,
}: {
  report: DocsReport;
  stats: DocsStats;
  periodLabel: string;
}) {
  const cats = Object.entries(stats.documents.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Synthèse documents — {periodLabel}
        </h2>
        <p className="mt-2 text-base leading-relaxed">{report.executive_summary}</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Documents créés"
          value={stats.documents.count}
          sub={fmtBytes(stats.documents.totalSize)}
        />
        <Stat label="Versions" value={stats.versions.count} sub={fmtBytes(stats.versions.totalSize)} />
        <Stat label="Docs versionnés" value={stats.versions.docsWithVersions} />
        <Stat label="Catégories" value={cats.length} />
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
        <h3 className="mb-3 text-sm font-semibold">Répartition par catégorie</h3>
        {cats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune catégorie sur la période.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {cats.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                <span className="truncate">{k}</span>
                <span className="font-mono text-xs text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{report.categories_analysis}</p>
      </section>
      {report.content_themes && report.content_themes.length > 0 && (
        <section className="rounded-lg border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Thèmes détectés dans les documents</h3>
          <div className="flex flex-wrap gap-2">
            {report.content_themes.map((t, i) => (
              <span key={i} className="rounded-full bg-accent px-2.5 py-1 text-xs">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}
      {report.per_document && report.per_document.length > 0 && (
        <section className="rounded-lg border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold">Analyse fichier par fichier</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            {report.per_document.length} document{report.per_document.length > 1 ? "s" : ""} analysé
            {report.per_document.length > 1 ? "s" : ""}
            {stats.documents.count > report.per_document.length
              ? ` sur ${stats.documents.count} (limite atteinte)`
              : ""}
            .
          </p>
          <ul className="space-y-4">
            {report.per_document.map((d) => (
              <li key={d.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.mime ?? "type ?"} · {d.category ?? "sans catégorie"}
                  </div>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {d.summary || "—"}
                </p>
                {d.key_points && d.key_points.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {d.key_points.map((k, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-primary">•</span>
                        <span>{k}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
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
  );
}
