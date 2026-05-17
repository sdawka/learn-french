/**
 * Misconception detection and register management.
 *
 * A misconception is "named" when a consistent error pattern appears 2+ times
 * in a session. Named misconceptions trigger teaching card insertion.
 */

import { query, queryOne, run, parseJson } from "../db/index.ts";

export type ErrorType =
  | "orthographic"
  | "semantic"
  | "morphological"
  | "syntactic"
  | "pragmatic";

export interface MisconceptionRecord {
  id: number;
  name: string;
  description: string | null;
  kc_ids: number[];
  error_type: ErrorType | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known misconceptions seeded at startup
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWN_MISCONCEPTIONS: Omit<MisconceptionRecord, "id">[] = [
  {
    name: "avoir/être movement verb confusion",
    description:
      "Using avoir instead of être as auxiliary for verbs of motion (aller, venir, partir, etc.)",
    kc_ids: [],
    error_type: "morphological",
  },
  {
    name: "present tense overextension to habitual past",
    description:
      "Using présent for habitual past actions that require imparfait",
    kc_ids: [],
    error_type: "syntactic",
  },
  {
    name: "elision omission before vowels",
    description: "Omitting elision (le → l') before words starting with a vowel or silent h",
    kc_ids: [],
    error_type: "orthographic",
  },
  {
    name: "adjective gender agreement error",
    description: "Failing to apply feminine/plural endings to adjectives",
    kc_ids: [],
    error_type: "morphological",
  },
  {
    name: "false cognate confusion",
    description: "Assigning English meaning to false French cognates (e.g. actuellement ≠ actually)",
    kc_ids: [],
    error_type: "semantic",
  },
  {
    name: "subjunctive trigger missed",
    description: "Using indicative after verbs/conjunctions that require subjunctive",
    kc_ids: [],
    error_type: "syntactic",
  },
];

export async function seedMisconceptions(): Promise<void> {
  for (const m of KNOWN_MISCONCEPTIONS) {
    await run(
      `INSERT OR IGNORE INTO misconceptions (name, description, kc_ids_json, error_type)
       VALUES (?,?,?,?)`,
      [m.name, m.description, JSON.stringify(m.kc_ids), m.error_type]
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record an error for a KC.
 * Increments the count, detects misconceptions when count >= 2.
 */
export async function recordError(
  kc_id: number,
  error_type: ErrorType,
  now: Date = new Date()
): Promise<MisconceptionRecord | null> {
  // Upsert error count
  await run(
    `INSERT INTO learner_kc_errors (kc_id, error_type, count, last_seen_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(kc_id, error_type) DO UPDATE SET
       count = count + 1,
       last_seen_at = excluded.last_seen_at`,
    [kc_id, error_type, now.toISOString()]
  );

  const row = await queryOne<{ count: number }>(
    "SELECT count FROM learner_kc_errors WHERE kc_id = ? AND error_type = ?",
    [kc_id, error_type]
  );

  // Threshold: 2 errors of same type → check for matching misconception
  if (row && row.count >= 2) {
    return detectMisconception(kc_id, error_type);
  }
  return null;
}

async function detectMisconception(
  kc_id: number,
  error_type: ErrorType
): Promise<MisconceptionRecord | null> {
  const match = await queryOne<{
    id: number;
    name: string;
    description: string | null;
    kc_ids_json: string;
    error_type: string | null;
  }>(
    "SELECT * FROM misconceptions WHERE error_type = ? LIMIT 1",
    [error_type]
  );

  if (!match) return null;

  // Link the KC to this misconception if not already linked
  await run(
    `UPDATE learner_kc_errors SET misconception_id = ?
     WHERE kc_id = ? AND error_type = ? AND misconception_id IS NULL`,
    [match.id, kc_id, error_type]
  );

  return {
    id: match.id,
    name: match.name,
    description: match.description,
    kc_ids: parseJson<number[]>(match.kc_ids_json, []),
    error_type: match.error_type as ErrorType | null,
  };
}

/**
 * Record a confusion between two KCs (learner confused A with B's answer).
 */
export async function recordConfusion(
  kc_id_a: number,
  kc_id_b: number,
  now: Date = new Date()
): Promise<void> {
  const [a, b] = [Math.min(kc_id_a, kc_id_b), Math.max(kc_id_a, kc_id_b)];
  await run(
    `INSERT INTO learner_confusion_pairs (kc_id_a, kc_id_b, confusion_count, last_seen_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(kc_id_a, kc_id_b) DO UPDATE SET
       confusion_count = confusion_count + 1,
       last_seen_at = excluded.last_seen_at`,
    [a, b, now.toISOString()]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function getActiveMisconceptions(): Promise<MisconceptionRecord[]> {
  const rows = await query<{
    id: number;
    name: string;
    description: string | null;
    kc_ids_json: string;
    error_type: string | null;
  }>(
    `SELECT DISTINCT m.*
     FROM misconceptions m
     JOIN learner_kc_errors e ON e.misconception_id = m.id
     WHERE e.count >= 2
     ORDER BY e.last_seen_at DESC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    kc_ids: parseJson<number[]>(row.kc_ids_json, []),
    error_type: row.error_type as ErrorType | null,
  }));
}

export async function getMisconception(id: number): Promise<MisconceptionRecord | null> {
  const row = await queryOne<{
    id: number;
    name: string;
    description: string | null;
    kc_ids_json: string;
    error_type: string | null;
  }>("SELECT * FROM misconceptions WHERE id = ?", [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kc_ids: parseJson<number[]>(row.kc_ids_json, []),
    error_type: row.error_type as ErrorType | null,
  };
}
