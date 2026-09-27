import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("."),
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      { find: "next/link", replacement: r("./shims/link.tsx") },
      { find: "next/navigation", replacement: r("./shims/navigation.ts") },
      { find: /^@\//, replacement: r("../src/") + "/" },
    ],
  },
  define: {
    "process.env.NEXT_PUBLIC_STATIC": JSON.stringify("1"),
    "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_LOGO_DEV_KEY": JSON.stringify(""),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: { outDir: r("./dist"), emptyOutDir: true },
});
