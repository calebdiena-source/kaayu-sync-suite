import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/rates-history")({
  head: () => ({ meta: [{ title: "Historique des taux — Kaayu" }] }),
  component: RatesHistoryPage,
});

type Rate = {
  rate_date: string;
  usd_to_fc: number | null;
  eur_to_usd: number | null;
  chf_to_usd: number | null;
};

function RatesHistoryPage() {
  const [rows, setRows] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("exchange_rates")
        .select("rate_date, usd_to_fc, eur_to_usd, chf_to_usd")
        .order("rate_date", { ascending: false })
        .limit(1000);
      setRows((data as Rate[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (from && r.rate_date < from) return false;
      if (to && r.rate_date > to) return false;
      return true;
    });
  }, [rows, from, to]);

  const exportCsv = () => {
    const header = "Date,USD_to_FC,EUR_to_USD,CHF_to_USD\n";
    const body = filtered
      .map(
        (r) =>
          `${r.rate_date},${r.usd_to_fc ?? ""},${r.eur_to_usd ?? ""},${r.chf_to_usd ?? ""}`,
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taux-historique-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/app/dashboard"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Retour au tableau de bord
          </Link>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <TrendingUp className="h-5 w-5 text-primary" />
            Historique des taux de change
          </h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} entrée{filtered.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Download className="h-4 w-4" /> Exporter CSV
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Du</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Au</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-right font-medium">USD → FC</th>
              <th className="px-3 py-2 text-right font-medium">EUR → USD</th>
              <th className="px-3 py-2 text-right font-medium">CHF → USD</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Chargement…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Aucune donnée
                </td>
              </tr>
            ) : (
              filtered.map((h) => (
                <tr key={h.rate_date} className="border-t">
                  <td className="px-3 py-2">
                    {new Date(h.rate_date).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.usd_to_fc?.toFixed(6) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.eur_to_usd?.toFixed(6) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.chf_to_usd?.toFixed(6) ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
