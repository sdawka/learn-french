/**
 * Translate game — vocabulary fact recall.
 *
 * Scaffold levels:
 *   0 = free typing (hardest)
 *   1 = first-letter hint
 *   2 = MC 2-way
 *   3 = MC 4-way (easiest)
 */

import { useState, useRef, useEffect } from "react";

interface KCData {
  word: string;
  translations: string[];
  definition?: string;
  examples?: Array<{ fr: string; en: string }>;
}

interface Props {
  kc_data: KCData;
  scaffold_level: number;
  mc_options?: string[]; // provided when scaffold >= 2
  on_submit: (answer: string) => void;
  on_hint: () => void;
  hints_used: number;
  feedback?: { is_correct: boolean; message?: string } | null;
}

export default function TranslateGame({
  kc_data,
  scaffold_level,
  mc_options = [],
  on_submit,
  on_hint,
  hints_used,
  feedback,
}: Props) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    setTyped("");
  }, [kc_data.word]);

  const isMC = scaffold_level >= 2;
  const showHint = scaffold_level >= 1 && !isMC;
  // Hint shows first letter of the French answer (word), not the English prompt
  const firstLetter = kc_data.word?.[0] ?? "";
  // Display the English meaning; word is the French answer they need to produce
  const englishPrompt = kc_data.translations[0] ?? kc_data.word;

  const handleSubmit = () => {
    if (typed.trim()) on_submit(typed.trim());
  };

  return (
    <div className="w-full space-y-8">
      {/* Prompt — show ENGLISH, ask for FRENCH */}
      <div className="text-center space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Translate to French</p>
        <h1 className="text-4xl font-bold text-white">{englishPrompt}</h1>
        {kc_data.definition && (
          <p className="text-sm text-gray-400 italic max-w-xs mx-auto">{kc_data.definition}</p>
        )}
      </div>

      {/* Hint (scaffold 1) — first letter of the French word */}
      {showHint && hints_used > 0 && (
        <p className="text-center text-sm text-amber-400">
          Starts with: <span className="font-mono font-bold">{firstLetter}__</span>
        </p>
      )}

      {/* Answer area */}
      {isMC ? (
        <div className="grid grid-cols-1 gap-3">
          {mc_options.slice(0, scaffold_level >= 3 ? 4 : 2).map((opt) => (
            <button
              key={opt}
              onClick={() => on_submit(opt)}
              className="w-full py-4 px-6 rounded-xl border border-gray-700 bg-gray-800 hover:border-blue-500 hover:bg-gray-750 text-left text-lg transition-all"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Type in French…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />

          <div className="flex gap-3">
            {scaffold_level >= 1 && hints_used === 0 && (
              <button
                onClick={on_hint}
                className="flex-1 py-3 rounded-xl border border-amber-500/40 text-amber-400 text-sm hover:bg-amber-500/10 transition-colors"
              >
                Hint
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!typed.trim()}
              className="flex-1 py-3 rounded-xl bg-french-blue disabled:opacity-40 hover:bg-blue-700 font-semibold transition-colors"
            >
              Check
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div
          className={`text-center py-3 rounded-xl text-sm font-medium ${
            feedback.is_correct
              ? "bg-green-900/40 text-green-400 border border-green-500/30"
              : "bg-red-900/40 text-red-400 border border-red-500/30"
          }`}
        >
          {feedback.is_correct
            ? `Correct! "${kc_data.word}"`
            : feedback.message ?? `The answer is "${kc_data.word}"`}
        </div>
      )}

      {/* Example (shown after feedback) */}
      {feedback?.is_correct && kc_data.examples?.[0] && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm text-gray-300 border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Example</p>
          <p className="text-white">{kc_data.examples[0].fr}</p>
          <p className="text-gray-400 text-xs mt-1">{kc_data.examples[0].en}</p>
        </div>
      )}
    </div>
  );
}
