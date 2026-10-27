/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module "cloudflare:workers" {
  interface Env {
    DB: import("@cloudflare/workers-types").D1Database;
  }
  export const env: Env;
}
