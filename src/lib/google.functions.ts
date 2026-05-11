import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { buildAuthUrl, pushEvent, deleteEvent } from "./google-calendar.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function originFromRequest() {
  const host = getRequestHost();
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const origin = originFromRequest();
    // state = userId (signed via random nonce stored)
    const state = `${context.userId}.${crypto.randomUUID()}`;
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId, action: "google_oauth_start", entity: "google", metadata: { state },
    });
    return { url: buildAuthUrl(origin, state) };
  });

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("google_integrations")
      .select("google_email, sync_enabled, calendar_id, created_at")
      .eq("user_id", context.userId).maybeSingle();
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
      .from("calendar_events").select("*").eq("id", data.eventId).eq("user_id", context.userId).maybeSingle();
    if (!ev) throw new Error("Event not found");
    const googleId = await pushEvent(context.userId, ev, ev.google_event_id);
    if (googleId) {
      await supabaseAdmin.from("calendar_events")
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
