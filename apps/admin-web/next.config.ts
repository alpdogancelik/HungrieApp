import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@hungrie/domain", "@hungrie/database-types"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" }
        ]
      },
      {
        source: "/private/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }]
      }
    ];
  }
};

export default nextConfig;
