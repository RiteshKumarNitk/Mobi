import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Repair Guides & News",
  description: "Mobile repair guides, product news and tips for repair shops.",
  alternates: { canonical: "/blog" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
