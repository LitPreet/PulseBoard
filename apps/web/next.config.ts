import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pulseboard/core"],
  serverExternalPackages: ["pg", "ioredis"],
  poweredByHeader: false,
  agentRules: false,
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
