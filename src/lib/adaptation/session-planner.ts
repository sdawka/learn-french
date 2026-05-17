/**
 * Session Planner — composes a Session Plan from the Learner Model.
 *
 * Targeting principle: ~80% predicted accuracy (ZPD sweet spot).
 * Items are a mix of:
 *   - Due review items (lower retrievability → more challenge)
 *   - New items (scaffold at easiest level initially)
 *   - Optional exploration items (higher R, harder game type)
 *
 * Game type selection is weighted by:
 *   - KLI knowledge type (fact → translate/cloze; concept → definition/odd-one-out; etc.)
 *   - Learner style_weights (engagement signal)
 *   - Session mood
 */

import { getDueItems } from "../srs/scheduler.ts";
import { getProfile, proficiencyToCEFR } from "../learner-model/profile.ts";
import { run } from "../db/index.ts";

export type GameType =
  | "translate"
  | "cloze"
  | "idiomatic"
  | "definition"
  | "odd_one_out"
  | "context_guess"
  | "construct"
  | "spot_error"
  | "transform"
  | "dictogloss"
  | "naturalness";

export type Mood = "challenge" | "review" | "explore" | "quick" | "deep";
export type Subject = "vocabulary" | "grammar" | "mixed";

export interface PlanItem {
  kc_id: number;
  game_type: GameType;
  scaffold_level: number; // 0 = hardest, 3 = easiest
  expected_difficulty: number; // 0.0–1.0
  predicted_accuracy: number; // 0.0–1.0
}

export interface SessionPlan {
  id: number;
  subject: Subject;
  topic: string | null;
  level: string;
  style: string;
  mood: Mood;
  items: PlanItem[];
  expected_accuracy: number;
}

// KLI type → preferred game types
const KLI_GAME_MAP: Record<string, GameType[]> = {
  fact: ["translate", "cloze"],
  concept: ["definition", "odd_one_out"],
  procedure: ["construct", "transform", "spot_error"],
  principle: ["idiomatic", "context_guess", "naturalness"],
};

// Vocabulary subtype game types
const VOCAB_GAMES: GameType[] = [
  "translate",
  "cloze",
  "idiomatic",
  "definition",
  "odd_one_out",
  "context_guess",
];

// Grammar subtype game types
const GRAMMAR_GAMES: GameType[] = [
  "construct",
  "spot_error",
  "transform",
  "dictogloss",
  "naturalness",
];

// Mood → item count and challenge level
const MOOD_CONFIG: Record<Mood, { count: number; challenge_bias: number }> = {
  quick: { count: 10, challenge_bias: 0 },
  review: { count: 15, challenge_bias: -0.1 }, // slightly easier
  challenge: { count: 15, challenge_bias: 0.15 }, // slightly harder
  explore: { count: 12, challenge_bias: 0 },
  deep: { count: 25, challenge_bias: 0 },
};

/**
 * Detect which game types are actually compatible with a KC's data shape.
 *
 * This prevents the planner from assigning e.g. "transform" to a KC that only
 * has cloze_sentence/blank_answer fields and would render blank.
 */
function compatibleGameTypes(
  kc_data: Record<string, unknown>,
  kc_type: "vocabulary" | "grammar"
): GameType[] {
  if (kc_type === "grammar") {
    // Cloze-shaped: has a sentence with a blank to fill
    if (kc_data.cloze_sentence) return ["cloze"];
    // MC-shaped: has a prompt + options + single correct answer
    if (kc_data.prompt && kc_data.mc_options && kc_data.correct_answer) {
      return ["construct", "spot_error", "naturalness"];
    }
    return ["construct"];
  }

  // Vocabulary
  const games: GameType[] = [];
  if (kc_data.word && kc_data.translations) games.push("translate", "definition");
  if (kc_data.mc_options) games.push("idiomatic", "context_guess", "odd_one_out");
  if (kc_data.cloze_sentence) games.push("cloze");
  return games.length > 0 ? games : ["translate"];
}

/**
 * Select game type for a KC based on its KLI subtype, data shape, and learner weights.
 */
function selectGameType(
  kc_subtype: string,
  kc_type: "vocabulary" | "grammar",
  kc_data: Record<string, unknown>,
  style_weights: Record<string, number>
): GameType {
  const preferred = KLI_GAME_MAP[kc_subtype] ?? [];
  const compatible = compatibleGameTypes(kc_data, kc_type);

  // Intersect KLI preference with what the KC data can actually support
  const candidates = preferred.filter((g) => compatible.includes(g));
  const pool = candidates.length > 0 ? candidates : compatible;

  // Weight by learner style preference
  const weights = pool.map((g) => style_weights[g] ?? 1.0);
  const total = weights.reduce((a, b) => a + b, 0);
  const rand = Math.random() * total;
  let cumulative = 0;
  for (let i = 0; i < pool.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Compute initial scaffold level based on predicted accuracy.
 * If predicted accuracy is very low, start at easier scaffold.
 */
function scaffoldForAccuracy(predicted_accuracy: number): number {
  if (predicted_accuracy >= 0.8) return 0; // hardest — they know it
  if (predicted_accuracy >= 0.6) return 1;
  if (predicted_accuracy >= 0.4) return 2;
  return 3; // easiest
}

/**
 * Plan a session by loading due items and learner profile, then persisting the plan.
 */
export async function planSession(
  subject: Subject = "mixed",
  mood: Mood = "review",
  topic: string | null = null
): Promise<SessionPlan> {
  const profile = await getProfile();
  const { count, challenge_bias } = MOOD_CONFIG[mood];

  const level =
    subject === "grammar"
      ? proficiencyToCEFR(
          Object.values(profile.grammar_proficiency).reduce<number>(
            (a, b) => a + (b ?? 0),
            0
          ) /
            Math.max(
              1,
              Object.keys(profile.grammar_proficiency).length || 1
            )
        )
      : proficiencyToCEFR(profile.vocabulary_proficiency);

  const dueItems = await getDueItems(subject, count);
  const items: PlanItem[] = [];
  let accuracySum = 0;

  for (const item of dueItems) {
    const data = item.kc_data as { subtype?: string; type?: string };
    const subtype = (data.subtype as string) ??
      (item.kc_type === "vocabulary" ? "fact" : "procedure");

    const game_type = selectGameType(
      subtype,
      item.kc_type,
      item.kc_data as Record<string, unknown>,
      profile.style_weights as Record<string, number>
    );

    const predicted_accuracy = Math.max(
      0,
      Math.min(1, item.retrievability + challenge_bias)
    );

    items.push({
      kc_id: item.kc_id,
      game_type,
      scaffold_level: scaffoldForAccuracy(predicted_accuracy),
      expected_difficulty: item.card.difficulty,
      predicted_accuracy,
    });

    accuracySum += predicted_accuracy;
  }

  const expected_accuracy =
    items.length > 0 ? accuracySum / items.length : 0.8;

  const planResult = await run(
    `INSERT INTO session_plans
      (subject, topic, level, style, mood, items_json, expected_accuracy)
     VALUES (?,?,?,?,?,?,?)`,
    [subject, topic, level, mood, mood, JSON.stringify(items), expected_accuracy]
  );

  return {
    id: planResult.lastInsertRowid as number,
    subject,
    topic,
    level,
    style: mood,
    mood,
    items,
    expected_accuracy,
  };
}

/** @deprecated Use planSession instead */
export const planSessionSync = planSession;
