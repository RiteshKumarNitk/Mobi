import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/store";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Baba Communication - Mobile Spare Parts at Wholesale Prices",
  description:
    "B2B eCommerce platform for mobile spare parts: displays, batteries, chargers, cameras and more at wholesale rates. Serving repair shops and retailers across India.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main className="container main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
