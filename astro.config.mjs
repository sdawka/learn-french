import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [react(), tailwind()],
  vite: {
    ssr: {
      external: ["better-sqlite3"],
    },
    resolve: {
      alias: import.meta.env.PROD ? {
        "better-sqlite3": "./src/lib/db/d1-shim.ts",
      } : {},
    },
  },
});
