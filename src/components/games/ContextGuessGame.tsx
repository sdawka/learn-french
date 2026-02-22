/**
 * Context guess game — guess the missing French word from a passage.
 *
 * Scaffold levels:
 *   0 = long passage, typed input (hardest)
 *   1 = long passage + 4-way MC
 *   2 = short passage + 2-way MC
 *   3 = short passage + 2-way MC + definition hint
 */

import { useState, useRef, useEffect } from "react";

interface KCData {
  word: string;
  translations?: string[];
  definition?: string;
  passage_long?: string;
  passage_short?: string;
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

function maskWord(passage: string, word: string): string {
  // Replace the target word (case-insensitive, whole word) with a blank
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return passage.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[_____]");
}

export default function ContextGuessGame({
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
    if (scaffold_level === 0) {
      inputRef.current?.focus();
    }
  }, [kc_data.word]);

  const isMC = scaffold_level >= 1;
  const optionCount = scaffold_level === 1 ? 4 : 2;
  const useShortPassage = scaffold_level >= 2;
  const showDefinition = scaffold_level >= 3 && kc_data.definition;

  // Determine the passage to display
  const rawPassage = useShortPassage
    ? (kc_data.passage_short ?? kc_data.passage_long)
    : kc_data.passage_long;

  // Fallback: use first example sentence if no passage
  const fallbackPassage = kc_data.examples?.[0]?.fr ?? null;
  const passage = rawPassage ?? fallbackPassage;

  const displayPassage = passage ? maskWord(passage, kc_data.word) : null;

  // Build MC options ensuring correct answer is present
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

  // No passage available at all
  if (!passage && !kc_data.word) {
    return (
      <div className="w-full space-y-8 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Guess the word from context</p>
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

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Guess the word from context</p>
        {!passage && (
          <p className="text-sm text-gray-400">What French word fits best in this context?</p>
        )}
      </div>

      {/* Passage block */}
      {displayPassage ? (
        <div className="bg-gray-800/60 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-300 italic leading-relaxed text-lg">{displayPassage}</p>
        </div>
      ) : (
        <div className="bg-gray-800/60 rounded-xl p-5 border border-gray-700 text-center">
          <p className="text-gray-400 text-sm">
            Provide the French word for:{" "}
            <span className="text-white font-medium">{kc_data.translations?.[0] ?? kc_data.word}</span>
          </p>
        </div>
      )}

      {/* Definition hint (scaffold >= 3) */}
      {showDefinition && (
        <p className="text-center text-sm text-amber-400 italic">{kc_data.definition}</p>
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
            placeholder="Type the missing French word…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
          />

          <div className="flex gap-3">
            {hints_used === 0 && !feedback && (
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

      {/* Full passage revealed after feedback (with word filled in) */}
      {feedback && passage && displayPassage !== passage && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Full sentence</p>
          <p className="text-gray-300 italic">{passage}</p>
        </div>
      )}
    </div>
  );
}
