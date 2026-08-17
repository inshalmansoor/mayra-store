import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: isDev ? "http://127.0.0.1:8000/api/:path*" : "/api/index",
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
    // Only for our own /public/placeholder.svg (the missing-image fallback
    // in lib/variants.ts) — never for uploaded/remote content, so the usual
    // SVG-can-carry-a-script risk doesn't apply here.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
