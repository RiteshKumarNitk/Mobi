import type { Metadata } from "next";
import { fetchPublic } from "@/lib/site";

// Uses the list endpoint (not /blog/:slug) so metadata rendering does not inflate view counts.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const list = await fetchPublic<{ items: { slug: string; title: string; excerpt?: string | null; metaTitle?: string | null; metaDescription?: string | null; featuredImage?: string | null }[] }>(
    "/blog?pageSize=50",
    600
  );
  const post = list?.items.find((p) => p.slug === slug);
  if (!post) return { title: "Blog" };
  const description = post.metaDescription ?? post.excerpt ?? undefined;
  return {
    title: post.metaTitle ? { absolute: post.metaTitle } : post.title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { type: "article", title: post.title, description, images: post.featuredImage ? [{ url: post.featuredImage }] : undefined },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
