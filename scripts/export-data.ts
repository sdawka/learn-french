#!/usr/bin/env bun
/**
 * Export local french.db data to migrations/data.sql for D1 import.
 */

import { Database } from "bun:sqlite";
import { writeFileSync } from "fs";

const db = new Database("french.db");

const tables = [
  "knowledge_components",
  "kc_prerequisites",
  "misconceptions",
  "srs_cards",
  "learner_kc_errors",
  "learner_confusion_pairs",
  "learner_profile",
  "session_plans",
  "sessions",
  "responses",
  "audit_events",
  "daily_stats",
];

let sql = "-- Data export from french.db\n";
sql += "-- Generated: " + new Date().toISOString() + "\n\n";

for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) continue;

  sql += `-- ${table}\n`;
  for (const row of rows) {
    const cols = Object.keys(row as object);
    const vals = Object.values(row as object).map((v) => {
      if (v === null) return "NULL";
      if (typeof v === "number") return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")});\n`;
  }
  sql += "\n";
}

writeFileSync("migrations/data.sql", sql);
console.log("Exported to migrations/data.sql");
