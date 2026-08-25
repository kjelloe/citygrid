# Ruling 007 — Balance starts from the reference, then is tuned by sweep

- **Date:** 2026-08-25
- **Source:** P6, answering questionnaire item Q9
- **Status:** ruled

## Question

Do difficulty and balance constants start from the values catalogued in `specs/referencedata.md`
§13, or are they designed fresh?

## Ruling

**Start from the reference constants and tune by sweep.** They enter `data/balance.json` labelled
`era 0, untuned`. They are a starting point for measurement, never a shipped balance.

Every value that survives to release names the **era** and the **commit** whose sweep measured it.

## Why

The reference numbers are a working, shipped balance for a game whose loop is recognisably related,
which is worth far more than a blank sheet. But they were tuned for a 120×100 map, a different
demand model, a broken traffic router, and no multiplayer at all. Treating them as authoritative
would import a balance for a game we are not building.

Labelling them `era 0` makes the distinction structural rather than remembered: nobody can later
mistake an inherited constant for a measured one.

## Consequences

- **Never tune on five seeds.** Five seeds tell you a system fires; 200+ games tell you what is
  fair. This is the single most expensive lesson in `../Fireline`'s log and it transfers directly.
- Balance work is era-disciplined: numbers from a previous era are void, not "roughly comparable",
  and multiplayer rows never mix into singleplayer baselines.
- The first balance era is pinned at the end of Wave 3, with a report in `reports/`.
- Telemetry from real play (`/metrics`) complements sweeps: sweeps say what the AI mayors do,
  telemetry says what people do, and it must record abandoned rooms and rage-quits, not only
  successes.

## Enforced by

- `specs/plan.md` §8 provenance note, §11 era discipline
- `plan-v1.md` ruling 6, slices 2.3 and 3.4, Wave 3 gate
- `data/balance.json` era labels (from slice 2.3)
