/**
 * POST /api/session/start
 *
 * Creates a session plan from the learner model and starts a session.
 * Returns the plan and first item with its game variant config.
 *
 * Body: { subject?, mood?, topic? }
 */

import type { APIRoute } from "astro";
import { planSession } from "~/lib/adaptation/session-planner.ts";
import type { Subject, Mood } from "~/lib/adaptation/session-planner.ts";
import { run, queryOne } from "~/lib/db/index.ts";
import { resolveVariant } from "~/lib/game-engine/executor.ts";
import { enrichKcDataForGame } from "~/lib/game-engine/distractors.ts";
import { logEvent } from "~/lib/audit/logger.ts";
import { getDueCount } from "~/lib/srs/scheduler.ts";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const subject: Subject = body.subject ?? "mixed";
    const mood: Mood = body.mood ?? "review";
    const topic: string | null = body.topic ?? null;

    const dueCount = await getDueCount(subject === "mixed" ? "mixed" : subject);
    if (dueCount.due + dueCount.new_cards === 0) {
      return new Response(
        JSON.stringify({ error: "no_items_due", message: "Nothing due for review right now." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const plan = await planSession(subject, mood, topic);

    // Create session row
    const sessionResult = await run(
      "INSERT INTO sessions (plan_id, started_at) VALUES (?,?)",
      [plan.id, new Date().toISOString()]
    );
    const session_id = sessionResult.lastInsertRowid as number;

    await logEvent(session_id, "session_started", {
      plan_id: plan.id,
      subject,
      mood,
      item_count: plan.items.length,
      expected_accuracy: plan.expected_accuracy,
    });

    if (plan.items.length === 0) {
      return new Response(
        JSON.stringify({ error: "empty_plan", session_id }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const firstItem = plan.items[0];
    const kc = await queryOne<{ data_json: string }>(
      "SELECT data_json FROM knowledge_components WHERE id = ?",
      [firstItem.kc_id]
    );
    if (!kc) {
      return new Response(
        JSON.stringify({ error: "kc_not_found", kc_id: firstItem.kc_id }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const rawKcData = JSON.parse(kc.data_json ?? "{}");
    const kc_data = await enrichKcDataForGame(
      firstItem.game_type,
      firstItem.scaffold_level,
      firstItem.kc_id,
      rawKcData
    );

    const variant = resolveVariant(
      firstItem.game_type,
      firstItem.scaffold_level,
      kc_data
    );

    await logEvent(session_id, "item_shown", {
      item_index: 0,
      kc_id: firstItem.kc_id,
      game_type: firstItem.game_type,
      scaffold_level: firstItem.scaffold_level,
    });

    return new Response(
      JSON.stringify({
        session_id,
        plan_id: plan.id,
        total_items: plan.items.length,
        expected_accuracy: plan.expected_accuracy,
        level: plan.level,
        current_item: {
          index: 0,
          kc_id: firstItem.kc_id,
          kc_data,
          game_type: firstItem.game_type,
          scaffold_level: firstItem.scaffold_level,
          variant,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[session/start]", err);
    return new Response(
      JSON.stringify({ error: "internal", message: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
