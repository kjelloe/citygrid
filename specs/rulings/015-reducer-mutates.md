# Ruling 015 — `apply()` mutates; snapshots are the caller's job

- **Date:** 2026-08-25
- **Source:** slice 0.3, a measurement rather than a prompt
- **Status:** ruled

## Question

The reference stack's reducer is `apply(state, command) → state`, returning a new state. Does City
Grid copy the whole state per command?

## Ruling

**`apply()` mutates the state it is given** and returns a result envelope
`{result, events}`. Callers that need a snapshot call `copyState` first.

## Why

Measured against the cadence rather than argued: a whole-state copy is roughly 300 KB at 128×128,
and at sixteen fast ticks a second that is five megabytes a second of memcpy achieving nothing.

Determinism — the property the pure-copy form exists to protect — is unaffected. Same state, same
command, same outcome, always. And the guarantee that the pure form was really buying, all-or-
nothing placement, already comes from the transactional staging buffer, which stages writes and
commits or discards them without copying the world.

## Consequences

- `copyState` still exists, is still a full deep copy, and is what snapshots, undo and the
  multiplayer join path use. It is tested by a walk that asserts every nested array is a distinct
  object, so a new nested field fails there rather than becoming the fourth aliasing bug.
- **Events are returned, not stored.** Storing them in state would grow hashed state without bound
  over a persistent room's lifetime (ruling 002).
- A caller that keeps a reference to state and expects it to be frozen is wrong, and the reducer
  test asserts the bargain from the other side: a snapshot taken with `copyState` does not move
  when the state is ticked fifty more times.

## Enforced by

- `engine/reducer.js` header comment
- `test/reducer.test.js` — "copyState gives a snapshot the reducer cannot reach back into"
- `test/state.test.js` — the deep-copy walk
