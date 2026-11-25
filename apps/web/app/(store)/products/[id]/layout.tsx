import type { Metadata } from "next";
import { fetchPublic, SITE_NAME, SITE_URL } from "@/lib/site";

interface ProductMeta {
  id: string;
  name: string;
  sku: string;
  price: string;
  description?: string | null;
  shortDescription?: string | null;
  image?: string | null;
  stockQuantity: number;
  brand?: { name: string } | null;
  rating?: number;
  reviewCount?: number;
}

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

const loadProduct = (id: string) => fetchPublic<ProductMeta>(`/products/${encodeURIComponent(id)}`, 120);

const plain = (s?: string | null) => (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await loadProduct(id);
  if (!p) return { title: "Product", robots: { index: false, follow: true } };
  const description = (plain(p.shortDescription) || plain(p.description) || `${p.name} at wholesale price from ${SITE_NAME}.`).slice(0, 160);
  return {
    title: { absolute: `${p.name} | ${SITE_NAME}` },
    description,
    alternates: { canonical: `/products/${p.id}` },
    openGraph: { type: "website", title: p.name, description, url: `/products/${p.id}`, images: p.image ? [{ url: p.image }] : undefined },
  };
}

export default async function ProductLayout({ params, children }: Props) {
  const { id } = await params;
  const p = await loadProduct(id);
  // Structured data uses only real catalogue values; rating is included only
  // when approved reviews actually exist.
  const jsonLd = p
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        sku: p.sku,
        image: p.image ? [p.image] : undefined,
        description: plain(p.shortDescription) || plain(p.description) || undefined,
        brand: p.brand ? { "@type": "Brand", name: p.brand.name } : undefined,
        offers: {
          "@type": "Offer",
          url: `${SITE_URL}/products/${p.id}`,
          priceCurrency: "INR",
          price: Number(p.price).toFixed(2),
          availability: p.stockQuantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          seller: { "@type": "Organization", name: SITE_NAME },
        },
        aggregateRating:
          p.reviewCount && p.reviewCount > 0 && p.rating
            ? { "@type": "AggregateRating", ratingValue: Number(p.rating).toFixed(1), reviewCount: p.reviewCount }
            : undefined,
      }
    : null;
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON.stringify + "<" escaping prevents breaking out of the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      {children}
    </>
  );
}
