import type { Metadata } from "next";
import "./globals.css";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Baba Communication Admin",
  description: "Admin panel for the Baba Communication B2B eCommerce platform",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
