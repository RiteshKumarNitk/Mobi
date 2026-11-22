import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/lib/store";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "B2B eCommerce platform for mobile spare parts: displays, batteries, chargers, cameras and more at wholesale rates. Serving repair shops and retailers across India.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} - Mobile Spare Parts at Wholesale Prices`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, title: `${SITE_NAME} - Mobile Spare Parts at Wholesale Prices`, description: DESCRIPTION, url: "/", locale: "en_IN" },
  twitter: { card: "summary", title: SITE_NAME, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0056b3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <Providers>
          <Header />
          <main id="main" className="container main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
