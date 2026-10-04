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
