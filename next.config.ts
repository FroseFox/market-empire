import type { NextConfig } from "next";

// Site 100 % statique, publié sur GitHub Pages (https://<compte>.github.io/market-empire/).
// NEXT_PUBLIC_BASE_PATH = "/market-empire" en production, vide en local.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
