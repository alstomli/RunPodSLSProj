import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1", "*.localhost"],
};

export default nextConfig;
