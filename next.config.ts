import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true, // 💀 ignore all TS errors
  },
  eslint: {
    ignoreDuringBuilds: true, // 💀 ignore eslint errors
  },
};

export default nextConfig;
