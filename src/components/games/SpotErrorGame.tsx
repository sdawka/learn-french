/**
 * SpotError game — identify and correct a grammatical error.
 *
 * Scaffold levels:
 *   0 = MC (all options), no hints
 *   1 = MC (all options) + error region highlighted in amber
 *   2 = MC (all options) + highlight + rule shown
 *   3 = MC (3 options) + highlight + rule
 */

import { useState, useEffect } from "react";

interface KCData {
  prompt?: string;
  rule?: string;
  mc_options?: string[];
  correct_answer?: string;
  explanation?: string;
  examples?: Array<{ fr: string; en: string; breakdown?: string[] }>;
  sentence?: string;
  error_word?: string;
  correction?: string;
}

interface Props {
  kc_data: KCData;
  scaffold_level: number;
  on_submit: (answer: string) => void;
  on_hint: () => void;
  hints_used: number;
  feedback?: { is_correct: boolean; message?: string } | null;
}

function HighlightedSentence({ sentence, errorWord }: { sentence: string; errorWord: string }) {
  if (!errorWord) return <span className="text-white">{sentence}</span>;
  const idx = sentence.indexOf(errorWord);
  if (idx === -1) return <span className="text-white">{sentence}</span>;
  return (
    <>
      <span className="text-white">{sentence.slice(0, idx)}</span>
      <span className="text-amber-400 font-semibold underline decoration-amber-400/60 underline-offset-4">
        {errorWord}
      </span>
      <span className="text-white">{sentence.slice(idx + errorWord.length)}</span>
    </>
  );
}

export default function SpotErrorGame({
  kc_data,
  scaffold_level,
  on_submit,
  feedback,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const correctAnswer = kc_data.correct_answer ?? "";
  const hasMC = Array.isArray(kc_data.mc_options) && kc_data.mc_options.length > 0;

  // Reset when question changes
  useEffect(() => {
    setSelected(null);
  }, [correctAnswer]);

  if (!hasMC && !kc_data.sentence && !kc_data.prompt) {
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

  const allOptions = kc_data.mc_options ?? [];

  // Build visible options: scaffold 3 → 3 options (always include correct), else all
  let visibleOptions = [...allOptions];
  if (scaffold_level >= 3 && visibleOptions.length > 3) {
    const without = visibleOptions.filter((o) => o !== correctAnswer);
    visibleOptions = [without[0], without[1], correctAnswer].filter(Boolean);
  }
  // Shuffle (stable across re-renders by not re-sorting on every render — use state init)
  // We keep insertion order from kc_data to avoid randomisation surprises
  const showHighlight =
    scaffold_level >= 1 && !!kc_data.sentence && !!kc_data.error_word;
  const showRule = scaffold_level >= 2 && !!kc_data.rule;

  const handleSelect = (opt: string) => {
    if (feedback) return;
    setSelected(opt);
    on_submit(opt);
  };

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Spot the error</p>
        <p className="text-xl text-white leading-relaxed">
          {kc_data.prompt ?? "Which sentence is grammatically correct?"}
        </p>
      </div>

      {/* Sentence with optional highlight */}
      {kc_data.sentence && (
        <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 text-center text-xl leading-relaxed font-serif">
          {showHighlight ? (
            <HighlightedSentence sentence={kc_data.sentence} errorWord={kc_data.error_word!} />
          ) : (
            <span className="text-white">{kc_data.sentence}</span>
          )}
          {showHighlight && (
            <p className="text-amber-400 text-xs mt-2 font-sans">
              The underlined word contains the error
            </p>
          )}
        </div>
      )}

      {/* Rule (scaffold 2+) */}
      {showRule && (
        <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
          <span className="text-amber-500 font-semibold text-xs uppercase tracking-wider">Rule — </span>
          {kc_data.rule}
        </div>
      )}

      {/* MC options */}
      {hasMC && (
        <div className="grid grid-cols-1 gap-3">
          {visibleOptions.map((opt, i) => {
            const isSelected = selected === opt;
            const isCorrect = feedback && opt === correctAnswer;
            const isWrong = feedback && isSelected && !feedback.is_correct;
            return (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                disabled={!!feedback}
                className={`w-full py-4 px-5 rounded-xl border text-left text-base transition-all ${
                  isCorrect
                    ? "border-green-500 bg-green-900/40 text-green-300"
                    : isWrong
                    ? "border-red-500 bg-red-900/40 text-red-300"
                    : isSelected
                    ? "border-blue-500 bg-blue-900/30 text-white"
                    : "border-gray-700 bg-gray-800 hover:border-blue-500 text-white"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

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
            : feedback.message ?? `Correct answer: "${correctAnswer}"`}
        </div>
      )}

      {/* Explanation (after feedback) */}
      {feedback && kc_data.explanation && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm text-gray-300 border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Explanation</p>
          <p>{kc_data.explanation}</p>
        </div>
      )}
    </div>
  );
}
