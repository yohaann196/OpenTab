import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@opentab/engine", "@opentab/db", "@opentab/core"],
  serverExternalPackages: ["pg-boss", "postgres", "@electric-sql/pglite"],
  poweredByHeader: false,
  agentRules: false,
  typedRoutes: false,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
