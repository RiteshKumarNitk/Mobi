import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop by Category",
  description: "All mobile spare part categories at wholesale prices for repair shops and retailers.",
  alternates: { canonical: "/categories" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
