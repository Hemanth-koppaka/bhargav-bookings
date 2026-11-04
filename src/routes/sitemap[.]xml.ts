import { createFileRoute } from "@tanstack/react-router";

// The public pages for search engines, on whichever address the site is served
// from. The booking steps need a choice first, so only their entry is listed.
const PAGES = [
  { path: "/", priority: "1.0", freq: "weekly" },
  { path: "/book", priority: "0.9", freq: "weekly" },
  { path: "/hours", priority: "0.8", freq: "weekly" },
  { path: "/contact", priority: "0.8", freq: "monthly" },
  { path: "/artist", priority: "0.7", freq: "monthly" },
  { path: "/studio", priority: "0.7", freq: "monthly" },
  { path: "/manage", priority: "0.4", freq: "monthly" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const today = new Date().toISOString().slice(0, 10);
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${origin}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>
`;
        return new Response(body, {
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
