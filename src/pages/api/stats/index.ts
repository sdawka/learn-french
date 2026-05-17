/**
 * GET /api/stats
 *
 * Returns all data needed to render the dashboard:
 *   - Due counts, knowledge state ring, daily streak, weak areas,
 *     7-day forgetting curve predictions, retention by topic.
 */

import type { APIRoute } from "astro";
import { query, queryOne, parseJson } from "~/lib/db/index.ts";
import { getDueCount } from "~/lib/srs/scheduler.ts";
import { predictRetrievability } from "~/lib/srs/fsrs.ts";
import type { FSRSCard } from "~/lib/srs/fsrs.ts";
import { getProfile, proficiencyToCEFR } from "~/lib/learner-model/profile.ts";

export const GET: APIRoute = async () => {
  try {
    const profile = await getProfile();
    const due = await getDueCount("mixed");

    // Knowledge state ring (new/learning/review/mastered)
    const stateRing = await queryOne<{
      new_count: number;
      learning_count: number;
      review_count: number;
      mastered_count: number;
    }>(`
      SELECT
        SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) AS learning_count,
        SUM(CASE WHEN state = 'review' AND stability < 21 THEN 1 ELSE 0 END) AS review_count,
        SUM(CASE WHEN state = 'review' AND stability >= 21 THEN 1 ELSE 0 END) AS mastered_count
      FROM srs_cards
    `) ?? { new_count: 0, learning_count: 0, review_count: 0, mastered_count: 0 };

    // Weak areas (bottom 10 by retrievability)
    const weakAreas = (await query<{
      kc_id: number;
      retrievability: number;
      due_at: string | null;
      data_json: string;
      type: string;
    }>(`
      SELECT sc.kc_id, sc.retrievability, sc.due_at, kc.data_json, kc.type
      FROM srs_cards sc
      JOIN knowledge_components kc ON kc.id = sc.kc_id
      WHERE sc.state != 'new'
      ORDER BY sc.retrievability ASC
      LIMIT 10
    `)).map((row) => {
      const data = parseJson<{ word?: string; rule?: string }>(row.data_json, {});
      return {
        kc_id: row.kc_id,
        retrievability: row.retrievability,
        due_at: row.due_at,
        label: data.word ?? data.rule ?? `KC ${row.kc_id}`,
        type: row.type,
      };
    });

    // Retention map by topic/tag (average retrievability per tag)
    const retentionByTag = await query<{ tag: string; avg_ret: number }>(`
      SELECT json_each.value AS tag, AVG(sc.retrievability) AS avg_ret
      FROM srs_cards sc
      JOIN knowledge_components kc ON kc.id = sc.kc_id,
           json_each(kc.tags_json)
      WHERE sc.state != 'new'
      GROUP BY json_each.value
      ORDER BY avg_ret ASC
    `);

    // 7-day forgetting curve: predict retrievability each day for all active cards
    const now = new Date();
    const activeCards = await query<{
      stability: number;
      difficulty: number;
      retrievability: number;
      state: string;
      last_reviewed_at: string | null;
    }>(`
      SELECT stability, difficulty, retrievability, state, last_reviewed_at
      FROM srs_cards WHERE state != 'new'
    `);

    const forgettingCurve = Array.from({ length: 8 }, (_, day) => {
      const at = new Date(now.getTime() + day * 86_400_000);
      const predictions = activeCards.map((row) => {
        const card: FSRSCard = {
          stability: row.stability,
          difficulty: row.difficulty,
          retrievability: row.retrievability,
          state: row.state as FSRSCard["state"],
          due_at: null,
          review_count: 0,
          lapse_count: 0,
          last_reviewed_at: row.last_reviewed_at
            ? new Date(row.last_reviewed_at)
            : null,
        };
        return predictRetrievability(card, at);
      });
      const avg =
        predictions.length > 0
          ? predictions.reduce((a, b) => a + b, 0) / predictions.length
          : 1;
      return { day, avg_retrievability: Math.round(avg * 1000) / 1000 };
    });

    // Daily stats for heatmap (last 365 days)
    const heatmap = await query<{
      date: string;
      cards_reviewed: number;
      accuracy: number;
      minutes_studied: number;
    }>(
      "SELECT date, cards_reviewed, accuracy, minutes_studied FROM daily_stats ORDER BY date ASC"
    );

    // Streak
    let streak = 0;
    const today = now.toISOString().split("T")[0];
    for (let i = 0; i < heatmap.length; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const entry = heatmap.find((h) => h.date === dateStr);
      if (entry && entry.cards_reviewed > 0) {
        streak++;
      } else {
        break;
      }
    }

    return new Response(
      JSON.stringify({
        due,
        profile: {
          vocabulary_proficiency: profile.vocabulary_proficiency,
          vocabulary_cefr: proficiencyToCEFR(profile.vocabulary_proficiency),
          grammar_proficiency: profile.grammar_proficiency,
        },
        knowledge_ring: stateRing,
        weak_areas: weakAreas,
        retention_by_tag: retentionByTag,
        forgetting_curve: forgettingCurve,
        heatmap,
        streak,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stats]", err);
    return new Response(
      JSON.stringify({ error: "internal", message: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
