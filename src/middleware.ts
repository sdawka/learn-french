import { defineMiddleware } from "astro:middleware";
import { setD1 } from "~/lib/db/index.ts";

export const onRequest = defineMiddleware(async (context, next) => {
  // Inject D1 binding from Cloudflare runtime (works in both dev and prod with platformProxy)
  const runtime = (context.locals as any).runtime;
  if (runtime?.env?.DB) {
    setD1(runtime.env.DB);
  }
  return next();
});
