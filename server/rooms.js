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
import { normaliseRoomCode } from "../shared/roomcode.js";

/** How many rooms one process will hold. Not a measurement — a 48-tile room is
 * about a megabyte of state and a beat of 0.1 ms, so this is well inside what
 * the machine can do and well outside what anybody needs; it exists so that
 * "unlimited" is not the answer. */
const ROOM_LIMIT = 64;

/** How long a room with nobody in it is kept. Long enough for a reconnect, short
 * enough that an abandoned city is not still beating an hour later. */
const EMPTY_FOR_MS = 5 * 60 * 1000;

export function createRooms({
  tickMs = 100, limit = ROOM_LIMIT, emptyForMs = EMPTY_FOR_MS, heldForMs, regencyAfterMs,
} = {}) {
  /** code → `{ room, pump, stop, emptySince }`. */
  const held = new Map();

  function entryFor(code) {
    return held.get(normaliseRoomCode(code));
  }

  return {
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
        room = createRoom({ heldForMs, regencyAfterMs, ...given });
      } catch (error) {
        // A save the room cannot read: `createRoom` throws, and a player who
        // asked to host from a broken file needs a sentence rather than a
        // dropped socket.
        return { ok: false, reason: REFUSAL.BAD_CODE, detail: String(error.message ?? error) };
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
}
