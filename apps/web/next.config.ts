import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "drizzle-orm"],
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
};

export default nextConfig;
