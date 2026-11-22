import type { MetadataRoute } from "next";
import { fetchPublic, SITE_URL } from "@/lib/site";

// Rendered per request (never frozen at build time, when the API may be unreachable);
// the underlying API calls are cached for an hour by fetchPublic.
export const dynamic = "force-dynamic";

const STATIC = ["", "/products", "/categories", "/brands", "/offers", "/faqs", "/blog", "/contact",
  "/page/about", "/page/privacy", "/page/terms", "/page/shipping-policy", "/page/return-policy", "/page/cancellation-policy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.6 }));

  // Product pages (API pages are capped at 50 items; walk up to 40 pages = 2000 products).
  for (let page = 1; page <= 40; page++) {
    const data = await fetchPublic<{ items: { id: string }[]; pages: number }>(`/products?page=${page}&pageSize=50`, 3600);
    if (!data) break;
    for (const p of data.items) entries.push({ url: `${SITE_URL}/products/${p.id}`, changeFrequency: "daily", priority: 0.8 });
    if (page >= data.pages) break;
  }
  const blog = await fetchPublic<{ items: { slug: string; updatedAt?: string }[] }>("/blog?pageSize=50", 3600);
  for (const b of blog?.items ?? []) entries.push({ url: `${SITE_URL}/blog/${b.slug}`, lastModified: b.updatedAt, changeFrequency: "monthly", priority: 0.4 });
  return entries;
}
