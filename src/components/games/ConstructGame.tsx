/**
 * Construct game — grammar procedure (build the correct form).
 *
 * Scaffold levels:
 *   0 = 6-way MC
 *   1 = 4-way MC
 *   2 = 2-way MC
 */

import { useState } from "react";

interface KCData {
  prompt: string; // e.g. "Choose the correct form of avoir for 'nous'"
  mc_options: string[]; // 6 options max (trimmed to 2/4/6 by scaffold)
  correct_answer: string;
  rule?: string;
  explanation?: string;
}

interface Props {
  kc_data: KCData;
  scaffold_level: number;
  on_submit: (answer: string) => void;
  feedback?: { is_correct: boolean; message?: string } | null;
}

export default function ConstructGame({
  kc_data,
  scaffold_level,
  on_submit,
  feedback,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const option_count = scaffold_level === 0 ? 6 : scaffold_level === 1 ? 4 : 2;
  // Always include the correct answer in the visible options
  const all = kc_data.mc_options ?? [];
  const visible = all.slice(0, option_count);
  if (!visible.includes(kc_data.correct_answer)) {
    visible[visible.length - 1] = kc_data.correct_answer;
  }
  // Shuffle
  const shuffled = [...visible].sort(() => Math.random() - 0.5);

  const handleSelect = (opt: string) => {
    if (feedback) return; // already submitted
    setSelected(opt);
    on_submit(opt);
  };

  return (
    <div className="w-full space-y-8">
      {/* Prompt */}
      <div className="text-center space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Choose the correct form</p>
        <p className="text-2xl text-white leading-relaxed">{kc_data.prompt}</p>
      </div>

      {/* MC options */}
      <div
        className={`grid gap-3 ${option_count <= 2 ? "grid-cols-2" : option_count <= 4 ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {shuffled.map((opt) => {
          const isSelected = selected === opt;
          const isCorrect = feedback && opt === kc_data.correct_answer;
          const isWrong = feedback && isSelected && !feedback.is_correct;

          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className={`py-4 px-4 rounded-xl border text-center text-lg font-mono transition-all ${
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
            ? "Correct!"
            : `The answer is "${kc_data.correct_answer}"`}
        </div>
      )}

      {/* Rule explanation (always shown after answer) */}
      {feedback && kc_data.explanation && (
        <div className="bg-gray-800/60 rounded-xl p-4 text-sm text-gray-300 border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Rule</p>
          <p>{kc_data.explanation}</p>
        </div>
      )}
    </div>
  );
}
