import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withBundleAnalyzer =
  process.env.ANALYZE === "true"
    ? (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require("@next/bundle-analyzer")({
            enabled: true,
            openAnalyzer: false,
          });
        } catch {
          return (config: NextConfig) => config;
        }
      })()
    : (config: NextConfig) => config;

/** Applied to every route. Documented in docs/decisions/0004-security-headers-and-csp.md. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Old browsers ignore frame-ancestors in CSP, so frame protection is set here too.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** Routes where a photo is captured (delivery proof, supplier product photos, dispute evidence). */
const EVIDENCE_ROUTES = ["/organize/:id/delivery", "/supplier/offers/new", "/pools/:id"];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Listed after the global rule so the camera is allowed only on these routes.
      ...EVIDENCE_ROUTES.map((source) => ({
        source,
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ],
      })),
    ];
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
