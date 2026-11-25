import type { Metadata } from "next";
import { NOINDEX } from "@/lib/site";

// Private / per-user page: excluded from search indexing.
export const metadata: Metadata = { title: "Confirmation", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
