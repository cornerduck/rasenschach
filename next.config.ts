import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Logo-Upload (max. 1 MB Bild) braucht etwas mehr als die Standardgrenze von 1 MB
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
