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
