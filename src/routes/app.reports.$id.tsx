import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileText, Save } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { jsPDF } from "jspdf";

type RateStat = {
  first: number;
  last: number;
  min: number;
  max: number;
  avg: number;
  variation: number;
  count: number;
};
type Stats = {
  documents: { count: number; totalSize: number; byCategory: Record<string, number> };
  versions: { count: number };
  rates: {
    usd_to_fc: RateStat | null;
    eur_to_usd: RateStat | null;
    chf_to_usd: RateStat | null;
    timeline: any[];
  };
  tasks: { count: number; byStatus: Record<string, number> };
  meetings: { count: number };
};
type Report = {
  executive_summary: string;
  key_points: string[];
  rate_analysis: string;
  activity_analysis: string;
  recommendations: string[];
  html?: string;
};

export const Route = createFileRoute("/app/reports/$id")({
  head: () => ({ meta: [{ title: "Rapport mensuel — Kaayu" }] }),
  component: ReportViewer,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-xl space-y-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Impossible d'afficher ce rapport</h1>
      <p className="text-sm text-muted-foreground">{error?.message || "Erreur inconnue"}</p>
      <div className="flex justify-center gap-2">
        <Button size="sm" onClick={reset}>Réessayer</Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/reports">Retour aux rapports</Link>
        </Button>
      </div>
    </div>
  ),
});

const EMPTY_RATE_STATS: Stats["rates"] = {
  usd_to_fc: null,
  eur_to_usd: null,
  chf_to_usd: null,
  timeline: [],
};

function normalizeStats(s: any): Stats {
  return {
    documents: {
      count: s?.documents?.count ?? 0,
      totalSize: s?.documents?.totalSize ?? 0,
      byCategory: s?.documents?.byCategory ?? {},
    },
    versions: { count: s?.versions?.count ?? 0 },
    rates: {
      usd_to_fc: s?.rates?.usd_to_fc ?? null,
      eur_to_usd: s?.rates?.eur_to_usd ?? null,
      chf_to_usd: s?.rates?.chf_to_usd ?? null,
      timeline: Array.isArray(s?.rates?.timeline) ? s.rates.timeline : [],
    },
    tasks: { count: s?.tasks?.count ?? 0, byStatus: s?.tasks?.byStatus ?? {} },
    meetings: { count: s?.meetings?.count ?? 0 },
  };
}

function normalizeReport(r: any): Report {
  return {
    executive_summary: typeof r?.executive_summary === "string" ? r.executive_summary : "",
    key_points: Array.isArray(r?.key_points) ? r.key_points.filter((x: any) => typeof x === "string") : [],
    rate_analysis: typeof r?.rate_analysis === "string" ? r.rate_analysis : "",
    activity_analysis: typeof r?.activity_analysis === "string" ? r.activity_analysis : "",
    recommendations: Array.isArray(r?.recommendations) ? r.recommendations.filter((x: any) => typeof x === "string") : [],
    html: typeof r?.html === "string" ? r.html : undefined,
  };
}

function fmtBytes(n: number) {
  if (!n) return "0 o";
  const u = ["o", "Ko", "Mo", "Go"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

function monthLabelOf(mo: string) {
  const [y, m] = mo.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function escapeHtml(s: string) {
  return (s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function rateRowHtml(label: string, st: RateStat | null) {
  if (!st) return `<tr><td><strong>${label}</strong></td><td colspan="6">Aucune donnée</td></tr>`;
  return `<tr><td><strong>${label}</strong></td><td>${st.first.toFixed(6)}</td><td>${st.last.toFixed(6)}</td><td>${st.min.toFixed(6)}</td><td>${st.max.toFixed(6)}</td><td>${st.avg.toFixed(6)}</td><td>${st.variation.toFixed(2)} %</td></tr>`;
}

function buildHtml(r: Report, s: Stats, mo: string) {
  return `
<h1>Rapport mensuel — ${escapeHtml(monthLabelOf(mo))}</h1>
<p><em>Généré le ${escapeHtml(new Date().toLocaleString("fr-FR"))} · Kaayu Workspace</em></p>
<h2>Synthèse exécutive</h2>
<p>${escapeHtml(r.executive_summary)}</p>
<h2>Points clés</h2>
<ul>${(r.key_points || []).map((k) => `<li>${escapeHtml(k)}</li>`).join("")}</ul>
<h2>Analyse des taux de change</h2>
<p>${escapeHtml(r.rate_analysis)}</p>
<table>
  <thead><tr><th>Devise</th><th>Début</th><th>Fin</th><th>Min</th><th>Max</th><th>Moyenne</th><th>Variation</th></tr></thead>
  <tbody>
    ${rateRowHtml("USD → FC", s.rates.usd_to_fc)}
    ${rateRowHtml("EUR → USD", s.rates.eur_to_usd)}
    ${rateRowHtml("CHF → USD", s.rates.chf_to_usd)}
  </tbody>
</table>
<h2>Analyse de l'activité</h2>
<p>${escapeHtml(r.activity_analysis)}</p>
<h2>Indicateurs</h2>
<ul>
  <li>Documents créés : ${s.documents.count} (${fmtBytes(s.documents.totalSize)})</li>
  <li>Nouvelles versions : ${s.versions.count}</li>
  <li>Tâches : ${s.tasks.count}</li>
  <li>Réunions : ${s.meetings.count}</li>
</ul>
<h2>Recommandations</h2>
<ul>${(r.recommendations || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
<p></p>
`;
}

function htmlToPlainBlocks(
  html: string,
): { text: string; level: 0 | 1 | 2 | 3; bullet?: boolean }[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const out: { text: string; level: 0 | 1 | 2 | 3; bullet?: boolean }[] = [];
  const walk = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    const text = (node.textContent ?? "").trim();
    if (tag === "h1" && text) out.push({ text, level: 1 });
    else if (tag === "h2" && text) out.push({ text, level: 2 });
    else if (tag === "h3" && text) out.push({ text, level: 3 });
    else if (tag === "li" && text) out.push({ text, level: 0, bullet: true });
    else if ((tag === "p" || tag === "blockquote") && text) out.push({ text, level: 0 });
    else node.childNodes.forEach(walk);
  };
  div.childNodes.forEach(walk);
  return out;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportDocx(html: string, filename: string) {
  const blocks = htmlToPlainBlocks(html);
  const children = blocks.map((b) => {
    if (b.level === 1)
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: b.text, bold: true })],
      });
    if (b.level === 2)
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: b.text, bold: true })],
      });
    if (b.level === 3)
      return new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: b.text, bold: true })],
      });
    if (b.bullet) return new Paragraph({ text: b.text, bullet: { level: 0 } });
    return new Paragraph({ children: [new TextRun(b.text)] });
  });
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, filename);
}

function exportPdf(html: string, filename: string) {
  const blocks = htmlToPlainBlocks(html);
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  let y = margin;
  const ensure = (h: number) => {
    if (y + h > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
  };
  const write = (
    text: string,
    size: number,
    bold: boolean,
    color: [number, number, number],
    indent = 0,
  ) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(text, pageW - margin * 2 - indent);
    const lh = size * 1.35;
    for (const l of lines) {
      ensure(lh);
      pdf.text(l, margin + indent, y);
      y += lh;
    }
  };
  for (const b of blocks) {
    if (b.level === 1) {
      y += 6;
      write(b.text, 18, true, [10, 30, 80]);
      y += 4;
    } else if (b.level === 2) {
      y += 6;
      write(b.text, 14, true, [20, 60, 120]);
      y += 2;
    } else if (b.level === 3) {
      y += 4;
      write(b.text, 12, true, [30, 30, 30]);
    } else if (b.bullet) {
      write(`• ${b.text}`, 11, false, [30, 30, 30], 12);
    } else {
      write(b.text, 11, false, [30, 30, 30]);
    }
  }
  pdf.save(filename);
}

function ReportViewer() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [html, setHtml] = useState<string>("<p></p>");
  const [month, setMonth] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const isDraft = id === "new";

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (isDraft) {
          const raw = sessionStorage.getItem("kaayu:report:draft");
          if (!raw) {
            toast.error("Aucun brouillon trouvé");
            navigate({ to: "/app/reports" });
            return;
          }
          const parsed = JSON.parse(raw);
          const dStats = normalizeStats(parsed.stats);
          const dReport = normalizeReport(parsed.report);
          const dMonth = typeof parsed.month === "string" ? parsed.month : "";
          if (!active) return;
          setMonth(dMonth);
          setStats(dStats);
          setReport(dReport);
          setHtml(dReport.html || buildHtml(dReport, dStats, dMonth));
          return;
        }
        const { data, error } = await supabase
          .from("monthly_reports")
          .select("id,month,stats,report")
          .eq("id", id)
          .maybeSingle();
        if (!active) return;
        if (error || !data) {
          toast.error("Rapport introuvable");
          navigate({ to: "/app/reports" });
          return;
        }
        const r = normalizeReport(data.report);
        const s = normalizeStats(data.stats);
        setMonth(data.month);
        setStats(s);
        setReport(r);
        setHtml(r.html || buildHtml(r, s, data.month));
      } catch (e: any) {
        toast.error(e?.message || "Erreur de chargement");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, navigate, isDraft]);

  const save = async () => {
    if (!user || !report || !stats || !month) return;
    setSaving(true);
    try {
      // Un seul rapport par mois : on supprime tout rapport existant pour ce mois
      await supabase
        .from("monthly_reports")
        .delete()
        .eq("user_id", user.id)
        .eq("month", month);
      const reportToSave: Report = { ...report, html };
      const { data: saved, error } = await supabase
        .from("monthly_reports")
        .insert({ user_id: user.id, month, stats, report: reportToSave })
        .select("id")
        .single();
      if (error) throw error;
      if (isDraft) {
        try {
          sessionStorage.removeItem("kaayu:report:draft");
        } catch {
          // ignore
        }
      }
      toast.success("Rapport enregistré");
      if (saved?.id && saved.id !== id) {
        navigate({ to: "/app/reports/$id", params: { id: saved.id }, replace: true });
      }
    } catch (e: any) {
      toast.error(e?.message || "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const baseName = useMemo(() => `rapport-kaayu-${month || "rapport"}`, [month]);

  if (loading) return <div className="text-sm text-muted-foreground">Chargement…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/reports">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">
          {isDraft ? "Brouillon — " : "Rapport — "}
          {month ? monthLabelOf(month) : ""}
        </h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? "…" : isDraft ? "Enregistrer" : "Mettre à jour"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPdf(html, `${baseName}.pdf`)}>
            <FileText className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportDocx(html, `${baseName}.docx`)}>
            <Download className="mr-1 h-4 w-4" /> DOCX
          </Button>
        </div>
      </div>

      {isDraft && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Ce rapport n'est pas encore enregistré. Relisez, modifiez si nécessaire, puis cliquez sur
          « Enregistrer ».
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <RichTextEditor value={html} onChange={setHtml} editable placeholder="Rapport mensuel…" />
      </div>
    </div>
  );
}
