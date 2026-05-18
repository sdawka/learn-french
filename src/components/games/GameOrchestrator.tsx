/**
 * GameOrchestrator — React island that drives the full session lifecycle.
 *
 * Calls /api/session/start, then loops /api/session/submit until done,
 * then calls /api/session/end and shows the post-session summary.
 */

import { useState, useEffect, useCallback } from "react";
import GameShell from "./GameShell.tsx";
import TranslateGame from "./TranslateGame.tsx";
import ClozeGame from "./ClozeGame.tsx";
import ConstructGame from "./ConstructGame.tsx";
import IdiomaticGame from "./IdiomaticGame.tsx";
import DefinitionGame from "./DefinitionGame.tsx";
import OddOneOutGame from "./OddOneOutGame.tsx";
import ContextGuessGame from "./ContextGuessGame.tsx";
import SpotErrorGame from "./SpotErrorGame.tsx";
import TransformGame from "./TransformGame.tsx";
import DictoglossGame from "./DictoglossGame.tsx";
import NaturalnessGame from "./NaturalnessGame.tsx";
import TeachingCard from "./TeachingCard.tsx";

type GameType =
  | "translate" | "cloze" | "construct"
  | "idiomatic" | "definition" | "odd_one_out"
  | "context_guess" | "spot_error" | "transform"
  | "dictogloss" | "naturalness";

interface CurrentItem {
  index: number;
  kc_id: number;
  kc_data: Record<string, unknown>;
  game_type: GameType;
  scaffold_level: number;
  variant: {
    mode: string;
    config: Record<string, unknown>;
  };
}

interface TeachingCardData {
  misconception_name: string | null;
  rule_explanation: string;
  worked_example: {
    prompt: string;
    steps: string[];
    answer: string;
    annotation: string;
  };
}

interface SessionSummary {
  items_reviewed: number;
  accuracy: number;
  minutes_studied: number;
  misconceptions_flagged: string[];
  predicted_vs_actual: { predicted: number; actual: number };
}

interface Props {
  subject: string;
  mood: string;
}

type Phase = "loading" | "playing" | "teaching" | "summary" | "empty" | "error";

export default function GameOrchestrator({ subject, mood }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentItem, setCurrentItem] = useState<CurrentItem | null>(null);
  const [execState, setExecState] = useState<Record<string, unknown>>({
    scaffold_level: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    items_completed: 0,
    current_item_index: 0,
    teaching_card_pending: false,
    last_misconception_id: null,
  });
  const [teaching, setTeaching] = useState<TeachingCardData | null>(null);
  const [feedback, setFeedback] = useState<{ is_correct: boolean; message?: string } | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start session on mount
  useEffect(() => {
    startSession();
  }, []);

  const startSession = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, mood }),
      });
      const data = await res.json();

      if (data.error === "no_items_due") {
        setPhase("empty");
        return;
      }
      if (data.error) throw new Error(data.message ?? data.error);

      setSessionId(data.session_id);
      setPlanId(data.plan_id);
      setTotalItems(data.total_items);
      setCurrentItem(data.current_item);
      setPhase("playing");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  const handleAnswer = useCallback(
    async (answer: string, hints_used: number) => {
      if (!currentItem || !sessionId || !planId) return;

      const kc = currentItem.kc_data as Record<string, unknown>;

      // For translate: show English (translations[0]), expected answer is the French word.
      // For all others: use correct_answer, or fall back through known fields.
      const expected =
        currentItem.game_type === "translate" && !kc.correct_answer
          ? (kc.word as string) ?? ""
          : (kc.correct_answer as string) ??
            (kc.translations as string[])?.[0] ??
            (kc.blank_answer as string) ??
            "";

      // Acceptable alternates: for translate game these would be other French forms,
      // not the English translations array.
      const acceptable_answers =
        currentItem.game_type === "translate" && !kc.correct_answer
          ? []
          : (kc.translations as string[]) ?? (kc.acceptable_answers as string[]) ?? [];

      try {
        const res = await fetch("/api/session/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            plan_id: planId,
            item_index: currentItem.index,
            kc_id: currentItem.kc_id,
            game_type: currentItem.game_type,
            answer,
            expected,
            acceptable_answers,
            hints_used,
            executor_state: execState,
          }),
        });
        const data = await res.json();

        setFeedback({
          is_correct: data.grade.is_correct,
          message: data.grade.feedback,
        });
        setExecState(data.executor_state);

        // Pause for feedback, then advance
        setTimeout(() => {
          setFeedback(null);

          if (data.teaching_card) {
            setTeaching(data.teaching_card);
            setPhase("teaching");
            return;
          }

          if (data.session_done) {
            endSession().catch((e) => {
              setError(String(e));
              setPhase("error");
            });
            return;
          }

          setCurrentItem(data.next_item);
          setPhase("playing");
        }, data.grade.is_correct ? 800 : 1500);
      } catch (e) {
        setError(String(e));
        setPhase("error");
      }
    },
    [currentItem, sessionId, planId, execState]
  );

  const endSession = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      setSummary(data.summary);
      setPhase("summary");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  const dismissTeaching = () => {
    setTeaching(null);
    setPhase("playing");
  };

  // ─── Render phases ───────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading session…</p>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center p-8">
        <div className="max-w-md space-y-6">
          <div className="text-5xl">🎉</div>
          <h1 className="text-2xl font-bold">All caught up!</h1>
          <p className="text-gray-400">
            No {subject === "mixed" ? "" : subject + " "}items due for review right now.
            Come back later or try a different mode.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/" className="px-6 py-3 bg-gray-800 rounded-xl text-sm hover:bg-gray-700 transition-colors">
              Back to dashboard
            </a>
            {mood === "review" && (
              <a
                href={`/games/${subject}?mood=explore`}
                className="px-6 py-3 bg-purple-700 rounded-xl text-sm hover:bg-purple-600 transition-colors"
              >
                Explore new words
              </a>
            )}
            {mood !== "challenge" && (
              <a
                href={`/games/${subject}?mood=challenge`}
                className="px-6 py-3 bg-amber-700 rounded-xl text-sm hover:bg-amber-600 transition-colors"
              >
                Try a challenge
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center p-8">
        <div className="space-y-4">
          <p className="text-red-400">Something went wrong</p>
          <p className="text-gray-500 text-sm font-mono">{error}</p>
          <a href="/" className="inline-block px-6 py-3 bg-gray-800 rounded-xl text-sm">
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  if (phase === "summary" && summary) {
    const predPct = Math.round(summary.predicted_vs_actual.predicted * 100);
    const actualPct = Math.round(summary.accuracy * 100);
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-6">
          <h1 className="text-2xl font-bold text-center">Session complete</h1>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Cards", value: summary.items_reviewed },
              { label: "Accuracy", value: `${actualPct}%` },
              { label: "Minutes", value: Math.round(summary.minutes_studied) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-sm space-y-2">
            <div className="flex justify-between text-gray-400">
              <span>Predicted accuracy</span>
              <span>{predPct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Actual accuracy</span>
              <span className={actualPct >= predPct ? "text-green-400" : "text-amber-400"}>
                {actualPct}%
              </span>
            </div>
          </div>

          {summary.misconceptions_flagged.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs text-amber-400 font-medium mb-2">Patterns to work on:</p>
              {summary.misconceptions_flagged.map((m) => (
                <p key={m} className="text-xs text-gray-300">• {m}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <a href="/" className="flex-1 text-center py-3 bg-gray-800 rounded-xl text-sm hover:bg-gray-700 transition-colors">
              Dashboard
            </a>
            <button
              onClick={startSession}
              className="flex-1 py-3 bg-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors"
            >
              Another session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentItem) return null;

  const kc = currentItem.kc_data as Record<string, unknown>;

  return (
    <>
      <GameShell
        total_items={totalItems}
        current_index={currentItem.index}
        scaffold_level={currentItem.scaffold_level}
        session_id={sessionId!}
        plan_id={planId!}
        game_type={currentItem.game_type}
        kc_id={currentItem.kc_id}
        kc_data={kc}
        on_answer={handleAnswer}
      >
        {({ on_submit, on_hint, hints_used }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const kcAny = kc as any;
          switch (currentItem.game_type) {
            case "translate":
              return (
                <TranslateGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  mc_options={kcAny.mc_options ?? []}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "cloze":
              return (
                <ClozeGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "construct":
              return (
                <ConstructGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  feedback={feedback}
                />
              );
            case "idiomatic":
              return (
                <IdiomaticGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "definition":
              return (
                <DefinitionGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "odd_one_out":
              return (
                <OddOneOutGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "context_guess":
              return (
                <ContextGuessGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "spot_error":
              return (
                <SpotErrorGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "transform":
              return (
                <TransformGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "dictogloss":
              return (
                <DictoglossGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            case "naturalness":
              return (
                <NaturalnessGame
                  kc_data={kcAny}
                  scaffold_level={currentItem.scaffold_level}
                  on_submit={on_submit}
                  on_hint={on_hint}
                  hints_used={hints_used}
                  feedback={feedback}
                />
              );
            default:
              return (
                <div className="text-center space-y-4">
                  <p className="text-gray-400 text-sm capitalize">
                    {(currentItem.game_type as string).replace(/_/g, " ")} game
                  </p>
                  <button
                    onClick={() => on_submit("stub")}
                    className="px-6 py-3 bg-gray-800 rounded-xl text-sm"
                  >
                    Skip →
                  </button>
                </div>
              );
          }
        }}
      </GameShell>

      {phase === "teaching" && teaching && (
        <TeachingCard
          misconception_name={teaching.misconception_name}
          rule_explanation={teaching.rule_explanation}
          worked_example={teaching.worked_example}
          on_continue={dismissTeaching}
        />
      )}
    </>
  );
}
