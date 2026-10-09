// Many rooms in one process (X2c, slice 5.2).
//
// `server/index.js` held exactly one room until now: created at boot, addressed
// by a code the door checked, and that was enough while the only way in was a
// URL somebody was given. Hosting means a player MAKES one, and the moment a
// process holds several, three questions that did not exist before need
// answers:
//
//   - **which room a connection belongs to** — the code in its `HELLO`, which
//     is X2a's work and why that slice came first;
//   - **what stops somebody making ten thousand** — a cap, refused as
//     `RATE_LIMIT`, because the player did nothing wrong and later is the right
//     advice (the X1b distinction between "pick another seat" and "go away");
//   - **what happens to a room everybody has left** — reaped, but not the
//     instant the last socket closes: a player whose train goes into a tunnel
//     would come back to nothing, so emptiness has to last.
//
// The registry owns the rooms AND their pumps, because a room nobody is beating
// is a city that has stopped. One pump each rather than one pump for all: one
// city's stall must not become everybody's, which is what `plan.md` §3.7.6's
// "degrade the game clock, never the pump" means once there is more than one
// clock to degrade.

import { createRoom } from "./room.js";
import { createPump } from "./pump.js";
import { REFUSAL } from "../shared/protocol.js";
import { makeRoomCode, normaliseRoomCode } from "../shared/roomcode.js";
import { randomBytes } from "node:crypto";

/** How many rooms one process will hold. Not a measurement — a 48-tile room is
 * about a megabyte of state and a beat of 0.1 ms, so this is well inside what
 * the machine can do and well outside what anybody needs; it exists so that
 * "unlimited" is not the answer. */
const ROOM_LIMIT = 64;

/** How long a room with nobody in it is kept. Long enough for a reconnect, short
 * enough that an abandoned city is not still beating an hour later. */
const EMPTY_FOR_MS = 5 * 60 * 1000;

export function createRooms({
  tickMs = 100, limit = ROOM_LIMIT, emptyForMs = EMPTY_FOR_MS, heldForMs, regencyAfterMs, store,
} = {}) {
  /** code → `{ room, pump, stop, emptySince }`. */
  const held = new Map();
  /** Codes that belong to a room this process is not holding — the hibernated
   * files, listed once at boot (A143). A claim stops the MINTER, never the room
   * it belongs to: a sleeping room that wakes is given its own code explicitly
   * and must get it. */
  const claimedCodes = new Set();
  /** code → the promise that is reading it off the disk (X4f). Two players
   * typing the same code at the same moment are two `wake` calls in flight
   * before either resolves, and `add` mints a room per call — so the second
   * would register a second copy of the same city over the first and the two
   * halves of the room would never see each other's commands. */
  const waking = new Map();

  function entryFor(code) {
    return held.get(normaliseRoomCode(code));
  }

  /** A code no room in this process is using **and none asleep on the disk**.
   *
   * `createRoom` mints its own when it is given none, and nothing checked the
   * result against the registry: one in a thousand million per pair is small
   * and 64 rooms make it a two in a million, and what it does is REPLACE a live
   * room's entry in the map with a stranger's. The namespace belongs to the
   * registry, so the minting does too — and worldgen is expensive, so the retry
   * happens before the city is made rather than by making two.
   *
   * **The sleeping rooms are in it since A143.** Q165 asked whether a new room
   * could take a hibernated one's code and X4f wrote the answer down rather
   * than guarding it, because asking the DISK is a read and that would have
   * made `add` asynchronous and the door's `CREATE` branch with it. A143 chose
   * the other option: the server lists the store's codes once at boot and
   * `claimCodes` hands them here, so the door stays synchronous and a sleeping
   * city can never be overwritten by a stranger's new room. */
  function freeCode() {
    for (let tries = 0; tries < 8; tries += 1) {
      const code = makeRoomCode(randomBytes(6));
      if (!held.has(code) && !claimedCodes.has(code)) return code;
    }
    return makeRoomCode(randomBytes(6));
  }

  const registry = {
    count: () => held.size,

    /** `{ options }` for a new city or `{ save, code }` for one off the disk.
     * Answers `{ ok: true, room }` or `{ ok: false, reason }` with a refusal the
     * door can send — never a throw, because the caller is a socket and a throw
     * there is a closed connection with no reason in it. */
    add(given = {}) {
      if (held.size >= limit) return { ok: false, reason: REFUSAL.RATE_LIMIT };
      // `keep` is the process's OWN room — the one `server/index.js` boots with
      // and restores from the disk. It is nobody's host room, so an empty one
      // is not an abandoned one and the reaper leaves it alone.
      let room;
      try {
        // The registry's own windows, unless the caller named one: a gate that
        // wants a seat handed over in seconds rather than a quarter of an hour
        // passes them to `startServer` and they arrive here.
        room = createRoom({
          heldForMs, regencyAfterMs, ...given, code: normaliseRoomCode(given.code) || freeCode(),
        });
      } catch (error) {
        // A save the room cannot read: `createRoom` throws, and a player who
        // asked to host from a broken file needs a sentence rather than a
        // dropped socket — and its OWN sentence (X2d). This answered `BAD_CODE`
        // for a year's worth of slices, which tells a player to check a join
        // code they never typed.
        return { ok: false, reason: REFUSAL.BAD_SAVE, detail: String(error.message ?? error) };
      }
      const pump = createPump(room, { tickMs });
      // `emptySince` is left UNSET rather than stamped with `Date.now()`: the
      // reaper takes its clock as an argument, and a room stamped from one
      // clock and judged by another is a room that is either immortal or
      // reaped at once. The first sweep stamps it.
      held.set(room.code(), {
        room, pump, stop: undefined, emptySince: undefined, keep: given.keep === true,
      });
      return { ok: true, room, pump };
    },

    get: (code) => entryFor(code)?.room,
    pumpFor: (code) => entryFor(code)?.pump,

    /** The codes of the rooms asleep on the disk, from the server at boot
     * (A143). Normalised on the way in like every other code this project
     * reads, and anything that is not a code is dropped rather than claimed. */
    claimCodes(codes) {
      for (const code of codes ?? []) {
        const id = normaliseRoomCode(code);
        if (id) claimedCodes.add(id);
      }
      return claimedCodes.size;
    },
    claimed: (code) => claimedCodes.has(normaliseRoomCode(code)),

    /**
     * The room for a code, off the DISK if it is not in memory (X4f).
     *
     * X4d stopped an empty room's clock and the reaper then dropped the room
     * five minutes later — and dropped the city with it, as far as anybody
     * holding the code could tell: the checkpoint file stayed on the disk,
     * nothing ever opened it, and `prune` deleted it `keepForDays` later
     * unread. A player who came back to their own room was told there was no
     * such room while their city sat in a file.
     *
     * Asynchronous because a disk is, which is why the door awaits it; a held
     * room is answered from memory without touching the store, because waking
     * one that is awake would overwrite a city people are playing with
     * whatever the last checkpoint said.
     */
    async wake(code) {
      const id = normaliseRoomCode(code);
      const already = held.get(id)?.room;
      if (already) return already;
      if (!store) return undefined;
      const pending = waking.get(id);
      if (pending) return pending;
      const reading = (async () => {
        // The reap's own write may still be in the queue — `store.put` is
        // deliberately off the pump, so it is started and not awaited, and a
        // read that raced it would restore the checkpoint before the last one.
        await store.settled?.();
        const kept = await store.get(id);
        if (!kept?.save) return undefined;
        const woken = registry.add({ save: kept.save, code: kept.code || id });
        if (!woken.ok) return undefined;
        registry.start();
        return woken.room;
      })().finally(() => waking.delete(id));
      waking.set(id, reading);
      return reading;
    },

    /** One beat of one room, for a test driving the clock by hand. `at` is
     * forwarded because the room's regency window is measured against it, and a
     * caller that stamps `leave` with one clock and beats with another gets a
     * seat handed to a deputy on the first beat. */
    beat(code, elapsedMs, at) {
      const entry = entryFor(code);
      if (!entry) return undefined;
      return entry.room.beat(elapsedMs, at);
    },

    /** Starts the real clock for every room that has not got one. Rooms added
     * later start their own, so this is idempotent and cheap to call again. */
    start() {
      for (const entry of held.values()) {
        if (entry.stop === undefined) entry.stop = entry.pump.start();
      }
    },

    /** Rooms with nobody in them for longer than the grace, dropped. Returns
     * how many — a reaper that says nothing is a reaper nobody can gate on.
     *
     * `now` is an argument for the same reason the pump's clock is: a reaper
     * that read the clock itself could not be tested in a millisecond. */
    reapEmpty(now = Date.now()) {
      let reaped = 0;
      for (const [code, entry] of [...held.entries()]) {
        if (entry.keep) continue;
        const empty = entry.room.seats().length === 0;
        if (!empty) { entry.emptySince = undefined; continue; }
        if (entry.emptySince === undefined) { entry.emptySince = now; continue; }
        if (now - entry.emptySince < emptyForMs) continue;
        // **Written out before it is dropped** (X4f). The checkpoint pass is
        // three seconds behind at best and a room that stopped beating when it
        // emptied has not moved since, so this is usually the same bytes — but
        // "usually" is not a guarantee, and this is the last moment the city
        // exists in this process. Not awaited, for the reason nothing else
        // awaits the store: the reaper runs on an interval beside the pump.
        store?.put(code, { save: entry.room.save(), tick: entry.room.tick(), code });
        entry.stop?.();
        held.delete(code);
        reaped += 1;
      }
      return reaped;
    },

    /** Every room, for a checkpoint pass or a shutdown. */
    all: () => [...held.values()].map(({ room, pump }) => ({ room, pump })),

    stop() {
      for (const entry of held.values()) entry.stop?.();
      held.clear();
    },
  };
  return registry;
}
