// One room, two clients, one city (X1, slice 5.1 — the headless half).
//
// No sockets here: the pump takes its clock as an argument and the room takes
// its connections as objects with a `send`, so a whole room runs in node in
// milliseconds. The socket is `server/index.js`'s business and `room_soak`'s;
// what is asserted here is the part that must be true before a wire is worth
// having — **one order, one hash**.
//
// plan.md §3.2: commands cross the wire, not state. Every client applies the
// same accepted commands in `(tick, seq)` order and compares hashes; a room is
// right when a client that joined late and a client that was there from the
// start end up on the same number.

import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, TICKS_PER_SECOND } from "../server/room.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createPump, costDigest } from "../server/pump.js";
import { createSimHost } from "../worker/sim-host.js";
import { createMirror, applyPatch } from "../client/mirror.js";
import { hashState } from "../engine/state.js";
import { CMD_PLACE_ROAD, CMD_SET_TAX } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { RESULT, C2S, S2C, REFUSAL, PROTOCOL_VERSION } from "../shared/protocol.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, formatRoomCode } from "../shared/roomcode.js";
import { buildHash, setBuildHash } from "../shared/build-hash.js";
import { PLAYER_ACTIVE, PLAYER_REGENT, PLAYER_GONE } from "../engine/constants.js";

/** A seat's status in the room's own city. */
const seatStatus = (room, seat) => room.state.players.find((p) => p.seat === seat)?.status;
import { loadSystems, readFixture, fixtureNames } from "../tools/fixtures.mjs";

await loadSystems();

const OPTIONS = { seed: 31, width: 48, height: 48, seats: 2 };

/** A road the city will actually accept, found by ASKING it rather than by
 * remembering a tile: three of the first four coordinates picked by hand on this
 * seed were water or rock, and a test whose subject is "two commands interleave"
 * must not fail because one of them was refused for a reason of its own. */
function road(room, actor, row, length = 8) {
  const state = room.state;
  const W = state.width;
  for (let z = row; z < state.height - 2; z += 1) {
    for (let x = 2; x + length < W - 2; x += 1) {
      const cells = Array.from({ length }, (unused, i) => z * W + x + i);
      const clear = cells.every((i) => state.tiles.terrain[i] !== 3 && state.tiles.terrain[i] !== 4
        && state.tiles.road[i] === 0 && state.tiles.buildingId[i] === 0);
      if (clear) return { type: CMD_PLACE_ROAD, actor, runs: encodeRuns(cells) };
    }
  }
  throw new Error("no dry ground on this map");
}

/** A connection the room can talk to, which in a test is an array. */
function wire(name = "client") {
  const sent = [];
  return {
    name,
    sent,
    send: (message) => sent.push(message),
    of: (type) => sent.filter((m) => m.type === type),
    last: (type) => [...sent].reverse().find((m) => m.type === type),
  };
}

/** A client the way a real one works: its own simulation, fed only by frames. */
function client(welcome) {
  const host = createSimHost();
  const self = {
    host,
    mirror: undefined,
    hash: () => hashState(self.mirror),
    /** A resync is a re-join: the reducer starts again from the city as bytes.
     * Healing the mirror alone is undone by the next frame this host produces
     * (`server/room.js`'s `resync` says why, and `room_soak` is what found
     * it). */
    restart(save) {
      const ready = host.handle({ type: "init", id: 0, save }).reply;
      assert.equal(ready.type, "ready", `a client could not start: ${ready.reason}`);
      self.mirror = createMirror(ready.patch);
    },
    /** A command only this client applies — a divergence on purpose. */
    diverge(command) {
      const { reply } = host.handle({ type: "apply", id: 99, command });
      applyPatch(self.mirror, reply.patch);
    },
    /** Everything a frame says, in the order it says it. */
    play(frame) {
      for (const entry of frame.cmds) {
        const { reply } = host.handle({ type: "apply", id: 1, command: entry.command });
        applyPatch(self.mirror, reply.patch);
      }
      if (frame.ticks > 0) {
        const { reply } = host.handle({ type: "tick", id: 2, count: frame.ticks });
        applyPatch(self.mirror, reply.patch);
      }
    },
  };
  self.restart(welcome.save);
  return self;
}

function joined(room, name, seat) {
  const connection = wire(name);
  const refusal = room.join(connection, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat, room: room.code(),
  });
  assert.equal(refusal, "", `${name} was refused: ${refusal}`);
  return { connection, welcome: connection.last(S2C.WELCOME) };
}

test("a room welcomes a client with a seat and the city as it stands", () => {
  const room = createRoom({ options: OPTIONS });
  const { welcome } = joined(room, "one", 1);
  assert.equal(welcome.seat, 1);
  assert.ok(welcome.token.length > 0, "a seat with no token cannot reconnect");
  assert.ok(welcome.save, "nothing to start from");
  assert.equal(client(welcome).hash(), room.hash(), "the joiner starts on a different city");
});

test("a client on a different build is refused, with the reason", () => {
  // The default failure after every deploy (plan.md §3.9): a cached client meets
  // an updated room. It is told to reload rather than allowed to diverge.
  //
  // The room is given a REAL build hash first, because a `dev` build on either
  // side talks to anything — which is the documented escape for a developer
  // whose client and server are rebuilt at different moments, and which would
  // otherwise make this test pass for the wrong reason.
  const was = buildHash();
  setBuildHash("feedfacefeed");
  const room = createRoom({ options: OPTIONS });
  const connection = wire("stale");
  const refusal = room.join(connection, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: "0123456789ab", seat: 1, room: room.code(),
  });
  setBuildHash(was);
  assert.equal(refusal, REFUSAL.BUILD_MISMATCH);
  assert.equal(connection.last(S2C.REFUSED)?.reason, REFUSAL.BUILD_MISMATCH);
  assert.equal(connection.of(S2C.WELCOME).length, 0, "a refused client was welcomed anyway");
});

test("two clients' commands interleave into one order, and everybody ends on one hash", () => {
  const room = createRoom({ options: OPTIONS });
  const pump = createPump(room, { tickMs: 100 });
  const a = joined(room, "a", 1);
  const b = joined(room, "b", 2);
  const ca = client(a.welcome);
  const cb = client(b.welcome);

  // Both seats act between two pumps, which is the case the ordering exists for.
  room.submit(1, road(room, 1, 6));
  room.submit(2, road(room, 2, 16));
  room.submit(1, { type: CMD_SET_TAX, actor: 1, rate: 9 });
  pump.step(100);

  const frame = a.connection.last(S2C.FRAME);
  assert.deepEqual(frame, b.connection.last(S2C.FRAME), "the two clients got different frames");
  // Five: the two seats ARRIVING and the three things they did. A join is a
  // command — it adds a player and touches a hashed field — so it rides the
  // frame like anything else, and every client applies it in the same order.
  assert.equal(frame.cmds.length, 5, frame.cmds.map((c) => c.command.type).join(", "));
  assert.deepEqual(frame.cmds.map((c) => c.seq), [1, 2, 3, 4, 5], "the sequence is not a sequence");
  assert.deepEqual(frame.cmds.slice(0, 2).map((c) => c.command.type), ["join", "join"]);
  for (const entry of frame.cmds) assert.equal(entry.result, RESULT.OK, entry.command.type);

  ca.play(frame);
  cb.play(frame);
  assert.equal(ca.hash(), room.hash(), "client a is not the room");
  assert.equal(cb.hash(), room.hash(), "client b is not the room");
});

test("a refused command is in the frame and changes nobody", () => {
  // Speed 0: the room's clock is deliberate here, because a tick changes the
  // city on its own and this is a test about a command that must not.
  const room = createRoom({ options: OPTIONS, speed: 0 });
  const pump = createPump(room, { tickMs: 100 });
  const a = joined(room, "a", 1);
  const ca = client(a.welcome);
  pump.step(50);
  ca.play(a.connection.last(S2C.FRAME));
  const before = room.hash();

  // A seat that exists cannot build on another seat's ground, and a seat that
  // does not exist cannot build at all — the rejection is identical on both
  // sides, so the client plays the frame and stays level with the room.
  room.submit(1, { type: CMD_PLACE_ROAD, actor: 9, runs: encodeRuns([100]) });
  pump.step(100);

  const frame = a.connection.last(S2C.FRAME);
  // One: the seat's arrival went out in the first beat, so this frame is the
  // refusal alone — which still rides a frame, because a client that never
  // heard about it would be one command ahead of the room for ever.
  assert.equal(frame.cmds.length, 1, frame.cmds.map((c) => c.command.type).join(", "));
  assert.notEqual(frame.cmds[0].result, RESULT.OK);
  assert.equal(room.hash(), before, "a refusal changed the room");
  ca.play(frame);
  assert.equal(ca.hash(), room.hash());
});

test("the clock is the room's, and it runs at the GAME's speed (X1d)", () => {
  // Speed 1 is two fast ticks **a second** (plan.md §3.6: one sim-month every
  // six seconds); the speeds are a table, not a multiplier, which is why the
  // frame carries the COUNT rather than the speed.
  //
  // **This test used to assert 24 ticks in 1.2 seconds** — 20 a second — above a
  // comment saying two a second, because the table was applied per BEAT and a
  // beat is 100 ms. Singleplayer's play speed is one tick every 400 ms, so a
  // room aged a city eight times faster than one machine, and `room_smoke`
  // measured it the moment a browser could join: 19.9 ticks a second. What is
  // asserted now is the RATE, which is the thing that was wrong — a count is
  // only a rate if you also say over how long.
  const room = createRoom({ options: OPTIONS, speed: 1 });
  const pump = createPump(room, { tickMs: 100 });
  const a = joined(room, "a", 1);
  const ca = client(a.welcome);
  for (let n = 1; n <= 12; n += 1) pump.step(n * 100);
  const frames = a.connection.of(S2C.FRAME);
  assert.equal(frames.length, 12);
  for (const frame of frames) ca.play(frame);
  assert.equal(room.tick(), 2, `1.2 s at two ticks a second is 2, not ${room.tick()}`);
  assert.equal(ca.hash(), room.hash(), "the client's clock drifted from the room's");

  // Twice the wall time is twice the ticks, and the remainder is CARRIED rather
  // than dropped: 12 more beats take it to 4, not to 3 and a lost 0.4.
  for (let n = 13; n <= 24; n += 1) pump.step(n * 100);
  assert.equal(room.tick(), 4, `2.4 s is 4 ticks, not ${room.tick()} — the credit was dropped`);

  // And a faster room is faster by the ratio in the table, not by a beat count.
  // Both rooms need somebody in them: since X4d a room nobody is in does not
  // play, and two sleeping rooms would compare equal for the wrong reason.
  const fast = createRoom({ options: OPTIONS, speed: 3 });
  const fastPump = createPump(fast, { tickMs: 100 });
  joined(fast, "f", 1);
  for (let n = 1; n <= 12; n += 1) fastPump.step(n * 100);
  assert.equal(fast.tick(), 19, `1.2 s at sixteen ticks a second is 19, not ${fast.tick()}`);
});

test("a late joiner catches up to a client that was there from the start", () => {
  // §3.3: the world never pauses for a joiner. The snapshot is a tick, and the
  // frames after it are the rest — which is the whole of "drop-in".
  const room = createRoom({ options: OPTIONS, speed: 1 });
  const pump = createPump(room, { tickMs: 100 });
  const a = joined(room, "a", 1);
  const early = client(a.welcome);
  room.submit(1, road(room, 1, 6, 10));
  pump.step(100);
  early.play(a.connection.last(S2C.FRAME));
  pump.step(200);
  early.play(a.connection.last(S2C.FRAME));

  const b = joined(room, "b", 2);
  const late = client(b.welcome);
  assert.equal(late.hash(), room.hash(), "the snapshot was not the room");

  room.submit(2, road(room, 2, 20, 6));
  pump.step(300);
  early.play(a.connection.last(S2C.FRAME));
  late.play(b.connection.last(S2C.FRAME));
  assert.equal(early.hash(), room.hash());
  assert.equal(late.hash(), early.hash(), "the late joiner is playing a different city");
});

test("a client that has diverged is found at the month and resynced", () => {
  // The loudest alarm in the project (CLAUDE.md), on the cadence plan §3.7.9
  // asks for: the room's hash rides a frame once a sim-month, the client
  // compares, and a mismatch is a snapshot rather than a silence.
  //
  // **Sixty beats, because the subject is a MONTH.** A sim-month is twelve ticks
  // and speed 1 is two a second (X1d), so a whole month at the play speed is
  // six seconds of beats and the sixtieth lands exactly on the boundary. That
  // exactness matters: the monthly hash is the city AT the frame that carried
  // it, so a run that stops after the boundary is comparing two different
  // moments, which is how this read as a divergence on X1d's first run.
  const room = createRoom({ options: OPTIONS, speed: 1 });
  const pump = createPump(room, { tickMs: 100 });
  const a = joined(room, "a", 1);
  const ca = client(a.welcome);

  for (let n = 1; n <= 60; n += 1) {
    pump.step(n * 100);
    ca.play(a.connection.last(S2C.FRAME));
  }
  const monthly = a.connection.of(S2C.FRAME).filter((f) => f.hash !== undefined);
  assert.ok(monthly.length >= 1, "no frame carried a hash in a whole sim-month");
  assert.equal(monthly[monthly.length - 1].hash, room.hash());

  // Diverge the client's SIMULATION on purpose — a road only it has — and ask
  // the room for the truth. Editing the mirror instead would prove nothing:
  // the next frame's patch overwrites it, which is how the first cut of
  // `room_soak`'s resync block passed without a resync happening at all.
  ca.diverge(road(room, 1, 30, 6));
  assert.notEqual(ca.hash(), room.hash());
  const snapshot = room.resync(a.connection, 1);
  ca.restart(snapshot.save);
  assert.equal(ca.hash(), room.hash(), "a resync did not put the client back");

  // And stays back: the client's reducer is the thing that was wrong, so the
  // test is the month AFTER the snapshot, not the instant of it.
  for (let n = 61; n <= 120; n += 1) {
    pump.step(n * 100);
    ca.play(a.connection.last(S2C.FRAME));
  }
  assert.equal(ca.hash(), room.hash(), "a resynced client diverged again at the next month");
});

test("a seat that is taken is refused as TAKEN, and a full room as full (X1b)", () => {
  // Two different refusals, because they tell the player to do two different
  // things: pick another seat, or go away. `join` answered `ROOM_FULL` for
  // both, so a room with three seats free told a player it was full.
  const room = createRoom({ options: { ...OPTIONS, seats: 2 } });
  joined(room, "a", 1);
  const sameSeat = wire("b");
  assert.equal(room.join(sameSeat, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 1, room: room.code(),
  }), REFUSAL.SEAT_TAKEN);
  assert.equal(sameSeat.last(S2C.REFUSED)?.reason, REFUSAL.SEAT_TAKEN);

  // The second seat is free, so this one is let in — and then the room IS full.
  joined(room, "b", 2);
  const third = wire("c");
  assert.equal(room.join(third, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 3, room: room.code(),
  }), REFUSAL.ROOM_FULL);
  assert.equal(third.last(S2C.REFUSED)?.reason, REFUSAL.ROOM_FULL);
});

test("the pump records its own jitter, and says nothing until it has enough", () => {
  // Fireline's `jitterDigest`, adapted: the number that says whether the room
  // kept its beat. Null below ten samples, because four gaps are an anecdote.
  const room = createRoom({ options: OPTIONS });
  const pump = createPump(room, { tickMs: 100 });
  assert.equal(pump.jitter(), undefined);
  for (let n = 1; n <= 20; n += 1) pump.step(n * 100);
  const jitter = pump.jitter();
  assert.equal(jitter.expectedMs, 100);
  assert.equal(jitter.p50Ms, 100);
  assert.equal(jitter.latePct, 0);
  // A pump that slept through three beats is late, and says so.
  for (let n = 1; n <= 10; n += 1) pump.step(2000 + n * 400);
  assert.ok(pump.jitter().latePct > 0, "a 400 ms gap on a 100 ms pump is not late");
});

// --- the fixtures, through a room --------------------------------------------

const names = await fixtureNames();

for (const name of names) {
  test(`fixture ${name} replays through a room against its pinned hashes`, async (t) => {
    const fixture = await readFixture(name);
    if (fixture.generate === false) return t.skip("not a generated world");
    const room = createRoom({ options: fixture.options, speed: 0 });
    const pump = createPump(room, { tickMs: 100 });
    const problems = [];
    let at = 0;
    for (let i = 0; i < fixture.steps.length; i += 1) {
      const step = fixture.steps[i];
      for (let n = 0; n < (step.repeat ?? 1); n += 1) room.submit(step.command.actor ?? 1, { ...step.command });
      at += 100;
      pump.step(at);
      const hash = room.hash();
      if (step.hash !== undefined && step.hash !== hash) {
        problems.push(`${name} step ${i} (${step.command.type}): hash ${hash}, pinned ${step.hash}`);
        break;
      }
    }
    assert.deepEqual(problems, [], `\n  ${problems.join("\n  ")}`);
  });
}

test("a room can be hosted from a save, and that is how a restart resumes (X1)", () => {
  // The branch existed and returned a room with NO CITY in it: `{ok: true,
  // state: undefined}`. Nothing called it, so nothing said so — and the store
  // was writing a checkpoint every thirty beats that nobody ever opened, which
  // made "a room persists so a restart resumes it" true of the writing half
  // only.
  const first = createRoom({ options: OPTIONS, speed: 1 });
  const a = joined(first, "a", 1);
  first.submit(1, road(first, 1, 6));
  // `beat(100)` — a beat with the time it took. Since X1d the ticks are owed
  // per second, so a beat told nothing about the clock owes nothing, and this
  // read `tick > 0` on a room that had never been given a millisecond.
  first.beat(100);
  for (let n = 0; n < 60; n += 1) first.beat(100);
  const tick = first.tick();
  const hash = first.hash();
  assert.ok(tick > 0 && a.welcome !== undefined);

  const resumed = createRoom({ save: first.save(), speed: 1 });
  assert.equal(resumed.tick(), tick, "the resumed room is at a different hour");
  assert.equal(resumed.hash(), hash, "the resumed room is a different city");
  // And it plays on: a seat rejoins without being treated as a new player,
  // because `CMD_JOIN` reclaims a seat the save already holds.
  const back = joined(resumed, "a again", 1);
  // 500 ms, which is exactly one tick at two a second (X1d) — a beat told
  // nothing about the clock owes nothing, and this asserted the clock started.
  resumed.beat(500);
  assert.equal(back.welcome.tick, tick);
  assert.ok(resumed.tick() > tick, "the resumed room's clock never started");
});

test("a save the room cannot read is a refusal, not a room with no city", () => {
  assert.throws(() => createRoom({ save: { v: 99, nonsense: true } }), /could not start/);
  assert.throws(() => createRoom({ save: {} }), /could not start/);
});

test("the seats a room holds are the ones it welcomed, with distinct tokens", () => {
  // `seats()` is what X2's ROSTER is built from and it had no reader at all.
  const room = createRoom({ options: OPTIONS });
  joined(room, "a", 1);
  joined(room, "b", 2);
  const seats = room.seats();
  assert.deepEqual(seats.map((s) => s.seat).sort(), [1, 2]);
  assert.equal(new Set(seats.map((s) => s.token)).size, 2, "two seats share one token");
  room.leave(1);
  assert.deepEqual(room.seats().map((s) => s.seat), [2]);
});

// --- the door asks which room (X2a, slice 5.2's headless half) --------------

test("a room has a join code, and it is one a player could read out", () => {
  const room = createRoom({ options: OPTIONS });
  const code = room.code();
  assert.equal(code.length, ROOM_CODE_LENGTH);
  for (const ch of code) assert.ok(ROOM_CODE_ALPHABET.includes(ch), `${ch} is not in the alphabet`);
  // Two rooms in one process are two codes, or a code addresses nothing.
  const codes = new Set();
  for (let i = 0; i < 20; i += 1) codes.add(createRoom({ options: OPTIONS }).code());
  assert.ok(codes.size >= 19, `20 rooms produced ${codes.size} codes`);
  // A room told its code keeps it — the store's key and the lobby's field are
  // the same string, so a restored room is still the room people have.
  assert.equal(createRoom({ options: OPTIONS, code: "ABC123" }).code(), "ABC123");
});

test("a hello that names another room is refused BAD_CODE, and not welcomed", () => {
  const room = createRoom({ options: OPTIONS, code: "ABC123" });
  const connection = wire("wrong");
  const refusal = room.join(connection, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 1, room: "ZZZZZZ",
  });
  assert.equal(refusal, REFUSAL.BAD_CODE);
  assert.equal(connection.last(S2C.REFUSED)?.reason, REFUSAL.BAD_CODE);
  assert.equal(connection.of(S2C.WELCOME).length, 0, "a client with the wrong code was let in");
  // **And a hello with no room at all.** Before X2a the door asked nothing, so
  // anybody who found the socket was in the city; a client that cannot name the
  // room it means is a client that has not been given one.
  const silent = wire("silent");
  assert.equal(room.join(silent, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 1,
  }), REFUSAL.BAD_CODE);
  assert.equal(silent.of(S2C.WELCOME).length, 0, "a client that named no room was let in");
});

test("the code is normalised at the door, not only in the lobby", () => {
  // A player reads `ABC-123` off a screen and types `abc 123`. The
  // normalisation has to happen where the decision is made, or the lobby is the
  // only thing that can ever open a door and every other client is a bug
  // report. (`shared/`, because both ends need it — the ruling-003 shape.)
  // `heldForMs: 0` — this test leaves and rejoins seat 1 five times and its
  // subject is the CODE, not X4a's hold. Without it the second attempt is
  // refused `SEAT_TAKEN` by a rule that is working correctly.
  const room = createRoom({ options: OPTIONS, code: "ABC123", heldForMs: 0 });
  for (const typed of ["ABC123", "abc123", formatRoomCode("ABC123"), "abc 123", "ABC-123"]) {
    const connection = wire(`typed ${typed}`);
    const refusal = room.join(connection, {
      type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 1, room: typed,
    });
    assert.equal(refusal, "", `"${typed}" was refused: ${refusal}`);
    assert.equal(connection.last(S2C.WELCOME)?.room, "ABC123", "the welcome does not name the room");
    room.leave(1);
  }
});

test("a malformed hello is told it is malformed, not that the code is wrong", () => {
  // X1b's finding, one door along: `ROOM_FULL` for a taken seat told the player
  // to go away when the answer was "pick another seat". `BAD_CODE` for a
  // message that is not a hello tells them to check a code they typed
  // correctly, when what is wrong is the client.
  const room = createRoom({ options: OPTIONS, code: "ABC123" });
  for (const nonsense of [undefined, null, {}, { type: C2S.COMMAND }, { type: "hello " }]) {
    const connection = wire("noise");
    assert.equal(room.join(connection, nonsense), REFUSAL.MALFORMED,
      `${JSON.stringify(nonsense)} was answered with the wrong refusal`);
    assert.equal(connection.last(S2C.REFUSED)?.reason, REFUSAL.MALFORMED);
  }
});

// --- the room's hour (X1c, A63 against A41) ---------------------------------

test("a frame carries the room's PLAYED time, which is the hour every seat shares", () => {
  // A63 asked for "the room's hour", and the obvious reading — derive it from
  // the tick — is the one **A41 already rejected with a measurement**: at the
  // play speed a tick is 400 ms, so the sun raced whenever the game sped up,
  // and the light is scenery rather than simulation (R2). The wall clock is
  // right and each client's own wall clock is wrong, because a late joiner's
  // noon would be somebody else's night.
  //
  // So the room counts the milliseconds it has PLAYED and stamps each frame
  // with them: one wall clock, shared, and the same number on every seat.
  // Not hashed, and it must never be — scenery is not state.
  const room = createRoom({ options: OPTIONS });
  joined(room, "a", 1);
  const first = room.beat(100);
  assert.equal(first.at, 100, "the frame does not carry the room's clock");
  const second = room.beat(100);
  assert.equal(second.at, 200);

  // **A paused room holds its moment** (A41: "it stops when the game is
  // paused, because a paused city is a held moment"). The PUMP never pauses —
  // "degrade the game clock, never the pump" — so this is the one place the
  // difference between the two clocks is visible.
  room.setSpeed(0);
  const held = room.beat(100);
  assert.equal(held.at, 200, "the sun moved in a paused room");
  assert.equal(held.ticks, 0, "a paused room ticked");
  room.setSpeed(1);
  assert.equal(room.beat(100).at, 300, "the clock did not start again");

  // And it is wall time, not ticks: the same beat at a higher speed costs the
  // same number of milliseconds, which is what stops the sun racing.
  // Somebody in each: since X4d a room nobody is in does not play, and two
  // sleeping rooms would compare equal for entirely the wrong reason.
  const slow = createRoom({ options: OPTIONS, speed: 1 });
  const fast = createRoom({ options: OPTIONS, speed: 3 });
  joined(slow, "slow", 1);
  joined(fast, "fast", 1);
  for (let n = 0; n < 5; n += 1) { slow.beat(100); fast.beat(100); }
  assert.equal(slow.beat(100).at, fast.beat(100).at, "a faster room has a faster sun");
  assert.ok(fast.tick() > slow.tick(), "the two rooms ran at the same speed; nothing was compared");
});

test("the pump reports a warm maximum beside its cold one (X1c)", () => {
  // A budget checked against a cold maximum is a budget checked against the
  // compiler. X1c gave the room the quest catalogue it should always have had
  // and the first monthly pass is JIT: measured per arm, a 48×48 room's worst
  // beat is 1.59 ms with the quests cleared, 11.34 ms warm with them loaded,
  // and 26–33 ms on the run that includes the cold pass.
  const room = createRoom({ options: OPTIONS });
  joined(room, "a", 1);
  const pump = createPump(room, { tickMs: 100 });
  for (let n = 0; n < 20; n += 1) pump.step(n * 100);
  assert.equal(pump.warmBeats(), 0, "a warm number appeared before the engine was warm");
  assert.equal(pump.worstWarmBeatMs(), 0, "a warm maximum was taken from cold beats");
  for (let n = 20; n < 90; n += 1) pump.step(n * 100);
  assert.ok(pump.warmBeats() > 0, "the warm window never opened");
  // The cold maximum cannot be smaller than the warm one: they are maxima over
  // a set and its subset, and getting that backwards is how a budget ends up
  // being checked against the wrong half of a run.
  assert.ok(pump.worstBeatMs() >= pump.worstWarmBeatMs(),
    `cold ${pump.worstBeatMs()} is under warm ${pump.worstWarmBeatMs()}`);
});

test("a p99 over fewer than a hundred samples IS the maximum (X1d)", () => {
  // The trap this project has fallen into before: A78's bake check took a p95
  // over eighteen chunks, and the nearest-rank p95 of eighteen is the
  // eighteenth. `costDigest` has the same arithmetic, and the budget is now
  // checked against its p99 — so the number of samples is part of the reading,
  // which is why it is in the digest and why `room_soak` refuses to report on
  // fewer than a hundred.
  const ten = [1, 1, 1, 1, 1, 1, 1, 1, 1, 99];
  const small = costDigest(ten);
  assert.equal(small.n, 10);
  assert.equal(small.p99Ms, 99, "a p99 of ten samples is not the maximum; the arithmetic changed");
  assert.equal(small.maxMs, 99);

  // Over two hundred, the outlier is where it belongs: one bad sample in two
  // hundred does not move the p99, and the maximum still tells you it happened.
  const many = new Array(199).fill(1).concat([99]);
  const big = costDigest(many);
  assert.equal(big.n, 200);
  assert.equal(big.p99Ms, 1, `one in two hundred moved the p99 to ${big.p99Ms}`);
  assert.equal(big.maxMs, 99, "the maximum stopped reporting the outlier");
  assert.equal(big.p50Ms, 1);

  // Below ten it says nothing rather than something wrong — four samples are an
  // anecdote, which is `jitterDigest`'s own rule.
  assert.equal(costDigest([1, 2, 3, 4]), undefined);
  // And `-1` is the ring's empty slot, not a beat that took minus a millisecond.
  assert.equal(costDigest(new Array(50).fill(-1)), undefined);
  const partial = costDigest(new Array(40).fill(-1).concat(new Array(12).fill(5)));
  assert.equal(partial.n, 12, "the empty slots were counted as beats");
});

test("a joiner that names no seat is given the lowest free one (X2b)", () => {
  // A player who types a join code cannot know which seats are taken, and the
  // door is the only thing that does. Before X2b `Number(hello.seat) || 1` made
  // every such client ask for seat 1 and be refused `SEAT_TAKEN` the moment
  // anybody was in it — so the lobby would have had to make the player guess,
  // or the screen would have needed a roster it has no way to get (that is
  // X3b's). Seat 0, or no seat at all, means "any".
  // `heldForMs: 0`: the last part of this test leaves a seat and takes it again
  // by number, which X4a holds for its owner. The hold has its own tests.
  const room = createRoom({ options: { ...OPTIONS, seats: 3 }, code: "ABC123", heldForMs: 0 });
  const hello = (seat) => ({
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", ...seat,
  });
  const first = wire("any one");
  assert.equal(room.join(first, hello({})), "");
  assert.equal(first.last(S2C.WELCOME)?.seat, 1, "the first joiner was not given seat 1");

  // Somebody takes seat 3 deliberately, so "lowest free" is not "next".
  const third = wire("asks for three");
  assert.equal(room.join(third, hello({ seat: 3 })), "");
  assert.equal(third.last(S2C.WELCOME)?.seat, 3);

  const second = wire("any two");
  assert.equal(room.join(second, hello({ seat: 0 })), "");
  assert.equal(second.last(S2C.WELCOME)?.seat, 2, "seat 0 did not take the lowest free seat");

  // And a full room says so rather than claiming the seat is taken: the player
  // has to be told to go away, not to pick another (X1b's distinction).
  const late = wire("too late");
  assert.equal(room.join(late, hello({})), REFUSAL.ROOM_FULL);
  assert.equal(late.of(S2C.WELCOME).length, 0);

  // A reconnecting seat still gets the seat it asks for, which is what the
  // token is for — "any" must not renumber somebody who is coming back.
  room.leave(2);
  const back = wire("back again");
  assert.equal(room.join(back, hello({ seat: 2 })), "");
  assert.equal(back.last(S2C.WELCOME)?.seat, 2, "a returning seat was renumbered");
});

// --- a seat you left is yours for a while (X4a) ------------------------------

test("the token the WELCOME hands out is what proves a seat is yours", () => {
  // Every welcome has carried a token since X1a and **nothing has ever checked
  // one**. So a player whose connection dropped lost their seat to whoever
  // asked next — their treasury, their land and their city, to a stranger who
  // typed the code. A capability with no control, and a safety one.
  const room = createRoom({ options: { ...OPTIONS, seats: 3 }, code: "ABC123" });
  const hello = (over) => ({
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", ...over,
  });
  const first = wire("one");
  assert.equal(room.join(first, hello({ seat: 1 })), "");
  const token = first.last(S2C.WELCOME)?.token;
  assert.ok(token?.length > 0, "the welcome carried no token");

  // The player's connection drops. The seat is HELD, not freed.
  room.leave(1);
  const stranger = wire("stranger");
  assert.equal(room.join(stranger, hello({ seat: 1 })), REFUSAL.SEAT_TAKEN,
    "a seat that was left was given away to whoever asked next");
  assert.equal(stranger.of(S2C.WELCOME).length, 0);
  // And "any free seat" must not hand it out either, which is the same hole
  // through the door X2b opened.
  const any = wire("any");
  assert.equal(room.join(any, hello({})), "");
  assert.equal(any.last(S2C.WELCOME)?.seat, 2, `the any-seat door gave seat ${any.last(S2C.WELCOME)?.seat}`);

  // The player comes back with what they were given, and it is theirs again.
  const back = wire("back");
  assert.equal(room.join(back, hello({ seat: 1, token })), "", "the token did not open its own seat");
  assert.equal(back.last(S2C.WELCOME)?.seat, 1);
  // A fresh token each time, so a copied one is good for one return.
  assert.notEqual(back.last(S2C.WELCOME)?.token, token, "the same token was handed out twice");
});

test("a held seat is let go when the grace runs out (X4a)", () => {
  // Held for ever would be a room that fills up with ghosts; let go at once
  // would be a player whose train went into a tunnel losing a city. The clock
  // is an argument for the same reason the pump's is.
  const room = createRoom({ options: { ...OPTIONS, seats: 2 }, code: "ABC123", heldForMs: 1000 });
  const hello = (over) => ({
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", ...over,
  });
  assert.equal(room.join(wire("one"), hello({ seat: 1 })), "");
  room.leave(1, 0);

  const early = wire("early");
  assert.equal(room.join(early, hello({ seat: 1, at: 500 })), REFUSAL.SEAT_TAKEN,
    "the seat was let go before its grace ran out");
  const late = wire("late");
  assert.equal(room.join(late, hello({ seat: 1, at: 2000 })), "",
    "the seat was never let go");
  assert.equal(late.last(S2C.WELCOME)?.seat, 1);
});

test("a seat nobody has left is still refused to a second client (X1b, unchanged)", () => {
  // The hold must not blur the distinction X1b drew: somebody sitting there is
  // `SEAT_TAKEN` and always was, and this test is here so that a change to the
  // hold cannot quietly turn an occupied seat into a grace window.
  const room = createRoom({ options: { ...OPTIONS, seats: 2 }, code: "ABC123" });
  const hello = (over) => ({
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", ...over,
  });
  const sitting = wire("sitting");
  assert.equal(room.join(sitting, hello({ seat: 1 })), "");
  const token = sitting.last(S2C.WELCOME)?.token;
  // Even WITH the right token: the seat is not empty, and two sockets on one
  // seat is two clients applying one seat's commands.
  assert.equal(room.join(wire("also one"), hello({ seat: 1, token })), REFUSAL.SEAT_TAKEN);
});

// --- regency (X4b) -----------------------------------------------------------

test("a seat nobody has come back to is handed to the deputy, and taken back", () => {
  // X4's "a city nobody is watching is still there". The room already knows who
  // is connected and for how long (X4a's hold), so **the server decides** and
  // issues `CMD_SET_STATUS` as a command — which means the status is hashed
  // state every client applies in order, and there is no second clock in the
  // engine to keep in step and no fixture to re-pin.
  const room = createRoom({
    options: { ...OPTIONS, seats: 2 }, code: "ABC123",
    heldForMs: 1000, regencyAfterMs: 5000,
  });
  const hello = (over) => ({
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", ...over,
  });
  const one = wire("one");
  assert.equal(room.join(one, hello({ seat: 1 })), "");
  const token = one.last(S2C.WELCOME)?.token;
  room.beat(100);
  assert.equal(seatStatus(room, 1), PLAYER_ACTIVE, "a seat that is being played is not active");

  room.leave(1, 0);
  // Not the instant they drop, and not when the HOLD runs out either: letting
  // somebody else take the seat and handing it to a deputy are two different
  // clocks, and a player whose train went into a tunnel is not absent yet.
  room.beat(100, 2000);
  assert.equal(seatStatus(room, 1), PLAYER_ACTIVE, "the deputy took over during the grace");

  room.beat(100, 6000);
  assert.equal(seatStatus(room, 1), PLAYER_REGENT, "nobody took the city over");
  // The change crossed as a COMMAND, so every client applies it in order.
  const frame = room.beat(100, 6100);
  assert.ok(room.state.players.find((p) => p.seat === 1).status === PLAYER_REGENT);

  // And coming back takes it off them, at the door.
  const back = wire("back");
  assert.equal(room.join(back, hello({ seat: 1, token, at: 7000 })), "");
  room.beat(100, 7100);
  assert.equal(seatStatus(room, 1), PLAYER_ACTIVE, "a returning player is still a regency");
});

test("a regent seat is PLAYED, and what it does crosses the wire like anything else", () => {
  // The deputy runs on the SERVER and its commands ride the frame: every client
  // replays them in `(tick, seq)` order and reaches the same city. A deputy that
  // mutated the server's state without telling anybody would be a desync at the
  // next monthly hash — which is the whole reason this is commands and not a
  // second simulation.
  const room = createRoom({
    options: { ...OPTIONS, seats: 2, startingTreasury: 60000 }, code: "ABC123",
    heldForMs: 0, regencyAfterMs: 0,
  });
  const a = joined(room, "a", 1);
  const seatClient = client(a.welcome);
  // A beat first, so the ARRIVAL lands: a seat joining is a command and the
  // regency pass runs before the queue is drained, so without this the seat it
  // is looking for does not exist in `state.players` yet.
  seatClient.play(room.beat(100, 500));
  room.leave(1, 0);
  seatClient.play(room.beat(100, 1000));
  assert.equal(seatStatus(room, 1), PLAYER_REGENT);

  // Enough beats for the deputy to do something. It acts once a beat at most,
  // which is what keeps a regency from out-building a person.
  let issued = 0;
  for (let n = 2; n < 60; n += 1) {
    const frame = room.beat(100, n * 1000);
    for (const entry of frame.cmds) {
      if (entry.seat === 1 && entry.command.type !== "setStatus") issued += 1;
    }
    seatClient.play(frame);
  }
  assert.ok(issued > 0, "the deputy did nothing at all in sixty beats");
  assert.equal(seatClient.hash(), room.hash(),
    "a client replaying the deputy's commands reached a different city");
});

// --- spectators (X4e) --------------------------------------------------------

test("somebody can watch without taking a seat, and a full room can still be watched", () => {
  // X4: "spectators (tokenless, no commands)". A watcher is not a player: they
  // take no seat, so a full room is still watchable, and they get no token
  // because there is nothing to come back to.
  const room = createRoom({ options: { ...OPTIONS, seats: 1 }, code: "ABC123" });
  const hello = (over) => ({
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", ...over,
  });
  assert.equal(room.join(wire("player"), hello({ seat: 1 })), "");
  // The room is full, and that is exactly the case worth checking: a watcher
  // refused because every seat is taken would be a rule about the wrong thing.
  assert.equal(room.join(wire("latecomer"), hello({})), REFUSAL.ROOM_FULL);

  const watcher = wire("watcher");
  assert.equal(room.join(watcher, hello({ spectate: true })), "", "a full room refused a watcher");
  const welcome = watcher.last(S2C.WELCOME);
  assert.ok(welcome?.save, "a watcher was welcomed with no city to draw");
  assert.equal(welcome.seat, 0, "a watcher was given a seat");
  assert.equal(welcome.token, undefined, "a watcher was given a token to come back with");
  assert.equal(room.seats().length, 1, "a watcher took a seat after all");
});

test("a watcher sees the city change and cannot change it", () => {
  // Frames reach them — watching a still picture is not watching — and nothing
  // they send does anything. The refusal is the DOOR's job in `server/index.js`
  // (a seatless connection never reaches `submit`), and the room's own guard is
  // here so that a future caller cannot route around it.
  const room = createRoom({ options: { ...OPTIONS, seats: 2 }, code: "ABC123" });
  const a = joined(room, "a", 1);
  const watcher = wire("watcher");
  assert.equal(room.join(watcher, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", spectate: true,
  }), "");

  room.submit(1, road(room, 1, 6));
  const frame = room.beat(100);
  assert.ok(frame.cmds.length > 0, "the beat carried nothing; the test proves nothing");
  assert.equal(watcher.of(S2C.FRAME).length, 1, "a watcher saw no frame");
  assert.deepEqual(watcher.last(S2C.FRAME), a.connection.last(S2C.FRAME),
    "a watcher sees a different frame from a player");

  // Nothing a watcher sends is accepted: `submit` takes a seat, and seat 0 is
  // nature. The city is unmoved.
  const before = room.hash();
  assert.equal(room.submit(0, road(room, 1, 10)), false, "a watcher's command was queued");
  room.beat(100);
  assert.equal(room.hash(), before, "a watcher moved the city");
});

test("a room full of watchers and nobody playing is still asleep (X4d)", () => {
  // Watching is not playing: a city nobody is steering should not run because
  // somebody is looking at it, or an abandoned room with one idle tab open
  // would tick for ever.
  const room = createRoom({ options: { ...OPTIONS, seats: 2 }, code: "ABC123" });
  assert.equal(room.join(wire("watcher"), {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: "ABC123", spectate: true,
  }), "");
  const before = room.tick();
  room.beat(1000, 1000);
  room.beat(1000, 2000);
  assert.equal(room.tick(), before, "a room with only watchers in it kept playing");
});

// --- the room's clock belongs to the host (X2d) ------------------------------

test("the host is whoever got here first, not seat one", () => {
  // Not the same claim. A room restored from a save can have seat 1 in its
  // player list with nobody behind it, and X4a holds a seat for two minutes
  // after its socket drops — so "seat 1" names a chair and "the host" names a
  // person.
  const room = createRoom({ options: OPTIONS });
  assert.equal(room.host(), 0, "a room with nobody in it has a host");
  const second = joined(room, "two", 2);
  assert.equal(room.host(), 2, "the first to join is not the host");
  assert.equal(second.welcome.host, 2, "the welcome does not say who the host is");
  const first = joined(room, "one", 1);
  assert.equal(room.host(), 2, "a later joiner took the room over");
  assert.equal(first.welcome.host, 2);
});

test("only the host may turn the room's clock", () => {
  // The check lives with the state it protects rather than at the door, so a
  // later caller cannot route around it — the rule `submit` already follows.
  const room = createRoom({ options: OPTIONS });
  joined(room, "host", 1);
  joined(room, "guest", 2);
  assert.equal(room.speed(), 1, "a room does not start at 1x");
  assert.equal(room.setSpeed(3, 2), 1, "a guest turned the host's clock");
  assert.equal(room.speed(), 1);
  assert.equal(room.setSpeed(3, 1), 3, "the host could not turn their own clock");
  assert.equal(room.speed(), 3);
  // Clamped to the table, because a speed off the end of it is a room that
  // either stops or runs away, and the message comes off a wire.
  assert.equal(room.setSpeed(99, 1), 3, "an impossible speed was accepted");
  assert.equal(room.setSpeed(-5, 1), 0, "a negative speed was not clamped to paused");
  // No `by` is the server's own hand — the pump and the hibernation path — and
  // that is not a seat asking.
  assert.equal(room.setSpeed(2), 2);
});

test("every frame carries the speed, so a guest's dial follows the host's", () => {
  // The alternative is a message of its own, which would be a second source for
  // one fact and a client that missed it showing a label about a room it is not
  // in. The frame already carries the tick count and the played clock.
  const room = createRoom({ options: OPTIONS });
  joined(room, "host", 1);
  const guest = joined(room, "guest", 2);
  room.setSpeed(3, 1);
  room.beat(1000, 1000);
  const frame = guest.connection.last(S2C.FRAME);
  assert.ok(frame, "no frame reached the guest");
  assert.equal(frame.speed, 3, "the frame does not carry the room's speed");
});

test("the room has one speed more than a player has words for, and it is the gates'", () => {
  // Two tables for one idea, and they do NOT agree — on purpose. `client/game.js`
  // offers three speeds (paused, play, fast) and the room owes ticks at four
  // rates, because `room_soak` and `room_smoke` drive a room at `3` to play
  // five city years in under a minute. No control can ask for it: the speed
  // button cycles the client's three and the server refuses anything else from
  // a seat.
  //
  // What this pins is the ASYMMETRY, because the first run of X2d's gate
  // crashed on it — a watcher joined a room at a speed its page had no entry
  // for and `SPEEDS[speed].labelKey` threw inside the boot. The page leaves a
  // speed it cannot name unlabelled now, and this says why there is one.
  const labels = Object.keys(JSON.parse(readFileSync(join(repoRoot, "data", "i18n", "en.json"), "utf8")))
    .filter((key) => /^speed\./.test(key));
  assert.equal(labels.length, 3, `the player has ${labels.length} speed words: ${labels.join(", ")}`);
  assert.equal(TICKS_PER_SECOND.length, labels.length + 1,
    "the room's rates and the player's words moved apart by more than the gates' one");
  assert.equal(TICKS_PER_SECOND[0], 0, "the first speed is not paused");
  assert.ok(TICKS_PER_SECOND[3] > TICKS_PER_SECOND[2], "the gates' speed is not the fastest");
});

// --- the host removes a seat (X2d) -------------------------------------------

test("only the host may remove a seat, and never their own", () => {
  const room = createRoom({ options: OPTIONS });
  const host = joined(room, "host", 1);
  const guest = joined(room, "guest", 2);
  assert.equal(room.kick(1, 2), undefined, "a guest removed the host");
  assert.equal(room.kick(1, 1), undefined, "the host removed themselves");
  assert.equal(room.kick(3, 1), undefined, "a seat nobody is in was removed");
  assert.ok(room.kick(2, 1), "the host could not remove a guest");
  assert.ok(host.welcome, "the host's own seat went with it");
  assert.ok(guest.connection.last(S2C.REFUSED), "the removed seat was told nothing");
  assert.equal(guest.connection.last(S2C.REFUSED).reason, REFUSAL.BANNED);
});

test("a removed seat is freed at once, not held like a dropped socket", () => {
  // `leave` keeps a seat warm for `heldForMs` because a dropped socket is an
  // accident (X4a). A kick is a decision, and a held seat would be the player
  // walking back in with the token from their last WELCOME.
  const room = createRoom({ options: OPTIONS });
  joined(room, "host", 1);
  const guest = joined(room, "guest", 2);
  const token = guest.welcome.token;
  room.kick(2, 1);
  // The same token, offered again, gets nothing back: the seat is free, so this
  // is a NEW joiner taking an empty chair rather than a return to a held one.
  const back = wire("again");
  const refusal = room.join(back, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), room: room.code(),
    seat: 2, token,
  });
  assert.equal(refusal, "", `coming back was refused: ${refusal}`);
  assert.notEqual(back.last(S2C.WELCOME).token, token, "the old token still opens the seat");
});

test("the city learns about a removal in the frame, like everything else", () => {
  // A room that only closed the socket would leave every other client's roster
  // showing somebody who is not there — and the rosters are built from
  // `state.players`, which is hashed, so the fix cannot be a message.
  const room = createRoom({ options: OPTIONS });
  const host = joined(room, "host", 1);
  joined(room, "guest", 2);
  room.kick(2, 1);
  room.beat(1000, 1000);
  const frame = host.connection.last(S2C.FRAME);
  const left = (frame.cmds ?? []).find((c) => c.command?.type === "leave");
  assert.ok(left, "no leave reached the frame");
  assert.equal(left.seat, 2);
  assert.equal(room.state.players.find((p) => p.seat === 2).status, PLAYER_GONE,
    "the removed player is still playing as far as the city knows");
});
