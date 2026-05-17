/**
 * POST /api/session/submit
 *
 * Grades an answer, updates executor state, and returns the next item.
 * Executor state is passed through from the client (stateless server).
 *
 * Body: {
 *   session_id, plan_id, item_index,
 *   kc_id, game_type, answer, expected,
 *   response_time_ms, hints_used,
 *   executor_state,           ← client echoes back
 *   options?,                 ← for MC confusion tracking
 *   acceptable_answers?
 * }
 */

import type { APIRoute } from "astro";
import { grade } from "~/lib/game-engine/grader.ts";
import {
  processResponse,
  resolveVariant,
  MAX_SCAFFOLD,
} from "~/lib/game-engine/executor.ts";
import type { ExecutorState } from "~/lib/game-engine/executor.ts";
import { generateTeachingCard } from "~/lib/game-engine/teaching.ts";
import { enrichKcDataForGame } from "~/lib/game-engine/distractors.ts";
import { recordError, recordConfusion } from "~/lib/learner-model/misconceptions.ts";
import type { ErrorType } from "~/lib/learner-model/misconceptions.ts";
import { run, queryOne, parseJson } from "~/lib/db/index.ts";
import { logEvent } from "~/lib/audit/logger.ts";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      session_id,
      plan_id,
      item_index,
      kc_id,
      game_type,
      answer,
      expected,
      response_time_ms = 0,
      hints_used = 0,
      executor_state,
      options,
      acceptable_answers,
    } = body;

    if (!session_id || kc_id === undefined || !answer || !expected) {
      return new Response(
        JSON.stringify({ error: "missing_fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Grade the answer
    const gradeResult = grade({
      game_type,
      answer,
      expected,
      options,
      acceptable_answers,
    });

    // Persist response
    await run(
      `INSERT INTO responses
        (session_id, kc_id, game_type, answer, is_correct, response_time_ms,
         scaffold_level, hints_used, error_type)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        session_id,
        kc_id,
        game_type,
        answer,
        gradeResult.is_correct ? 1 : 0,
        response_time_ms,
        executor_state.scaffold_level ?? 0,
        hints_used,
        gradeResult.error_type ?? null,
      ]
    );

    await logEvent(session_id, "answer_submitted", {
      item_index,
      kc_id,
      game_type,
      is_correct: gradeResult.is_correct,
      error_type: gradeResult.error_type,
      response_time_ms,
    });

    // Misconception tracking
    let misconception_id: number | null = null;
    if (!gradeResult.is_correct && gradeResult.error_type) {
      const m = await recordError(kc_id, gradeResult.error_type as ErrorType);
      misconception_id = m?.id ?? null;

      if (gradeResult.confused_with && options) {
        // Find the KC for the confused answer if possible
        // (simplified: track by name in confusion pairs for now)
      }
    }

    // Update executor state
    const { state: newExecState, scaffold_update } = processResponse(
      executor_state as ExecutorState,
      gradeResult.is_correct,
      misconception_id,
      executor_state.scaffold_level ?? 0
    );

    if (scaffold_update.changed) {
      await logEvent(session_id, "scaffold_changed", {
        direction: scaffold_update.direction,
        new_level: scaffold_update.new_scaffold_level,
        item_index,
      });
    }

    // Teaching card?
    let teaching_card = null;
    if (scaffold_update.teaching_triggered) {
      teaching_card = await generateTeachingCard(kc_id, misconception_id);
      await logEvent(session_id, "teaching_inserted", {
        kc_id,
        misconception_id,
        teaching_name: teaching_card.misconception_name,
      });
    }

    // Load session plan to get next item
    const planRow = await queryOne<{ items_json: string }>(
      "SELECT items_json FROM session_plans WHERE id = ?",
      [plan_id]
    );
    const items = parseJson<Array<{
      kc_id: number;
      game_type: string;
      scaffold_level: number;
      expected_difficulty: number;
      predicted_accuracy: number;
    }>>(planRow?.items_json ?? "[]", []);

    const nextIndex = item_index + 1;
    const nextItem = items[nextIndex];

    let next_item = null;
    if (nextItem) {
      const kc = await queryOne<{ data_json: string }>(
        "SELECT data_json FROM knowledge_components WHERE id = ?",
        [nextItem.kc_id]
      );
      const rawKcData = JSON.parse(kc?.data_json ?? "{}");
      const effectiveScaffold = Math.max(
        nextItem.scaffold_level,
        newExecState.scaffold_level
      );
      const kc_data = await enrichKcDataForGame(
        nextItem.game_type,
        effectiveScaffold,
        nextItem.kc_id,
        rawKcData
      );
      const variant = resolveVariant(nextItem.game_type, effectiveScaffold, kc_data);

      await logEvent(session_id, "item_shown", {
        item_index: nextIndex,
        kc_id: nextItem.kc_id,
        game_type: nextItem.game_type,
        scaffold_level: effectiveScaffold,
      });

      next_item = {
        index: nextIndex,
        kc_id: nextItem.kc_id,
        kc_data,
        game_type: nextItem.game_type,
        scaffold_level: effectiveScaffold,
        variant,
      };
    }

    return new Response(
      JSON.stringify({
        grade: gradeResult,
        scaffold_update,
        executor_state: newExecState,
        teaching_card,
        next_item,
        session_done: nextItem === undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[session/submit]", err);
    return new Response(
      JSON.stringify({ error: "internal", message: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
