import type { LoaderFunctionArgs } from "react-router";
import { getBlogSlugs } from "../lib/blog.server";

const BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://tinylemon.example.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const slugs = getBlogSlugs();
  const urls: string[] = [
    "",
    "/features",
    "/pricing",
    "/try",
    "/blog",
    ...slugs.map((s) => `/blog/${encodeURIComponent(s)}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (path) => `  <url>
    <loc>${escapeXml(BASE + path || "/")}</loc>
    <changefreq>weekly</changefreq>
  </url>`
  )
  .join("\n")}
</urlset>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
