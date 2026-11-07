import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

/**
 * Same job as the generated `attachSupabaseAuth`, without putting the whole
 * Supabase client in every page's first download. The site never signs anyone
 * in through Supabase in the browser (admin uses its own PIN session), so the
 * client is only fetched when a Supabase session could exist: a saved `sb-…`
 * login in this browser, or inside the Lovable editor preview (which keeps
 * its login elsewhere).
 */
function maySupabaseSession(): boolean {
  try {
    if (window.self !== window.top) return true;
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("sb-")) return true;
    }
    return false;
  } catch {
    return true;
  }
}

const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (!maySupabaseSession()) return next();
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
