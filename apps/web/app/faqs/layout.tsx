import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Answers about ordering, payment, shipping, returns and B2B accounts.",
  alternates: { canonical: "/faqs" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
