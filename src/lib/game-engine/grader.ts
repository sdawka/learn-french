/**
 * Per-game grading logic.
 *
 * Each game type has its own grader because:
 *   - Multiple choice games are binary (right/wrong)
 *   - Free-response games need fuzzy matching
 *   - Dictogloss grades partial transcript accuracy
 *   - Naturalness ranks options (not binary)
 */

export type ErrorType =
  | "orthographic"
  | "semantic"
  | "morphological"
  | "syntactic"
  | "pragmatic";

export interface GradeResult {
  is_correct: boolean;
  partial_credit?: number; // 0.0–1.0 (for future use)
  error_type?: ErrorType;
  feedback?: string;
  confused_with?: string; // the answer the learner gave (for confusion tracking)
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize for comparison: lowercase, trim, remove diacritics optionally. */
function normalize(s: string, strict = true): string {
  const trimmed = s.trim().toLowerCase();
  if (!strict) {
    return trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return trimmed;
}

/** Levenshtein distance for typo tolerance. */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Accept answer if within 1 edit distance for short words, 2 for longer. */
function fuzzyMatch(given: string, expected: string): boolean {
  const a = normalize(given);
  const b = normalize(expected);
  if (a === b) return true;
  const maxDist = b.length <= 5 ? 1 : 2;
  return editDistance(a, b) <= maxDist;
}

/** Check if a diacritic was dropped (orthographic error). */
function hasDiacriticError(given: string, expected: string): boolean {
  return (
    normalize(given, false) === normalize(expected, false) &&
    normalize(given, true) !== normalize(expected, true)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-game graders
// ─────────────────────────────────────────────────────────────────────────────

export interface GradeInput {
  game_type: string;
  answer: string;
  expected: string; // correct answer
  options?: string[]; // MC options (for confusion tracking)
  acceptable_answers?: string[]; // alternative correct forms
}

export function grade(input: GradeInput): GradeResult {
  switch (input.game_type) {
    case "translate":
      return gradeTranslate(input);
    case "cloze":
      return gradeCloze(input);
    case "idiomatic":
    case "odd_one_out":
    case "context_guess":
    case "construct":
    case "spot_error":
    case "naturalness":
      return gradeMultipleChoice(input);
    case "definition":
      return gradeDefinition(input);
    case "transform":
      return gradeTransform(input);
    case "dictogloss":
      return gradeDictogloss(input);
    default:
      return gradeMultipleChoice(input);
  }
}

function accentReminder(correct: string): string {
  return `✓ Accepted — accent tip: ${correct}`;
}

function gradeTranslate(input: GradeInput): GradeResult {
  const given = normalize(input.answer);
  const expected = normalize(input.expected);
  const alternatives = (input.acceptable_answers ?? []).map((s) => normalize(s));

  if (given === expected || alternatives.includes(given)) {
    return { is_correct: true };
  }

  // Accept missing/wrong accents — correct with a soft reminder
  const givenFlat = normalize(input.answer, false);
  const expectedFlat = normalize(input.expected, false);
  const altFlats = (input.acceptable_answers ?? []).map((s) => normalize(s, false));
  if (givenFlat === expectedFlat || altFlats.includes(givenFlat)) {
    return { is_correct: true, feedback: accentReminder(input.expected) };
  }

  // Fuzzy match — near miss (typo)
  if (fuzzyMatch(input.answer, input.expected)) {
    return {
      is_correct: false,
      error_type: "orthographic",
      feedback: `Close! The correct spelling is "${input.expected}"`,
    };
  }

  return {
    is_correct: false,
    error_type: "semantic",
    confused_with: input.answer,
  };
}

function gradeCloze(input: GradeInput): GradeResult {
  const given = normalize(input.answer);
  const expected = normalize(input.expected);
  const alternatives = (input.acceptable_answers ?? []).map((s) => normalize(s));

  if (given === expected || alternatives.includes(given)) {
    return { is_correct: true };
  }

  // Accept missing/wrong accents — correct with a soft reminder
  const givenFlat = normalize(input.answer, false);
  const expectedFlat = normalize(input.expected, false);
  if (givenFlat === expectedFlat) {
    return { is_correct: true, feedback: accentReminder(input.expected) };
  }

  // Morphological error (right root, wrong ending)
  const expectedRoot = expected.slice(0, Math.max(3, expected.length - 3));
  if (given.startsWith(expectedRoot)) {
    return {
      is_correct: false,
      error_type: "morphological",
      feedback: `Check the form: the answer should be "${input.expected}"`,
    };
  }

  return {
    is_correct: false,
    error_type: "semantic",
    confused_with: input.answer,
  };
}

function gradeMultipleChoice(input: GradeInput): GradeResult {
  const given = normalize(input.answer);
  const expected = normalize(input.expected);

  if (given === expected) {
    return { is_correct: true };
  }

  return {
    is_correct: false,
    confused_with: input.answer,
    // MC errors are typically conceptual/semantic
    error_type: "semantic",
  };
}

function gradeDefinition(input: GradeInput): GradeResult {
  // Definition can be free-response or MC; use fuzzy for free-response
  const given = normalize(input.answer);
  const expected = normalize(input.expected);

  if (fuzzyMatch(input.answer, input.expected) || given === expected) {
    return { is_correct: true };
  }

  return {
    is_correct: false,
    error_type: "semantic",
    confused_with: input.answer,
  };
}

function gradeTransform(input: GradeInput): GradeResult {
  const given = normalize(input.answer);
  const expected = normalize(input.expected);
  const alternatives = (input.acceptable_answers ?? []).map((s) => normalize(s));

  if (given === expected || alternatives.includes(given)) {
    return { is_correct: true };
  }

  // Accept missing accents
  const givenFlat = normalize(input.answer, false);
  const expectedFlat = normalize(input.expected, false);
  if (givenFlat === expectedFlat) {
    return { is_correct: true, feedback: accentReminder(input.expected) };
  }

  // Check for morphological vs. syntactic error
  const expectedParts = expected.split(" ");
  const givenParts = given.split(" ");
  if (expectedParts.length === givenParts.length) {
    return {
      is_correct: false,
      error_type: "morphological",
      confused_with: input.answer,
    };
  }

  return {
    is_correct: false,
    error_type: "syntactic",
    confused_with: input.answer,
  };
}

function gradeDictogloss(input: GradeInput): GradeResult {
  // Grade based on word overlap (simplified)
  const givenWords = normalize(input.answer).split(/\s+/);
  const expectedWords = normalize(input.expected).split(/\s+/);

  const matches = givenWords.filter((w) => expectedWords.includes(w)).length;
  const accuracy = matches / expectedWords.length;

  return {
    is_correct: accuracy >= 0.85,
    partial_credit: accuracy,
    error_type: accuracy < 0.85 ? "syntactic" : undefined,
    feedback:
      accuracy < 0.85
        ? `${Math.round(accuracy * 100)}% accuracy — keep listening`
        : undefined,
  };
}
