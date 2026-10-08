// The seam against a transport that is not a worker (W4).
//
// Ruling 003 put the session seam in from day one so that "no UI module ever
// learns whether a socket exists". That was a claim, not a fact, for the life
// of the project: every `apply()` ran on the render thread until W1, and W2's
// mirror could only be built over a `Worker`, which node cannot construct.
//
// Since W4 the transport is an argument. `client/transport/echo.js` runs the
// simulation where it stands and answers with a sequence number — what a room's
// frame carries — so this file drives the real mirror session, in node, in
// milliseconds, and checks the three things the drop-in claim rests on: the
// same hashes, a refusal that changes nothing, and one API across all three
// sessions.

import test from "node:test";
import assert from "node:assert/strict";
import { openMirrorSession } from "../client/session.js";
import { openLocalSession } from "../client/session-local.js";
import { createEchoTransport } from "../client/transport/echo.js";
import { hashState } from "../engine/state.js";
import { CMD_JOIN, CMD_PLACE_ROAD, CMD_UNDO, CMD_SET_TAX } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { RESULT } from "../shared/protocol.js";
import { TICKS_PER_MONTH } from "../engine/constants.js";
import { loadSystems, readFixture, fixtureNames } from "../tools/fixtures.mjs";

await loadSystems();

const OPTIONS = { seed: 11, width: 48, height: 48, seats: 1 };
const road = (actor, x, z, length, width = 48) => ({
  type: CMD_PLACE_ROAD, actor,
  runs: encodeRuns(Array.from({ length }, (unused, i) => z * width + x + i)),
});

test("the echo transport and the local seam play the same city, hash for hash", async () => {
  const remote = await openMirrorSession({ options: OPTIONS }, createEchoTransport());
  const local = await openLocalSession({ options: OPTIONS });
  const script = [
    { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" },
    road(1, 8, 8, 10),
    { type: CMD_SET_TAX, actor: 1, rate: 8 },
  ];
  for (const command of script) {
    const a = await remote.apply({ ...command });
    const b = await local.apply({ ...command });
    assert.equal(a.result, b.result, command.type);
    assert.equal(await remote.hash(), await local.hash(), `${command.type}: the hash moved`);
  }
  await remote.tick(60);
  await local.tick(60);
  assert.equal(await remote.hash(), await local.hash(), "sixty ticks apart");
  assert.equal(hashState(remote.state), await local.hash(), "the mirror is not the city");
  remote.dispose();
  local.dispose();
});

test("a rejected command is a toast, not a rollback: nothing changes", async () => {
  const transport = createEchoTransport();
  const remote = await openMirrorSession({ options: OPTIONS }, transport);
  await remote.apply({ type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const before = await remote.hash();
  const heard = [];
  remote.onChange((change) => heard.push(change));

  // A seat that does not exist, which is the shape every illegal command has on
  // the wire: refused identically by client and server (plan.md §3.2).
  const refused = await remote.apply(road(99, 2, 2, 3));
  assert.notEqual(refused.result, RESULT.OK);
  assert.equal(await remote.hash(), before, "a refusal changed the city");
  assert.deepEqual(heard, [], "a refusal was announced as a change");
  remote.dispose();
});

test("every accepted command comes back with a sequence number", async () => {
  // Not a server — but the shape of one. `(tick, seq)` is what every client
  // applies in, and a transport that could not carry a seq would not be a
  // stand-in for the thing Wave 5 replaces it with.
  const transport = createEchoTransport();
  const remote = await openMirrorSession({ options: OPTIONS }, transport);
  await remote.apply({ type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  await remote.apply(road(1, 6, 6, 4));
  const seqs = transport.frames.map((f) => f.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "the frames are out of order");
  assert.equal(new Set(seqs).size, seqs.length, "a sequence number was reused");
  remote.dispose();
});

test("undo crosses the transport, because it is a command now (Q147)", async () => {
  const remote = await openMirrorSession({ options: OPTIONS }, createEchoTransport());
  await remote.apply({ type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const before = await remote.hash();
  const built = await remote.apply(road(1, 8, 8, 5));
  assert.equal(built.result, RESULT.OK, "the road was refused; this test proves nothing");
  assert.notEqual(await remote.hash(), before);
  assert.equal(await remote.undo(1), RESULT.OK);
  assert.equal(await remote.hash(), before, "undo did not reach the simulation");
  // And it is a command on the wire, not a member of its own.
  assert.ok(await remote.apply({ type: CMD_UNDO, actor: 1 }));
  remote.dispose();
});

test("all three sessions are the same session (the drop-in claim)", async () => {
  const local = await openLocalSession({ options: OPTIONS });
  const remote = await openMirrorSession({ options: OPTIONS }, createEchoTransport());
  // A member list is the API. Two sessions that differ by one member are two
  // APIs, and the difference will be found by a UI module rather than by a test.
  const members = (session) => Object.keys(session).sort();
  assert.deepEqual(members(local), members(remote),
    "the local seam and the mirror disagree about what a session is");
  for (const name of ["state", "apply", "undo", "tick", "setSpeed", "load", "onChange", "hash",
    "dispose", "pending", "local", "desyncs", "desyncChecks"]) {
    assert.ok(members(local).includes(name), `the local session has no ${name}`);
  }
  local.dispose();
  remote.dispose();
});

test("the session owns the clock, and stops owning it when it is disposed", async () => {
  // `game.js` owned a `setInterval` until W4. A remote session cannot: the
  // server owns the clock and the frame carries the tick count, so a client
  // running its own interval would run the world twice (plan.md §3.4).
  for (const open of [
    () => openLocalSession({ options: OPTIONS }),
    () => openMirrorSession({ options: OPTIONS }, createEchoTransport()),
  ]) {
    const session = await open();
    assert.equal(session.state.tick, 0);
    session.setSpeed(5);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const ticked = session.state.tick;
    assert.ok(ticked > 0, "a speed was set and nothing ticked");
    session.setSpeed(0);
    const stopped = session.state.tick;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(session.state.tick, stopped, "speed 0 kept ticking");
    session.setSpeed(5);
    session.dispose();
    const disposed = session.state.tick;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(session.state.tick, disposed, "a disposed session is still playing the city");
  }
});

// --- the fixtures, through a transport ---------------------------------------

const names = await fixtureNames();

for (const name of names) {
  test(`fixture ${name} replays through the transport with every pinned hash`, async (t) => {
    const fixture = await readFixture(name);
    if (fixture.generate === false) return t.skip("not a generated world");
    const remote = await openMirrorSession({ options: fixture.options }, createEchoTransport());
    const problems = [];
    for (let i = 0; i < fixture.steps.length; i += 1) {
      const step = fixture.steps[i];
      let outcome;
      for (let n = 0; n < (step.repeat ?? 1); n += 1) outcome = await remote.apply({ ...step.command });
      const hash = await remote.hash();
      const at = `${name} step ${i} (${step.command.type})`;
      if (step.result !== undefined && step.result !== outcome.result) {
        problems.push(`${at}: result ${outcome.result}, pinned ${step.result}`);
      }
      if (step.hash !== undefined && step.hash !== hash) {
        problems.push(`${at}: hash ${hash}, pinned ${step.hash}`);
        break;
      }
    }
    remote.dispose();
    assert.deepEqual(problems, [], `\n  ${problems.join("\n  ")}`);
  });
}

// --- the pushed half (X1c) ---------------------------------------------------

/** A transport that pushes, which is the half `createEchoTransport` cannot be:
 * a room broadcasts a frame carrying another seat's command, and nothing above
 * the seam has a promise waiting for it (the X1 review, item 1). */
function pushingTransport() {
  const echo = createEchoTransport();
  let listener;
  return {
    ...echo,
    get pending() { return echo.pending; },
    post: (message, transfer) => echo.post(message, transfer),
    onMessage(handler) { listener = handler; },
    /** A reply nobody asked for, exactly as given — for driving the detector,
     * which needs a hash that is wrong rather than a city that is different. */
    pushRaw(reply) { listener?.(reply); },
    /** The room speaking: whatever the simulation did, as a reply nobody asked
     * for. Built by posting through the echo and relabelling the answer, so the
     * patch is a real one. */
    async push(command) {
      const reply = await echo.post({ type: "apply", command });
      listener?.({ ...reply, pushed: true });
      return reply;
    },
    roomClock: true,
  };
}

test("a pushed frame patches the mirror and is announced (X1c)", async () => {
  const transport = pushingTransport();
  const session = await openMirrorSession({ options: OPTIONS }, transport);
  // A seat first: every other test in this file joins before it builds, because
  // a command from a player the city does not have is `invalid` and an
  // assertion about whether the mirror moved would then pass either way.
  await session.apply({ type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const changes = [];
  session.onChange((change) => changes.push(change));
  const before = hashState(session.state);
  const result = await transport.push(road(1, 4, 4, 6));
  assert.equal(result.result, RESULT.OK, "the pushed command was refused; the test proves nothing");

  // The mirror moved, and the UI was told. A pushed frame that patched nothing
  // is another seat's city nobody can see; one that patched silently is a
  // minimap and an advisor that never notice (ruling 028's shape).
  assert.notEqual(hashState(session.state), before, "another seat's command never reached the mirror");
  assert.equal(changes.length, 1, `${changes.length} announcements for one pushed frame`);
  assert.equal(changes[0].pushed, true, "a pushed change is indistinguishable from this seat's own");
  session.dispose();
});

test("in a room the session keeps no clock of its own (X1c)", async () => {
  // **The server owns the clock** (plan.md §3.6, CLAUDE.md). The tick count
  // rides the frame, so a session that also kept an interval would tick a city
  // the room never ticked — and because the socket transport answers a `tick`
  // post with a no-op, the defect would be invisible: the right number of
  // announcements, none of them a tick.
  const transport = pushingTransport();
  const session = await openMirrorSession({ options: OPTIONS }, transport);
  // `finally`, because an interval that outlives a FAILED assertion keeps node
  // alive: planting this defect made the file hang rather than go red, and a
  // test that hangs is worse than one that fails.
  try {
    session.setSpeed(10);
    assert.equal(session.clocked, false, "the session started an interval in a room");
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(transport.frames.filter((f) => f.type === "tick").length, 0,
      "the session ticked a city whose clock belongs to the room");
  } finally {
    session.dispose();
  }
});

test("singleplayer still keeps its own clock (the other arm)", async () => {
  // The same assertion from the other side, because "no clock in a room" is
  // only a finding if the clock exists everywhere else.
  const session = await openMirrorSession({ options: OPTIONS }, createEchoTransport());
  try {
    session.setSpeed(10);
    assert.equal(session.clocked, true, "singleplayer lost its clock");
  } finally {
    session.dispose();
  }
  assert.equal(session.clocked, false, "a disposed session is still ticking");
});

test("a detected desync ASKS to be put back, rather than only saying so (X1c)", async () => {
  // `check()` has printed `DESYNC` and done nothing else since W2. In
  // singleplayer there is nothing to ask — the worker is the authority and a
  // mirror that disagrees with it is a bug in the patch, not a divergence — but
  // in a ROOM the authority is somewhere else and it has answered
  // `C2S.RESYNC_REQUEST` since X1a. Nobody had ever sent one from a page.
  const transport = pushingTransport();
  const asks = [];
  transport.resync = () => asks.push(Date.now());
  const session = await openMirrorSession({ options: OPTIONS }, transport);
  await session.apply({ type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });

  // A reply whose hash is not the mirror's, at a new month, which is the one
  // moment the detector looks. The hash is deliberately wrong rather than the
  // city deliberately different: what is under test is the DETECTOR's response.
  const monthly = { type: "result", result: RESULT.OK, events: [],
    tick: TICKS_PER_MONTH * 3, hash: "0000000000000000" };
  session.onChange(() => {});
  transport.pushRaw(monthly);
  assert.equal(session.desyncs, 1, `the detector did not fire: ${session.desyncs} desync(s)`);
  assert.equal(asks.length, 1, `the detector fired and asked ${asks.length} times`);
  session.dispose();
});
