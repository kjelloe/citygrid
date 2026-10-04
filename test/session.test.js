// The session seam (W1; `workitems-worker.md`).
//
// The seam exists so that W2 can put the reducer on another thread without
// anything above it noticing. That only holds if the seam is EXACTLY the
// reducer: the same results, the same events and — the one that matters — the
// same hash, command for command. So the test that counts here is a second
// world played through the seam beside a world played directly, compared by
// `hashState` at every step.

import test from "node:test";
import assert from "node:assert/strict";
import { apply } from "../engine/reducer.js";
import { openLocalSession } from "../client/session-local.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { hashState } from "../engine/state.js";
import { CMD_JOIN, CMD_TICK, CMD_PLACE_ROAD, CMD_SET_TAX } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { RESULT } from "../shared/protocol.js";
import { loadSystems, readFixture, fixtureNames, fixtureState } from "../tools/fixtures.mjs";

await loadSystems();

const city = () => {
  const world = generateWorld(defaultOptions({ seed: 7, width: 32, height: 32, seats: 1 }));
  assert.ok(world.ok, world.reason);
  return world.state;
};

/** The same handful of commands, in order, for both arms. */
const SCRIPT = [
  { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" },
  { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([8 * 32 + 8, 8 * 32 + 9, 8 * 32 + 10, 8 * 32 + 11]) },
  { type: CMD_SET_TAX, actor: 1, rate: 9 },
  { type: CMD_TICK },
  { type: CMD_TICK },
  // A refusal, which must be a refusal on both sides and must not move a hash.
  { type: CMD_PLACE_ROAD, actor: 99, runs: encodeRuns([2 * 32 + 2, 2 * 32 + 3]) },
];

test("a command through the seam is the same command: result, events and hash", async () => {
  const direct = city();
  const sim = await openLocalSession({ state: city() });
  for (const command of SCRIPT) {
    const a = apply(direct, { ...command });
    const b = await sim.apply({ ...command });
    assert.equal(b.result, a.result, `${command.type}: result`);
    assert.deepEqual(b.events.map((e) => e.type), a.events.map((e) => e.type), `${command.type}: events`);
    assert.equal(await sim.hash(), hashState(direct), `${command.type}: the hash moved`);
  }
});

test("onChange fires once per accepted command, and a refusal is not a change", async () => {
  const sim = await openLocalSession({ state: city() });
  const seen = [];
  const off = sim.onChange((change) => seen.push(change));

  await sim.apply({ type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  assert.equal(seen.length, 1, "a join is a change");
  assert.equal(seen[0].result, RESULT.OK);
  assert.ok(Array.isArray(seen[0].events), "a change carries its events");

  const refused = await sim.apply({ type: CMD_PLACE_ROAD, actor: 99, runs: encodeRuns([2 * 32 + 2, 2 * 32 + 3]) });
  assert.notEqual(refused.result, RESULT.OK, "that command was supposed to be refused");
  assert.equal(seen.length, 1, "a refusal is the caller's business, not a world change");

  // The tick is a call on the seam, not a clock inside it: `game.js` owns the
  // interval and a gate can step the city by hand.
  const before = sim.state.tick;
  await sim.tick();
  assert.equal(sim.state.tick, before + 1);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].tick, sim.state.tick, "a change says which tick it is");

  off();
  await sim.tick();
  assert.equal(seen.length, 2, "unsubscribing has to actually unsubscribe");
});

test("two listeners both hear it, in the order they subscribed", async () => {
  const sim = await openLocalSession({ state: city() });
  const heard = [];
  sim.onChange(() => { heard.push("a"); });
  sim.onChange(() => { heard.push("b"); });
  await sim.tick();
  assert.deepEqual(heard, ["a", "b"]);
});

test("the state is the SAME object, because everything above the seam holds it", async () => {
  const state = city();
  const sim = await openLocalSession({ state });
  assert.equal(sim.state, state);
  await sim.tick();
  assert.equal(sim.state, state, "the seam must never replace the reference it was given");
});

// --- the fixtures, replayed through the seam --------------------------------

const names = await fixtureNames();

for (const name of names) {
  test(`fixture ${name} replays through the seam with every hash matching`, async () => {
    const fixture = await readFixture(name);
    const sim = await openLocalSession({ state: fixtureState(fixture) });
    const problems = [];
    for (let i = 0; i < fixture.steps.length; i += 1) {
      const step = fixture.steps[i];
      let outcome;
      for (let n = 0; n < (step.repeat ?? 1); n += 1) outcome = await sim.apply({ ...step.command });
      const hash = await sim.hash();
      const at = `${name} step ${i} (${step.command.type})`;
      if (step.result !== undefined && step.result !== outcome.result) {
        problems.push(`${at}: result ${outcome.result}, pinned ${step.result}`);
      }
      if (step.hash !== undefined && step.hash !== hash) {
        problems.push(`${at}: hash ${hash}, pinned ${step.hash}`);
        break;
      }
    }
    assert.deepEqual(problems, [], `\n  ${problems.join("\n  ")}`);
  });
}
