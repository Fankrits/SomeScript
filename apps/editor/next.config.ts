import type { NextConfig } from "next";
import { withEve } from "eve/next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
};

export default withEve(nextConfig);

