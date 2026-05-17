/**
 * Learner profile — read/write the singleton learner_profile row.
 * Maps proficiency 0.0–6.0 to CEFR levels A1–C2.
 */

import { queryOne, run, parseJson } from "../db/index.ts";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface GrammarProficiency {
  present?: number;
  passe_compose?: number;
  imparfait?: number;
  futur?: number;
  subjonctif?: number;
  conditionnel?: number;
  gender_agreement?: number;
  pronoun_use?: number;
  question_formation?: number;
  relative_clauses?: number;
  [category: string]: number | undefined;
}

export interface StyleWeights {
  translate?: number;
  cloze?: number;
  idiomatic?: number;
  definition?: number;
  odd_one_out?: number;
  context_guess?: number;
  construct?: number;
  spot_error?: number;
  transform?: number;
  dictogloss?: number;
  naturalness?: number;
  [game: string]: number | undefined;
}

export interface SessionPattern {
  optimal_length_min?: number;
  best_time_of_day?: string | null;
  avg_accuracy_by_hour?: Record<string, number>;
}

export interface LearnerProfile {
  vocabulary_proficiency: number;
  grammar_proficiency: GrammarProficiency;
  forgetting_rate: number;
  style_weights: StyleWeights;
  session_pattern: SessionPattern;
}

// Maps proficiency 0.0–6.0 → CEFR
export function proficiencyToCEFR(p: number): CEFRLevel {
  if (p < 1) return "A1";
  if (p < 2) return "A2";
  if (p < 3) return "B1";
  if (p < 4) return "B2";
  if (p < 5) return "C1";
  return "C2";
}

export async function getProfile(): Promise<LearnerProfile> {
  const row = await queryOne<{
    vocabulary_proficiency: number;
    grammar_proficiency_json: string;
    forgetting_rate: number;
    style_weights_json: string;
    session_pattern_json: string;
  }>("SELECT * FROM learner_profile WHERE id = 1");

  if (!row) {
    // Singleton must exist (seeded in schema)
    await run("INSERT OR IGNORE INTO learner_profile (id) VALUES (1)");
    return {
      vocabulary_proficiency: 0,
      grammar_proficiency: {},
      forgetting_rate: 1.0,
      style_weights: {},
      session_pattern: {},
    };
  }

  return {
    vocabulary_proficiency: row.vocabulary_proficiency,
    grammar_proficiency: parseJson<GrammarProficiency>(
      row.grammar_proficiency_json,
      {}
    ),
    forgetting_rate: row.forgetting_rate,
    style_weights: parseJson<StyleWeights>(row.style_weights_json, {}),
    session_pattern: parseJson<SessionPattern>(row.session_pattern_json, {}),
  };
}

export async function updateProfile(patch: Partial<LearnerProfile>): Promise<void> {
  const current = await getProfile();

  const merged: LearnerProfile = {
    vocabulary_proficiency:
      patch.vocabulary_proficiency ?? current.vocabulary_proficiency,
    grammar_proficiency: {
      ...current.grammar_proficiency,
      ...patch.grammar_proficiency,
    },
    forgetting_rate: patch.forgetting_rate ?? current.forgetting_rate,
    style_weights: { ...current.style_weights, ...patch.style_weights },
    session_pattern: { ...current.session_pattern, ...patch.session_pattern },
  };

  await run(
    `UPDATE learner_profile SET
      vocabulary_proficiency   = ?,
      grammar_proficiency_json = ?,
      forgetting_rate          = ?,
      style_weights_json       = ?,
      session_pattern_json     = ?
     WHERE id = 1`,
    [
      merged.vocabulary_proficiency,
      JSON.stringify(merged.grammar_proficiency),
      merged.forgetting_rate,
      JSON.stringify(merged.style_weights),
      JSON.stringify(merged.session_pattern),
    ]
  );
}

/**
 * Update vocabulary proficiency based on recent session accuracy.
 * Uses exponential moving average (α=0.1) — gradual drift, not jumps.
 */
export async function updateVocabProficiency(sessionAccuracy: number): Promise<void> {
  const { vocabulary_proficiency } = await getProfile();
  // Accuracy maps linearly to proficiency changes: +0.1 at 100%, -0.1 at 0%
  const delta = (sessionAccuracy - 0.5) * 0.2;
  const updated = Math.max(0, Math.min(6, vocabulary_proficiency + delta));
  await updateProfile({ vocabulary_proficiency: updated });
}

/**
 * Update grammar proficiency for a specific category.
 */
export async function updateGrammarProficiency(
  category: string,
  sessionAccuracy: number
): Promise<void> {
  const { grammar_proficiency } = await getProfile();
  const current = grammar_proficiency[category] ?? 0;
  const delta = (sessionAccuracy - 0.5) * 0.2;
  const updated = Math.max(0, Math.min(6, current + delta));
  await updateProfile({
    grammar_proficiency: { ...grammar_proficiency, [category]: updated },
  });
}

/**
 * Update style weights based on engagement signal.
 * Higher accuracy in a game type → slightly higher weight (learned preference).
 */
export async function updateStyleWeight(gameType: string, accuracy: number): Promise<void> {
  const { style_weights } = await getProfile();
  const current = style_weights[gameType] ?? 1.0;
  // Small drift toward engagement signal
  const updated = current * 0.95 + accuracy * 0.05;
  await updateProfile({ style_weights: { ...style_weights, [gameType]: updated } });
}
