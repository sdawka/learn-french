/**
 * POST /api/session/end
 *
 * Runs post-session adaptation and returns the session summary.
 *
 * Body: { session_id }
 */

import type { APIRoute } from "astro";
import { query, queryOne, run, parseJson } from "~/lib/db/index.ts";
import { runPostSession } from "~/lib/adaptation/post-session.ts";
import type { SessionResponse } from "~/lib/adaptation/post-session.ts";
import { logEvent } from "~/lib/audit/logger.ts";
import { getScaffoldTrajectory } from "~/lib/audit/queries.ts";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { session_id } = await request.json();
    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "missing session_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load all responses for this session
    const responseRows = await query<{
      kc_id: number;
      is_correct: number;
      response_time_ms: number;
      game_type: string;
      error_type: string | null;
    }>(
      "SELECT kc_id, is_correct, response_time_ms, game_type, error_type FROM responses WHERE session_id = ?",
      [session_id]
    );

    const responses: SessionResponse[] = responseRows.map((r) => ({
      kc_id: r.kc_id,
      is_correct: r.is_correct === 1,
      response_time_ms: r.response_time_ms,
      game_type: r.game_type,
      error_type: r.error_type as SessionResponse["error_type"],
    }));

    const result = await runPostSession(session_id, responses);

    await logEvent(session_id, "session_ended", {
      accuracy: result.accuracy,
      kcs_updated: result.kcs_updated,
      misconceptions_triggered: result.misconceptions_triggered,
    });

    const trajectory = await getScaffoldTrajectory(session_id);
    const sessionRow = await queryOne<{ started_at: string; ended_at: string | null }>(
      "SELECT started_at, ended_at FROM sessions WHERE id = ?",
      [session_id]
    );
    if (!sessionRow) {
      return new Response(
        JSON.stringify({ error: "session_not_found", session_id }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    const minutes = sessionRow.ended_at
      ? (new Date(sessionRow.ended_at).getTime() - new Date(sessionRow.started_at).getTime()) / 60_000
      : 0;

    // Update minutes in daily_stats
    const today = new Date().toISOString().split("T")[0];
    await run(
      "UPDATE daily_stats SET minutes_studied = minutes_studied + ? WHERE date = ?",
      [minutes, today]
    );

    return new Response(
      JSON.stringify({
        session_id,
        summary: {
          items_reviewed: result.kcs_updated,
          accuracy: result.accuracy,
          minutes_studied: Math.round(minutes * 10) / 10,
          misconceptions_flagged: result.misconceptions_triggered,
          predicted_vs_actual: result.predicted_vs_actual,
          scaffold_trajectory: trajectory,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[session/end]", err);
    return new Response(
      JSON.stringify({ error: "internal", message: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
