/**
 * Unified async database layer.
 * Uses Cloudflare D1 (local emulation in dev via wrangler, real D1 in prod)
 */

import type { D1Database } from "@cloudflare/workers-types";

// D1 binding (set per-request via middleware)
let _d1: D1Database | null = null;

export function setD1(binding: D1Database): void {
  _d1 = binding;
}

export function getD1(): D1Database {
  if (!_d1) throw new Error("D1 binding not set. Call setD1() in middleware.");
  return _d1;
}

/** Execute a query returning all rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const db = getD1();
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.all<T>();
  return result.results;
}

/** Execute a query returning the first row or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const db = getD1();
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.first<T>();
  return result ?? null;
}

/** Execute a write statement. */
export async function run(
  sql: string,
  params: unknown[] = []
): Promise<{ changes: number; lastInsertRowid: number }> {
  const db = getD1();
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.run();
  return {
    changes: result.meta.changes,
    lastInsertRowid: Number(result.meta.last_row_id),
  };
}

/** Execute raw SQL (for schema migrations). */
export async function exec(sql: string): Promise<void> {
  const db = getD1();
  await db.exec(sql);
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
