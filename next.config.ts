import type { NextConfig } from "next";
import { writeFileSync } from "node:fs";

// Site 100 % statique, publié sur GitHub Pages (https://<compte>.github.io/market-empire/).
// NEXT_PUBLIC_BASE_PATH = "/market-empire" en production, vide en local.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Version publiée (commit) : intégrée au jeu et écrite dans public/version.json, que le jeu relit pour savoir
// s'il est resté ouvert sur une ancienne version (voir src/lib/version.ts). En local : « dev », rien n'est vérifié.
const build = process.env.GITHUB_SHA?.slice(0, 12) || "dev";
try { writeFileSync("public/version.json", JSON.stringify({ build }) + "\n"); } catch { /* lecture seule : sans effet */ }

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD: build },
};

export default nextConfig;
