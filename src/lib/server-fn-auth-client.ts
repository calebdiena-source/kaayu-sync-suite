// Attaches the Supabase JWT to every TanStack server-fn request.
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    __lovableServerFnFetchPatched?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__lovableServerFnFetchPatched) {
  window.__lovableServerFnFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/_serverFn/")) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
          init = { ...(init ?? {}), headers };
        }
      }
    } catch { /* fall through to plain fetch */ }
    return originalFetch(input, init);
  };
}

export {};
