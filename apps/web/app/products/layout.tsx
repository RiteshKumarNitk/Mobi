import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mobile Spare Parts Catalogue",
  description: "Browse wholesale mobile spare parts - displays, batteries, charging ports, cameras and more - with bulk B2B pricing.",
  alternates: { canonical: "/products" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
