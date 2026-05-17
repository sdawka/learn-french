import { defineMiddleware } from "astro:middleware";
import { setD1 } from "~/lib/db/index.ts";

export const onRequest = defineMiddleware(async (context, next) => {
  // In production, inject D1 binding
  if (!import.meta.env.DEV) {
    const runtime = (context.locals as any).runtime;
    if (runtime?.env?.DB) {
      setD1(runtime.env.DB);
    }
  }
  return next();
});
