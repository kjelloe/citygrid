---
name: fixture-repin
description: Re-pin City Grid's founding and two-player fixtures after a deliberate change to hashed state. Use whenever a field is added to or removed from hashed state, or when a fixture test fails with hash mismatches after an intentional engine change.
---

# Re-pinning a fixture

The fixtures pin a command sequence and **every intermediate state hash**:

- `test/fixtures/empty.json` — an empty region, ticked. Slice 0.4's named gate.
- `test/fixtures/founding.json` — the singleplayer founding sequence, grown to 156 residents.
- `test/fixtures/two_player.json` — two seats in two districts; each builds on their own land, and
  the bulldoze of a neighbour's road is pinned as `notOwner`. *(The request lifecycle joins it with
  slice 5.3; the ownership half is here and in the permission matrix in `test/build.test.js`.)*

Each fixture also carries an `expect` block — the floor below which it is not worth measuring —
because a fixture that pins the hashes of a city that never grew pins nothing and looks exactly
like one that works.

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

1. **Update both lists.** Hashed fields live in `writeState()` in `engine/state.js` *and* in
   `HASHED_FIELDS` in `test/fixture.test.js`. The duplication is deliberate: a hash change is
   always a conscious two-file act, and "the two lists of hashed fields agree" fails if it is not.
2. **Check the other four places** any new nested state must reach: `copyState` deep copy, the save
   migration, the snapshot projection, the lobby options record.
3. **Re-pin with a reason:**
   ```sh
   node tools/repin.mjs "<why, in one sentence>"
   node tools/repin.mjs --only founding.json "<why>"
   ```
   The reason is **required** and is written into the fixture: a fixture whose `why` says "fix
   tests" is one nobody will trust in six months. The tool prints every hash it moves, so the diff
   in the commit says what changed.

   It **aborts on event drift** unless `--events-changed` is passed with the reason. If it aborts,
   go back to question 2 above — that abort is the tool working, not an obstacle.
4. **Run the full suite twice** and the slice's gate. A re-pin that changes soak outcomes is a
   behaviour change, and belongs in the dev-log as one.
5. **Record it** in `dev-log.md`: what changed in hashed state, why, and the reason string used.

## Deep-copy check

Three separate aliasing bugs in the reference project came from a nested mutable array that
`copyState` shared instead of copying — and a shared nested object lets a backward replay scrub
read the future. Any new nested state (request lists, contract lists, sector tables, quest state)
gets its deep copy on day one.
