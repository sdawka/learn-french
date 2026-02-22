/**
 * Transform game — transform a sentence according to a grammar rule.
 *
 * Scaffold levels:
 *   0 = free typing (hardest — independent)
 *   1 = guided typing with rule/pattern hint
 *   2 = worked example shown + MC options
 *   3 = MC options + worked example + rule explanation
 */

import { useState, useRef, useEffect } from "react";

interface KCData {
  prompt?: string;
  rule?: string;
  mc_options?: string[];
  correct_answer?: string;
  explanation?: string;
  source_sentence?: string;
  instruction?: string;
  target_sentence?: string;
  acceptable_answers?: string[];
  examples?: Array<{ fr: string; en: string; breakdown?: string[] }>;
}

interface Props {
  kc_data: KCData;
  scaffold_level: number;
  on_submit: (answer: string) => void;
  on_hint: () => void;
  hints_used: number;
  feedback?: { is_correct: boolean; message?: string } | null;
}

export default function TransformGame({
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

  const correctAnswer = kc_data.correct_answer ?? kc_data.target_sentence ?? "";
  const isMC = scaffold_level >= 2 && Array.isArray(kc_data.mc_options) && kc_data.mc_options.length > 0;
  const showWorkedExample = scaffold_level >= 2 && !!kc_data.examples?.[0];
  const showRule = scaffold_level >= 1 && !!kc_data.rule;

  // Reset when question changes
  useEffect(() => {
    setTyped("");
    setSelected(null);
    if (!isMC) inputRef.current?.focus();
  }, [correctAnswer]);

  if (!kc_data.source_sentence && !kc_data.prompt && !kc_data.mc_options?.length) {
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

  const instruction = kc_data.instruction ?? kc_data.prompt ?? "Transform the sentence";

  const handleTypedSubmit = () => {
    if (typed.trim()) on_submit(typed.trim());
  };

  const handleSelect = (opt: string) => {
    if (feedback) return;
    setSelected(opt);
    on_submit(opt);
  };

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Transform the sentence</p>
        <p className="text-lg font-semibold text-white">{instruction}</p>
      </div>

      {/* Source sentence */}
      {kc_data.source_sentence && (
        <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-gray-500 text-xs mb-1">Original</p>
          <p className="text-xl text-white font-serif">{kc_data.source_sentence}</p>
        </div>
      )}

      {/* Rule hint (scaffold 1+) */}
      {showRule && (
        <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
          <span className="text-amber-500 font-semibold text-xs uppercase tracking-wider">Pattern — </span>
          {kc_data.rule}
        </div>
      )}

      {/* Worked example (scaffold 2+) */}
      {showWorkedExample && (
        <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-4 text-sm">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">Worked example</p>
          <p className="text-white font-serif text-base">{kc_data.examples![0].fr}</p>
          <p className="text-gray-400 text-xs mt-1">{kc_data.examples![0].en}</p>
          {kc_data.examples![0].breakdown && (
            <ul className="mt-2 space-y-0.5">
              {kc_data.examples![0].breakdown!.map((b, i) => (
                <li key={i} className="text-blue-300 text-xs">• {b}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Answer area */}
      {isMC ? (
        <div className="grid grid-cols-1 gap-3">
          {kc_data.mc_options!.map((opt, i) => {
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
      ) : (
        <div className="space-y-3">
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTypedSubmit()}
            disabled={!!feedback}
            placeholder={scaffold_level >= 1 ? "Type your transformation…" : "Type the transformed sentence…"}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
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
              onClick={handleTypedSubmit}
              disabled={!typed.trim() || !!feedback}
              className="flex-1 py-3 rounded-xl bg-blue-600 disabled:opacity-40 hover:bg-blue-700 font-semibold text-white transition-colors"
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
