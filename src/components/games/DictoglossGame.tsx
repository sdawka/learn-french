/**
 * Dictogloss game — reconstruct a French sentence from memory.
 *
 * Scaffold levels:
 *   0 = flash sentence for 3s then hide — type from memory (hardest)
 *   1 = sentence + translation visible, type
 *   2 = sentence + translation + first-3-words hint, type
 *   3 = sentence fully visible, type it out
 */

import { useState, useRef, useEffect, useCallback } from "react";

interface KCData {
  rule?: string;
  correct_answer?: string;
  prompt?: string;
  explanation?: string;
  sentence?: string;
  translation?: string;
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

function resolveSentence(kc_data: KCData): string {
  if (kc_data.sentence) return kc_data.sentence;
  if (kc_data.correct_answer) return kc_data.correct_answer;
  if (kc_data.rule) {
    // Extract first sentence-like substring
    const match = kc_data.rule.match(/[^.!?]+[.!?]?/);
    return match ? match[0].trim() : kc_data.rule;
  }
  return "";
}

const FLASH_DURATION = 3000;

export default function DictoglossGame({
  kc_data,
  scaffold_level,
  on_submit,
  on_hint,
  hints_used,
  feedback,
}: Props) {
  const sentence = resolveSentence(kc_data);
  const correctAnswer = kc_data.correct_answer ?? sentence;

  const [typed, setTyped] = useState("");
  const [visible, setVisible] = useState(scaffold_level !== 0);
  const [countdown, setCountdown] = useState(scaffold_level === 0 ? 3 : 0);
  const [flashDone, setFlashDone] = useState(scaffold_level !== 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startFlash = useCallback(() => {
    setVisible(true);
    setCountdown(3);
    setFlashDone(false);

    let remaining = 3;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setVisible(false);
        setFlashDone(true);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    }, 1000);
  }, []);

  // Reset when question changes
  useEffect(() => {
    setTyped("");
    if (timerRef.current) clearInterval(timerRef.current);

    if (scaffold_level === 0) {
      setVisible(false);
      setFlashDone(false);
      setCountdown(3);
      // Auto-start flash on mount
      startFlash();
    } else {
      setVisible(true);
      setFlashDone(true);
      setCountdown(0);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [correctAnswer, scaffold_level]);

  if (!sentence) {
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

  const firstThreeWords = sentence.split(" ").slice(0, 3).join(" ");
  const showTranslation = scaffold_level >= 1 && !!kc_data.translation;
  const showFirstHint = scaffold_level >= 2;
  const alwaysShowSentence = scaffold_level >= 3;

  const handleSubmit = () => {
    if (typed.trim()) on_submit(typed.trim());
  };

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Reconstruct the sentence</p>
        <p className="text-gray-400 text-sm">
          {scaffold_level === 0
            ? "Memorise the sentence, then type it from memory"
            : scaffold_level === 3
            ? "Type out the sentence exactly"
            : "Use the sentence to reconstruct it word for word"}
        </p>
      </div>

      {/* Flash card (scaffold 0) */}
      {scaffold_level === 0 && (
        <div className="relative bg-gray-800/60 rounded-xl border border-gray-700 p-6 text-center min-h-[100px] flex flex-col items-center justify-center">
          {visible ? (
            <>
              <p className="text-2xl text-white font-serif leading-relaxed">{sentence}</p>
              <p className="mt-3 text-amber-400 text-sm font-mono animate-pulse">
                {countdown > 0 ? `${countdown}…` : ""}
              </p>
            </>
          ) : flashDone ? (
            <div className="space-y-2">
              <p className="text-gray-500 text-sm">Sentence hidden — type it below</p>
              <button
                onClick={startFlash}
                className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                Show again
              </button>
            </div>
          ) : (
            <p className="text-gray-600 text-sm">Get ready…</p>
          )}
        </div>
      )}

      {/* Sentence visible (scaffold 1-3) */}
      {scaffold_level >= 1 && (
        <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5 text-center space-y-2">
          <p className="text-2xl text-white font-serif leading-relaxed">{sentence}</p>
          {showTranslation && (
            <p className="text-gray-400 text-sm italic">{kc_data.translation}</p>
          )}
        </div>
      )}

      {/* First-3-words hint (scaffold 2) */}
      {showFirstHint && !alwaysShowSentence && (
        <div className="text-center text-sm text-amber-400">
          Starts with:{" "}
          <span className="font-mono font-semibold">{firstThreeWords}…</span>
        </div>
      )}

      {/* Text area */}
      {(flashDone || scaffold_level > 0) && (
        <div className="space-y-3">
          <textarea
            ref={textareaRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={!!feedback}
            rows={3}
            placeholder="Type the sentence…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none disabled:opacity-50"
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
            : feedback.message ?? `Expected: "${sentence}"`}
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
