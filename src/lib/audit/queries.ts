/**
 * Audit log queries — session timeline, replay, analysis.
 */

import { query, parseJson } from "../db/index.ts";

export interface AuditEvent {
  id: number;
  session_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  ts: string;
}

export async function getSessionTimeline(session_id: number): Promise<AuditEvent[]> {
  const rows = await query<{
    id: number;
    session_id: number;
    event_type: string;
    payload_json: string;
    ts: string;
  }>(
    "SELECT * FROM audit_events WHERE session_id = ? ORDER BY ts ASC",
    [session_id]
  );
  return rows.map((row) => ({
    id: row.id,
    session_id: row.session_id,
    event_type: row.event_type,
    payload: parseJson(row.payload_json, {}),
    ts: row.ts,
  }));
}

export async function getScaffoldTrajectory(
  session_id: number
): Promise<Array<{ ts: string; direction: string; new_level: number }>> {
  const rows = await query<{ payload_json: string; ts: string }>(
    "SELECT payload_json, ts FROM audit_events WHERE session_id = ? AND event_type = 'scaffold_changed' ORDER BY ts",
    [session_id]
  );
  return rows.map((row) => {
    const p = parseJson<{ direction: string; new_level: number }>(row.payload_json, { direction: "none", new_level: 0 });
    return { ts: row.ts, direction: p.direction, new_level: p.new_level };
  });
}
