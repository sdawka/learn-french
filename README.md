# French Learning App

A spaced repetition French learning application with adaptive scaffolding, 11 game types, and FSRS-5 scheduling algorithm.

**Live:** https://french.dawka.workers.dev

## Tech Stack

- **Framework:** Astro 4.16 (SSR)
- **Frontend:** React 18, Tailwind CSS
- **Database:** Cloudflare D1 (SQLite)
- **Deployment:** Cloudflare Workers
- **Runtime:** Bun

## Features

### Learning System
- **FSRS-5 Algorithm** — State-of-the-art spaced repetition with stability, difficulty, and retrievability tracking
- **Adaptive Scaffolding** — 4 difficulty levels per game that adjust based on performance
- **CEFR Progression** — A1→C2 level unlocking with 70% mastery threshold
- **Misconception Tracking** — Error pattern detection (orthographic, semantic, morphological, syntactic, pragmatic)

### Game Types (11)
| Game | Description |
|------|-------------|
| Translate | English→French recall with fuzzy matching |
| Cloze | Fill-in-the-blank sentences |
| Construct | Build grammatically correct sentences |
| Definition | Word↔definition matching |
| Idiomatic | Phrasal expression recognition |
| Odd One Out | Semantic discrimination |
| Context Guess | Infer meaning from passage |
| Spot Error | Grammar error identification |
| Transform | Conjugation/agreement practice |
| Dictogloss | Sentence reconstruction from memory |
| Naturalness | Pragmatic grammar selection |

### Dashboard
- Knowledge state ring (new/learning/review/mastered)
- Retention forecast (8-day forgetting curve)
- Activity heatmap (365-day calendar)
- Weak areas list with direct practice links
- Progress toward next CEFR level

## Local Development

### Prerequisites
- [Bun](https://bun.sh/) (v1.0+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (for D1)

### Setup

```bash
# Install dependencies
bun install

# Create local database
bun run d1:schema  # Apply schema

# Seed vocabulary data (optional)
bun run seed

# Start dev server
bun run dev
```

The app runs at `http://localhost:4321` with hot reload.

### Database Commands

```bash
# Apply schema to local D1
bun run d1:schema

# Export local data to SQL file
bun run migrate:export

# Import data to remote D1
bun run d1:import
```

## Deployment

### First-time Setup

1. Create D1 database:
   ```bash
   wrangler d1 create french-learning
   ```

2. Update `wrangler.toml` with your database ID

3. Apply schema to remote:
   ```bash
   wrangler d1 execute french-learning --remote --file=./migrations/schema.sql
   ```

4. Import data (if migrating):
   ```bash
   bun run migrate:export
   wrangler d1 execute french-learning --remote --file=./migrations/data.sql
   ```

### Deploy

```bash
bun run deploy
```

This builds the Astro app and deploys to Cloudflare Workers.

## Testing

### Manual Testing

```bash
# Test dashboard loads
curl -s https://french.dawka.workers.dev/ | head -100

# Test session start API
curl -s -X POST https://french.dawka.workers.dev/api/session/start \
  -H "Content-Type: application/json" \
  -d '{"subject":"vocabulary","mood":"review"}'

# Test stats API
curl -s https://french.dawka.workers.dev/api/stats

# Test answer submission
curl -s -X POST https://french.dawka.workers.dev/api/session/submit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": 1,
    "plan_id": 1,
    "item_index": 0,
    "kc_id": 81,
    "game_type": "translate",
    "answer": "merci",
    "expected": "merci",
    "hints_used": 0,
    "executor_state": {"scaffold_level": 0}
  }'
```

### Key Flows to Test

1. **Dashboard** — Stats display, progress bar, weak areas
2. **Session Start** — `/games/vocabulary?mood=review` loads game
3. **Answer Flow** — Submit correct/incorrect answers, verify feedback
4. **Scaffolding** — Consecutive wrong answers increase scaffold level
5. **Teaching Cards** — Max scaffold triggers teaching intervention
6. **Session End** — Summary displays accuracy and misconceptions

## Project Structure

```
src/
├── pages/
│   ├── index.astro          # Dashboard
│   ├── skills/
│   │   ├── vocabulary.astro # Vocabulary skill page
│   │   └── grammar.astro    # Grammar skill page
│   ├── games/
│   │   └── [game].astro     # Game page (dynamic route)
│   └── api/
│       ├── session/
│       │   ├── start.ts     # POST: Create session
│       │   ├── submit.ts    # POST: Grade answer
│       │   └── end.ts       # POST: Finalize session
│       └── stats/
│           └── index.ts     # GET: Dashboard stats
├── components/
│   ├── dashboard/           # KnowledgeStateRing, ActivityHeatmap, etc.
│   └── games/               # 11 game components + GameOrchestrator
├── lib/
│   ├── db/                  # Database abstraction (D1/SQLite)
│   ├── srs/                 # FSRS-5 scheduler
│   ├── learner-model/       # Profile and misconception tracking
│   ├── adaptation/          # Session planning and post-session
│   ├── game-engine/         # Grading, teaching cards, distractors
│   └── audit/               # Event logging
└── middleware.ts            # D1 binding injection
```

## API Reference

### POST /api/session/start
Start a new learning session.

**Body:**
```json
{
  "subject": "vocabulary" | "grammar" | "mixed",
  "mood": "review" | "challenge" | "explore"
}
```

**Response:**
```json
{
  "session_id": 1,
  "plan_id": 1,
  "total_items": 15,
  "expected_accuracy": 0.8,
  "current_item": { ... }
}
```

### POST /api/session/submit
Submit an answer and get the next item.

**Body:**
```json
{
  "session_id": 1,
  "plan_id": 1,
  "item_index": 0,
  "kc_id": 81,
  "game_type": "translate",
  "answer": "merci",
  "expected": "merci",
  "executor_state": { ... }
}
```

**Response:**
```json
{
  "grade": { "is_correct": true },
  "scaffold_update": { "changed": false },
  "next_item": { ... },
  "session_done": false
}
```

### POST /api/session/end
End session and get summary.

### GET /api/stats
Get dashboard statistics.

## License

MIT
