/**
 * Idiomatic game — pick the correct French idiom/expression for a given English meaning.
 *
 * Scaffold levels:
 *   0 = 4-way MC (hardest)
 *   1 = 2-way MC
 *   2 = 2-way MC + first example sentence shown
 *   3 = 2-way MC + full definition shown
 */

import { useState, useEffect } from "react";

interface KCData {
  word: string;
  translations: string[];
  definition?: string;
  mc_options?: string[];
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

export default function IdiomaticGame({
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

  const optionCount = scaffold_level === 0 ? 4 : 2;

  // Build MC options list, always ensuring correct answer (kc_data.word) is present
  const buildOptions = (): string[] => {
    const correct = kc_data.word;
    let opts: string[] = kc_data.mc_options ? [...kc_data.mc_options] : [];

    // Trim to desired count
    opts = opts.slice(0, optionCount);

    // Ensure correct answer is present
    if (!opts.includes(correct)) {
      if (opts.length < optionCount) {
        opts.push(correct);
      } else {
        opts[opts.length - 1] = correct;
      }
    }

    // Shuffle
    return [...opts].sort(() => Math.random() - 0.5);
  };

  const [options] = useState<string[]>(() => buildOptions());

  // If no mc_options at all, show a minimal 2-option fallback
  const visibleOptions = kc_data.mc_options
    ? options.slice(0, optionCount)
    : [kc_data.word, kc_data.translations?.[0] ?? "—"].sort(() => Math.random() - 0.5);

  const showExample = scaffold_level >= 2 && kc_data.examples?.[0];
  const showDefinition = scaffold_level >= 3 && kc_data.definition;

  const handleSelect = (opt: string) => {
    if (feedback) return;
    setSelected(opt);
    on_submit(opt);
  };

  const meaning = kc_data.translations?.[0] ?? kc_data.definition ?? "";

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Choose the correct usage</p>
        <h1 className="text-3xl font-bold text-white leading-snug">{meaning}</h1>
        {showDefinition && (
          <p className="text-sm text-gray-400 italic max-w-sm mx-auto">{kc_data.definition}</p>
        )}
      </div>

      {/* Example sentence (scaffold >= 2) */}
      {showExample && (
        <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
          <p className="text-xs text-gray-500 mb-1">Example</p>
          <p className="text-gray-300 italic text-sm">{kc_data.examples![0].fr}</p>
          <p className="text-gray-500 text-xs mt-1">{kc_data.examples![0].en}</p>
        </div>
      )}

      {/* MC options */}
      <div className={`grid gap-3 ${optionCount === 4 ? "grid-cols-2" : "grid-cols-1"}`}>
        {visibleOptions.map((opt) => {
          const isSelected = selected === opt;
          const isCorrect = feedback && opt === kc_data.word;
          const isWrong = feedback && isSelected && !feedback.is_correct;

          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className={`py-4 px-4 rounded-xl border text-center text-lg transition-all ${
                isCorrect
                  ? "border-green-500 bg-green-900/40 text-green-300"
                  : isWrong
                  ? "border-red-500 bg-red-900/40 text-red-300"
                  : "border-gray-700 bg-gray-800 hover:border-blue-500 text-white"
              }`}
            >
              {opt}
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
            : feedback.message ?? `The answer is "${kc_data.word}"`}
        </div>
      )}

      {/* Example revealed after correct */}
      {feedback?.is_correct && kc_data.examples?.[0] && scaffold_level < 2 && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Example</p>
          <p className="text-white">{kc_data.examples[0].fr}</p>
          <p className="text-gray-400 text-xs mt-1">{kc_data.examples[0].en}</p>
        </div>
      )}
    </div>
  );
}
