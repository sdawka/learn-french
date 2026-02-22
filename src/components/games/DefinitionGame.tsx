/**
 * Definition game — recall the French word for an English definition.
 *
 * Scaffold levels:
 *   0 = free typing (hardest)
 *   1 = first-letter hint + typed input
 *   2 = 4-way MC
 *   3 = 2-way MC (easiest)
 */

import { useState, useRef, useEffect } from "react";

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

export default function DefinitionGame({
  kc_data,
  scaffold_level,
  on_submit,
  on_hint,
  hints_used,
  feedback,
}: Props) {
  const [typed, setTyped] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTyped("");
    setSelected(null);
    if (scaffold_level < 2) {
      inputRef.current?.focus();
    }
  }, [kc_data.word]);

  const isMC = scaffold_level >= 2;
  const optionCount = scaffold_level === 2 ? 4 : 2;

  // Build MC options ensuring correct answer is included
  const buildOptions = (): string[] => {
    const correct = kc_data.word;
    let opts: string[] = kc_data.mc_options ? [...kc_data.mc_options] : [];
    opts = opts.slice(0, optionCount);
    if (!opts.includes(correct)) {
      if (opts.length < optionCount) {
        opts.push(correct);
      } else {
        opts[opts.length - 1] = correct;
      }
    }
    return [...opts].sort(() => Math.random() - 0.5);
  };

  const [options] = useState<string[]>(() => buildOptions());

  const handleSubmit = () => {
    if (typed.trim()) on_submit(typed.trim());
  };

  const handleSelect = (opt: string) => {
    if (feedback) return;
    setSelected(opt);
    on_submit(opt);
  };

  const prompt = kc_data.definition ?? kc_data.translations?.[0] ?? kc_data.word;
  const firstLetter = kc_data.word[0] ?? "";
  const letterHint =
    scaffold_level >= 1 && hints_used > 0
      ? firstLetter + "_".repeat(Math.max(0, kc_data.word.length - 1))
      : null;

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-widest">What's the French word?</p>
        <p className="text-2xl text-white leading-relaxed max-w-md mx-auto">{prompt}</p>
        {kc_data.definition && kc_data.translations?.[0] && (
          <p className="text-sm text-gray-400 italic">{kc_data.translations[0]}</p>
        )}
      </div>

      {/* First-letter hint (scaffold 1) */}
      {letterHint && (
        <p className="text-center text-sm text-amber-400">
          Hint: <span className="font-mono font-bold tracking-widest">{letterHint}</span>
        </p>
      )}

      {/* Answer area */}
      {isMC ? (
        <div className={`grid gap-3 ${optionCount === 4 ? "grid-cols-2" : "grid-cols-1"}`}>
          {options.map((opt) => {
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
      ) : (
        <div className="space-y-3">
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !feedback && handleSubmit()}
            disabled={!!feedback}
            placeholder="Type the French word…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
          />

          <div className="flex gap-3">
            {scaffold_level >= 1 && hints_used === 0 && !feedback && (
              <button
                onClick={on_hint}
                className="flex-1 py-3 rounded-xl border border-amber-500/40 text-amber-400 text-sm hover:bg-amber-500/10 transition-colors"
              >
                Hint
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!typed.trim() || !!feedback}
              className="flex-1 py-3 rounded-xl bg-french-blue disabled:opacity-40 hover:bg-blue-700 font-semibold transition-colors"
            >
              Check
            </button>
          </div>
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
            ? `Correct! "${kc_data.word}"`
            : feedback.message ?? `The answer is "${kc_data.word}"`}
        </div>
      )}

      {/* Example after feedback */}
      {feedback && kc_data.examples?.[0] && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Example</p>
          <p className="text-white">{kc_data.examples[0].fr}</p>
          <p className="text-gray-400 text-xs mt-1">{kc_data.examples[0].en}</p>
        </div>
      )}
    </div>
  );
}
