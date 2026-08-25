# Ruling 012 — Campaign is post-v1, but its hooks are built with their slices

- **Date:** 2026-08-25
- **Source:** P8, answering Q12
- **Status:** ruled

## Question

Guided Campaign scenarios (`gamedesign.md` §4.1) are post-v1. Do we do anything about them now?

## Ruling

**The content is post-v1. The hooks are not.** Six hook points are built as part of the slices that
naturally own them, and each is exercised by at least one test scenario at v1 even though no
campaign exists.

| # | Hook | Built in | Exercised at v1 by |
|---|---|---|---|
| H1 | **Scenario-defined starting state** — a state delta applied after generation (pre-built infrastructure, starting treasury, pre-existing damage) | 1.1, 1.5 | The tutorial's starting region |
| H2 | **Objective evaluation** — the quest condition DSL evaluated against a scenario rather than a giver | 4.2 | Quest conditions |
| H3 | **Restrictions** — a rule set that forbids or gates commands for a scenario (no coal, no demolition, capped budget) | 1.3 permissions | Mode rules, which use the same gate |
| H4 | **Scripted events** — the event system firing on a scenario timeline rather than probabilistically | 3.1 | The tutorial's staged first fire |
| H5 | **Completion tiers** — bronze/silver/gold evaluated at an end condition | 4.2 | Scenario Co-op |
| H6 | **Region progression** — unlock state carried between scenarios | 5.5 unlocks | Room-level unlocks, same mechanism |

## Why

Every one of these six is something the engine needs anyway for tutorials, modes, quests or
Scenario Co-op. Naming them as campaign hooks costs nothing now and prevents the usual outcome,
where a campaign is bolted on afterwards through a parallel system that duplicates the quest engine.

The rule that makes it work: **a scenario must be data**, never code. If a campaign scenario would
need a new condition type, that type gets added to the closed DSL with a ruling, not scripted
inline.

## Consequences

- `data/scenarios/*.json` schema is designed at 4.2 to carry all six, even though only tutorial and
  co-op scenarios ship at v1.
- H3 shares the permission gate with ownership and modes, so a scenario restriction is refused by
  the reducer identically on every machine.
- A campaign is then a directory of scenarios plus a progression file — Wave 7 content work, not
  engine work.

## Enforced by

- `plan-v1.md` slices 1.1, 1.3, 3.1, 4.2, 5.5 and Wave 7
- `data/scenarios/` schema and its test
- `specs/gamedesign.md` §33 amendment to §22
