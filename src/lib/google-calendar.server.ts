// Server-only Google Calendar helpers (token refresh, event sync)
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
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

export class GoogleReconnectRequiredError extends Error {
  constructor(message = "google_reconnect_required") {
    super(message);
    this.name = "GoogleReconnectRequiredError";
  }
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
  if (!res.ok) {
    const body = await res.text();
    const lower = body.toLowerCase();
    if (
      res.status === 400 ||
      res.status === 401 ||
      lower.includes("invalid_grant") ||
      lower.includes("expired or revoked")
    ) {
      throw new GoogleReconnectRequiredError();
    }
    throw new Error(`Refresh failed: ${body}`);
  }
  return res.json() as Promise<{ access_token: string; expires_in: number; scope?: string }>;
}

export function decodeIdEmail(id_token?: string): string | null {
  if (!id_token) return null;
  try {
    const payload = JSON.parse(Buffer.from(id_token.split(".")[1], "base64").toString());
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export async function getValidAccessToken(
  userId: string,
): Promise<{ token: string; calendarId: string } | null> {
  const { data } = await supabaseAdmin
    .from("google_integrations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  let token = data.access_token;
  if (new Date(data.token_expires_at).getTime() - 60000 < Date.now()) {
    try {
      const r = await refreshToken(data.refresh_token);
      token = r.access_token;
      await supabaseAdmin
        .from("google_integrations")
        .update({
          access_token: token,
          token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
        })
        .eq("user_id", userId);
    } catch (e) {
      if (e instanceof GoogleReconnectRequiredError) {
        // Token révoqué/expiré : supprimer l'intégration pour forcer une reconnexion propre.
        await supabaseAdmin.from("google_integrations").delete().eq("user_id", userId);
        return null;
      }
      throw e;
    }
  }
  return { token, calendarId: data.calendar_id ?? "primary" };
}

type EventInput = {
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
  reminder_minutes?: number | null;
  color?: string | null;
};

// Map hex/name colors to Google Calendar colorId (1-11). Best-effort.
const COLOR_TO_ID: Record<string, string> = {
  "#7986CB": "1",
  "#33B679": "2",
  "#8E24AA": "3",
  "#E67C73": "4",
  "#F6BF26": "5",
  "#F4511E": "6",
  "#039BE5": "7",
  "#616161": "8",
  "#3F51B5": "9",
  "#0B8043": "10",
  "#D50000": "11",
};

export async function pushEvent(
  userId: string,
  ev: EventInput,
  googleEventId?: string | null,
): Promise<string | null> {
  const auth = await getValidAccessToken(userId);
  if (!auth) return null;
  const startIso = new Date(ev.start_at).toISOString();
  const endIso = new Date(
    ev.end_at ?? new Date(new Date(ev.start_at).getTime() + 3600000).toISOString(),
  ).toISOString();
  const reminders =
    ev.reminder_minutes && ev.reminder_minutes > 0
      ? {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: ev.reminder_minutes },
            { method: "email", minutes: ev.reminder_minutes },
          ],
        }
      : { useDefault: true };
  const body: Record<string, unknown> = {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
    reminders,
  };
  if (ev.color && COLOR_TO_ID[ev.color.toUpperCase()]) {
    body.colorId = COLOR_TO_ID[ev.color.toUpperCase()];
  }
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

export type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  colorId?: string;
};

export async function listEvents(
  userId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleEvent[]> {
  const auth = await getValidAccessToken(userId);
  if (!auth) return [];
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(auth.calendarId)}/events?${params}`,
    {
      headers: { Authorization: `Bearer ${auth.token}` },
    },
  );
  if (!res.ok) throw new Error(`Google list failed: ${await res.text()}`);
  const j = await res.json();
  return (j.items ?? []) as GoogleEvent[];
}
