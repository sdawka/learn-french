/**
 * Odd-one-out game — identify the word that doesn't belong to the group.
 *
 * Scaffold levels:
 *   0 = words only, no hints (hardest)
 *   1 = category label shown
 *   2 = category + reason/hint shown dimmed
 *   3 = category + reason + correct answer pre-highlighted (just confirm)
 */

import { useState, useEffect } from "react";

interface KCData {
  word: string;
  words?: string[];
  odd_one_out?: string;
  category?: string;
  reason?: string;
  translations?: string[];
}

interface Props {
  kc_data: KCData;
  scaffold_level: number;
  on_submit: (answer: string) => void;
  on_hint: () => void;
  hints_used: number;
  feedback?: { is_correct: boolean; message?: string } | null;
}

export default function OddOneOutGame({
  kc_data,
  scaffold_level,
  on_submit,
  on_hint,
  hints_used,
  feedback,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [kc_data.word]);

  // Graceful fallback when words list is absent
  if (!kc_data.words || kc_data.words.length === 0) {
    return (
      <div className="w-full space-y-8 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Which doesn't belong?</p>
        <p className="text-gray-400">This exercise isn't available yet.</p>
        <button
          onClick={() => on_submit("stub")}
          className="px-6 py-3 rounded-xl border border-gray-700 bg-gray-800 text-gray-300 hover:border-blue-500 transition-all"
        >
          Skip
        </button>
      </div>
    );
  }

  const words = kc_data.words;
  const oddWord = kc_data.odd_one_out ?? "";
  const showCategory = scaffold_level >= 1 && kc_data.category;
  const showReason = scaffold_level >= 2 && kc_data.reason;
  const preHighlight = scaffold_level >= 3 && oddWord;

  const handleSelect = (word: string) => {
    if (feedback) return;
    setSelected(word);
    on_submit(word);
  };

  const cols = words.length <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Which doesn't belong?</p>

        {showCategory && (
          <span className="inline-block px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400 uppercase tracking-wider">
            Topic: {kc_data.category}
          </span>
        )}
      </div>

      {/* Reason hint (scaffold >= 2) */}
      {showReason && (
        <p className="text-center text-sm text-amber-400 italic">{kc_data.reason}</p>
      )}

      {/* Word buttons */}
      <div className={`grid ${cols} gap-3`}>
        {words.map((word) => {
          const isSelected = selected === word;
          const isOdd = word === oddWord;
          const isCorrect = feedback && isOdd;
          const isWrong = feedback && isSelected && !feedback.is_correct;
          const isPrehighlighted = preHighlight && isOdd && !feedback;

          return (
            <button
              key={word}
              onClick={() => handleSelect(word)}
              className={`py-4 px-4 rounded-xl border text-center text-lg transition-all ${
                isCorrect
                  ? "border-green-500 bg-green-900/40 text-green-300"
                  : isWrong
                  ? "border-red-500 bg-red-900/40 text-red-300"
                  : isPrehighlighted
                  ? "border-amber-500/60 bg-amber-900/20 text-amber-300"
                  : "border-gray-700 bg-gray-800 hover:border-blue-500 text-white"
              }`}
            >
              {word}
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
            : feedback.message ?? (oddWord ? `The odd one out is "${oddWord}"` : "Not quite")}
        </div>
      )}

      {/* Reason revealed after feedback */}
      {feedback && kc_data.reason && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Why</p>
          <p className="text-gray-300">{kc_data.reason}</p>
        </div>
      )}
    </div>
  );
}
