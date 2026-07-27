import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["drizzle-orm"],
  transpilePackages: ["pg"],
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "300mb",
    },
  },
};

export default nextConfig;
