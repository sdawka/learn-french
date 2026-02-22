/**
 * SQLite connection singleton + typed query helpers.
 * Uses better-sqlite3 (works in both Node/Vite dev and Bun production).
 */

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";

const DB_PATH = `${process.cwd()}/french.db`;

let _db: DB | null = null;

export function getDb(): DB {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("foreign_keys = ON");
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

/** Execute a query returning all rows. */
export function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

/** Execute a query returning the first row or null. */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | null {
  return (getDb().prepare(sql).get(...params) as T) ?? null;
}

/** Execute a write statement. */
export function run(
  sql: string,
  params: unknown[] = []
): { changes: number; lastInsertRowid: number | bigint } {
  const result = getDb().prepare(sql).run(...params);
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid,
  };
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
