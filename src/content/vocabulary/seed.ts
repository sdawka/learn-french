/**
 * Seed script — runs under Bun directly.
 * Run with: bun src/content/vocabulary/seed.ts
 */

import { Database } from "bun:sqlite";
import { SCHEMA_SQL } from "../../lib/db/schema.ts";
// Misconceptions seeded inline to avoid better-sqlite3 import in Bun context
const MISCONCEPTIONS = [
  { name: "avoir/être movement verb confusion", description: "Using avoir instead of être as auxiliary for verbs of motion", error_type: "morphological" },
  { name: "present tense overextension to habitual past", description: "Using présent for habitual past actions that require imparfait", error_type: "syntactic" },
  { name: "elision omission before vowels", description: "Omitting elision (le → l') before words starting with a vowel or silent h", error_type: "orthographic" },
  { name: "adjective gender agreement error", description: "Failing to apply feminine/plural endings to adjectives", error_type: "morphological" },
  { name: "false cognate confusion", description: "Assigning English meaning to false French cognates", error_type: "semantic" },
  { name: "subjunctive trigger missed", description: "Using indicative after verbs/conjunctions that require subjunctive", error_type: "syntactic" },
];

const DB_PATH = `${process.cwd()}/french.db`;
const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");
db.exec(SCHEMA_SQL);

const insertKC = db.prepare(`
  INSERT OR IGNORE INTO knowledge_components (type, subtype, level, data_json, tags_json)
  VALUES (?, ?, ?, ?, ?)
`);

interface KCEntry {
  type: string;
  subtype: string;
  level: string;
  data_json: Record<string, unknown>;
  tags_json: string[];
}

async function seedFile(filepath: string): Promise<number> {
  const raw = await Bun.file(filepath).text();
  const items = JSON.parse(raw) as KCEntry[];
  let count = 0;
  db.run("BEGIN");
  for (const item of items) {
    insertKC.run(
      item.type,
      item.subtype,
      item.level,
      JSON.stringify(item.data_json),
      JSON.stringify(item.tags_json)
    );
    count++;
  }
  db.run("COMMIT");
  return count;
}

const vocabDir = import.meta.dir;
const grammarDir = `${import.meta.dir}/../grammar`;

let total = 0;

for await (const entry of new Bun.Glob("*.json").scan(vocabDir)) {
  const n = await seedFile(`${vocabDir}/${entry}`);
  console.log(`  Vocabulary ${entry}: ${n} KCs`);
  total += n;
}

try {
  for await (const entry of new Bun.Glob("*.json").scan(grammarDir)) {
    const n = await seedFile(`${grammarDir}/${entry}`);
    console.log(`  Grammar ${entry}: ${n} KCs`);
    total += n;
  }
} catch {
  console.log("  (no grammar dir)");
}

// ── Seed kc_prerequisites ────────────────────────────────────────────────────
try {
  const prereqDefs = JSON.parse(
    await Bun.file(`${grammarDir}/prerequisites.json`).text()
  ) as Array<{ kc_name: string; requires: string[] }>;

  // concept name → LIKE patterns that must ALL match the tags_json column
  const CONCEPT_TAGS: Record<string, string[]> = {
    "present tense avoir":                                 ['"avoir"', '"present"'],
    "present tense être":                                  ['"être"', '"present"'],
    "present tense -er verbs":                             ['"-er verbs"'],
    "present tense irregular: faire":                      ['"faire"'],
    "present tense irregular: aller":                      ['"aller"'],
    "present tense irregular: prendre":                    ['"prendre"'],
    "present tense irregular: vouloir":                    ['"vouloir"'],
    "negation ne...pas":                                   ['"negation"', '"A1"'],
    "negation ne...jamais":                                ['"negation"', '"A2"'],
    "negation ne...plus":                                  ['"negation"', '"A2"'],
    "question formation: intonation":                      ['"question_formation"', '"A1"'],
    "question formation: est-ce que":                      ['"question_formation"', '"A1"'],
    "question formation: inversion":                       ['"question_formation"', '"A2"'],
    "gender agreement: articles":                          ['"gender_agreement"'],
    "adjective agreement: regular":                        ['"adjective_agreement"', '"A1"'],
    "adjective agreement: irregular":                      ['"adjective_agreement"', '"A2"'],
    "passé composé with avoir":                            ['"passe_compose"', '"avoir"'],
    "passé composé with être":                             ['"passe_compose"', '"être"'],
    "passé composé: past participle agreement with avoir": ['"passe_compose"', '"agreement"'],
    "imparfait: formation":                                ['"imparfait"', '"A2"'],
    "imparfait vs passé composé: usage contrast":          ['"imparfait"', '"B1"'],
    "direct object pronouns":                              ['"direct object"'],
    "indirect object pronouns":                            ['"indirect object"'],
    "relative clauses: qui":                               ['"relative_clauses"'],
    "relative clauses: que":                               ['"relative_clauses"'],
    "relative clauses: dont":                              ['"relative_clauses"'],
    "futur simple: regular":                               ['"futur"', '"A2"'],
    "futur simple: irregular stems":                       ['"futur"', '"B1"'],
    "pluperfect (plus-que-parfait)":                       [],
  };

  function conceptKcIds(name: string): number[] {
    const tags = CONCEPT_TAGS[name];
    if (!tags || tags.length === 0) return [];
    const where = tags.map(() => `tags_json LIKE ?`).join(" AND ");
    const params = tags.map((t) => `%${t}%`);
    return (
      db
        .prepare(
          `SELECT id FROM knowledge_components WHERE type = 'grammar' AND ${where} ORDER BY id`
        )
        .all(...params) as Array<{ id: number }>
    ).map((r) => r.id);
  }

  const insertPrereq = db.prepare(
    `INSERT OR IGNORE INTO kc_prerequisites (kc_id, requires_kc_id) VALUES (?, ?)`
  );

  let prereqEdges = 0;
  db.run("BEGIN");
  for (const entry of prereqDefs) {
    const kcIds = conceptKcIds(entry.kc_name);
    for (const reqName of entry.requires) {
      const reqIds = conceptKcIds(reqName);
      if (reqIds.length === 0) continue;
      const reqRepId = reqIds[0]; // min-id representative for the concept
      for (const kcId of kcIds) {
        if (kcId === reqRepId) continue; // no self-loops
        insertPrereq.run(kcId, reqRepId);
        prereqEdges++;
      }
    }
  }
  db.run("COMMIT");
  console.log(`  Prerequisites seeded: ${prereqEdges} edges`);
} catch (e) {
  console.log("  (prerequisite seeding skipped:", e instanceof Error ? e.message : e, ")");
}

const insertMisc = db.prepare(
  `INSERT OR IGNORE INTO misconceptions (name, description, kc_ids_json, error_type) VALUES (?,?,?,?)`
);
for (const m of MISCONCEPTIONS) {
  insertMisc.run(m.name, m.description, "[]", m.error_type);
}
db.run("INSERT OR IGNORE INTO learner_profile (id) VALUES (1)");
console.log("  Misconceptions seeded");
console.log(`\nTotal KCs inserted: ${total}`);
