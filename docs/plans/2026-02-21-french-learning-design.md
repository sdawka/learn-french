# French Learning Webapp — Design Document

**Date:** 2026-02-21
**Stack:** Astro (SSR) + Bun + TypeScript + bun:sqlite + React islands

## Architecture

The app follows a Plan-Execute-Adapt loop:

```
[Learner Model] → [Adaptation Engine] → [Session Plan]
       ↑                                        ↓
[Audit Log] ←────── [Game Engine executes] ─────┘
```

### Key modules

| Module | Path | Purpose |
|---|---|---|
| DB layer | `src/lib/db/` | bun:sqlite connection, query helpers, schema, migrations |
| FSRS-5 | `src/lib/srs/fsrs.ts` | Spaced repetition algorithm |
| Scheduler | `src/lib/srs/scheduler.ts` | Due items query, card state persistence |
| Learner Model | `src/lib/learner-model/` | Profile, proficiency estimates, misconception register |
| Session Planner | `src/lib/adaptation/session-planner.ts` | Compose session plan targeting ~80% accuracy |
| Post-session | `src/lib/adaptation/post-session.ts` | Update FSRS + proficiency after session |
| Game Engine | `src/lib/game-engine/` | Grader, executor (scaffold adjuster), teaching cards |
| Audit | `src/lib/audit/` | Append-only event log |
| API | `src/pages/api/session/` | start / submit / end endpoints |
| Games | `src/components/games/` | React island components per game type |
| Dashboard | `src/components/dashboard/` | Stats visualizations |

## Data Flow: Single Item

1. `POST /api/session/start` → planSessionSync() → INSERT session_plans → INSERT sessions → return first item + variant config
2. User plays game → `POST /api/session/submit` → grade() → processResponse() (scaffold adjuster) → INSERT responses → INSERT audit_events → return next item (or teaching card)
3. `POST /api/session/end` → runPostSession() → schedule() per KC → UPDATE srs_cards → UPDATE learner_profile → INSERT daily_stats

## Content Schema

KCs are stored as JSON blobs in `knowledge_components.data_json`. This keeps the schema flexible — vocabulary items have different fields than grammar items, and both can evolve without migrations.

Grammar category is stored in `data_json->>'$.category'` and queried with SQLite's JSON functions.

## Decisions

- **No ORM:** bun:sqlite is used directly with typed query helpers. The schema is simple enough that an ORM adds complexity without benefit.
- **Stateless API:** Executor state is passed through from client (echoed back in submit body). Server is stateless between requests.
- **React for games, Astro for pages:** Game components need reactive state (typing, feedback flash, scaffold changes). Dashboard pages are mostly static after SSR.
- **SVG charts, no chart library:** Forgetting curve and retention map are simple enough to render as inline SVG computed from DB data.
