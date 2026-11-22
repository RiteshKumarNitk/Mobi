import type { Metadata } from "next";
import { fetchPublic } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPublic<{ title: string; metaTitle?: string | null; metaDescription?: string | null }>(`/pages/${encodeURIComponent(slug)}`, 300);
  if (!page) return { title: "Page", robots: { index: false, follow: true } };
  return {
    title: page.metaTitle ? { absolute: page.metaTitle } : page.title,
    description: page.metaDescription ?? undefined,
    alternates: { canonical: `/page/${slug}` },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
