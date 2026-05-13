import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { buildAuthUrl, pushEvent, deleteEvent, listEvents } from "./google-calendar.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GOOGLE_OAUTH_ORIGINS } from "./google-oauth-config";

// The redirect_uri sent to Google MUST be one of the stable Lovable URLs
// registered in Google Cloud Console. The user-facing origin (custom domain
// or published *.lovable.app) is encoded inside `state` so the callback can
// redirect the browser back to the page the user actually came from.

function stableOriginFromRequest() {
  const host = getRequestHost() ?? "";
  const isDev = host.includes("-dev") || host.includes("preview") || host.includes("localhost");
  return isDev ? GOOGLE_OAUTH_ORIGINS.preview : GOOGLE_OAUTH_ORIGINS.production;
}

function userFacingOriginFromRequest(): string {
  const origin = getRequestHeader("origin");
  if (origin) return origin;
  const referer = getRequestHeader("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  const host = getRequestHost();
  return host ? `https://${host}` : stableOriginFromRequest();
}

function encodeState(userId: string, returnTo: string) {
  const payload = JSON.stringify({ u: userId, o: returnTo, n: crypto.randomUUID() });
  return Buffer.from(payload).toString("base64url");
}

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const stableOrigin = stableOriginFromRequest();
    const returnOrigin = userFacingOriginFromRequest();
    const redirectUri = `${stableOrigin}/api/public/google/callback`;
    const state = encodeState(context.userId, returnOrigin);
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      action: "google_oauth_start",
      entity: "google",
      metadata: { state, redirect_uri: redirectUri, return_origin: returnOrigin },
    });
    return {
      url: buildAuthUrl(stableOrigin, state),
      redirectUri,
    };
  });

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("google_integrations")
      .select("google_email, sync_enabled, calendar_id, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin.from("google_integrations").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const syncEventToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { eventId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: ev } = await supabaseAdmin
      .from("calendar_events")
      .select("*")
      .eq("id", data.eventId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!ev) throw new Error("Event not found");
    const googleId = await pushEvent(context.userId, ev, ev.google_event_id);
    if (googleId) {
      await supabaseAdmin
        .from("calendar_events")
        .update({ google_event_id: googleId, google_synced_at: new Date().toISOString() })
        .eq("id", ev.id);
    }
    return { googleEventId: googleId };
  });

export const deleteEventFromGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { googleEventId: string }) => d)
  .handler(async ({ data, context }) => {
    await deleteEvent(context.userId, data.googleEventId);
    return { ok: true };
  });

export const syncTaskToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!t) throw new Error("Task not found");
    if (!t.due_date) return { googleEventId: null };
    const time = (t.due_time as string | null) || "09:00";
    const startIso = new Date(`${t.due_date}T${time}:00`).toISOString();
    const endIso = new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString();
    const colorByPriority: Record<string, string> = { high: "#D50000", medium: "#F6BF26", low: "#33B679" };
    const status = (t.status as string) === "done" ? " ✓" : "";
    const googleId = await pushEvent(
      context.userId,
      {
        title: `[Tâche] ${t.title}${status}`,
        description: t.description ?? null,
        start_at: startIso,
        end_at: endIso,
        reminder_minutes: 30,
        color: colorByPriority[t.priority as string] ?? null,
      },
      (t.google_event_id as string | null) ?? undefined,
    );
    if (googleId) {
      await supabaseAdmin
        .from("tasks")
        .update({ google_event_id: googleId, google_synced_at: new Date().toISOString() })
        .eq("id", t.id);
    }
    return { googleEventId: googleId };
  });

export const deleteTaskFromGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { googleEventId: string }) => d)
  .handler(async ({ data, context }) => {
    await deleteEvent(context.userId, data.googleEventId);
    return { ok: true };
  });

export const pullGoogleEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fromIso: string; toIso: string }) => d)
  .handler(async ({ data, context }) => {
    const items = await listEvents(context.userId, data.fromIso, data.toIso);
    let imported = 0;
    for (const g of items) {
      if (!g.id) continue;
      const startStr = g.start?.dateTime ?? g.start?.date;
      if (!startStr) continue;
      const endStr = g.end?.dateTime ?? g.end?.date ?? null;
      // Skip events we created from tasks (avoid duplicate insert as event)
      const isTaskMirror = (g.summary ?? "").startsWith("[Tâche]");
      if (isTaskMirror) continue;
      const { data: existing } = await supabaseAdmin
        .from("calendar_events")
        .select("id")
        .eq("user_id", context.userId)
        .eq("google_event_id", g.id)
        .maybeSingle();
      const row = {
        user_id: context.userId,
        title: g.summary ?? "(Sans titre)",
        description: g.description ?? null,
        location: g.location ?? null,
        start_at: new Date(startStr).toISOString(),
        end_at: endStr ? new Date(endStr).toISOString() : null,
        google_event_id: g.id,
        google_synced_at: new Date().toISOString(),
      };
      if (existing?.id) {
        await supabaseAdmin.from("calendar_events").update(row).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("calendar_events").insert(row);
        imported++;
      }
    }
    return { imported, total: items.length };
  });
