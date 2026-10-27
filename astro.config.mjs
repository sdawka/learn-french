import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  session: false,
  // Keep pre-v7 whitespace handling
  compressHTML: true,
  integrations: [react()],
});
