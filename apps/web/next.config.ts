import type { NextConfig } from "next";

/** Serve under a sub-path (e.g. BASE_PATH=/opentab for yohaan.tech/opentab). Build-time. */
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "") || undefined;
/** Live updates: "sse" (Postgres LISTEN; long-running servers) or "poll" (serverless). */
const liveMode = process.env.LIVE_MODE ?? (process.env.VERCEL ? "poll" : "sse");

const config: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath ?? "",
    NEXT_PUBLIC_LIVE_MODE: liveMode,
  },
  transpilePackages: ["@opentab/engine", "@opentab/db", "@opentab/core"],
  serverExternalPackages: ["pg-boss", "postgres", "@electric-sql/pglite"],
  poweredByHeader: false,
  agentRules: false,
  typedRoutes: false,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async redirects() {
    // Bare domain → the app, when it lives under a sub-path.
    return basePath
      ? [{ source: "/", destination: basePath, basePath: false, permanent: false }]
      : [];
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
