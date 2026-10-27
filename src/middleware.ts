import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { setD1 } from "~/lib/db/index.ts";

export const onRequest = defineMiddleware(async (_context, next) => {
  // Inject D1 binding from the Cloudflare runtime (workerd in both dev and prod)
  if (env.DB) {
    setD1(env.DB);
  }
  return next();
});
