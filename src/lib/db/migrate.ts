/**
 * Migration runner — runs under Bun directly.
 * Run with: bun src/lib/db/migrate.ts
 */

import { Database } from "bun:sqlite";
import { SCHEMA_SQL } from "./schema.ts";

const DB_PATH = `${process.cwd()}/french.db`;
const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");
db.exec(SCHEMA_SQL);
console.log("Migration complete");
