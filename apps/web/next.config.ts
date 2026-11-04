import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pulseboard/core"],
  serverExternalPackages: ["pg", "ioredis"],
  poweredByHeader: false,
};

export default nextConfig;
