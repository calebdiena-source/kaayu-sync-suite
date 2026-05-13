import { createFileRoute } from "@tanstack/react-router";
import { exchangeCode, decodeIdEmail } from "@/lib/google-calendar.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type StatePayload = { u: string; o?: string; n?: string };

function decodeState(raw: string): StatePayload | null {
  // New format: base64url JSON { u, o, n }
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as StatePayload;
    if (parsed && typeof parsed.u === "string") return parsed;
  } catch {
    /* fall through to legacy */
  }
  // Legacy format: "<userId>.<nonce>"
  const userId = raw.split(".")[0];
  if (userId) return { u: userId };
  return null;
}

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        // The redirect_uri sent to Google was THIS host — keep it identical
        // for the token exchange or Google rejects with redirect_uri_mismatch.
        const callbackOrigin = `${url.protocol}//${url.host}`;

        const parsed = state ? decodeState(state) : null;
        // Where to send the user's browser after we're done.
        const returnOrigin = parsed?.o ?? callbackOrigin;

        const redirectApp = (msg: string, ok: boolean) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: `${returnOrigin}/app/settings?google=${ok ? "ok" : "err"}&msg=${encodeURIComponent(msg)}`,
            },
          });

        if (error || !code || !state) return redirectApp(error ?? "missing_code", false);
        if (!parsed) return redirectApp("invalid_state", false);

        try {
          const tok = await exchangeCode(code, callbackOrigin);
          const email = decodeIdEmail(tok.id_token);
          await supabaseAdmin.from("google_integrations").upsert(
            {
              user_id: parsed.u,
              google_email: email,
              access_token: tok.access_token,
              refresh_token: tok.refresh_token,
              token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
              scope: tok.scope,
              calendar_id: "primary",
              sync_enabled: true,
            },
            { onConflict: "user_id" },
          );
          return redirectApp("connected", true);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "exchange_failed";
          return redirectApp(msg, false);
        }
      },
    },
  },
});
