/**
 * Naturalness game — pick the most natural/grammatically correct French sentence.
 *
 * Scaffold levels:
 *   0 = options in random order, pick the most natural (hardest)
 *   1 = options pre-sorted worst→best (correct is last)
 *   2 = pre-sorted + rule hint
 *   3 = pre-sorted + rule + correct option labelled with ★
 */

import { useState, useEffect, useRef } from "react";

interface KCData {
  prompt?: string;
  rule?: string;
  mc_options?: string[];
  correct_answer?: string;
  explanation?: string;
  examples?: Array<{ fr: string; en: string }>;
}

interface Props {
  kc_data: KCData;
  scaffold_level: number;
  on_submit: (answer: string) => void;
  on_hint: () => void;
  hints_used: number;
  feedback?: { is_correct: boolean; message?: string } | null;
}

const LABELS = ["A", "B", "C", "D", "E"];

function shuffleArray<T>(arr: T[], seed: number): T[] {
  // Deterministic shuffle using a simple seed so it doesn't re-shuffle on every render
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function NaturalnessGame({
  kc_data,
  scaffold_level,
  on_submit,
  feedback,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const correctAnswer = kc_data.correct_answer ?? "";
  const rawOptions = (kc_data.mc_options ?? []).slice(0, 5);

  // Seed for stable shuffle — changes when question changes
  const seedRef = useRef(Date.now());
  useEffect(() => {
    setSelected(null);
    seedRef.current = Date.now();
  }, [correctAnswer, scaffold_level]);

  if (!rawOptions.length) {
    return (
      <div className="text-center text-gray-400 space-y-4">
        <p>Content not available</p>
        <button
          onClick={() => on_submit("stub")}
          className="px-4 py-2 bg-gray-700 rounded-xl text-white hover:bg-gray-600 transition-colors"
        >
          Skip
        </button>
      </div>
    );
  }

  // Build display order
  let displayOptions: string[];
  if (scaffold_level === 0) {
    // Random order, correct can be anywhere
    displayOptions = shuffleArray(rawOptions, seedRef.current);
  } else {
    // Pre-sorted: incorrect first, correct last
    const without = rawOptions.filter((o) => o !== correctAnswer);
    displayOptions = [...without, correctAnswer];
  }

  const showRule = scaffold_level >= 2 && !!kc_data.rule;
  const showStar = scaffold_level >= 3;

  const handleSelect = (opt: string) => {
    if (feedback) return;
    setSelected(opt);
    on_submit(opt);
  };

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Which sounds most natural?</p>
        <p className="text-gray-400 text-sm">
          {kc_data.prompt ?? "Pick the most grammatically correct French sentence"}
        </p>
      </div>

      {/* Rule hint (scaffold 2+) */}
      {showRule && (
        <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
          <span className="text-amber-500 font-semibold text-xs uppercase tracking-wider">Rule — </span>
          {kc_data.rule}
        </div>
      )}

      {/* Option list */}
      <div className="grid grid-cols-1 gap-3">
        {displayOptions.map((opt, i) => {
          const label = LABELS[i] ?? String(i + 1);
          const isSelected = selected === opt;
          const isCorrect = feedback && opt === correctAnswer;
          const isWrong = feedback && isSelected && !feedback.is_correct;
          const isMostNatural = showStar && opt === correctAnswer;

          return (
            <button
              key={i}
              onClick={() => handleSelect(opt)}
              disabled={!!feedback}
              className={`w-full py-4 px-5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                isCorrect
                  ? "border-green-500 bg-green-900/40 text-green-300"
                  : isWrong
                  ? "border-red-500 bg-red-900/40 text-red-300"
                  : isSelected
                  ? "border-blue-500 bg-blue-900/30 text-white"
                  : "border-gray-700 bg-gray-800 hover:border-blue-500 text-white"
              }`}
            >
              <span
                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isCorrect
                    ? "bg-green-700/50 text-green-300"
                    : isWrong
                    ? "bg-red-700/50 text-red-300"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                {label}
              </span>
              <span className="flex-1 text-base leading-relaxed">{opt}</span>
              {isMostNatural && !feedback && (
                <span className="shrink-0 text-amber-400 text-xs mt-1">★ Most natural</span>
              )}
              {isCorrect && (
                <span className="shrink-0 text-green-400 text-xs mt-1">✓ Most natural</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`text-center py-3 rounded-xl text-sm font-medium ${
            feedback.is_correct
              ? "bg-green-900/40 text-green-400 border border-green-500/30"
              : "bg-red-900/40 text-red-400 border border-red-500/30"
          }`}
        >
          {feedback.is_correct
            ? "Correct!"
            : feedback.message ?? `The most natural is: "${correctAnswer}"`}
        </div>
      )}

      {/* Explanation (after feedback) */}
      {feedback && kc_data.explanation && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm text-gray-300 border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Why</p>
          <p>{kc_data.explanation}</p>
        </div>
      )}
    </div>
  );
}
