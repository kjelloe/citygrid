# Ruling 010 — The advisor is cheerful; personas are a data axis from day one

- **Date:** 2026-08-25
- **Source:** P8, answering Q2
- **Status:** ruled

## Question

What is the advisor's tone, and how much personality is too much for a voice heard on every
tutorial step for hours?

## Ruling

**Default persona `sunny`: happy, cheerful, overly optimistic.** Relentlessly positive about a
city that is on fire, which is where the gentle satire lives.

**Alternate personas are planned for later** — `dry` (British, sarcastic) and `strict` (German,
exacting) — and dialogue is therefore keyed by persona **from the first line written**.

## Why

The tone matches the design's stated register: optimistic, witty, gently satirical, welcoming
rather than cynical. An over-optimistic advisor is also mechanically useful — the gap between what
they say and what the overlays show is a joke the simulation tells for free.

Personas are ruled now, before any dialogue exists, because it is the difference between a data
axis and a rewrite. A persona pack added later to flat strings means re-authoring every line and
re-testing every quest.

## Consequences

- Dialogue lives at `data/dialogue/{persona}/{locale}.json`. `sunny` is the only complete pack at
  v1; the others may exist partially and **fall back to `sunny` per key**, never to a missing
  string.
- Persona is a **client-side display preference**, not game state — it must never reach the reducer
  or the state hash, so two players in one room can hear different advisors.
- Persona × locale is a product, not a sum: personality does not survive literal translation, so
  each pack is authored per locale rather than translated (ruling 008).
- **Alternates are a cosmetic unlock earned by mayor rank** (P9). This fits the existing
  constraints without strain: mayor rank already persists in the local profile as recognition and
  never gates a building (`gamedesign.md` §27.2), and persona is already a client display
  preference that never reaches game state. So the unlock is profile-local too — two players in one
  room can hear different advisors, and one of them has earned theirs.
- Which rank unlocks which persona is Q18, still open.

## Enforced by

- `data/dialogue/sunny/{en,no}.json`
- `test/dialogue.test.js` — every quest and advisory key resolves in every persona pack via fallback
- `test/purity.test.js` — persona must not appear in hashed state
