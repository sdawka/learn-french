# D1 Deployment Design

Deploy the French learning app to Cloudflare Workers with D1 database.

## Context

- Single-user personal learning app (no auth needed)
- Local dev keeps SQLite for fast iteration
- Production uses D1
- Migrate existing `french.db` data to D1

## Approach

Unified async interface — all DB helpers become async. In dev, wrap `better-sqlite3` in `Promise.resolve()`. In prod, use D1's native async API.

## Changes

### 1. Database Abstraction (`src/lib/db/index.ts`)

```typescript
// Context holder for D1 binding (set per-request via middleware)
let _d1: D1Database | null = null;
export function setD1(binding: D1Database) { _d1 = binding; }

// Unified async interface
export async function query<T>(sql: string, params?: unknown[]): Promise<T[]>
export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>
export async function run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>
```

- Dev: uses `better-sqlite3`, wraps in Promise
- Prod: uses D1 binding from `_d1`

### 2. Cloudflare Configuration

**New files:**
- `wrangler.toml` — D1 binding, compatibility date
- `src/middleware.ts` — Astro middleware to call `setD1(env.DB)`

**Adapter swap:**
- Remove `@astrojs/node`
- Add `@astrojs/cloudflare`

**wrangler.toml:**
```toml
name = "french-learning"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "french-learning"
database_id = "<to-be-created>"
```

### 3. Async Migration

Files requiring `async/await`:

| Layer | Files |
|-------|-------|
| DB helpers | `src/lib/db/index.ts` |
| SRS | `src/lib/srs/scheduler.ts` |
| Learner model | `src/lib/learner-model/profile.ts` |
| Pages | `index.astro`, `skills/vocabulary.astro`, `skills/grammar.astro` |
| API routes | `session/start.ts`, `session/submit.ts`, `session/end.ts`, `stats/index.ts` |

No changes: React components, `fsrs.ts` (pure math), `seed.ts` (local-only).

### 4. Data Migration

```bash
# Create D1 database
wrangler d1 create french-learning

# Apply schema
wrangler d1 execute french-learning --remote --file=./migrations/schema.sql

# Export local data
bun run migrate:export  # outputs migrations/data.sql

# Import to D1
wrangler d1 execute french-learning --remote --file=./migrations/data.sql
```

**Directory structure:**
```
migrations/
  schema.sql      # CREATE TABLE statements
  data.sql        # INSERT statements (gitignored)
```

### 5. Package.json Scripts

```json
{
  "dev": "astro dev",
  "build": "astro build",
  "deploy": "wrangler deploy",
  "d1:migrate": "wrangler d1 execute french-learning --remote --file=./migrations/schema.sql",
  "migrate:export": "bun scripts/export-data.ts"
}
```

## Implementation Order

1. Add Cloudflare adapter + wrangler.toml
2. Rewrite `src/lib/db/index.ts` to async with env detection
3. Add Astro middleware for D1 context
4. Update `scheduler.ts` and `profile.ts` to async
5. Update pages and API routes to await DB calls
6. Extract schema.sql from schema.ts
7. Create export script for data migration
8. Test locally with `wrangler dev`
9. Create D1 database and deploy
10. Run data migration
