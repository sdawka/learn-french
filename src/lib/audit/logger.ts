/**
 * Audit event logger — append-only log of all in-session events.
 * Used for session replay, debugging, and post-session analysis.
 */

import { run } from "../db/index.ts";

export type EventType =
  | "session_started"
  | "item_shown"
  | "hint_requested"
  | "answer_submitted"
  | "teaching_inserted"
  | "scaffold_changed"
  | "session_ended";

export async function logEvent(
  session_id: number,
  event_type: EventType,
  payload: Record<string, unknown> = {},
  now: Date = new Date()
): Promise<void> {
  await run(
    "INSERT INTO audit_events (session_id, event_type, payload_json, ts) VALUES (?,?,?,?)",
    [session_id, event_type, JSON.stringify(payload), now.toISOString()]
  );
}
