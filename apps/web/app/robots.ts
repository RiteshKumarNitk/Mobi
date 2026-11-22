import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/cart", "/checkout", "/confirmation", "/orders/", "/wishlist", "/login", "/register", "/forgot-password", "/track", "/quick-order", "/search"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
