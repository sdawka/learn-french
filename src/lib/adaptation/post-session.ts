/**
 * Post-session adaptation — runs after a session ends.
 *
 * Updates:
 *   1. FSRS state for each reviewed KC
 *   2. Error tallies and confusion pairs
 *   3. Proficiency estimates per domain
 *   4. Style weights (engagement signal)
 *   5. Daily stats
 */

import { query, queryOne, run, parseJson } from "../db/index.ts";
import { schedule } from "../srs/fsrs.ts";
import type { FSRSCard, Grade } from "../srs/fsrs.ts";
import { saveCardState } from "../srs/scheduler.ts";
import {
  updateVocabProficiency,
  updateGrammarProficiency,
  updateStyleWeight,
} from "../learner-model/profile.ts";
import { recordError, recordConfusion } from "../learner-model/misconceptions.ts";
import type { ErrorType } from "../learner-model/misconceptions.ts";

export interface SessionResponse {
  kc_id: number;
  is_correct: boolean;
  response_time_ms: number;
  game_type: string;
  error_type?: ErrorType;
  confused_with_kc_id?: number;
}

export interface PostSessionResult {
  kcs_updated: number;
  misconceptions_triggered: string[];
  accuracy: number;
  predicted_vs_actual: { predicted: number; actual: number };
}

/**
 * Run all post-session updates for a completed session.
 */
export function runPostSession(
  session_id: number,
  responses: SessionResponse[],
  now: Date = new Date()
): PostSessionResult {
  const misconceptions_triggered: string[] = [];
  let kcs_updated = 0;

  // Load KC types for proficiency updates
  const kcIds = [...new Set(responses.map((r) => r.kc_id))];
  const kcTypes: Record<number, { type: string; subtype: string }> = {};
  for (const id of kcIds) {
    const row = queryOne<{ type: string; subtype: string }>(
      "SELECT type, subtype FROM knowledge_components WHERE id = ?",
      [id]
    );
    if (row) kcTypes[id] = row;
  }

  // Group responses by KC to compute per-KC grade
  const byKc: Record<number, SessionResponse[]> = {};
  for (const r of responses) {
    byKc[r.kc_id] ??= [];
    byKc[r.kc_id].push(r);
  }

  // Accuracy accumulators per domain
  const vocabResults: boolean[] = [];
  const grammarResults: Record<string, boolean[]> = {};
  const gameTypeResults: Record<string, boolean[]> = {};

  for (const [kc_id_str, kcResponses] of Object.entries(byKc)) {
    const kc_id = Number(kc_id_str);
    const kcType = kcTypes[kc_id];

    // Compute overall grade for this KC (last response is most recent)
    const lastResponse = kcResponses[kcResponses.length - 1];
    const correctCount = kcResponses.filter((r) => r.is_correct).length;
    const totalCount = kcResponses.length;
    const accuracy = correctCount / totalCount;

    // Map accuracy → FSRS grade
    const grade: Grade =
      accuracy >= 0.9 ? 4 : accuracy >= 0.7 ? 3 : accuracy >= 0.4 ? 2 : 1;

    // Load current card state
    const cardRow = queryOne<{
      stability: number;
      difficulty: number;
      retrievability: number;
      state: string;
      due_at: string | null;
      review_count: number;
      lapse_count: number;
      last_reviewed_at: string | null;
    }>("SELECT * FROM srs_cards WHERE kc_id = ?", [kc_id]);

    const currentCard: FSRSCard = cardRow
      ? {
          stability: cardRow.stability,
          difficulty: cardRow.difficulty,
          retrievability: cardRow.retrievability,
          state: cardRow.state as FSRSCard["state"],
          due_at: cardRow.due_at ? new Date(cardRow.due_at) : null,
          review_count: cardRow.review_count,
          lapse_count: cardRow.lapse_count,
          last_reviewed_at: cardRow.last_reviewed_at
            ? new Date(cardRow.last_reviewed_at)
            : null,
        }
      : {
          stability: 0,
          difficulty: 0.3,
          retrievability: 1.0,
          state: "new",
          due_at: null,
          review_count: 0,
          lapse_count: 0,
          last_reviewed_at: null,
        };

    const { card: updatedCard } = schedule(currentCard, grade, now);
    saveCardState(kc_id, updatedCard);
    kcs_updated++;

    // Error tracking
    for (const resp of kcResponses) {
      if (!resp.is_correct && resp.error_type) {
        const misconception = recordError(kc_id, resp.error_type, now);
        if (misconception && !misconceptions_triggered.includes(misconception.name)) {
          misconceptions_triggered.push(misconception.name);
        }
      }
      if (!resp.is_correct && resp.confused_with_kc_id) {
        recordConfusion(kc_id, resp.confused_with_kc_id, now);
      }

      // Accumulate for proficiency updates
      const gameType = resp.game_type;
      gameTypeResults[gameType] ??= [];
      gameTypeResults[gameType].push(resp.is_correct);
    }

    // Domain-specific proficiency tracking
    if (kcType?.type === "vocabulary") {
      vocabResults.push(...kcResponses.map((r) => r.is_correct));
    } else if (kcType?.type === "grammar") {
      const category = (kcType as any).category ?? "general";
      grammarResults[category] ??= [];
      grammarResults[category].push(...kcResponses.map((r) => r.is_correct));
    }
  }

  // Update proficiency estimates
  if (vocabResults.length > 0) {
    const acc = vocabResults.filter(Boolean).length / vocabResults.length;
    updateVocabProficiency(acc);
  }
  for (const [category, results] of Object.entries(grammarResults)) {
    if (results.length > 0) {
      const acc = results.filter(Boolean).length / results.length;
      updateGrammarProficiency(category, acc);
    }
  }

  // Update style weights
  for (const [gameType, results] of Object.entries(gameTypeResults)) {
    if (results.length > 0) {
      const acc = results.filter(Boolean).length / results.length;
      updateStyleWeight(gameType, acc);
    }
  }

  const overallAccuracy =
    responses.length > 0
      ? responses.filter((r) => r.is_correct).length / responses.length
      : 0;

  // Update session record
  run(
    `UPDATE sessions SET
      ended_at = ?, cards_reviewed = ?, accuracy = ?
     WHERE id = ?`,
    [now.toISOString(), kcs_updated, overallAccuracy, session_id]
  );

  // Update daily stats
  const today = now.toISOString().split("T")[0];
  run(
    `INSERT INTO daily_stats (date, cards_reviewed, accuracy, new_kcs_learned)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(date) DO UPDATE SET
       cards_reviewed = cards_reviewed + excluded.cards_reviewed,
       accuracy = (accuracy + excluded.accuracy) / 2`,
    [today, kcs_updated, overallAccuracy]
  );

  // Load predicted accuracy from plan
  const sessionRow = queryOne<{ plan_id: number | null }>(
    "SELECT plan_id FROM sessions WHERE id = ?",
    [session_id]
  );
  let predicted = 0.8;
  if (sessionRow?.plan_id) {
    const planRow = queryOne<{ expected_accuracy: number }>(
      "SELECT expected_accuracy FROM session_plans WHERE id = ?",
      [sessionRow.plan_id]
    );
    predicted = planRow?.expected_accuracy ?? 0.8;
  }

  return {
    kcs_updated,
    misconceptions_triggered,
    accuracy: overallAccuracy,
    predicted_vs_actual: { predicted, actual: overallAccuracy },
  };
}
