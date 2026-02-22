/**
 * FSRS-5 algorithm — TypeScript port.
 *
 * References:
 *   https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 *   Ye et al. (2024) "A Stochastic Shortest Path Algorithm for Optimizing
 *     Spaced Repetition Scheduling"
 *
 * Key constructs:
 *   S (stability)    — days until retention drops to ~37% (1/e)
 *   D (difficulty)   — intrinsic item difficulty, 1–10
 *   R (retrievability) — current recall probability 0–1
 *   I (interval)     — days until next review
 */

// Pre-trained FSRS-5 weights (default from open-spaced-repetition)
export const DEFAULT_W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.06, 1.4599,
  0.1544, 1.004, 1.9395, 0.11, 0.29, 2.2700, 0.1544, 2.9898,
] as const;

export type Grade = 1 | 2 | 3 | 4; // again=1, hard=2, good=3, easy=4
export type CardState = "new" | "learning" | "review" | "relearning";

export interface FSRSCard {
  stability: number; // S
  difficulty: number; // D (1–10)
  retrievability: number; // R (0–1)
  state: CardState;
  due_at: Date | null;
  review_count: number;
  lapse_count: number;
  last_reviewed_at: Date | null;
}

export interface FSRSResult {
  card: FSRSCard;
  interval_days: number;
  scheduled_days: number;
}

export const DESIRED_RETENTION = 0.9;

// ─────────────────────────────────────────────────────────────────────────────
// Core math
// ─────────────────────────────────────────────────────────────────────────────

/** Current retrievability given elapsed days and stability. */
export function retrievability(elapsed_days: number, S: number): number {
  return Math.exp((Math.log(DESIRED_RETENTION) * elapsed_days) / S);
}

/** Next interval targeting desired_retention. */
export function nextInterval(S: number, desired_retention = DESIRED_RETENTION): number {
  return Math.max(1, Math.round(
    (-S * Math.log(desired_retention)) / Math.log(2)
  ));
}

// ─────────────────────────────────────────────────────────────────────────────
// Stability updates
// ─────────────────────────────────────────────────────────────────────────────

function initStability(grade: Grade, w: readonly number[]): number {
  // w[0..3] = initial stability for grades 1–4
  return Math.max(0.1, w[grade - 1]);
}

function initDifficulty(grade: Grade, w: readonly number[]): number {
  // D0(G) = w[4] - exp(w[5] * (G - 1)) + 1
  return clamp(w[4] - Math.exp(w[5] * (grade - 1)) + 1, 1, 10);
}

function nextDifficulty(D: number, grade: Grade, w: readonly number[]): number {
  // D' = D + w[6] * (grade - 3) with mean reversion
  const delta = w[6] * (grade - 3);
  return clamp(D + delta, 1, 10);
}

function shortTermStability(
  S: number,
  grade: Grade,
  w: readonly number[]
): number {
  // For new/learning cards: S' = S * exp(w[17-ish]) — simplified short-term formula
  return S * Math.exp(w[7] * (grade - 3));
}

function recallStability(
  D: number,
  S: number,
  R: number,
  grade: Grade,
  w: readonly number[]
): number {
  const hard_penalty = grade === 2 ? w[15] : 1;
  const easy_bonus = grade === 4 ? w[16] : 1;
  return (
    S *
    (Math.exp(w[8]) *
      (11 - D) *
      Math.pow(S, -w[9]) *
      (Math.exp(w[10] * (1 - R)) - 1) *
      hard_penalty *
      easy_bonus +
      1)
  );
}

function forgetStability(
  D: number,
  S: number,
  R: number,
  w: readonly number[]
): number {
  return (
    w[11] *
    Math.pow(D, -w[12]) *
    (Math.pow(S + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - R))
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule a card after a review.
 * Returns the updated card state and computed interval.
 */
export function schedule(
  card: FSRSCard,
  grade: Grade,
  now: Date = new Date(),
  w: readonly number[] = DEFAULT_W,
  desired_retention = DESIRED_RETENTION
): FSRSResult {
  const elapsed =
    card.last_reviewed_at
      ? (now.getTime() - card.last_reviewed_at.getTime()) / 86_400_000
      : 0;

  let S: number;
  let D: number;
  let newState: CardState;
  let lapseCount = card.lapse_count;

  if (card.state === "new") {
    S = initStability(grade, w);
    D = initDifficulty(grade, w);
    newState = grade === 1 ? "learning" : "review";
  } else {
    const R = retrievability(elapsed, card.stability);
    D = nextDifficulty(card.difficulty, grade, w);

    if (grade === 1) {
      // Lapse — forgotten
      S = forgetStability(D, card.stability, R, w);
      newState = "relearning";
      lapseCount += 1;
    } else if (card.state === "learning" || card.state === "relearning") {
      S = shortTermStability(card.stability, grade, w);
      newState = grade >= 3 ? "review" : "learning";
    } else {
      // Recall — normal review
      S = recallStability(D, card.stability, R, grade, w);
      newState = "review";
    }
  }

  S = Math.max(0.1, S);
  const interval = nextInterval(S, desired_retention);
  const due = new Date(now.getTime() + interval * 86_400_000);

  return {
    card: {
      stability: S,
      difficulty: D,
      retrievability: retrievability(0, S), // at review moment = ~1
      state: newState,
      due_at: due,
      review_count: card.review_count + 1,
      lapse_count: lapseCount,
      last_reviewed_at: now,
    },
    interval_days: interval,
    scheduled_days: interval,
  };
}

/**
 * Predict retrievability for a card at a future date.
 * Used by session planner to target ~80% predicted accuracy.
 */
export function predictRetrievability(card: FSRSCard, at: Date = new Date()): number {
  if (card.state === "new" || !card.last_reviewed_at) return 1.0;
  const elapsed =
    (at.getTime() - card.last_reviewed_at.getTime()) / 86_400_000;
  return retrievability(elapsed, card.stability);
}

/** Create a new blank card for a knowledge component. */
export function newCard(): Omit<FSRSCard, "due_at" | "last_reviewed_at"> {
  return {
    stability: 0,
    difficulty: 0.3,
    retrievability: 1.0,
    state: "new",
    review_count: 0,
    lapse_count: 0,
  };
}
