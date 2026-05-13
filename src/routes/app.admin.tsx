import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/app/admin")({
  head: () => ({ meta: [{ title: "Administration — Kaayu" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const [counts, setCounts] = useState({ users: 0, docs: 0, meetings: 0, rates: 0 });

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [u, d, m, r] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("documents").select("*", { count: "exact", head: true }),
        supabase.from("meetings").select("*", { count: "exact", head: true }),
        supabase.from("exchange_rates").select("*", { count: "exact", head: true }),
      ]);
      setCounts({
        users: u.count ?? 0,
        docs: d.count ?? 0,
        meetings: m.count ?? 0,
        rates: r.count ?? 0,
      });
    })();
  }, [isAdmin]);

  if (loading) return <div className="text-muted-foreground">Chargement…</div>;
  if (!isAdmin)
    return (
      <div className="rounded-xl border bg-card p-12 text-center">
        <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">Accès réservé aux administrateurs.</div>
      </div>
    );

  const cards = [
    { label: "Utilisateurs", value: counts.users },
    { label: "Documents", value: counts.docs },
    { label: "Réunions", value: counts.meetings },
    { label: "Taux enregistrés", value: counts.rates },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Administration</h2>
        <p className="text-sm text-muted-foreground">Statistiques globales</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {c.label}
            </div>
            <div className="mt-2 text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
