/**
 * Teaching card insertion logic.
 *
 * A teaching card fires when scaffold_level hits MAX_SCAFFOLD.
 * It shows a worked example with explicit rule annotation, then
 * re-attempts the same item at a slightly easier scaffold.
 */

import { queryOne, parseJson } from "../db/index.ts";
import { getMisconception } from "../learner-model/misconceptions.ts";

export interface TeachingCard {
  kc_id: number;
  misconception_name: string | null;
  rule_explanation: string;
  worked_example: WorkedExample;
  re_attempt: boolean;
}

export interface WorkedExample {
  prompt: string;
  steps: string[];
  answer: string;
  annotation: string; // explicit rule reference
}

/**
 * Generate a teaching card for a KC that has triggered max scaffolding.
 */
export async function generateTeachingCard(
  kc_id: number,
  misconception_id: number | null
): Promise<TeachingCard> {
  const kc = await queryOne<{
    type: string;
    subtype: string;
    data_json: string;
  }>("SELECT type, subtype, data_json FROM knowledge_components WHERE id = ?", [
    kc_id,
  ]);

  if (!kc) {
    return {
      kc_id,
      misconception_name: null,
      rule_explanation: "Review this item carefully.",
      worked_example: {
        prompt: "Study this example",
        steps: [],
        answer: "",
        annotation: "",
      },
      re_attempt: true,
    };
  }

  const data = parseJson<{
    word?: string;
    rule?: string;
    examples?: Array<{ fr: string; en: string; breakdown?: string[] }>;
    definition?: string;
    translations?: string[];
  }>(kc.data_json, {});

  const misconception = misconception_id
    ? await getMisconception(misconception_id)
    : null;

  // Build worked example from KC data
  const example = data.examples?.[0];
  const workedExample: WorkedExample = {
    prompt: data.word
      ? `How to use "${data.word}"`
      : data.rule ?? "Study this example",
    steps: example?.breakdown ?? [],
    answer: example?.fr ?? "",
    annotation: misconception
      ? `This relates to: ${misconception.name}. ${misconception.description ?? ""}`
      : data.rule ?? "",
  };

  const rule = data.rule ?? generateRuleFromType(kc.type, kc.subtype, data);

  return {
    kc_id,
    misconception_name: misconception?.name ?? null,
    rule_explanation: rule,
    worked_example: workedExample,
    re_attempt: true,
  };
}

function generateRuleFromType(
  type: string,
  subtype: string,
  data: Record<string, unknown>
): string {
  if (type === "vocabulary" && subtype === "fact") {
    const word = data.word as string;
    const translations = data.translations as string[];
    return `"${word}" means "${translations?.[0] ?? "—"}". ${
      data.definition ?? ""
    }`;
  }
  if (type === "grammar") {
    return (data.rule as string) ?? "Study the pattern in the example.";
  }
  return "Review the example carefully before trying again.";
}
