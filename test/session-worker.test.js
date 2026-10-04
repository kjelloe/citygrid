// The worker's half of the seam (W2; `workitems-worker.md`).
//
// The claim this has to check is the one the whole lane rests on: **the mirror
// is the state**. A patched copy on the render thread that hashes to anything
// other than the worker's own state is a desync, and a desync that nobody
// notices is the worst defect this project can have.
//
// So every test here ends in `hashState(mirror) === reply.hash`, including the
// fixtures replayed message by message. `worker/sim-host.js` is a plain module
// on purpose — node can load it and cannot load a Web Worker — and the thread
// itself is proven by `tools/worker_smoke.mjs` in a browser.

import test from "node:test";
import assert from "node:assert/strict";
import { createSimHost } from "../worker/sim-host.js";
import { createMirror, applyPatch } from "../client/mirror.js";
import { openLocalSession } from "../client/session-local.js";
import { hashState, TILE_LAYERS } from "../engine/state.js";
import { CMD_JOIN, CMD_PLACE_ROAD, CMD_PAINT_ZONE } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { readFixture, fixtureNames, loadSystems } from "../tools/fixtures.mjs";
import { encodeRuns } from "../shared/grid.js";

/** A straight run of road tiles, as the one run-length-encoded command the
 * client sends (CLAUDE.md: a drag-paint is ONE command). */
const road = (actor, x, z, length, width) => ({
  type: CMD_PLACE_ROAD, actor,
  runs: encodeRuns(Array.from({ length }, (unused, i) => z * width + x + i)),
});

await loadSystems();

const OPTIONS = { seed: 7, width: 32, height: 32, seats: 1 };

/** A host and a mirror of it, started. */
function started(options = OPTIONS) {
  const host = createSimHost();
  const { reply } = host.handle({ type: "init", id: 0, options });
  assert.equal(reply.type, "ready", reply.reason);
  const mirror = createMirror(reply.patch);
  return { host, mirror, ready: reply };
}

/** Sends one message and patches the mirror with what comes back. */
function send(host, mirror, message) {
  const { reply } = host.handle(message);
  if (reply.patch) applyPatch(mirror, reply.patch);
  return reply;
}

test("the mirror of a fresh world hashes like the world", () => {
  const { mirror, ready } = started();
  assert.equal(hashState(mirror), ready.hash);
  // Every layer, not merely the ones that happened to be interesting: a first
  // patch is the whole city.
  for (const layer of TILE_LAYERS) {
    assert.ok(mirror.tiles[layer.name] !== undefined, `no ${layer.name} layer in the mirror`);
  }
});

test("a patch carries the layers that changed, and not the ones that did not", () => {
  const { host, mirror } = started();
  send(host, mirror, { type: "apply", id: 1, command: { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" } });

  const reply = send(host, mirror, {
    type: "apply", id: 2,
    command: road(1, 8, 8, 5, 32),
  });
  assert.equal(reply.result, RESULT.OK, "the road was refused; this test proves nothing");
  const names = Object.keys(reply.patch.layers);
  assert.ok(names.includes("road"), `a road changed no road layer: ${names.join(", ")}`);
  // The point of a patch: a 32×32 city has eighteen layers and laying a road
  // touches a handful of them. The elevation under a road never moves.
  assert.ok(!names.includes("elevation"), `elevation crossed the wire for a road: ${names.join(", ")}`);
  assert.ok(names.length < TILE_LAYERS.length, `every layer crossed: ${names.join(", ")}`);
  assert.equal(hashState(mirror), reply.hash);
});

test("a refusal changes nothing, and says so", () => {
  const { host, mirror } = started();
  const before = hashState(mirror);
  const reply = send(host, mirror, {
    type: "apply", id: 1,
    command: road(99, 2, 2, 2, 32),
  });
  assert.notEqual(reply.result, RESULT.OK);
  assert.deepEqual(Object.keys(reply.patch.layers), [], "a refusal sent layers");
  assert.equal(hashState(mirror), before);
  assert.equal(hashState(mirror), reply.hash);
});

test("a hundred ticks, and the mirror still hashes like the worker", () => {
  const { host, mirror } = started({ ...OPTIONS, width: 48, height: 48 });
  send(host, mirror, { type: "apply", id: 1, command: { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" } });
  for (let n = 0; n < 10; n += 1) {
    const reply = send(host, mirror, { type: "tick", id: 10 + n, count: 10 });
    assert.equal(hashState(mirror), reply.hash, `after ${(n + 1) * 10} ticks`);
  }
  assert.equal(mirror.tick, 100);
});

test("a batched tick carries every tick's events, not the last one's", async () => {
  // W5: `mvp_acceptance` collects event kinds over four hundred ticks to prove
  // that taxes are collected and maintenance paid. One message for four hundred
  // ticks that reported only the last tick's events would have it asserting that
  // nothing ever happened.
  const { host, mirror } = started({ ...OPTIONS, width: 48, height: 48 });
  send(host, mirror, { type: "apply", id: 1, command: { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" } });
  const batched = send(host, mirror, { type: "tick", id: 2, count: 48 });
  const kinds = new Set(batched.events.map((e) => e.kind));
  assert.ok(batched.events.length > 1, `a batch of 48 ticks carried ${batched.events.length} events`);
  assert.ok(kinds.size >= 1, "no kinds at all");

  // And the local seam says the same thing, because the two are one API.
  const local = await openLocalSession({ options: { ...OPTIONS, width: 48, height: 48 } });
  await local.apply({ type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const same = await local.tick(48);
  assert.deepEqual(same.events.map((e) => e.kind).sort(), batched.events.map((e) => e.kind).sort());
});

test("a snapshot is the whole city, whatever the mirror had", () => {
  const { host, mirror } = started();
  send(host, mirror, { type: "apply", id: 1, command: { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" } });
  send(host, mirror, { type: "tick", id: 2, count: 5 });
  const reply = send(host, mirror, { type: "snapshot", id: 3 });
  assert.equal(Object.keys(reply.patch.layers).length, TILE_LAYERS.length, "a snapshot left a layer out");
  // And a mirror built from nothing but that snapshot is the same city.
  const fresh = createMirror(reply.patch);
  assert.equal(hashState(fresh), reply.hash);
});

test("a save made in the worker restores in the worker, hash for hash", () => {
  const { host, mirror } = started();
  send(host, mirror, { type: "apply", id: 1, command: { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" } });
  send(host, mirror, { type: "tick", id: 2, count: 20 });
  const saved = host.handle({ type: "save", id: 3 }).reply;
  assert.ok(saved.save, "nothing came back from a save");

  const other = createSimHost();
  const { reply } = other.handle({ type: "init", id: 0, save: saved.save });
  assert.equal(reply.type, "ready", reply.reason);
  assert.equal(reply.hash, hashState(mirror), "a restored city is a different city");
  assert.equal(hashState(createMirror(reply.patch)), reply.hash);
});

test("an unknown message is an error, not a silent drop", () => {
  const { host } = started();
  const { reply } = host.handle({ type: "nonsense", id: 9 });
  assert.equal(reply.type, "error");
  assert.equal(reply.id, 9);
});

test("the local seam and the worker play the same game, command for command", async () => {
  // What `tools/worker_smoke.mjs` proves in a browser, in milliseconds and
  // without one: the two sides of the seam are interchangeable or the lane has
  // not delivered anything. It is a different question from the fixtures above,
  // which prove the worker matches the PINNED hashes — this one proves the two
  // implementations match each other over a city neither of them has seen.
  const script = [
    { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" },
    road(1, 8, 8, 12, 48),
    road(1, 8, 12, 12, 48),
    { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(
      Array.from({ length: 36 }, (unused, i) => (9 + Math.floor(i / 12)) * 48 + 8 + (i % 12))) },
  ];
  const options = { seed: 11, width: 48, height: 48, seats: 1 };

  const host = createSimHost();
  const ready = host.handle({ type: "init", id: 0, options }).reply;
  const mirror = createMirror(ready.patch);
  const local = await openLocalSession({ options });

  for (const command of script) {
    const reply = send(host, mirror, { type: "apply", id: 1, command: { ...command } });
    const outcome = await local.apply({ ...command });
    assert.equal(outcome.result, reply.result, `${command.type}: the two seams disagree`);
    assert.equal(await local.hash(), reply.hash, `${command.type}: the hash moved`);
  }
  // And a tick COUNT is the same as that many ticks: the seam takes one so a
  // fixture city costs one message, and a count that drifted would be a city
  // that is a month ahead on one thread.
  const ticked = send(host, mirror, { type: "tick", id: 2, count: 60 });
  await local.tick(60);
  assert.equal(await local.hash(), ticked.hash);
  assert.equal(hashState(mirror), ticked.hash, "the mirror fell behind over sixty ticks");
  assert.ok(local.state.population >= 0 && local.state.tick === 60);
});

// --- the fixtures, through the worker ---------------------------------------

const names = await fixtureNames();

for (const name of names) {
  test(`fixture ${name} replays through the worker, mirror and all`, async (t) => {
    const fixture = await readFixture(name);
    // `empty.json` is a bare `createState` with no terrain in it — a shape the
    // worker's init does not have and the game never asks for (a city is
    // generated or restored from a save). The two generated fixtures are what
    // this test is about.
    if (fixture.generate === false) return t.skip("not a generated world");
    const host = createSimHost();
    const init = host.handle({ type: "init", id: 0, options: fixture.options }).reply;
    assert.equal(init.type, "ready", init.reason);
    const mirror = createMirror(init.patch);

    const problems = [];
    fixture.steps.forEach((step, i) => {
      const repeat = step.repeat ?? 1;
      let reply;
      for (let n = 0; n < repeat; n += 1) {
        reply = send(host, mirror, { type: "apply", id: i, command: { ...step.command } });
      }
      const at = `${name} step ${i} (${step.command.type})`;
      if (step.result !== undefined && step.result !== reply.result) {
        problems.push(`${at}: result ${reply.result}, pinned ${step.result}`);
      }
      if (step.hash !== undefined && step.hash !== reply.hash) {
        problems.push(`${at}: the WORKER's hash is ${reply.hash}, pinned ${step.hash}`);
      }
      const mirrored = hashState(mirror);
      if (mirrored !== reply.hash) {
        problems.push(`${at}: the MIRROR is ${mirrored}, the worker says ${reply.hash}`);
      }
    });
    assert.deepEqual(problems, [], `\n  ${problems.join("\n  ")}`);
  });
}
