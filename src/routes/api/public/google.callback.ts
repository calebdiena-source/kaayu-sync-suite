import { createFileRoute } from "@tanstack/react-router";
import { exchangeCode, decodeIdEmail, getRedirectUri } from "@/lib/google-calendar.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;

        const redirectApp = (msg: string, ok: boolean) =>
          new Response(null, { status: 302, headers: { Location: `/app/settings?google=${ok ? "ok" : "err"}&msg=${encodeURIComponent(msg)}` } });

        if (error || !code || !state) return redirectApp(error ?? "missing_code", false);

        const userId = state.split(".")[0];
        if (!userId) return redirectApp("invalid_state", false);

        try {
          // ensure redirect_uri matches what we sent
          void getRedirectUri(origin);
          const tok = await exchangeCode(code, origin);
          const email = decodeIdEmail(tok.id_token);
          await supabaseAdmin.from("google_integrations").upsert({
            user_id: userId,
            google_email: email,
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
            scope: tok.scope,
            calendar_id: "primary",
            sync_enabled: true,
          }, { onConflict: "user_id" });
          return redirectApp("connected", true);
        } catch (e: any) {
          return redirectApp(e?.message ?? "exchange_failed", false);
        }
      },
    },
  },
});
