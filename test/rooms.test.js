// Many rooms in one process (X2c, slice 5.2's hosting half).
//
// Until now `server/index.js` held exactly one room, created at boot and
// addressed by a code the door checked. Hosting means a player makes one, so
// the process has to hold several — and the moment it does, three questions
// that did not exist before need answers: which room a connection belongs to,
// what stops somebody making ten thousand of them, and what happens to a room
// everybody has left.
//
// The registry is here rather than in `server/index.js` so node can ask it all
// three without a socket. It owns the rooms AND their pumps, because a room
// with nobody beating it is a city that has stopped.

import test from "node:test";
import assert from "node:assert/strict";
import { createRooms } from "../server/rooms.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../shared/roomcode.js";
import { REFUSAL, C2S, PROTOCOL_VERSION } from "../shared/protocol.js";
import { buildHash } from "../shared/build-hash.js";
import { loadSystems } from "../tools/fixtures.mjs";

await loadSystems();

const SMALL = { seed: 11, width: 48, height: 48, seats: 2 };

test("a room is created, keeps a code, and is found by it however it is typed", () => {
  const rooms = createRooms({ tickMs: 100 });
  try {
    const made = rooms.add({ options: SMALL });
    assert.equal(made.ok, true, `creating a room failed: ${made.reason}`);
    const code = made.room.code();
    assert.equal(code.length, ROOM_CODE_LENGTH);
    for (const ch of code) assert.ok(ROOM_CODE_ALPHABET.includes(ch));

    // Found however a player types it — the normalisation is the door's and the
    // registry's, not the lobby's alone (X2a).
    assert.equal(rooms.get(code), made.room);
    assert.equal(rooms.get(code.toLowerCase()), made.room);
    assert.equal(rooms.get(`${code.slice(0, 3)}-${code.slice(3)}`), made.room);
    assert.equal(rooms.get("ZZZZZZ"), undefined, "an unknown code found a room");
    assert.equal(rooms.get(""), undefined);
    assert.equal(rooms.get(undefined), undefined);
  } finally {
    rooms.stop();
  }
});

test("two rooms are two cities, and each beats on its own", () => {
  const rooms = createRooms({ tickMs: 100 });
  try {
    const a = rooms.add({ options: { ...SMALL, seed: 11 } }).room;
    const b = rooms.add({ options: { ...SMALL, seed: 22 } }).room;
    // Somebody in each: since X4d a room nobody is in does not play, and the
    // claim here is about one beat moving ONE room — which needs both of them
    // awake to mean anything.
    for (const room of [a, b]) {
      room.join({ send: () => {} }, {
        type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: room.code(),
      });
    }
    assert.notEqual(a.code(), b.code(), "two rooms share a code");
    assert.notEqual(a.hash(), b.hash(), "two seeds made one city");

    // A beat moves one room and not the other, which is what "its own pump"
    // means — one pump driving every room would be one city's stall becoming
    // everybody's.
    const before = b.tick();
    rooms.beat(a.code(), 500);
    assert.ok(a.tick() > 0, "the beaten room did not tick");
    assert.equal(b.tick(), before, "beating one room ticked another");
  } finally {
    rooms.stop();
  }
});

test("a process will not hold unlimited rooms, and says which refusal that is", () => {
  // Nothing stops a client opening a socket and asking for a room, so the cap
  // is the only thing between that and a server full of empty cities. The
  // refusal is `RATE_LIMIT` rather than `ROOM_CLOSED`: the player did nothing
  // wrong and trying later is the right advice (the X1b distinction).
  const rooms = createRooms({ tickMs: 100, limit: 3 });
  try {
    for (let n = 0; n < 3; n += 1) {
      assert.equal(rooms.add({ options: SMALL }).ok, true, `room ${n + 1} of 3 was refused`);
    }
    const full = rooms.add({ options: SMALL });
    assert.equal(full.ok, false);
    assert.equal(full.reason, REFUSAL.RATE_LIMIT);
    assert.equal(rooms.count(), 3, `${rooms.count()} rooms after a refused create`);
  } finally {
    rooms.stop();
  }
});

test("a room everybody has left is reaped, and one still being played is not", () => {
  // A room nobody is in is a pump spending a core on a city with no audience.
  // It is NOT dropped the instant the last socket closes — a player whose train
  // goes into a tunnel would come back to nothing — so emptiness has to last.
  const rooms = createRooms({ tickMs: 100, emptyForMs: 1000 });
  try {
    const quiet = rooms.add({ options: SMALL }).room;
    const busy = rooms.add({ options: SMALL }).room;
    // **Read the result of the join.** The first cut of this handed the door a
    // hello with `version: 0`, which it refused as a build mismatch — so
    // "busy" had nobody in it and the reaper took both rooms, correctly, while
    // the test blamed the reaper. A scripted city must read what came back.
    const welcomed = busy.join({ send: () => {} }, {
      type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: busy.code(),
    });
    assert.equal(welcomed, "", `the seat was refused: ${welcomed}`);
    assert.equal(busy.seats().length, 1, "nobody is in the room this test calls busy");

    // Nobody has ever joined `quiet`, and its clock says when it was made.
    assert.equal(rooms.reapEmpty(500), 0, "a room was reaped before its grace ran out");
    assert.equal(rooms.count(), 2);
    const reaped = rooms.reapEmpty(1500);
    assert.equal(reaped, 1, `${reaped} rooms reaped, expected the empty one`);
    assert.equal(rooms.get(quiet.code()), undefined, "the empty room is still there");
    assert.ok(rooms.get(busy.code()), "the room with somebody in it was reaped");

    // And a seat leaving starts the clock rather than ending the room.
    busy.leave(1);
    assert.equal(rooms.reapEmpty(1600), 0, "leaving reaped the room immediately");
    assert.equal(rooms.reapEmpty(3000), 1, "an emptied room was never reaped");
  } finally {
    rooms.stop();
  }
});

test("a room can be hosted from a save, and keeps the code it had", () => {
  const rooms = createRooms({ tickMs: 100 });
  try {
    const first = rooms.add({ options: SMALL }).room;
    rooms.beat(first.code(), 1000);
    const save = first.save();
    const code = first.code();
    const hash = first.hash();

    const second = createRooms({ tickMs: 100 });
    try {
      const back = second.add({ save, code }).room;
      assert.equal(back.code(), code, "a restored room was renamed");
      assert.equal(back.hash(), hash, "a restored room is a different city");
      assert.ok(second.get(code), "a restored room cannot be found by its code");
    } finally {
      second.stop();
    }
  } finally {
    rooms.stop();
  }
});

test("the process's own room is never reaped (X2c)", () => {
  // `server/index.js` boots with a room and restores it from the disk. It is
  // nobody's host room, so an empty one is not an abandoned one — and a reaper
  // that took it would make a restart lose the city it had just read back.
  const rooms = createRooms({ tickMs: 100, emptyForMs: 10 });
  try {
    const mine = rooms.add({ options: SMALL, keep: true }).room;
    const theirs = rooms.add({ options: SMALL }).room;
    rooms.reapEmpty(0);
    assert.equal(rooms.reapEmpty(1000), 1, "the host's empty room was not reaped");
    assert.ok(rooms.get(mine.code()), "the process's own room was reaped");
    assert.equal(rooms.get(theirs.code()), undefined);
  } finally {
    rooms.stop();
  }
});

test("a room everybody has left stops beating, and starts again when somebody comes (X4d)", () => {
  // X4: "an empty one hibernates to disk". The pump is what a room costs when
  // nobody is in it — a core spent on a city with no audience — and the reaper
  // only takes it after five minutes. Between the last socket closing and that,
  // the room should be asleep rather than busy.
  //
  // Not the same thing as the reaper: hibernation is reversible and costs
  // nothing to undo, which is why it can happen at once where dropping the room
  // has to wait.
  const rooms = createRooms({ tickMs: 100, emptyForMs: 60_000 });
  try {
    const room = rooms.add({ options: SMALL }).room;
    const code = room.code();
    room.join({ send: () => {} }, {
      type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: code,
    });
    rooms.beat(code, 1000, 1000);
    const played = room.tick();
    assert.ok(played > 0, "a room with somebody in it did not tick");

    // Everybody leaves. The room is still there — the reaper's grace has not
    // run — and it stops moving.
    // One clock throughout: `leave` stamps the regency window and the beat
    // measures against it, so stamping 0 and beating at `Date.now()` hands the
    // seat to a deputy on the first beat — and a regency is somebody, so the
    // room would never sleep.
    room.leave(1, 2000);
    rooms.beat(code, 1000, 3000);
    rooms.beat(code, 1000, 4000);
    assert.equal(room.tick(), played, "an empty room kept playing");
    assert.ok(rooms.get(code), "an empty room was dropped rather than slept");

    // And it wakes on the next arrival, with its city exactly where it was.
    room.join({ send: () => {} }, {
      type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: code, seat: 2,
    });
    rooms.beat(code, 1000, 5000);
    assert.ok(room.tick() > played, "a room nobody left did not start again");
  } finally {
    rooms.stop();
  }
});

// --- hosting a city that already exists (X2d) --------------------------------

test("a room can be hosted from a save, and it is the same city", async () => {
  // `createRoom` has taken `{ save }` since X1a — "hosting from a save is
  // §3.3's the world never pauses, seen from the other end" — and the DOOR
  // dropped the field, so the only way to host a city that already existed was
  // to boot the server with it. The registry needed nothing: it passes `given`
  // straight through, which is why this is one line at the door and a test
  // here to say the line is there.
  const first = createRooms();
  const made = first.add({ options: { seed: 77, width: 32, height: 32, seats: 2 } });
  assert.equal(made.ok, true, String(made.reason));
  const save = made.room.save();
  const hash = made.room.hash();

  const second = createRooms();
  const hosted = second.add({ save });
  assert.equal(hosted.ok, true, `hosting from a save was refused: ${hosted.reason}`);
  assert.equal(hosted.room.hash(), hash, "the hosted city is not the saved one");
  // A different code, because it is a different room: the save carries a city,
  // not a room.
  assert.notEqual(hosted.room.code(), made.room.code());
});

test("a save the room cannot read is refused in its own words", () => {
  // It answered `BAD_CODE` — "No room with that code" — which tells a player to
  // check a join code they never typed. X1b's lesson about `ROOM_FULL` for a
  // taken seat, in a second place.
  const rooms = createRooms();
  const refused = rooms.add({ save: { version: 1, nonsense: true } });
  assert.equal(refused.ok, false, "a broken save made a room");
  assert.equal(refused.reason, REFUSAL.BAD_SAVE);
  assert.ok(String(refused.detail ?? "").length > 0, "no detail for the log");
});

// --- X4f: hibernating to DISK, not only to a standstill ----------------------
//
// X4d stopped an empty room's clock, which is reversible and free. The reaper
// then DROPS it after five minutes, and until this slice that dropped the city
// with it: the file the checkpoint pass had written stayed on the disk, nothing
// ever opened it, and a player who came back to their own code was told "no
// room with that code" while their city sat there. `prune` would delete it
// `keepForDays` later, unread.
//
// A fake store rather than the disk: the registry's job is deciding WHEN, and a
// test that writes files measures the filesystem.

/** A store that remembers rather than writes. The shape is `server/store.js`'s
 * — `put`, `get`, `settled` — and nothing here may use a method the real one
 * does not have. */
function fakeStore() {
  const written = new Map();
  return {
    written,
    puts: 0,
    put(id, record) { this.puts += 1; written.set(id, record); return Promise.resolve(); },
    get: async (id) => written.get(id),
    settled: () => Promise.resolve(),
  };
}

test("a reaped room is written out before it is dropped (X4f)", async () => {
  const store = fakeStore();
  const rooms = createRooms({ tickMs: 100, emptyForMs: 1000, store });
  try {
    const room = rooms.add({ options: SMALL }).room;
    const code = room.code();
    rooms.beat(code, 1000, 1000);
    rooms.reapEmpty(0);
    assert.equal(store.puts, 0, "a room still inside its grace was written out");
    assert.equal(rooms.reapEmpty(5000), 1);
    await store.settled();

    const record = store.written.get(code);
    assert.ok(record, "the room was dropped without being written out");
    assert.equal(record.code, code, "a restored room with a new code is a different room");
    assert.equal(record.tick, room.tick());
    assert.ok(record.save, "the record carries no city");
  } finally {
    rooms.stop();
  }
});

test("and comes back, as the same city, when somebody asks for its code (X4f)", async () => {
  const store = fakeStore();
  const rooms = createRooms({ tickMs: 100, emptyForMs: 1000, store });
  try {
    const room = rooms.add({ options: SMALL }).room;
    const code = room.code();
    room.join({ send: () => {} }, {
      type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: code,
    });
    rooms.beat(code, 2000, 2000);
    const was = { tick: room.tick(), hash: room.hash() };
    assert.ok(was.tick > 0, "the room never played");
    room.leave(1, 3000);
    rooms.reapEmpty(4000);
    rooms.reapEmpty(10_000);
    assert.equal(rooms.get(code), undefined, "the room was not dropped");

    const woken = await rooms.wake(code);
    assert.ok(woken, "a code with a city on the disk was refused");
    assert.equal(woken.code(), code);
    assert.equal(woken.tick(), was.tick, "the city came back at a different hour");
    assert.equal(woken.hash(), was.hash, "the city came back as a different city");
    assert.equal(rooms.get(code), woken, "a woken room was not registered");
    assert.ok(rooms.pumpFor(code), "a woken room has no clock");
  } finally {
    rooms.stop();
  }
});

test("waking is idempotent, and a code with nothing behind it stays refused (X4f)", async () => {
  const store = fakeStore();
  const rooms = createRooms({ tickMs: 100, emptyForMs: 1000, store });
  try {
    const room = rooms.add({ options: SMALL }).room;
    const code = room.code();

    // A held room is answered from memory and never read off the disk: waking
    // one that is already awake would replace a city people are playing with
    // whatever the last checkpoint said.
    assert.equal(await rooms.wake(code), room);
    assert.equal(store.puts, 0);

    rooms.reapEmpty(0);
    rooms.reapEmpty(10_000);
    // **Two players type the code at once.** Both calls are in flight before
    // either resolves, and `add` mints a room per call — so without a guard the
    // second would register a second copy of the same city over the first, and
    // the two halves of the room would never see each other's commands.
    const [one, two] = await Promise.all([rooms.wake(code), rooms.wake(code)]);
    assert.equal(one, two, "two rooms came back for one code");
    assert.equal(rooms.count(), 1);

    assert.equal(await rooms.wake("ZZZZZZ"), undefined, "a code with no city woke something");
  } finally {
    rooms.stop();
  }
});

test("a registry with no store cannot wake, and says so by refusing (X4f)", async () => {
  // The registry is used without a store by every test above and by any caller
  // that does not want persistence; `wake` must then behave exactly as `get`
  // and not throw its way out of the door's hand.
  const rooms = createRooms({ tickMs: 100 });
  try {
    const room = rooms.add({ options: SMALL }).room;
    assert.equal(await rooms.wake(room.code()), room);
    assert.equal(await rooms.wake("ZZZZZZ"), undefined);
  } finally {
    rooms.stop();
  }
});

test("two rooms never share a code, however the dice fall (X4f)", () => {
  // `createRoom` minted its own code when it was given none and nothing held
  // the result against the registry — and `held` is a Map keyed by code, so a
  // collision REPLACES a live room with a stranger's. One in a thousand million
  // per pair is small; silently losing a city people are playing is not.
  const rooms = createRooms({ tickMs: 100, limit: 8 });
  try {
    const codes = new Set();
    for (let n = 0; n < 8; n += 1) {
      const made = rooms.add({ options: SMALL });
      assert.equal(made.ok, true, made.reason);
      codes.add(made.room.code());
    }
    assert.equal(codes.size, 8, "two rooms came back with one code");
    assert.equal(rooms.count(), 8, "a room replaced another in the registry");
    // And a code that was ASKED for is still honoured exactly: a restored room
    // keeps the code the people who were in it still have.
    rooms.stop();
    const asked = rooms.add({ options: SMALL, code: "ABC123" });
    assert.equal(asked.room.code(), "ABC123");
  } finally {
    rooms.stop();
  }
});
