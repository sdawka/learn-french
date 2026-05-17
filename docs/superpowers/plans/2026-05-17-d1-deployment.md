# D1 Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the French learning app to Cloudflare Workers with D1 database while maintaining local SQLite for development.

**Architecture:** Unified async database interface that uses `better-sqlite3` in dev (wrapped in Promise) and D1's native async API in production. Astro middleware injects the D1 binding per-request.

**Tech Stack:** Astro + Cloudflare adapter, D1 (SQLite), Wrangler CLI

---

## File Structure

```
src/
  lib/
    db/
      index.ts          # MODIFY: Async interface with env detection
      schema.ts         # NO CHANGE
  middleware.ts         # CREATE: D1 binding injection
  env.d.ts              # MODIFY: Add D1 types
  pages/
    index.astro                    # MODIFY: Add await
    skills/vocabulary.astro        # MODIFY: Add await
    skills/grammar.astro           # MODIFY: Add await
    api/session/start.ts           # MODIFY: Add await
    api/session/submit.ts          # MODIFY: Add await
    api/session/end.ts             # MODIFY: Add await
    api/stats/index.ts             # MODIFY: Add await
  lib/srs/
    scheduler.ts                   # MODIFY: Make async
  lib/learner-model/
    profile.ts                     # MODIFY: Make async
  lib/adaptation/
    session-planner.ts             # MODIFY: Make async
  lib/audit/
    logger.ts                      # MODIFY: Make async (if uses DB)
migrations/
  schema.sql            # CREATE: Extracted from schema.ts
scripts/
  export-data.ts        # CREATE: Data export script
wrangler.toml           # CREATE: Cloudflare config
astro.config.mjs        # MODIFY: Cloudflare adapter
package.json            # MODIFY: Scripts + dependencies
.gitignore              # MODIFY: Add migrations/data.sql
```

---

### Task 1: Install Cloudflare Dependencies

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`

- [ ] **Step 1: Install Cloudflare adapter**

```bash
bun add @astrojs/cloudflare
bun remove @astrojs/node
```

- [ ] **Step 2: Update astro.config.mjs**

Replace the entire file:

```javascript
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
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock astro.config.mjs
git commit -m "chore: switch to Cloudflare adapter"
```

---

### Task 2: Create wrangler.toml

**Files:**
- Create: `wrangler.toml`

- [ ] **Step 1: Create wrangler.toml**

```toml
name = "french-learning"
compatibility_date = "2024-01-01"
main = "dist/_worker.js"

[observability]
enabled = true

[[d1_databases]]
binding = "DB"
database_name = "french-learning"
database_id = "placeholder"
```

- [ ] **Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "chore: add wrangler.toml for Cloudflare deployment"
```

---

### Task 3: Add D1 TypeScript Types

**Files:**
- Modify: `src/env.d.ts`

- [ ] **Step 1: Update env.d.ts with D1 types**

Replace the entire file:

```typescript
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type D1Database = import("@cloudflare/workers-types").D1Database;

declare namespace App {
  interface Locals {
    runtime: {
      env: {
        DB: D1Database;
      };
    };
  }
}
```

- [ ] **Step 2: Install workers-types for D1 definitions**

```bash
bun add -d @cloudflare/workers-types
```

- [ ] **Step 3: Commit**

```bash
git add src/env.d.ts package.json bun.lock
git commit -m "chore: add D1 TypeScript types"
```

---

### Task 4: Rewrite Database Layer to Async

**Files:**
- Modify: `src/lib/db/index.ts`

- [ ] **Step 1: Rewrite index.ts with async interface**

Replace the entire file:

```typescript
/**
 * Unified async database layer.
 * Dev: better-sqlite3 wrapped in Promise
 * Prod: Cloudflare D1
 */

import type { D1Database } from "@cloudflare/workers-types";

const isDev = import.meta.env.DEV;

// D1 binding (set per-request via middleware in prod)
let _d1: D1Database | null = null;

export function setD1(binding: D1Database): void {
  _d1 = binding;
}

// Local SQLite (dev only)
let _localDb: import("better-sqlite3").Database | null = null;

function getLocalDb(): import("better-sqlite3").Database {
  if (!_localDb) {
    const Database = require("better-sqlite3");
    _localDb = new Database(`${process.cwd()}/french.db`);
    _localDb!.pragma("foreign_keys = ON");
    _localDb!.pragma("journal_mode = WAL");
  }
  return _localDb!;
}

/** Execute a query returning all rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (isDev) {
    return Promise.resolve(getLocalDb().prepare(sql).all(...params) as T[]);
  }
  if (!_d1) throw new Error("D1 binding not set. Call setD1() in middleware.");
  const stmt = _d1.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.all<T>();
  return result.results;
}

/** Execute a query returning the first row or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  if (isDev) {
    return Promise.resolve((getLocalDb().prepare(sql).get(...params) as T) ?? null);
  }
  if (!_d1) throw new Error("D1 binding not set. Call setD1() in middleware.");
  const stmt = _d1.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.first<T>();
  return result ?? null;
}

/** Execute a write statement. */
export async function run(
  sql: string,
  params: unknown[] = []
): Promise<{ changes: number; lastInsertRowid: number }> {
  if (isDev) {
    const result = getLocalDb().prepare(sql).run(...params);
    return Promise.resolve({
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    });
  }
  if (!_d1) throw new Error("D1 binding not set. Call setD1() in middleware.");
  const stmt = _d1.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.run();
  return {
    changes: result.meta.changes,
    lastInsertRowid: Number(result.meta.last_row_id),
  };
}

/** Execute raw SQL (for schema migrations). Dev only. */
export function execSync(sql: string): void {
  if (!isDev) throw new Error("execSync only available in dev");
  getLocalDb().exec(sql);
}

/** Parse a JSON column safely. */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run astro check 2>&1 | head -20
```

Expected: Errors about missing `await` in callers (expected at this stage).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "feat: async database layer with D1/SQLite dual support"
```

---

### Task 5: Create Astro Middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create middleware.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: middleware to inject D1 binding"
```

---

### Task 6: Update SRS Scheduler to Async

**Files:**
- Modify: `src/lib/srs/scheduler.ts`

- [ ] **Step 1: Make getUnlockedLevels async**

Replace lines 34-51 with:

```typescript
async function getUnlockedLevels(type: "vocabulary" | "grammar" | "mixed"): Promise<string[]> {
  const typeFilter = type === "mixed" ? "" : `AND kc.type = '${type}'`;
  const unlocked: string[] = [];
  for (const level of CEFR_LEVEL_ORDER) {
    unlocked.push(level);
    const stats = await queryOne<{ total: number; mastered: number }>(`
      SELECT
        COUNT(kc.id) AS total,
        SUM(CASE WHEN sc.state IN ('review','mastered') THEN 1 ELSE 0 END) AS mastered
      FROM knowledge_components kc
      LEFT JOIN srs_cards sc ON sc.kc_id = kc.id
      WHERE kc.level = ? ${typeFilter}
    `, [level]);
    if (!stats || stats.total === 0) continue;
    if (stats.mastered / stats.total < LEVEL_UNLOCK_THRESHOLD) break;
  }
  return unlocked;
}
```

- [ ] **Step 2: Make getDueItems async**

Change signature to `export async function getDueItems(...): Promise<DueItem[]>` and add `await` before all `query()` and `queryOne()` calls, plus `await getUnlockedLevels(...)`.

- [ ] **Step 3: Make saveCardState async**

Change signature to `export async function saveCardState(...): Promise<number>` and add `await` before all `queryOne()` and `run()` calls.

- [ ] **Step 4: Make getDueCount async**

Change signature to `export async function getDueCount(...): Promise<{ due: number; new_cards: number }>` and add `await` before `queryOne()` calls.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs/scheduler.ts
git commit -m "feat: make SRS scheduler async"
```

---

### Task 7: Update Learner Profile to Async

**Files:**
- Modify: `src/lib/learner-model/profile.ts`

- [ ] **Step 1: Make getProfile async**

Change signature to `export async function getProfile(): Promise<LearnerProfile>` and add `await` before `queryOne()` and `run()` calls.

- [ ] **Step 2: Make updateProfile async**

Change signature to `export async function updateProfile(...): Promise<void>` and add `await` before `getProfile()` and `run()` calls.

- [ ] **Step 3: Make remaining profile functions async**

Update `updateVocabProficiency`, `updateGrammarProficiency`, and `updateStyleWeight` to async with `await` on internal calls.

- [ ] **Step 4: Commit**

```bash
git add src/lib/learner-model/profile.ts
git commit -m "feat: make learner profile async"
```

---

### Task 8: Update Dashboard Page (index.astro)

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Update imports**

Change `getDb` import to `execSync`:
```typescript
import { execSync } from "~/lib/db/index.ts";
```

- [ ] **Step 2: Update schema migration**

Replace:
```typescript
try {
  getDb().exec(SCHEMA_SQL);
} catch {}
```
With:
```typescript
if (import.meta.env.DEV) {
  try {
    execSync(SCHEMA_SQL);
  } catch {}
}
```

- [ ] **Step 3: Add await to all DB calls**

Add `await` before: `getDueCount()`, `getProfile()`, `queryOne()`, `query()`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: async DB calls in dashboard"
```

---

### Task 9: Update Skills Pages

**Files:**
- Modify: `src/pages/skills/vocabulary.astro`
- Modify: `src/pages/skills/grammar.astro`

- [ ] **Step 1: Add await in vocabulary.astro**

Add `await` before: `getDueCount()`, `getProfile()`, `queryOne()`, `query()`.

- [ ] **Step 2: Add await in grammar.astro**

Same pattern as vocabulary.astro.

- [ ] **Step 3: Commit**

```bash
git add src/pages/skills/
git commit -m "feat: async DB calls in skills pages"
```

---

### Task 10: Update API Routes

**Files:**
- Modify: `src/pages/api/session/start.ts`
- Modify: `src/pages/api/session/submit.ts`
- Modify: `src/pages/api/session/end.ts`
- Modify: `src/pages/api/stats/index.ts`

- [ ] **Step 1: Update session/start.ts**

Add `await` before: `getDueCount()`, `run()`, `queryOne()`, and any calls to session-planner functions.

- [ ] **Step 2: Update session/submit.ts**

Add `await` before all DB calls: `run()`, `queryOne()`, `query()`, `saveCardState()`.

- [ ] **Step 3: Update session/end.ts**

Add `await` before all DB calls.

- [ ] **Step 4: Update stats/index.ts**

Add `await` before all DB calls.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/
git commit -m "feat: async DB calls in API routes"
```

---

### Task 11: Update Remaining Lib Files

**Files:**
- Check: `src/lib/adaptation/session-planner.ts`
- Check: `src/lib/audit/logger.ts`

- [ ] **Step 1: Find remaining sync callers**

```bash
grep -rn "query\|queryOne\|run\|getDueItems\|getProfile" src/lib --include="*.ts" | grep -v "async\|await\|export\|import"
```

- [ ] **Step 2: Update any remaining files to async**

Add `async` to function signatures and `await` to DB calls.

- [ ] **Step 3: Commit**

```bash
git add src/lib/
git commit -m "feat: async remaining lib callers"
```

---

### Task 12: Extract Schema to SQL File

**Files:**
- Create: `migrations/schema.sql`
- Modify: `.gitignore`

- [ ] **Step 1: Create migrations directory**

```bash
mkdir -p migrations
```

- [ ] **Step 2: Extract schema to SQL file**

Copy the SQL content from `SCHEMA_SQL` in `src/lib/db/schema.ts` (without the template literal wrapper) to `migrations/schema.sql`.

- [ ] **Step 3: Update .gitignore**

Add line:
```
migrations/data.sql
```

- [ ] **Step 4: Commit**

```bash
git add migrations/schema.sql .gitignore
git commit -m "chore: extract schema.sql for D1 migrations"
```

---

### Task 13: Create Data Export Script

**Files:**
- Create: `scripts/export-data.ts`
- Modify: `package.json`

- [ ] **Step 1: Create scripts directory**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Create export-data.ts**

```typescript
#!/usr/bin/env bun
/**
 * Export local french.db data to migrations/data.sql for D1 import.
 */

import Database from "better-sqlite3";
import { writeFileSync } from "fs";

const db = new Database("french.db");

const tables = [
  "knowledge_components",
  "kc_prerequisites", 
  "misconceptions",
  "srs_cards",
  "learner_kc_errors",
  "learner_confusion_pairs",
  "learner_profile",
  "session_plans",
  "sessions",
  "responses",
  "audit_events",
  "daily_stats",
];

let sql = "-- Data export from french.db\n";
sql += "-- Generated: " + new Date().toISOString() + "\n\n";

for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) continue;

  sql += `-- ${table}\n`;
  for (const row of rows) {
    const cols = Object.keys(row as object);
    const vals = Object.values(row as object).map((v) => {
      if (v === null) return "NULL";
      if (typeof v === "number") return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")});\n`;
  }
  sql += "\n";
}

writeFileSync("migrations/data.sql", sql);
console.log("Exported to migrations/data.sql");
```

- [ ] **Step 3: Update package.json scripts**

Add to scripts:
```json
"migrate:export": "bun scripts/export-data.ts",
"deploy": "astro build && wrangler deploy",
"d1:migrate": "wrangler d1 execute french-learning --remote --file=./migrations/schema.sql"
```

- [ ] **Step 4: Test export**

```bash
bun run migrate:export
head -30 migrations/data.sql
```

- [ ] **Step 5: Commit**

```bash
git add scripts/export-data.ts package.json
git commit -m "feat: data export script for D1 migration"
```

---

### Task 14: Test Local Development

- [ ] **Step 1: Start dev server**

```bash
bun run dev
```

Expected: Server starts without errors.

- [ ] **Step 2: Test dashboard loads**

Open http://localhost:4321 in browser.
Expected: Dashboard renders with stats.

- [ ] **Step 3: Test a review session**

Click "Review vocabulary" and complete one card.
Expected: Session works, answer submits correctly.

---

### Task 15: Create D1 Database and Deploy

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Login to Cloudflare**

```bash
wrangler login
```

- [ ] **Step 2: Create D1 database**

```bash
wrangler d1 create french-learning
```

Copy the returned database_id.

- [ ] **Step 3: Update wrangler.toml**

Replace `database_id = "placeholder"` with the actual ID.

- [ ] **Step 4: Apply schema to D1**

```bash
wrangler d1 execute french-learning --remote --file=./migrations/schema.sql
```

- [ ] **Step 5: Deploy**

```bash
bun run deploy
```

- [ ] **Step 6: Commit**

```bash
git add wrangler.toml
git commit -m "chore: add D1 database_id"
```

---

### Task 16: Migrate Data to D1

- [ ] **Step 1: Export local data**

```bash
bun run migrate:export
```

- [ ] **Step 2: Import to D1**

```bash
wrangler d1 execute french-learning --remote --file=./migrations/data.sql
```

- [ ] **Step 3: Verify deployment**

Open the deployed URL and verify:
- Dashboard shows your data
- Review session works
- Progress is preserved

---

### Task 17: Final Cleanup and PR

- [ ] **Step 1: Remove unused dependencies**

```bash
bun remove portless 2>/dev/null || true
```

- [ ] **Step 2: Update dev script if needed**

In package.json, ensure dev script is:
```json
"dev": "astro dev"
```

- [ ] **Step 3: Final commit**

```bash
git add package.json bun.lock
git commit -m "chore: cleanup unused dependencies"
```

- [ ] **Step 4: Push and create PR**

```bash
git push -u origin main
```
