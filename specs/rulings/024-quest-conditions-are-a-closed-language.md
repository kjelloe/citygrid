# Ruling 024 — The quest condition language is closed

- **Date:** 2026-08-29
- **Source:** N9, implementing `gamedesign.md` §11 and `plan-v1.md`'s "quests are pure data"
- **Status:** ruled

## Question

Quests must be pure data so content can be written after v1 without touching the
engine. How does a JSON file express "when the city reaches 500 people"?

## Ruling

**A closed condition language.** A fixed vocabulary — `measure`, `variable`,
`questDone`, `all`, `any`, `not`, `always` — over a fixed list of named
measurements declared in `engine/quests.js`. No expressions, no arithmetic, no
callbacks from data.

The catalogue is **validated at load** by `validateQuests`, which refuses
unknown condition types, unknown measure names, comparisons against nothing,
choices with fewer than two options, duplicate ids, and prerequisites naming
quests that do not exist.

## Why

**Safety.** An open language in a data file is a way to run code you did not
write. Saves carry quest state, mods will carry quest files, and multiplayer
means the file might be your opponent's. A closed vocabulary cannot express
anything but a comparison.

**Checkability, which matters more day to day.** A quest referencing a measure
nobody implements is the most expensive kind of bug: it never fires, and it
looks *exactly* like a quest whose conditions the player has not met. Nobody
reports it, because nothing appears to be wrong. Validation at load turns that
into a startup error naming the file.

**Determinism.** Conditions are evaluated on both clients in multiplayer. A
language that could reach a clock, a random number or the DOM would desync.

## Consequences

- Adding a measurement is a deliberate act in `engine/quests.js` with a test.
  A quest cannot invent one. That friction is the point.
- Quest progress is hashed state, and the lists inside it are kept **sorted** —
  active quests by id, completed by id, variables by name — so canonical
  serialisation never depends on the order things happened to be added.
- A quest with choices does not complete until a choice is made: the player is
  the objective.
- `test/quests.test.js` checks the authored catalogue is valid, that every quest
  is reachable from the start by walking the prerequisite graph, and that the
  tutorial chain actually covers what §24 needs a first-time player to do.

## Enforced by

- `engine/quests.js` — `evaluate`, `MEASURES`, `validateQuests`
- `client/content.js` — validation at boot
- `test/quests.test.js`
