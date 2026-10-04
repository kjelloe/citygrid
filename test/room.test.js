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
import { createRoom } from "../server/room.js";
import { createPump } from "../server/pump.js";
import { createSimHost } from "../worker/sim-host.js";
import { createMirror, applyPatch } from "../client/mirror.js";
import { hashState } from "../engine/state.js";
import { CMD_PLACE_ROAD, CMD_SET_TAX } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { RESULT, C2S, S2C, REFUSAL, PROTOCOL_VERSION } from "../shared/protocol.js";
import { buildHash, setBuildHash } from "../shared/build-hash.js";
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
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat,
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
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: "0123456789ab", seat: 1,
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

test("the clock is the room's: a pump advances the ticks the speed owes", () => {
  // Speed 1 is two fast ticks a second (plan.md §3.6: one sim-month every six
  // seconds); the speeds are a table, not a multiplier, which is why the frame
  // carries the COUNT rather than the speed.
  const room = createRoom({ options: OPTIONS, speed: 1 });
  const pump = createPump(room, { tickMs: 100 });
  const a = joined(room, "a", 1);
  const ca = client(a.welcome);
  for (let n = 1; n <= 12; n += 1) pump.step(n * 100);
  const frames = a.connection.of(S2C.FRAME);
  assert.equal(frames.length, 12);
  for (const frame of frames) ca.play(frame);
  assert.equal(room.tick(), 24, `the room ran ${room.tick()} ticks`);
  assert.equal(ca.hash(), room.hash(), "the client's clock drifted from the room's");
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
  const room = createRoom({ options: OPTIONS, speed: 1 });
  const pump = createPump(room, { tickMs: 100 });
  const a = joined(room, "a", 1);
  const ca = client(a.welcome);

  for (let n = 1; n <= 12; n += 1) {
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
  for (let n = 13; n <= 24; n += 1) {
    pump.step(n * 100);
    ca.play(a.connection.last(S2C.FRAME));
  }
  assert.equal(ca.hash(), room.hash(), "a resynced client diverged again at the next month");
});

test("a seat that is taken is refused, and the room says why", () => {
  const room = createRoom({ options: OPTIONS });
  joined(room, "a", 1);
  const connection = wire("b");
  const refusal = room.join(connection, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 1,
  });
  assert.equal(refusal, REFUSAL.ROOM_FULL);
  assert.equal(connection.last(S2C.REFUSED)?.reason, REFUSAL.ROOM_FULL);
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
