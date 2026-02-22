/**
 * Game Engine executor — manages scaffold level within a session.
 *
 * Scaffold rules:
 *   - 3 consecutive wrong → increase scaffold level (easier)
 *   - 3 consecutive right → decrease scaffold level (harder)
 *   - scaffold_level hits MAX_SCAFFOLD → insert teaching card
 */

export const MAX_SCAFFOLD = 3;
const STREAK_THRESHOLD = 3;

export interface ExecutorState {
  current_item_index: number;
  scaffold_level: number;
  consecutive_correct: number;
  consecutive_wrong: number;
  items_completed: number;
  teaching_card_pending: boolean;
  last_misconception_id: number | null;
}

export function initialExecutorState(): ExecutorState {
  return {
    current_item_index: 0,
    scaffold_level: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    items_completed: 0,
    teaching_card_pending: false,
    last_misconception_id: null,
  };
}

export interface ScaffoldUpdate {
  new_scaffold_level: number;
  changed: boolean;
  direction: "easier" | "harder" | "none";
  teaching_triggered: boolean;
}

/**
 * Process a response and update executor state.
 * Returns the scaffold update (may trigger teaching card).
 */
export function processResponse(
  state: ExecutorState,
  is_correct: boolean,
  misconception_id: number | null = null,
  current_scaffold: number = state.scaffold_level
): { state: ExecutorState; scaffold_update: ScaffoldUpdate } {
  let newState = { ...state };
  newState.items_completed++;
  newState.teaching_card_pending = false;

  if (is_correct) {
    newState.consecutive_correct++;
    newState.consecutive_wrong = 0;
  } else {
    newState.consecutive_wrong++;
    newState.consecutive_correct = 0;
    if (misconception_id !== null) {
      newState.last_misconception_id = misconception_id;
    }
  }

  let new_scaffold = current_scaffold;
  let direction: ScaffoldUpdate["direction"] = "none";
  let teaching_triggered = false;

  if (newState.consecutive_wrong >= STREAK_THRESHOLD) {
    // Struggling — make it easier
    newState.consecutive_wrong = 0;
    if (new_scaffold < MAX_SCAFFOLD) {
      new_scaffold++;
      direction = "easier";
    }

    if (new_scaffold >= MAX_SCAFFOLD) {
      // Max scaffold → trigger teaching card
      teaching_triggered = true;
      newState.teaching_card_pending = true;
      new_scaffold = MAX_SCAFFOLD - 1; // drop back after teaching
    }
  } else if (newState.consecutive_correct >= STREAK_THRESHOLD) {
    // Succeeding — make it harder
    newState.consecutive_correct = 0;
    if (new_scaffold > 0) {
      new_scaffold--;
      direction = "harder";
    }
  }

  newState.scaffold_level = new_scaffold;

  return {
    state: newState,
    scaffold_update: {
      new_scaffold_level: new_scaffold,
      changed: new_scaffold !== current_scaffold,
      direction,
      teaching_triggered,
    },
  };
}

/**
 * Select the actual game variant based on game_type + scaffold_level.
 * Returns variant config consumed by the frontend game component.
 */
export interface GameVariant {
  game_type: string;
  scaffold_level: number;
  mode: string; // human-readable mode name
  config: Record<string, unknown>; // variant-specific config
}

export function resolveVariant(
  game_type: string,
  scaffold_level: number,
  kc_data: Record<string, unknown>
): GameVariant {
  const config: Record<string, unknown> = {};

  switch (game_type) {
    case "translate":
      // 0=free typing, 1=first-letter hint, 2=MC 2-way, 3=MC 4-way
      config.show_hint = scaffold_level >= 1;
      config.mc_options = scaffold_level >= 2
        ? scaffold_level >= 3 ? 4 : 2
        : 0;
      return {
        game_type,
        scaffold_level,
        mode: ["free", "first-letter-hint", "mc-2", "mc-4"][scaffold_level] ?? "mc-4",
        config,
      };

    case "cloze":
      // 0=typed, 1=partial word hint, 2=MC options
      config.word_hint = scaffold_level >= 1;
      config.mc_options = scaffold_level >= 2 ? 4 : 0;
      return {
        game_type,
        scaffold_level,
        mode: ["typed", "word-hint", "mc-4"][Math.min(scaffold_level, 2)] ?? "mc-4",
        config,
      };

    case "idiomatic":
    case "context_guess":
      // 0=4 options, 1=2 options, 2=rule shown
      config.option_count = scaffold_level >= 1 ? 2 : 4;
      config.show_rule = scaffold_level >= 2;
      return {
        game_type,
        scaffold_level,
        mode: ["mc-4", "mc-2", "mc-2-rule"][Math.min(scaffold_level, 2)] ?? "mc-2-rule",
        config,
      };

    case "definition":
      // 0=typed French, 1=MC definitions
      config.mc_options = scaffold_level >= 1 ? 4 : 0;
      return {
        game_type,
        scaffold_level,
        mode: scaffold_level === 0 ? "free-type" : "mc-definitions",
        config,
      };

    case "odd_one_out":
      // 0=no label, 1=category label
      config.show_category = scaffold_level >= 1;
      return {
        game_type,
        scaffold_level,
        mode: scaffold_level === 0 ? "no-label" : "category-label",
        config,
      };

    case "construct":
      // 0=6-way MC, 1=4-way, 2=2-way
      config.option_count = scaffold_level === 0 ? 6 : scaffold_level === 1 ? 4 : 2;
      return {
        game_type,
        scaffold_level,
        mode: `mc-${config.option_count}`,
        config,
      };

    case "spot_error":
      // 0=no hint, 1=error region highlighted
      config.highlight_region = scaffold_level >= 1;
      return {
        game_type,
        scaffold_level,
        mode: scaffold_level === 0 ? "no-hint" : "highlight-region",
        config,
      };

    case "transform":
      // 0=independent, 1=guided, 2=worked example first
      config.show_worked_example = scaffold_level >= 2;
      config.guided = scaffold_level >= 1;
      return {
        game_type,
        scaffold_level,
        mode: ["independent", "guided", "worked-example"][Math.min(scaffold_level, 2)] ?? "worked-example",
        config,
      };

    case "dictogloss":
      // 0=from memory, 1=audio + text, 2=with text
      config.show_text = scaffold_level >= 2;
      config.show_audio_text = scaffold_level >= 1;
      return {
        game_type,
        scaffold_level,
        mode: ["memory", "audio-text", "with-text"][Math.min(scaffold_level, 2)] ?? "with-text",
        config,
      };

    case "naturalness":
      // 0=5 options unranked, 1=pre-sorted options
      config.pre_sorted = scaffold_level >= 1;
      config.option_count = 5;
      return {
        game_type,
        scaffold_level,
        mode: scaffold_level === 0 ? "unranked" : "pre-sorted",
        config,
      };

    default:
      return { game_type, scaffold_level, mode: "default", config };
  }
}
