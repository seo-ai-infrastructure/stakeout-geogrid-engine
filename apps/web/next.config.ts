import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@geogrid/db"],
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis"],
};

export default nextConfig;
