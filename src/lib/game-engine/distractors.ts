/**
 * Generate MC distractors for vocabulary games.
 * For translate game: returns French words (correct + distractors).
 */

import { query, parseJson } from "~/lib/db/index.ts";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * For translate game: generate MC options as French words.
 * Returns shuffled array with correct answer + distractors.
 */
export async function generateTranslateOptions(
  correctWord: string,
  excludeKcId: number,
  count = 4
): Promise<string[]> {
  const rows = await query<{ data_json: string }>(
    `SELECT data_json FROM knowledge_components
     WHERE type = 'vocabulary' AND id != ?
     ORDER BY RANDOM()
     LIMIT ?`,
    [excludeKcId, count * 2]
  );

  const distractors: string[] = [];
  for (const row of rows) {
    const data = parseJson<{ word?: string }>(row.data_json, {});
    if (data.word && data.word !== correctWord && !distractors.includes(data.word)) {
      distractors.push(data.word);
      if (distractors.length >= count - 1) break;
    }
  }

  return shuffle([correctWord, ...distractors]);
}

/**
 * Inject mc_options into kc_data for vocabulary games when in MC mode.
 * Both translate and definition games need French word options.
 */
export async function enrichKcDataForGame(
  game_type: string,
  scaffold_level: number,
  kc_id: number,
  kc_data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const needsFrenchOptions =
    (game_type === "translate" && scaffold_level >= 2) ||
    (game_type === "definition" && scaffold_level >= 1);

  if (needsFrenchOptions) {
    const word = kc_data.word as string | undefined;
    if (word) {
      const optionCount = game_type === "translate"
        ? (scaffold_level >= 3 ? 4 : 2)
        : 4;
      const mc_options = await generateTranslateOptions(word, kc_id, optionCount);
      return { ...kc_data, mc_options };
    }
  }
  return kc_data;
}
