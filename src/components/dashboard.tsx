import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  TrendingUp,
  FileText,
  Users2,
  ListTodo,
  CalendarDays,
  HardDrive,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);

type Rate = {
  id?: string;
  rate_date: string;
  usd_to_fc: number | null;
  eur_to_usd: number | null;
  chf_to_usd: number | null;
  updated_at?: string;
};

function RateField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number | null;
  onSave: (n: number) => Promise<void>;
}) {
  const [text, setText] = useState(value !== null && value !== undefined ? value.toFixed(6) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(value !== null && value !== undefined ? value.toFixed(6) : "");
  }, [value]);

  const commit = async () => {
    const n = parseFloat(text.replace(",", "."));
    if (Number.isNaN(n) || n < 0) {
      toast.error("Valeur invalide");
      return;
    }
    setSaving(true);
    try {
      await onSave(n);
      setText(n.toFixed(6));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="0.000000"
        className="mt-2 w-full bg-transparent font-mono text-2xl font-semibold tracking-tight outline-none"
        disabled={saving}
      />
      <div className="mt-1 text-[11px] text-muted-foreground">
        {saving ? "Enregistrement…" : "Cliquez pour modifier · 6 décimales"}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [rate, setRate] = useState<Rate | null>(null);
  const [history, setHistory] = useState<Rate[]>([]);
  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState({ docs: 0, meetings: 0, tasks: 0, events: 0 });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    const { data: r } = await supabase
      .from("exchange_rates")
      .select("*")
      .order("rate_date", { ascending: false })
      .limit(8);
    const todays = (r ?? []).find((x) => x.rate_date === today());
    setRate(todays ?? { rate_date: today(), usd_to_fc: null, eur_to_usd: null, chf_to_usd: null });
    setHistory(r ?? []);
    if (user) {
      const [{ count: dc }, { count: mc }, { count: tc }, { count: ec }] = await Promise.all([
        supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("meetings")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("calendar_events")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);
      setStats({ docs: dc ?? 0, meetings: mc ?? 0, tasks: tc ?? 0, events: ec ?? 0 });
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.id]);

  const saveField = async (field: "usd_to_fc" | "eur_to_usd" | "chf_to_usd", value: number) => {
    if (!user || !rate) return;
    const next = { ...rate, [field]: value } as Rate;
    const payload = {
      rate_date: today(),
      usd_to_fc: next.usd_to_fc,
      eur_to_usd: next.eur_to_usd,
      chf_to_usd: next.chf_to_usd,
      updated_by: user.id,
    };
    const { data, error } = await supabase
      .from("exchange_rates")
      .upsert(payload, { onConflict: "rate_date" })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setRate(data as Rate);
    toast.success("Taux enregistré");
    load();
  };

  const statCards = useMemo(
    () => [
      { label: "Documents", value: stats.docs, icon: FileText },
      { label: "Réunions", value: stats.meetings, icon: Users2 },
      { label: "Tâches", value: stats.tasks, icon: ListTodo },
      { label: "Événements", value: stats.events, icon: CalendarDays },
    ],
    [stats],
  );

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" /> Taux de change quotidiens
            </div>
            <div className="text-xs text-muted-foreground">
              Sauvegarde automatique · historique conservé par jour
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {now.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "medium" })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <RateField
            label="USD → FC"
            value={rate?.usd_to_fc ?? null}
            onSave={(n) => saveField("usd_to_fc", n)}
          />
          <RateField
            label="EUR → USD"
            value={rate?.eur_to_usd ?? null}
            onSave={(n) => saveField("eur_to_usd", n)}
          />
          <RateField
            label="Franc Suisse → USD"
            value={rate?.chf_to_usd ?? null}
            onSave={(n) => saveField("chf_to_usd", n)}
          />
        </div>

        {history.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-lg border">
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
                {history.map((h) => (
                  <tr key={h.rate_date} className="border-t">
                    <td className="px-3 py-2">
                      {new Date(h.rate_date).toLocaleDateString("fr-FR")}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold">{s.value}</div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold">Activité récente</div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between border-b pb-2">
              <span>Connexion à l'espace</span>
              <span className="text-xs">{now.toLocaleTimeString("fr-FR")}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span>Dernière session active</span>
              <span className="text-xs">aujourd'hui</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Statut système</span>
              <span className="text-xs text-success">Opérationnel</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="h-4 w-4 text-primary" /> Stockage
          </div>
          <div className="text-2xl font-semibold">{stats.docs} fichiers</div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(stats.docs * 2, 100)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Espace cloud personnel</div>
        </div>
      </section>
    </div>
  );
}
