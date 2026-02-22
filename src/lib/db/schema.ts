/**
 * SQLite schema definitions.
 * All CREATE TABLE statements live here — single source of truth.
 */

export const SCHEMA_SQL = `
-- ─────────────────────────────────────────────────────────────────────────────
-- Content tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_components (
  id        INTEGER PRIMARY KEY,
  type      TEXT NOT NULL CHECK (type IN ('vocabulary','grammar')),
  subtype   TEXT NOT NULL CHECK (subtype IN ('fact','concept','procedure','principle')),
  level     TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  data_json TEXT NOT NULL,
  -- {word, definition, examples[], translations[], rule?, exercises?, audio_url?}
  tags_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_kc_type_level ON knowledge_components(type, level);
CREATE INDEX IF NOT EXISTS idx_kc_subtype    ON knowledge_components(subtype);

CREATE TABLE IF NOT EXISTS kc_prerequisites (
  kc_id         INTEGER NOT NULL REFERENCES knowledge_components(id),
  requires_kc_id INTEGER NOT NULL REFERENCES knowledge_components(id),
  PRIMARY KEY (kc_id, requires_kc_id)
);

CREATE TABLE IF NOT EXISTS misconceptions (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  kc_ids_json  TEXT NOT NULL DEFAULT '[]',
  -- KLI error type this typically manifests as
  error_type   TEXT CHECK (error_type IN
    ('orthographic','semantic','morphological','syntactic','pragmatic',NULL))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Learner state
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS srs_cards (
  id               INTEGER PRIMARY KEY,
  kc_id            INTEGER NOT NULL REFERENCES knowledge_components(id),
  stability        REAL    NOT NULL DEFAULT 1.0,
  difficulty       REAL    NOT NULL DEFAULT 0.3,
  retrievability   REAL    NOT NULL DEFAULT 1.0,
  state            TEXT    NOT NULL DEFAULT 'new'
    CHECK (state IN ('new','learning','review','relearning')),
  due_at           DATETIME,
  review_count     INTEGER NOT NULL DEFAULT 0,
  lapse_count      INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at DATETIME,
  UNIQUE (kc_id)
);

CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_cards(due_at, state);

CREATE TABLE IF NOT EXISTS learner_kc_errors (
  kc_id            INTEGER NOT NULL REFERENCES knowledge_components(id),
  error_type       TEXT    NOT NULL
    CHECK (error_type IN
      ('orthographic','semantic','morphological','syntactic','pragmatic')),
  misconception_id INTEGER REFERENCES misconceptions(id),
  count            INTEGER NOT NULL DEFAULT 1,
  last_seen_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kc_id, error_type)
);

CREATE TABLE IF NOT EXISTS learner_confusion_pairs (
  kc_id_a        INTEGER NOT NULL REFERENCES knowledge_components(id),
  kc_id_b        INTEGER NOT NULL REFERENCES knowledge_components(id),
  confusion_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kc_id_a, kc_id_b),
  CHECK (kc_id_a < kc_id_b)  -- enforce canonical ordering
);

CREATE TABLE IF NOT EXISTS learner_profile (
  id                        INTEGER PRIMARY KEY DEFAULT 1,
  vocabulary_proficiency    REAL NOT NULL DEFAULT 0.0,
  -- 0.0–6.0 maps to A1(0–1)–A2(1–2)–B1(2–3)–B2(3–4)–C1(4–5)–C2(5–6)
  grammar_proficiency_json  TEXT NOT NULL DEFAULT '{}',
  -- {present:0.0, passe_compose:0.0, imparfait:0.0, ...}
  forgetting_rate           REAL NOT NULL DEFAULT 1.0,
  style_weights_json        TEXT NOT NULL DEFAULT '{}',
  -- {translate:1.0, cloze:1.0, construct:1.0, ...}
  session_pattern_json      TEXT NOT NULL DEFAULT '{}'
  -- {optimal_length_min:15, best_time_of_day:null}
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Session planning
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_plans (
  id                INTEGER PRIMARY KEY,
  subject           TEXT NOT NULL CHECK (subject IN ('vocabulary','grammar','mixed')),
  topic             TEXT,
  level             TEXT,
  style             TEXT,
  mood              TEXT CHECK (mood IN ('challenge','review','explore','quick','deep')),
  items_json        TEXT NOT NULL DEFAULT '[]',
  -- [{kc_id, game_type, scaffold_level, expected_difficulty}]
  expected_accuracy REAL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Session execution
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id             INTEGER PRIMARY KEY,
  plan_id        INTEGER REFERENCES session_plans(id),
  started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at       DATETIME,
  cards_reviewed INTEGER NOT NULL DEFAULT 0,
  accuracy       REAL
);

CREATE TABLE IF NOT EXISTS responses (
  id              INTEGER PRIMARY KEY,
  session_id      INTEGER NOT NULL REFERENCES sessions(id),
  kc_id           INTEGER NOT NULL REFERENCES knowledge_components(id),
  game_type       TEXT    NOT NULL,
  answer          TEXT,
  is_correct      INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  response_time_ms INTEGER,
  scaffold_level  INTEGER NOT NULL DEFAULT 0,
  hints_used      INTEGER NOT NULL DEFAULT 0,
  error_type      TEXT CHECK (error_type IN
    ('orthographic','semantic','morphological','syntactic','pragmatic',NULL)),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_responses_session ON responses(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_kc      ON responses(kc_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_events (
  id           INTEGER PRIMARY KEY,
  session_id   INTEGER REFERENCES sessions(id),
  event_type   TEXT NOT NULL CHECK (event_type IN (
    'item_shown','hint_requested','answer_submitted',
    'teaching_inserted','scaffold_changed','session_started','session_ended'
  )),
  payload_json TEXT,
  ts           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id, ts);

-- ─────────────────────────────────────────────────────────────────────────────
-- Aggregated stats
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_stats (
  date              TEXT PRIMARY KEY,
  cards_reviewed    INTEGER NOT NULL DEFAULT 0,
  accuracy          REAL,
  minutes_studied   REAL    NOT NULL DEFAULT 0,
  new_kcs_learned   INTEGER NOT NULL DEFAULT 0
);

-- Ensure learner_profile singleton row exists
INSERT OR IGNORE INTO learner_profile (id) VALUES (1);
`;
