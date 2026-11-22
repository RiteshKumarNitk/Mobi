import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop by Brand",
  description: "Spare parts for every major phone brand at B2B wholesale prices.",
  alternates: { canonical: "/brands" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
