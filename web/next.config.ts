import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (node server.js).
  output: "standalone",
  // Tests run their own dev server in .next-test so it doesn't clash with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // No image optimizer (/_next/image). Every Image is private, served by /api/images/<id>/file
  // to its owner only, and must reach the User as the original PNG, never resized or recompressed.
  // The optimizer fetches without the visitor's cookies and caches what it gets for everyone,
  // so it must never be in front of a User's file.
  images: { unoptimized: true },
};

export default nextConfig;
