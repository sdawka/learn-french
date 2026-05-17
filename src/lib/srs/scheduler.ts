/**
 * SRS scheduler — queries due items and computes review order.
 *
 * Scheduling priority:
 *   1. Overdue items (due_at < now) sorted by retrievability ascending
 *   2. New items (state = 'new') up to a daily budget
 *   3. Learning/relearning items always included
 */

import { query, queryOne, run, parseJson } from "../db/index.ts";
import { predictRetrievability, newCard } from "./fsrs.ts";
import type { FSRSCard } from "./fsrs.ts";

export interface DueItem {
  kc_id: number;
  card_id: number;
  card: FSRSCard;
  retrievability: number;
  overdue_days: number;
  kc_type: "vocabulary" | "grammar";
  kc_level: string;
  kc_data: Record<string, unknown>;
}

const NEW_CARDS_PER_SESSION = 10;
const CEFR_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const LEVEL_UNLOCK_THRESHOLD = 0.7; // fraction of KCs in review/mastered to unlock next level

/**
 * Returns all CEFR levels available for new KCs of the given type.
 * Each level is unlocked once LEVEL_UNLOCK_THRESHOLD of the prior level's KCs
 * are in review or mastered state. Levels with no KCs are skipped.
 */
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
    if (!stats || stats.total === 0) continue; // no KCs at this level, keep going
    if (stats.mastered / stats.total < LEVEL_UNLOCK_THRESHOLD) break;
  }
  return unlocked;
}

/**
 * Return items due for review, ordered by urgency.
 * subject: 'vocabulary' | 'grammar' | 'mixed'
 */
export async function getDueItems(
  subject: "vocabulary" | "grammar" | "mixed" = "mixed",
  limit = 20,
  now: Date = new Date()
): Promise<DueItem[]> {
  const nowIso = now.toISOString();
  const typeFilter =
    subject === "mixed" ? "" : `AND kc.type = '${subject}'`;

  // Due + learning/relearning cards (overdue first)
  const due = await query<{
    kc_id: number;
    card_id: number;
    stability: number;
    difficulty: number;
    retrievability: number;
    state: string;
    due_at: string | null;
    review_count: number;
    lapse_count: number;
    last_reviewed_at: string | null;
    kc_type: string;
    kc_level: string;
    data_json: string;
  }>(`
    SELECT
      kc.id          AS kc_id,
      sc.id          AS card_id,
      sc.stability,
      sc.difficulty,
      sc.retrievability,
      sc.state,
      sc.due_at,
      sc.review_count,
      sc.lapse_count,
      sc.last_reviewed_at,
      kc.type        AS kc_type,
      kc.level       AS kc_level,
      kc.data_json
    FROM srs_cards sc
    JOIN knowledge_components kc ON kc.id = sc.kc_id
    WHERE (sc.due_at <= ? OR sc.state IN ('learning','relearning'))
      ${typeFilter}
    ORDER BY sc.retrievability ASC, sc.due_at ASC
    LIMIT ?
  `, [nowIso, limit]);

  // New cards (not yet in srs_cards) to fill up to limit.
  // Gated by (a) CEFR level unlock and (b) prerequisite satisfaction.
  const newLimit = Math.max(0, limit - due.length);
  let newKcs: { kc_id: number; kc_type: string; kc_level: string; data_json: string }[] = [];
  if (newLimit > 0) {
    const unlockedLevels = await getUnlockedLevels(subject);
    const levelPlaceholders = unlockedLevels.map(() => "?").join(",");
    newKcs = await query<{ kc_id: number; kc_type: string; kc_level: string; data_json: string }>(`
      SELECT kc.id AS kc_id, kc.type AS kc_type, kc.level AS kc_level, kc.data_json
      FROM knowledge_components kc
      LEFT JOIN srs_cards sc ON sc.kc_id = kc.id
      WHERE sc.id IS NULL
        ${typeFilter}
        AND kc.level IN (${levelPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM kc_prerequisites kp
          LEFT JOIN srs_cards sc2 ON sc2.kc_id = kp.requires_kc_id
          WHERE kp.kc_id = kc.id
            AND (sc2.id IS NULL OR sc2.state NOT IN ('review','mastered'))
        )
      LIMIT ?
    `, [...unlockedLevels, Math.min(newLimit, NEW_CARDS_PER_SESSION)]);
  }

  const dueItems: DueItem[] = due.map((row) => {
    const card: FSRSCard = {
      stability: row.stability,
      difficulty: row.difficulty,
      retrievability: row.retrievability,
      state: row.state as FSRSCard["state"],
      due_at: row.due_at ? new Date(row.due_at) : null,
      review_count: row.review_count,
      lapse_count: row.lapse_count,
      last_reviewed_at: row.last_reviewed_at
        ? new Date(row.last_reviewed_at)
        : null,
    };
    const R = predictRetrievability(card, now);
    const overdue = row.due_at
      ? Math.max(
          0,
          (now.getTime() - new Date(row.due_at).getTime()) / 86_400_000
        )
      : 0;
    return {
      kc_id: row.kc_id,
      card_id: row.card_id,
      card,
      retrievability: R,
      overdue_days: overdue,
      kc_type: row.kc_type as "vocabulary" | "grammar",
      kc_level: row.kc_level,
      kc_data: parseJson(row.data_json, {}),
    };
  });

  const newItems: DueItem[] = newKcs.map((row) => ({
    kc_id: row.kc_id,
    card_id: -1, // not yet persisted
    card: { ...newCard(), due_at: null, last_reviewed_at: null },
    retrievability: 1.0,
    overdue_days: 0,
    kc_type: row.kc_type as "vocabulary" | "grammar",
    kc_level: row.kc_level,
    kc_data: parseJson(row.data_json, {}),
  }));

  return [...dueItems, ...newItems];
}

/**
 * Persist updated FSRS state back to srs_cards.
 * Creates the card row if it's new (card_id === -1).
 */
export async function saveCardState(kc_id: number, card: FSRSCard): Promise<number> {
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM srs_cards WHERE kc_id = ?",
    [kc_id]
  );

  if (existing) {
    await run(
      `UPDATE srs_cards SET
        stability = ?, difficulty = ?, retrievability = ?,
        state = ?, due_at = ?, review_count = ?,
        lapse_count = ?, last_reviewed_at = ?
       WHERE kc_id = ?`,
      [
        card.stability,
        card.difficulty,
        card.retrievability,
        card.state,
        card.due_at?.toISOString() ?? null,
        card.review_count,
        card.lapse_count,
        card.last_reviewed_at?.toISOString() ?? null,
        kc_id,
      ]
    );
    return existing.id;
  } else {
    const result = await run(
      `INSERT INTO srs_cards
        (kc_id, stability, difficulty, retrievability, state, due_at,
         review_count, lapse_count, last_reviewed_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        kc_id,
        card.stability,
        card.difficulty,
        card.retrievability,
        card.state,
        card.due_at?.toISOString() ?? null,
        card.review_count,
        card.lapse_count,
        card.last_reviewed_at?.toISOString() ?? null,
      ]
    );
    return result.lastInsertRowid as number;
  }
}

/** Count of items due today (for dashboard). */
export async function getDueCount(subject = "mixed"): Promise<{
  due: number;
  new_cards: number;
}> {
  const typeFilter =
    subject === "mixed" ? "" : `AND kc.type = '${subject}'`;
  const now = new Date().toISOString();

  const due = (await queryOne<{ n: number }>(`
    SELECT COUNT(*) AS n FROM srs_cards sc
    JOIN knowledge_components kc ON kc.id = sc.kc_id
    WHERE (sc.due_at <= ? OR sc.state IN ('learning','relearning'))
      ${typeFilter}
  `, [now]))?.n ?? 0;

  const newCards = (await queryOne<{ n: number }>(`
    SELECT COUNT(*) AS n FROM knowledge_components kc
    LEFT JOIN srs_cards sc ON sc.kc_id = kc.id
    WHERE sc.id IS NULL ${typeFilter}
  `))?.n ?? 0;

  return { due, new_cards: Math.min(newCards, NEW_CARDS_PER_SESSION) };
}
