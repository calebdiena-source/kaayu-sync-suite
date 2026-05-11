// Server-only Google Calendar helpers (token refresh, event sync)
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export function getRedirectUri(origin: string) {
  return `${origin}/api/public/google/callback`;
}

export function buildAuthUrl(origin: string, state: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    id_token?: string;
  }>;
}

export async function refreshToken(refresh_token: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number; scope?: string }>;
}

export function decodeIdEmail(id_token?: string): string | null {
  if (!id_token) return null;
  try {
    const payload = JSON.parse(Buffer.from(id_token.split(".")[1], "base64").toString());
    return payload.email ?? null;
  } catch { return null; }
}

export async function getValidAccessToken(userId: string): Promise<{ token: string; calendarId: string } | null> {
  const { data } = await supabaseAdmin
    .from("google_integrations").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  let token = data.access_token;
  if (new Date(data.token_expires_at).getTime() - 60000 < Date.now()) {
    const r = await refreshToken(data.refresh_token);
    token = r.access_token;
    await supabaseAdmin.from("google_integrations").update({
      access_token: token,
      token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
    }).eq("user_id", userId);
  }
  return { token, calendarId: data.calendar_id ?? "primary" };
}

type EventInput = { title: string; description?: string | null; start_at: string; end_at?: string | null; location?: string | null };

export async function pushEvent(userId: string, ev: EventInput, googleEventId?: string | null): Promise<string | null> {
  const auth = await getValidAccessToken(userId);
  if (!auth) return null;
  const body = {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: { dateTime: new Date(ev.start_at).toISOString() },
    end: { dateTime: new Date(ev.end_at ?? new Date(new Date(ev.start_at).getTime() + 3600000).toISOString()).toISOString() },
  };
  const url = googleEventId
    ? `${API}/calendars/${encodeURIComponent(auth.calendarId)}/events/${googleEventId}`
    : `${API}/calendars/${encodeURIComponent(auth.calendarId)}/events`;
  const res = await fetch(url, {
    method: googleEventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google push failed: ${await res.text()}`);
  const j = await res.json();
  return j.id as string;
}

export async function deleteEvent(userId: string, googleEventId: string) {
  const auth = await getValidAccessToken(userId);
  if (!auth) return;
  await fetch(`${API}/calendars/${encodeURIComponent(auth.calendarId)}/events/${googleEventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.token}` },
  });
}
