---
name: fixture-repin
description: Re-pin City Grid's founding and two-player fixtures after a deliberate change to hashed state. Use whenever a field is added to or removed from hashed state, or when a fixture test fails with hash mismatches after an intentional engine change.
---

# Re-pinning a fixture

> **The fixtures do not exist yet (audited 2026-08-29).** `test/fixtures/` is an empty directory
> and `tools/repin.mjs` was never written, despite slice 0.4 being marked done with
> `test/fixtures/empty.json` as its gate. Hashed fields live in **one** place —
> `writeState()` in `engine/state.js` — not the two `CLAUDE.md` describes.
>
> So the ritual below is what to do **once they are built**, and the questions in the next section
> are worth asking today regardless. Slice N15 added hashed state with no tripwire in place and
> said so in the dev-log; do the same until this note can be deleted.

The fixtures pin a command sequence and **every intermediate state hash**:

- `test/fixtures/founding.json` — the singleplayer founding sequence.
- `test/fixtures/two_player.json` — a join, a cross-border build, a demolition request, its
  approval. *(Arrives with the multiplayer lane; the ownership half of it is covered meanwhile by
  the permission matrix in `test/build.test.js`.)*

They are the project's tripwire. Re-pinning is a deliberate, recorded act, never a way to get to
green.

## Before you re-pin: is the fixture wrong, or is the reducer?

Ask in this order.

1. **Did hashed state change on purpose?** If you did not intend to change state, the reducer is
   wrong. Stop and fix it. "The hash moved unexpectedly" is the highest-value alarm this project
   has — do not silence it.
2. **Did the sequence of events change?** Event drift inside a fixture's pinned steps means the
   reducer is wrong, not the fixture. Prefer **silent state changes** for routine ticks: materiel
   loading, timers, counters and accruals should not emit events inside a fixture's window.
3. **Is this a hash-inert addition?** A new subsystem whose state is empty or absent in the default
   game hashes to nothing, and the fixture never notices. This is the cheapest way to land a whole
   feature — check whether the change can be shaped that way before re-pinning.

## The ritual

1. **Update both hash functions.** Hashed fields live in `shared/statehash.js` *and* a local copy
   in the fixture test. The duplication is deliberate: a hash change is always a conscious
   two-file act. Change them together.
2. **Check the other four places** any new nested state must reach: `copyState` deep copy, the save
   migration, the snapshot projection, the lobby options record.
3. **Re-pin with a reason:**
   ```sh
   node tools/repin.mjs "<why, in one sentence>"
   ```
   *(The tool lands with the fixture in slice 0.4's follow-up; until then, re-pin by regenerating
   the fixture and stating the reason in the commit message and the dev-log.)*
   It aborts on event drift. If it aborts, go back to question 2 above — that abort is the tool
   working, not an obstacle.
4. **Run the full suite twice** and the slice's gate. A re-pin that changes soak outcomes is a
   behaviour change, and belongs in the dev-log as one.
5. **Record it** in `dev-log.md`: what changed in hashed state, why, and the reason string used.

## Deep-copy check

Three separate aliasing bugs in the reference project came from a nested mutable array that
`copyState` shared instead of copying — and a shared nested object lets a backward replay scrub
read the future. Any new nested state (request lists, contract lists, sector tables, quest state)
gets its deep copy on day one.
