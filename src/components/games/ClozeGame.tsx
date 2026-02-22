/**
 * Cloze game — fill in the blank.
 *
 * Scaffold levels:
 *   0 = typed answer (hardest)
 *   1 = partial word hint shown
 *   2 = MC options
 */

import { useState, useRef, useEffect } from "react";

interface KCData {
  cloze_sentence: string; // French sentence with {{blank}} placeholder
  blank_answer: string; // correct fill-in
  mc_options?: string[];
  translation?: string;
}

interface Props {
  kc_data: KCData;
  scaffold_level: number;
  on_submit: (answer: string) => void;
  on_hint: () => void;
  hints_used: number;
  feedback?: { is_correct: boolean; message?: string } | null;
}

function renderSentence(sentence: string, blank: string, revealed: boolean) {
  const parts = sentence.split("{{blank}}");
  return (
    <span>
      {parts[0]}
      <span
        className={`inline-block min-w-[80px] border-b-2 text-center font-mono font-bold px-1 mx-1 ${
          revealed ? "text-green-400 border-green-500" : "border-blue-500 text-blue-400"
        }`}
      >
        {revealed ? blank : "?"}
      </span>
      {parts[1]}
    </span>
  );
}

export default function ClozeGame({
  kc_data,
  scaffold_level,
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
  }, [kc_data.cloze_sentence]);

  const isMC = scaffold_level >= 2;
  const wordHint =
    scaffold_level >= 1 && hints_used > 0
      ? kc_data.blank_answer.slice(0, Math.ceil(kc_data.blank_answer.length / 2)) + "…"
      : null;

  const handleSubmit = () => {
    if (typed.trim()) on_submit(typed.trim());
  };

  return (
    <div className="w-full space-y-8">
      {/* Sentence with blank */}
      <div className="text-center space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Complete the sentence</p>
        <p className="text-2xl text-white leading-relaxed">
          {renderSentence(
            kc_data.cloze_sentence,
            kc_data.blank_answer,
            !!(feedback?.is_correct)
          )}
        </p>
        {kc_data.translation && (
          <p className="text-sm text-gray-500 italic">{kc_data.translation}</p>
        )}
      </div>

      {/* Word hint */}
      {wordHint && (
        <p className="text-center text-sm text-amber-400">
          Hint: <span className="font-mono font-bold">{wordHint}</span>
        </p>
      )}

      {/* Answer area */}
      {isMC ? (
        <div className="grid grid-cols-2 gap-3">
          {(kc_data.mc_options ?? []).map((opt) => (
            <button
              key={opt}
              onClick={() => on_submit(opt)}
              className="py-4 px-4 rounded-xl border border-gray-700 bg-gray-800 hover:border-blue-500 text-center text-lg font-mono transition-all"
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
            placeholder="Fill in the blank…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-xl text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
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
            ? `Correct! "${kc_data.blank_answer}"`
            : feedback.message ?? `The answer is "${kc_data.blank_answer}"`}
        </div>
      )}
    </div>
  );
}
