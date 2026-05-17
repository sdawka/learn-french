/**
 * CEFR proficiency estimation.
 * Aggregates per-KC FSRS data into a continuous 0.0–6.0 proficiency score.
 * 0–1=A1, 1–2=A2, 2–3=B1, 3–4=B2, 4–5=C1, 5–6=C2
 */

import { query, queryOne } from "../db/index.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Maps CEFR level string to its 0–6 band floor. */
const LEVEL_FLOOR: Record<CefrLevel, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};

/** Maps srs_cards.state to a weight multiplier. */
const STATE_WEIGHT: Record<string, number> = {
  new: 0,
  learning: 0.5,
  relearning: 0.5,
  review: 1,
  mastered: 2,
};

/** Converts a 0–6 raw score to a CEFR level string. */
function scoreToCefrLevel(score: number): string {
  const clamped = Math.max(0, Math.min(6, score));
  const idx = Math.min(Math.floor(clamped), 5);
  return CEFR_LEVELS[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Vocabulary proficiency
// ─────────────────────────────────────────────────────────────────────────────

interface VocabLevelRow {
  level: CefrLevel;
  avg_retrievability: number;
  avg_state_weight: number;
  card_count: number;
}

/**
 * Estimates vocabulary proficiency as a continuous 0–6 score.
 *
 * Per CEFR level: computes a weighted signal = avg(state_weight × retrievability),
 * then scales it into the level's [floor, floor+1) band and takes a
 * card-count-weighted average across all levels.
 */
export async function estimateVocabProficiency(): Promise<number> {
  // SQLite has no native CASE in GROUP BY position, so we compute
  // state_weight inline via a CASE expression.
  const rows = await query<VocabLevelRow>(`
    SELECT
      kc.level,
      AVG(sc.retrievability)                                            AS avg_retrievability,
      AVG(
        CASE sc.state
          WHEN 'new'        THEN 0.0
          WHEN 'learning'   THEN 0.5
          WHEN 'relearning' THEN 0.5
          WHEN 'review'     THEN 1.0
          WHEN 'mastered'   THEN 2.0
          ELSE 0.0
        END
      )                                                                 AS avg_state_weight,
      COUNT(*)                                                          AS card_count
    FROM srs_cards sc
    JOIN knowledge_components kc ON kc.id = sc.kc_id
    WHERE kc.type = 'vocabulary'
    GROUP BY kc.level
  `);

  if (rows.length === 0) return 0;

  // Max possible signal per card: state_weight=2, retrievability=1 → 2.0
  const MAX_SIGNAL = 2.0;

  let totalWeight = 0;
  let weightedScore = 0;

  for (const row of rows) {
    const floor = LEVEL_FLOOR[row.level] ?? 0;
    // signal in [0, MAX_SIGNAL]; normalise to [0,1] then project into band
    const signal = (row.avg_state_weight * row.avg_retrievability) / MAX_SIGNAL;
    const bandScore = floor + Math.min(signal, 1.0);
    weightedScore += bandScore * row.card_count;
    totalWeight += row.card_count;
  }

  return totalWeight > 0 ? weightedScore / totalWeight : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Grammar proficiency
// ─────────────────────────────────────────────────────────────────────────────

interface GrammarCategoryRow {
  category: string;
  level: CefrLevel;
  correct: number;
  total: number;
}

/**
 * Estimates grammar proficiency per category.
 *
 * Uses accuracy over the last 20 responses per KC, averaged within each
 * grammar category, then maps accuracy into the KC's CEFR band.
 *
 * Returns { category: proficiency_score_0_to_6 }.
 */
export async function estimateGrammarProficiency(): Promise<Record<string, number>> {
  // Subquery: rank responses per kc_id by recency, keep last 20.
  const rows = await query<GrammarCategoryRow>(`
    SELECT
      kc.data_json ->> '$.category'  AS category,
      kc.level                       AS level,
      SUM(r.is_correct)              AS correct,
      COUNT(*)                       AS total
    FROM responses r
    JOIN knowledge_components kc ON kc.id = r.kc_id
    WHERE kc.type = 'grammar'
      AND r.id IN (
        SELECT id FROM responses r2
        WHERE r2.kc_id = r.kc_id
        ORDER BY r2.created_at DESC
        LIMIT 20
      )
    GROUP BY kc.data_json ->> '$.category', kc.level
  `);

  if (rows.length === 0) return {};

  // Group by category; a category may span multiple CEFR levels.
  // We compute a weighted average score across levels, weighted by response count.
  const byCategory: Record<string, { weightedScore: number; totalCount: number }> = {};

  for (const row of rows) {
    const category = row.category ?? "unknown";
    const floor = LEVEL_FLOOR[row.level] ?? 0;
    const accuracy = row.total > 0 ? row.correct / row.total : 0;
    const bandScore = floor + Math.min(accuracy, 1.0);

    if (!byCategory[category]) {
      byCategory[category] = { weightedScore: 0, totalCount: 0 };
    }
    byCategory[category].weightedScore += bandScore * row.total;
    byCategory[category].totalCount += row.total;
  }

  const result: Record<string, number> = {};
  for (const [category, { weightedScore, totalCount }] of Object.entries(byCategory)) {
    result[category] = totalCount > 0 ? weightedScore / totalCount : 0;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Overall CEFR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combines vocabulary (60%) and grammar (40%) into a single CEFR score.
 */
export function computeOverallCEFR(
  vocab: number,
  grammar: Record<string, number>
): { level: string; score: number } {
  const grammarValues = Object.values(grammar);
  const grammarAvg =
    grammarValues.length > 0
      ? grammarValues.reduce((a, b) => a + b, 0) / grammarValues.length
      : 0;

  const score = Math.min(6, Math.max(0, vocab * 0.6 + grammarAvg * 0.4));
  return { level: scoreToCefrLevel(score), score };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. KCs at a given CEFR level
// ─────────────────────────────────────────────────────────────────────────────

interface KcIdRow {
  id: number;
}

/**
 * Returns all kc_ids for the given CEFR level and type.
 */
export async function getKCsAtLevel(
  level: string,
  type: "vocabulary" | "grammar"
): Promise<number[]> {
  const rows = await query<KcIdRow>(
    `SELECT id FROM knowledge_components WHERE level = ? AND type = ?`,
    [level, type]
  );
  return rows.map((r) => r.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Prerequisite satisfaction
// ─────────────────────────────────────────────────────────────────────────────

interface PrereqRow {
  requires_kc_id: number;
}

interface SrsStateRow {
  state: string;
}

/**
 * Returns true if all prerequisite KCs for the given kc_id are in state
 * 'review' or 'mastered'. Returns true if the KC has no prerequisites.
 */
export async function getPrerequisitesSatisfied(kc_id: number): Promise<boolean> {
  const prereqs = await query<PrereqRow>(
    `SELECT requires_kc_id FROM kc_prerequisites WHERE kc_id = ?`,
    [kc_id]
  );

  if (prereqs.length === 0) return true;

  for (const { requires_kc_id } of prereqs) {
    const card = await queryOne<SrsStateRow>(
      `SELECT state FROM srs_cards WHERE kc_id = ?`,
      [requires_kc_id]
    );
    // Missing card counts as unsatisfied; only 'review' and 'mastered' pass.
    if (!card || (card.state !== "review" && card.state !== "mastered")) {
      return false;
    }
  }

  return true;
}
