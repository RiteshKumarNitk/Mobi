import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offers & Coupons",
  description: "Current wholesale offers and coupon codes on mobile spare parts.",
  alternates: { canonical: "/offers" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
