import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { month, from, to } = await req.json();
    const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const isMonth = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
    if (!isMonth(month) && !(isDate(from) && isDate(to))) {
      return new Response(
        JSON.stringify({ error: "Période invalide (month YYYY-MM ou from/to YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    let start: string;
    let end: string;
    let periodKey: string;
    let periodLabel: string;
    if (isMonth(month)) {
      start = `${month}-01`;
      const [y, m] = (month as string).split("-").map(Number);
      end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      periodKey = month as string;
      periodLabel = `mois ${month}`;
    } else {
      start = from as string;
      const toDate = new Date(`${to}T00:00:00Z`);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      end = toDate.toISOString().slice(0, 10);
      periodKey = `${from}→${to}`;
      periodLabel = `période du ${from} au ${to}`;
    }

    const [docsRes, versionsRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id,name,category,mime_type,size_bytes,created_at,updated_at,tags,folder_id")
        .gte("created_at", start)
        .lt("created_at", end),
      supabase
        .from("document_versions")
        .select("id,document_id,version_number,created_at,size_bytes,comment,mime_type")
        .gte("created_at", start)
        .lt("created_at", end),
    ]);

    const docs = docsRes.data ?? [];
    const versions = versionsRes.data ?? [];

    const byCategory = docs.reduce((acc: Record<string, number>, d: any) => {
      const k = d.category ?? "Sans catégorie";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const byMime = docs.reduce((acc: Record<string, number>, d: any) => {
      const k = (d.mime_type ?? "inconnu").split(";")[0];
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const tagCounts: Record<string, number> = {};
    for (const d of docs as any[]) {
      for (const t of d.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }));

    const totalSize = docs.reduce((a: number, d: any) => a + (d.size_bytes ?? 0), 0);
    const versionsSize = versions.reduce((a: number, v: any) => a + (v.size_bytes ?? 0), 0);
    const docsWithVersions = new Set(versions.map((v: any) => v.document_id)).size;

    const dailyCounts: Record<string, number> = {};
    for (const d of docs as any[]) {
      const day = (d.created_at as string).slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
    }
    const timeline = Object.entries(dailyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    const stats = {
      documents: {
        count: docs.length,
        totalSize,
        byCategory,
        byMime,
        topTags,
        timeline,
      },
      versions: {
        count: versions.length,
        totalSize: versionsSize,
        docsWithVersions,
      },
    };

    const prompt = `Tu es l'analyste documentaire de Kaayu Workspace. Analyse UNIQUEMENT l'activité documentaire de la ${periodLabel} et produis un rapport professionnel en français, exclusivement centré sur les documents (création, catégorisation, versions, types de fichiers, tags). N'évoque ni les taux de change, ni les tâches, ni les réunions.

Statistiques documentaires :
${JSON.stringify(stats, null, 2)}

Échantillon de documents : ${JSON.stringify(docs.slice(0, 30).map((d: any) => ({ name: d.name, category: d.category, mime: d.mime_type, size: d.size_bytes, tags: d.tags, created: d.created_at })))}

Produis un rapport en JSON strict avec :
- "executive_summary": 3-4 phrases de synthèse sur l'activité documentaire
- "key_points": tableau de 5-8 points clés courts
- "categories_analysis": analyse de la répartition par catégorie (1 paragraphe)
- "formats_analysis": analyse des types de fichiers et tailles (1 paragraphe)
- "versions_analysis": analyse du versioning et collaboration (1 paragraphe)
- "tags_analysis": analyse des tags les plus utilisés (1 paragraphe court)
- "recommendations": 3-5 recommandations concrètes pour mieux organiser/gérer les documents

Réponds UNIQUEMENT avec le JSON valide, sans markdown.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu produis des rapports d'analyse en JSON valide uniquement." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429)
        return new Response(JSON.stringify({ error: "Trop de requêtes IA, réessayez plus tard." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
        categories_analysis: "",
        formats_analysis: "",
        versions_analysis: "",
        tags_analysis: "",
        recommendations: [],
      };
    }

    return new Response(
      JSON.stringify({ month: periodKey, period: { start, end, label: periodLabel }, stats, report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("documents-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
