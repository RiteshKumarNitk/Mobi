/** @type {import('next').NextConfig} */

// Security headers for every storefront response. CSP is intentionally not set
// here yet: Razorpay Checkout loads scripts/frames from several Razorpay
// domains — add a CSP only after testing it against live checkout.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Clickjacking protection. (Does not affect the Flutter WebView, which is not a frame.)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\" \"https://api.razorpay.com\")" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

// The admin panel (/admin) is internal: never indexed, never framed, no referrer leakage.
const adminHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // Later entries override earlier ones for the same header key.
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin", headers: adminHeaders },
      { source: "/admin/:path*", headers: adminHeaders },
    ];
  },
};

export default nextConfig;
