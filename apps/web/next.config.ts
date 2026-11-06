import type { NextConfig } from "next";
import path from "node:path";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  transpilePackages: ["@geogrid/db"],
  serverExternalPackages: ["@prisma/client", "nodemailer"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  webpack(config, { isServer }) {
    if (isServer) config.plugins.push(new PrismaPlugin());
    return config;
  },
};

export default nextConfig;
