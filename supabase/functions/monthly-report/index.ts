import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { month } = await req.json(); // "YYYY-MM"
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return new Response(JSON.stringify({ error: "Mois invalide (attendu YYYY-MM)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configurée");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const endDate = new Date(Date.UTC(y, m, 1));
    const end = endDate.toISOString().slice(0, 10);

    const [docsRes, versionsRes, ratesRes, tasksRes, meetingsRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id,name,category,mime_type,size_bytes,created_at,updated_at,tags")
        .gte("created_at", start)
        .lt("created_at", end),
      supabase
        .from("document_versions")
        .select("id,document_id,version_number,created_at,size_bytes,comment")
        .gte("created_at", start)
        .lt("created_at", end),
      supabase
        .from("exchange_rates")
        .select("rate_date,usd_to_fc,eur_to_usd,chf_to_usd,updated_at")
        .gte("rate_date", start)
        .lt("rate_date", end)
        .order("rate_date", { ascending: true }),
      supabase
        .from("tasks")
        .select("id,title,status,priority,due_date,created_at")
        .gte("created_at", start)
        .lt("created_at", end),
      supabase
        .from("meetings")
        .select("id,title,meeting_date,participants,summary")
        .gte("meeting_date", start)
        .lt("meeting_date", end),
    ]);

    const docs = docsRes.data ?? [];
    const versions = versionsRes.data ?? [];
    const rates = ratesRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const meetings = meetingsRes.data ?? [];

    // Rate evolution stats
    const rateStats = (key: "usd_to_fc" | "eur_to_usd" | "chf_to_usd") => {
      const values = rates
        .map((r: any) => r[key])
        .filter((v: any) => v !== null && v !== undefined) as number[];
      if (!values.length) return null;
      const first = values[0];
      const last = values[values.length - 1];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const variation = first ? ((last - first) / first) * 100 : 0;
      return { first, last, min, max, avg, variation, count: values.length };
    };

    const stats = {
      documents: {
        count: docs.length,
        totalSize: docs.reduce((a, d: any) => a + (d.size_bytes ?? 0), 0),
        byCategory: docs.reduce((acc: Record<string, number>, d: any) => {
          const k = d.category ?? "Sans catégorie";
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
      },
      versions: { count: versions.length },
      rates: {
        usd_to_fc: rateStats("usd_to_fc"),
        eur_to_usd: rateStats("eur_to_usd"),
        chf_to_usd: rateStats("chf_to_usd"),
        timeline: rates,
      },
      tasks: {
        count: tasks.length,
        byStatus: tasks.reduce((acc: Record<string, number>, t: any) => {
          acc[t.status] = (acc[t.status] ?? 0) + 1;
          return acc;
        }, {}),
      },
      meetings: { count: meetings.length },
    };

    const prompt = `Tu es l'analyste mensuel de Kaayu Workspace. Analyse les données du mois ${month} et produis un rapport professionnel en français.

Données :
${JSON.stringify(stats, null, 2)}

Échantillon de documents : ${JSON.stringify(docs.slice(0, 20).map((d: any) => ({ name: d.name, category: d.category, created: d.created_at })))}
Échantillon de réunions : ${JSON.stringify(meetings.slice(0, 10).map((m: any) => ({ title: m.title, date: m.meeting_date })))}

Produis un rapport structuré en JSON avec :
- "executive_summary": 3-4 phrases de synthèse exécutive
- "key_points": tableau de 5-8 points clés (chaînes courtes)
- "rate_analysis": analyse de l'évolution des taux de change (USD→FC, EUR→USD, CHF→USD) en 1 paragraphe
- "activity_analysis": analyse de l'activité (documents, versions, tâches, réunions) en 1-2 paragraphes
- "recommendations": 3-5 recommandations concrètes pour le mois suivant

Réponds UNIQUEMENT avec le JSON valide, sans markdown.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Tu produis des rapports d'analyse en JSON valide uniquement.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429)
        return new Response(
          JSON.stringify({ error: "Trop de requêtes IA, réessayez plus tard." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      if (aiRes.status === 402)
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      throw new Error("Erreur du service IA");
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let report: any;
    try {
      report = JSON.parse(raw);
    } catch {
      report = {
        executive_summary: raw,
        key_points: [],
        rate_analysis: "",
        activity_analysis: "",
        recommendations: [],
      };
    }

    return new Response(JSON.stringify({ month, stats, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("monthly-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
