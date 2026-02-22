# Pedagogy Engine — Design Decisions

## Core Principle: The Plan-Execute-Adapt Loop

Every session follows:
```
[Learner Model] → [Session Planner] → [Game Engine] → [Audit Log] → [Adaptation]
```

Decisions are made _before_ the session (what to study), _during_ (how hard), and _after_ (what changed).

---

## Spaced Repetition: FSRS-5

**Why FSRS-5 over SM-2:** FSRS tracks three continuous parameters per item — stability (S), difficulty (D), and retrievability (R) — rather than SM-2's step-based interval system. This allows:
- Precise scheduling against a target retention rate (default: 90%)
- Per-item forgetting curves rather than fixed step intervals
- Empirically superior retention on open datasets

**Key formula:**
```
R(t) = e^(ln(0.9) × t/S)
```
Retention at time `t` days given stability `S`. Next interval computed by inverting: `I = -S × ln(0.9) / ln(2)`.

**Grades:** again=1, hard=2, good=3, easy=4 → mapped from session accuracy per KC.

---

## Session Targeting: ~80% Predicted Accuracy

**Rationale (Bjork's Desirable Difficulties + Vygotsky's ZPD):**
- >95% accuracy = too easy → minimal long-term retention gain
- <60% accuracy = too hard → frustration, learning breaks down
- ~80% = optimal challenge zone; maximises retention per unit time

**Implementation:** `session-planner.ts` sorts due items by retrievability ascending, selects items whose average predicted R lands near 0.80. Mood modifiers shift the target: `challenge` adds 0.15 bias (harder), `review` subtracts 0.10 (easier).

---

## Scaffolding: 4-Level Adaptive System

Each game type has 4 scaffold levels (0=hardest → 3=easiest). Scaffold adjusts _live_ during a session:

| Trigger | Action |
|---|---|
| 3 consecutive wrong | +1 scaffold level (easier) |
| 3 consecutive right | -1 scaffold level (harder) |
| scaffold hits level 3 | Teaching card inserted |

**Why 3-streak threshold?** Single responses are noisy (lucky guess, careless error). A 3-item streak reduces false positives by ~87% compared to single-response triggers.

**Teaching mode:** When scaffold maxes out, a worked example fires _before_ re-attempting the same item. This implements the "study-then-practice" sequence from Sweller's Cognitive Load Theory — reducing extraneous load before asking for productive engagement.

---

## Error Classification (5 Types)

Errors are classified at grading time:

| Type | Meaning | Example |
|---|---|---|
| `orthographic` | Spelling/accent error | "etudiant" → "étudiant" |
| `semantic` | Wrong meaning | translating _chat_ as "chatter" |
| `morphological` | Wrong form of correct word | "mange" → "mangé" |
| `syntactic` | Word order or structure error | "je pas comprends" |
| `pragmatic` | Correct but contextually wrong | using _tu_ in formal writing |

Two errors of the same type → check misconception register → potentially named misconception detected.

---

## Misconception Register

Named misconceptions fire a teaching card with a specific pedagogical intervention:

| Misconception | Error Type | Intervention |
|---|---|---|
| avoir/être movement verb confusion | morphological | Show être-verb list + mnemonic |
| Present overextension to habitual past | syntactic | Timeline diagram: habitual past → imparfait |
| Elision omission | orthographic | Show elision rule explicitly |
| Adjective gender agreement | morphological | Show masculine/feminine pattern table |
| False cognate confusion | semantic | Show false cognate comparison |
| Subjunctive trigger missed | syntactic | Show trigger verb list |

---

## Proficiency Estimation (CEFR 0.0–6.0)

Proficiency is a continuous score, not a discrete level:
- `0.0–1.0` = A1, `1.0–2.0` = A2, `2.0–3.0` = B1, etc.
- Updates after each session using exponential moving average (α=0.1) — gradual drift
- Vocabulary: single score; Grammar: per-category scores

**KC Prerequisite Gate:** Scheduling is gated by the prerequisite graph. A KC will not appear in session plans until all its prerequisites have reached `review` or `mastered` state in `srs_cards`.

---

## Style Weights

The session planner weights game type selection by `style_weights` in the learner profile. These update after each session based on accuracy per game type (engagement signal). This is a lightweight collaborative-filtering proxy — games where the learner succeeds more get slightly higher selection weight.

This is intentionally conservative: weights drift slowly (5% per session) to avoid locking a learner into a narrow game mix.
