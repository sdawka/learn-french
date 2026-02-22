/**
 * GameShell — wraps all game types.
 * Manages: progress bar, scaffold indicator, hint button, timer, teaching card overlay.
 */

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

interface Props {
  total_items: number;
  current_index: number;
  scaffold_level: number;
  session_id: number;
  plan_id: number;
  game_type: string;
  kc_id: number;
  kc_data: Record<string, unknown>;
  on_answer: (answer: string, hints_used: number) => Promise<void>;
  children: (props: {
    on_submit: (answer: string) => void;
    on_hint: () => void;
    hints_used: number;
    elapsed_ms: number;
  }) => ReactNode;
}

const SCAFFOLD_LABELS = ["Hard", "Medium", "Easy", "Guided"];
const SCAFFOLD_COLORS = ["text-red-500", "text-orange-400", "text-yellow-400", "text-green-400"];

export default function GameShell({
  total_items,
  current_index,
  scaffold_level,
  on_answer,
  children,
}: Props) {
  const [hints_used, setHintsUsed] = useState(0);
  const [start_time] = useState(Date.now());
  const [elapsed_ms, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - start_time), 1000);
    return () => clearInterval(id);
  }, [start_time]);

  const handleHint = useCallback(() => {
    setHintsUsed((h) => h + 1);
  }, []);

  const handleSubmit = useCallback(
    async (answer: string) => {
      if (submitting) return;
      setSubmitting(true);
      await on_answer(answer, hints_used);
      setSubmitting(false);
      setHintsUsed(0);
    },
    [on_answer, hints_used, submitting]
  );

  const progress = (current_index / total_items) * 100;
  const elapsed_sec = Math.floor(elapsed_ms / 1000);
  const elapsed_display =
    elapsed_sec < 60
      ? `${elapsed_sec}s`
      : `${Math.floor(elapsed_sec / 60)}m ${elapsed_sec % 60}s`;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {current_index + 1} / {total_items}
          </span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
              SCAFFOLD_COLORS[scaffold_level] ?? "text-gray-400"
            } border-current`}
          >
            {SCAFFOLD_LABELS[scaffold_level] ?? "Guided"}
          </span>
        </div>
        <span className="text-sm text-gray-500 font-mono">{elapsed_display}</span>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div
          className="h-full bg-french-blue transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Game content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto w-full">
        {children({
          on_submit: handleSubmit,
          on_hint: handleHint,
          hints_used,
          elapsed_ms,
        })}
      </main>
    </div>
  );
}
