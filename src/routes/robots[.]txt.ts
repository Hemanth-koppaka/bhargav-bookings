import { createFileRoute } from "@tanstack/react-router";

// Search engines may read the public site; the admin console and the site's
// internal endpoints stay out of search results. Points to the sitemap on
// whichever address the site is served from.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /_serverFn/
Disallow: /confirmed

Sitemap: ${origin}/sitemap.xml
`;
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
