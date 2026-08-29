import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  transpilePackages: ["@visa-commerce/contracts"],
};

export default nextConfig;
