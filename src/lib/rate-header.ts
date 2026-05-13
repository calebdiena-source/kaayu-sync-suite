import { supabase } from "@/integrations/supabase/client";

export type RateRow = {
  rate_date: string;
  usd_to_fc: number | null;
  eur_to_usd: number | null;
  chf_to_usd: number | null;
};

const fmt = (n: number | null) => (n === null || n === undefined ? "—" : Number(n).toFixed(6));

/** Plain-text header (used for .docx and downloadable text) */
export function buildRateHeaderText(rates: RateRow | null, when: Date = new Date()): string {
  const date = when.toLocaleDateString("fr-FR");
  const time = when.toLocaleTimeString("fr-FR");
  const line1 = `=== TAUX DU JOUR — ${date} — ${time} ===`;
  const line2 = `USD/FC: ${fmt(rates?.usd_to_fc ?? null)} | EUR/USD: ${fmt(rates?.eur_to_usd ?? null)} | CHF/USD: ${fmt(rates?.chf_to_usd ?? null)}`;
  const sep = "=".repeat(line1.length);
  return `${line1}\n${line2}\n${sep}`;
}

/** HTML header — rendered by TipTap as a styled block at the top of the document. */
export function buildRateHeaderHtml(rates: RateRow | null, when: Date = new Date()): string {
  const text = buildRateHeaderText(rates, when);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<pre data-rate-header="1" style="background:#f4f6fb;border-left:3px solid #6366f1;padding:8px 12px;margin:0 0 12px;font-family:monospace;font-size:12px;color:#1f2937;white-space:pre-wrap;">${escaped}</pre>`;
}

/** Fetch most-recent rate row (any date). */
export async function fetchLatestRates(): Promise<RateRow | null> {
  const { data } = await supabase
    .from("exchange_rates")
    .select("rate_date, usd_to_fc, eur_to_usd, chf_to_usd")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RateRow) ?? null;
}

/**
 * Strip any existing rate header (HTML <pre data-rate-header>) and prepend a fresh one.
 * Used right before saving a document so the header always reflects the latest rates + time.
 */
export function replaceRateHeaderHtml(
  html: string,
  rates: RateRow | null,
  when: Date = new Date(),
): string {
  const stripped = html.replace(/<pre[^>]*data-rate-header="1"[^>]*>[\s\S]*?<\/pre>/gi, "").trim();
  return buildRateHeaderHtml(rates, when) + stripped;
}
