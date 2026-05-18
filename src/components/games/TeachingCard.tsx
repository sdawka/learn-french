/**
 * TeachingCard — shown when max scaffold level is hit.
 * Displays a worked example with rule annotation, then lets learner continue.
 */

import { useEffect, useRef } from "react";

interface WorkedExample {
  prompt: string;
  steps: string[];
  answer: string;
  annotation: string;
}

interface Props {
  misconception_name: string | null;
  rule_explanation: string;
  worked_example: WorkedExample;
  on_continue: () => void;
}

export default function TeachingCard({
  misconception_name,
  rule_explanation,
  worked_example,
  on_continue,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the continue button when modal opens
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  // Handle Escape key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        on_continue();
      }
      // Focus trap: if Tab pressed, keep focus within modal
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [on_continue]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teaching-title"
    >
      <div
        ref={dialogRef}
        className="bg-gray-900 border border-amber-500/30 rounded-2xl max-w-lg w-full p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-lg" aria-hidden="true">!</span>
          <h2 id="teaching-title" className="text-amber-400 font-semibold">Let's learn this together</h2>
        </div>

        {misconception_name && (
          <p className="text-xs text-gray-500 italic">Pattern: {misconception_name}</p>
        )}

        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-300">{worked_example.prompt}</p>

          {worked_example.steps.length > 0 && (
            <ol className="space-y-1.5">
              {worked_example.steps.map((step, i) => (
                <li key={i} className="text-sm text-gray-400 flex gap-2">
                  <span className="text-amber-400 shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}

          {worked_example.answer && (
            <div className="border-t border-gray-700 pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Answer</p>
              <p className="text-white font-mono text-lg">{worked_example.answer}</p>
            </div>
          )}
        </div>

        {rule_explanation && (
          <div className="bg-blue-950/50 border border-blue-500/20 rounded-lg p-3">
            <p className="text-xs text-blue-300">{rule_explanation}</p>
          </div>
        )}

        <button
          ref={buttonRef}
          onClick={on_continue}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-xl transition-colors"
        >
          Got it — try again
        </button>
      </div>
    </div>
  );
}
