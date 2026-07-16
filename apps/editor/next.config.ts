import type { NextConfig } from "next";
import { withEve } from "eve/next";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@aws-sdk/client-s3"],
  ...(isProd
    ? {}
    : {
        turbopack: {
          root: path.resolve(__dirname, "../../"),
        },
      }),
};

export default withEve(nextConfig);

