import type { NextConfig } from "next";
import path from "path";

const cspHeader = `
  default-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data: https:;
  script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https:;
  style-src 'self' 'unsafe-inline' https:;
  img-src 'self' blob: data: https:;
  font-src 'self' data: https:;
  connect-src 'self' blob: data: https: wss:;
  worker-src 'self' blob: data:;
  object-src 'none';
`;

const nextConfig: NextConfig = {
  serverExternalPackages: ["drizzle-orm"],
  transpilePackages: ["pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\s{2,}/g, " ").trim(),
          },
        ],
      },
    ];
  },
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
