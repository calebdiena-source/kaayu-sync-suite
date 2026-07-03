import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILES = 25;            // hard cap to keep latency & cost predictable
const MAX_CHARS_PER_FILE = 8000; // text excerpt per doc sent to AI
const AI_CONCURRENCY = 3;        // parallel per-doc AI calls (gateway rate limits ~aggressively)
const AI_MAX_RETRIES = 4;        // retry on 429 with exponential backoff

async function callAiWithRetry(body: any, apiKey: string): Promise<Response> {
  let delay = 800;
  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status !== 429 || attempt === AI_MAX_RETRIES) return res;
    // Respect Retry-After if provided, otherwise exponential backoff
    const ra = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : delay + Math.floor(Math.random() * 300);
    await new Promise((r) => setTimeout(r, wait));
    delay = Math.min(delay * 2, 8000);
  }
  // Unreachable, but satisfies TS
  return new Response("rate limited", { status: 429 });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const TEXTUAL_MIMES = [
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/yaml",
  "application/sql",
  "application/csv",
  "application/rtf",
];

function isTextual(mime?: string | null) {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return TEXTUAL_MIMES.some((p) => m.startsWith(p));
}

function isImage(mime?: string | null) {
  return !!mime && mime.toLowerCase().startsWith("image/");
}

function isPdf(mime?: string | null) {
  return !!mime && mime.toLowerCase().includes("pdf");
}

function isDocx(mime?: string | null, name?: string | null) {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("officedocument.wordprocessingml.document")) return true;
  if (m === "application/msword") return true;
  return !!name && /\.docx?$/i.test(name);
}

function isOfficeOpenXml(mime?: string | null, name?: string | null) {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("openxmlformats-officedocument")) return true;
  return !!name && /\.(xlsx|pptx)$/i.test(name);
}

async function extractDocxText(bytes: Uint8Array, maxChars: number): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const parts: string[] = [];
  const files = ["word/document.xml"];
  // also include headers/footers if present
  zip.forEach((path) => {
    if (/^word\/(header|footer)\d*\.xml$/.test(path)) files.push(path);
  });
  for (const p of files) {
    const f = zip.file(p);
    if (!f) continue;
    const xml = await f.async("string");
    // paragraphs separated by w:p, runs by w:t
    const paragraphs = xml.split(/<w:p[ >]/);
    for (const para of paragraphs) {
      const texts = [...para.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
        m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      );
      if (texts.length) parts.push(texts.join(""));
    }
    if (parts.join("\n").length > maxChars) break;
  }
  return parts.join("\n").slice(0, maxChars);
}

async function extractOoxmlSharedText(bytes: Uint8Array, maxChars: number): Promise<string> {
  // Generic fallback for xlsx/pptx: concatenate all <t> / <a:t> texts
  try {
    const zip = await JSZip.loadAsync(bytes);
    const parts: string[] = [];
    const targets: string[] = [];
    zip.forEach((path) => {
      if (/\.xml$/.test(path) && /(sharedStrings|sheet|slide|notesSlide)/i.test(path)) targets.push(path);
    });
    for (const p of targets) {
      const xml = await zip.file(p)!.async("string");
      const texts = [...xml.matchAll(/<(?:a:)?t[^>]*>([\s\S]*?)<\/(?:a:)?t>/g)].map((m) => m[1]);
      if (texts.length) parts.push(texts.join(" "));
      if (parts.join("\n").length > maxChars) break;
    }
    return parts.join("\n").slice(0, maxChars);
  } catch {
    return "";
  }
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configurée");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // 1) Charger TOUS les documents accessibles à l'utilisateur. La période
    //    sera filtrée selon la date INSCRITE DANS le document (en-tête taux),
    //    pas selon la date d'enregistrement dans l'application.
    const [docsRes, versionsRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id,name,category,mime_type,size_bytes,created_at,updated_at,tags,folder_id,storage_path,storage_provider")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("document_versions")
        .select("id,document_id,version_number,created_at,size_bytes,comment,mime_type")
        .gte("created_at", start)
        .lt("created_at", end),
    ]);

    const allDocs = (docsRes.data ?? []) as any[];
    const versions = (versionsRes.data ?? []) as any[];

    // 2) Lecture du contenu (limité) avant filtrage par date du document
    const toAnalyze = allDocs.slice(0, 120);
    const fileContents = await Promise.all(
      toAnalyze.map(async (d) => {
        const base: any = {
          id: d.id,
          name: d.name,
          category: d.category ?? null,
          mime: d.mime_type ?? null,
          size: d.size_bytes ?? null,
          created_at: d.created_at,
          tags: d.tags ?? [],
        };
        try {
          if (d.storage_provider && d.storage_provider !== "supabase") {
            return { ...base, kind: "metadata", note: "Fichier externe non lu" };
          }
          if (!d.storage_path) return { ...base, kind: "metadata", note: "Aucun chemin de stockage" };

          const dl = await supabaseAdmin.storage.from("documents").download(d.storage_path);
          if (dl.error || !dl.data) {
            return { ...base, kind: "metadata", note: `Téléchargement impossible: ${dl.error?.message ?? "inconnu"}` };
          }
          const ab = await dl.data.arrayBuffer();
          const bytes = new Uint8Array(ab);

          if (isTextual(d.mime_type)) {
            const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, MAX_CHARS_PER_FILE);
            return { ...base, kind: "text", content: text };
          }
          if (isImage(d.mime_type)) {
            // Skip very large images
            if (bytes.byteLength > 4 * 1024 * 1024) {
              return { ...base, kind: "metadata", note: "Image trop volumineuse pour analyse" };
            }
            const b64 = await bytesToBase64(bytes);
            return { ...base, kind: "image", dataUrl: `data:${d.mime_type};base64,${b64}` };
          }
          if (isPdf(d.mime_type)) {
            // Heuristique simple: extraction de chaînes ASCII imprimables dans le PDF
            const decoded = new TextDecoder("latin1").decode(bytes);
            const matches = decoded.match(/[\x20-\x7E\u00A0-\u024F\n\r\t]{4,}/g) ?? [];
            const text = matches.join("\n").replace(/\s+\n/g, "\n").slice(0, MAX_CHARS_PER_FILE);
            return { ...base, kind: "pdf_text", content: text };
          }
          if (isDocx(d.mime_type, d.name)) {
            try {
              const text = await extractDocxText(bytes, MAX_CHARS_PER_FILE);
              if (text.trim().length >= 20) {
                return { ...base, kind: "text", content: text };
              }
              return { ...base, kind: "metadata", note: "DOCX sans texte extractible" };
            } catch (e: any) {
              return { ...base, kind: "metadata", note: `DOCX illisible: ${e?.message ?? "inconnu"}` };
            }
          }
          if (isOfficeOpenXml(d.mime_type, d.name)) {
            const text = await extractOoxmlSharedText(bytes, MAX_CHARS_PER_FILE);
            if (text.trim().length >= 20) {
              return { ...base, kind: "text", content: text };
            }
            return { ...base, kind: "metadata", note: "Document Office sans texte extractible" };
          }
          return { ...base, kind: "metadata", note: "Type non lisible automatiquement" };
        } catch (e: any) {
          return { ...base, kind: "metadata", note: `Erreur de lecture: ${e?.message ?? "inconnue"}` };
        }
      }),
    );

    // 2bis) Extraire la date INSCRITE dans le document (en-tête « TAUX DU JOUR — JJ/MM/AAAA »)
    //       et filtrer selon la période demandée.
    const extractDocDate = (text?: string | null): string | null => {
      if (!text) return null;
      // 1) en-tête taux du jour
      let m = text.match(/TAUX\s+DU\s+JOUR[^0-9]*?(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i);
      // 2) fallback: première date FR du document
      if (!m) m = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
      // 3) fallback: première date ISO
      if (!m) {
        const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
        return null;
      }
      let [, dd, mm, yy] = m;
      let year = yy.length === 2 ? `20${yy}` : yy;
      const d = dd.padStart(2, "0");
      const mo = mm.padStart(2, "0");
      return `${year}-${mo}-${d}`;
    };

    const withDocDate = fileContents.map((f: any) => {
      const text = typeof f.content === "string" ? f.content : "";
      const docDate = extractDocDate(text);
      return { ...f, doc_date: docDate, used_date: docDate ?? (f.created_at?.slice(0, 10) ?? null) };
    });

    // Filtre: date du document (ou created_at en secours) doit être dans [start, end)
    const inPeriod = withDocDate.filter((f: any) => {
      const d = f.used_date;
      return typeof d === "string" && d >= start && d < end;
    });

    // Cap après filtrage pour limiter le coût IA
    const docsForAi = inPeriod.slice(0, MAX_FILES);
    const docs = docsForAi; // utilisé pour stats & message d'agrégation

    // Statistiques agrégées (sur les documents de la période)
    const byCategory = docs.reduce((acc: Record<string, number>, d: any) => {
      const k = d.category ?? "Sans catégorie";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const byMime = docs.reduce((acc: Record<string, number>, d: any) => {
      const k = (d.mime ?? "inconnu").split(";")[0];
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const tagCounts: Record<string, number> = {};
    for (const d of docs) for (const t of d.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }));
    const totalSize = docs.reduce((a: number, d: any) => a + (d.size ?? 0), 0);
    const versionsSize = versions.reduce((a: number, v: any) => a + (v.size_bytes ?? 0), 0);
    const docsWithVersions = new Set(versions.map((v: any) => v.document_id)).size;
    const dailyCounts: Record<string, number> = {};
    for (const d of docs) {
      const day = d.used_date as string;
      if (day) dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
    }
    const timeline = Object.entries(dailyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    // 3) Résumer chaque document via l'IA — concurrence limitée + retry sur 429
    const perDocSummaries = await mapWithConcurrency(docsForAi, AI_CONCURRENCY, async (f) => {
      const id = f.id;
      const header = `Nom: ${f.name}\nType: ${f.mime ?? "inconnu"}\nCatégorie: ${f.category ?? "—"}\nTags: ${(f.tags ?? []).join(", ") || "—"}\nDate du document: ${f.doc_date ?? "(non détectée, fallback création: " + (f.created_at?.slice(0, 10) ?? "—") + ")"}`;

      let userContent: any;
      if (f.kind === "text" || f.kind === "pdf_text") {
        if (!f.content || f.content.trim().length < 20) {
          return {
            id,
            name: f.name,
            summary: f.kind === "pdf_text"
              ? "PDF probablement scanné/sans texte extractible."
              : "Document vide ou trop court pour analyse.",
            key_points: [],
          };
        }
        userContent = `${header}\n\nContenu extrait (tronqué):\n"""\n${f.content}\n"""\n\nRéponds en JSON: {"summary": "résumé 2-4 phrases", "key_points": ["3 à 6 puces"]}`;
      } else if (f.kind === "image") {
        userContent = [
          { type: "text", text: `${header}\n\nAnalyse le contenu visible de l'image (texte, schémas, sujet) et réponds en JSON: {"summary": "résumé 2-4 phrases", "key_points": ["3 à 6 puces"]}` },
          { type: "image_url", image_url: { url: f.dataUrl } },
        ];
      } else {
        return {
          id,
          name: f.name,
          summary: f.note ?? "Contenu non analysé.",
          key_points: [],
        };
      }

      try {
        const r = await callAiWithRetry({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Tu es un analyste documentaire. Réponds STRICTEMENT en JSON valide, en français." },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }, LOVABLE_API_KEY);
        if (!r.ok) {
          const t = await r.text();
          console.error("per-doc AI error", r.status, t.slice(0, 200));
          const msg = r.status === 429
            ? "Analyse temporairement limitée (quota IA atteint)."
            : r.status === 402
              ? "Crédits IA épuisés."
              : `Analyse indisponible (${r.status}).`;
          return { id, name: f.name, category: f.category, mime: f.mime, summary: msg, key_points: [] };
        }
        const j = await r.json();
        const raw = j?.choices?.[0]?.message?.content ?? "{}";
        let parsed: any = {};
        try { parsed = JSON.parse(raw); } catch { parsed = { summary: String(raw).slice(0, 400), key_points: [] }; }
        return {
          id,
          name: f.name,
          category: f.category,
          mime: f.mime,
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
          key_points: Array.isArray(parsed.key_points) ? parsed.key_points.filter((x: any) => typeof x === "string").slice(0, 8) : [],
        };
      } catch (e: any) {
        return { id, name: f.name, category: f.category, mime: f.mime, summary: `Erreur d'analyse: ${e?.message ?? "inconnue"}`, key_points: [] };
      }
    });


    const stats = {
      documents: {
        count: docs.length,
        analyzed: perDocSummaries.length,
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

    // 4) Synthèse unique des documents
    const synthesisPrompt = `Tu es l'analyste documentaire de Kaayu Workspace. À partir des résumés individuels des documents de la ${periodLabel}, rédige UNE SEULE synthèse en français, fluide et structurée, qui regroupe et raconte ce que disent les documents de la période (sujets traités, contenus principaux, décisions, faits, chiffres clés, éventuelles incohérences ou doublons). N'évoque ni les taux de change, ni les tâches, ni les réunions, ni les statistiques de stockage. Ne fais pas une liste de fichiers ni un tableau ; produis un texte narratif organisé en paragraphes (avec sous-titres en gras si utile), de longueur adaptée au volume documentaire (typiquement 400 à 1200 mots). Propose aussi 3 à 7 recommandations concrètes et actionnables tirées du contenu des documents (organisation, suivi, décisions à prendre, points à clarifier, etc.).
 
Résumés des documents (${perDocSummaries.length} fichiers analysés sur ${docs.length}) :
${JSON.stringify(perDocSummaries.map((s) => ({ name: s.name, category: (s as any).category, summary: s.summary, key_points: s.key_points })), null, 2)}
 
Réponds STRICTEMENT en JSON valide de la forme : {"synthesis": "<le texte de la synthèse, en markdown léger>", "recommendations": ["...", "..."]}.`;

    const aiRes = await callAiWithRetry({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Tu produis un texte de synthèse documentaire renvoyé strictement en JSON {\"synthesis\": \"...\"}." },
        { role: "user", content: synthesisPrompt },
      ],
      response_format: { type: "json_object" },
    }, LOVABLE_API_KEY);


    let synthesis = "";
    let recommendations: string[] = [];

    if (!aiRes.ok) {
      // Dégradation gracieuse : on garde les résumés par document et on fabrique
      // une synthèse minimale plutôt que de faire échouer tout le rapport.
      const t = await aiRes.text().catch(() => "");
      console.error("synthesis AI error", aiRes.status, t.slice(0, 200));
      const reason = aiRes.status === 429
        ? "quota IA temporairement atteint"
        : aiRes.status === 402
          ? "crédits IA épuisés"
          : `erreur IA ${aiRes.status}`;
      synthesis = `Synthèse automatique indisponible (${reason}). Les résumés par document ci-dessous restent disponibles.`;
      recommendations = [];
    } else {
      const aiJson = await aiRes.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(raw);
        synthesis = typeof parsed.synthesis === "string" ? parsed.synthesis : String(raw);
        if (Array.isArray(parsed.recommendations)) {
          recommendations = parsed.recommendations.filter((x: any) => typeof x === "string").slice(0, 10);
        }
      } catch {
        synthesis = String(raw);
      }
    }

    const report = { synthesis, recommendations, per_document: perDocSummaries };

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
