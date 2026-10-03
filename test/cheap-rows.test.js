// The cheap rows (slice T7; A70).
//
// Five definitions that cost a row and a kit each: a clinic, two headquarters,
// a reservoir and a waste facility. The item calls them cheap because they
// reuse machinery that already works — and the test that matters is the one
// that checks they actually reuse it rather than carrying a field that LOOKS
// like a rule.
//
// Two of the five were specified in terms of fields nothing reads (`storage`
// on the water tower, `capacity` on the hospital — Q119, Q127), so they are
// built without them: the reservoir is a bigger groundwater pump and the
// headquarters are a bigger radius. Adding a dead field to two more buildings
// is how `landValueBonus` reached four.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { generateWorld } from "../engine/worldgen.js";
import { catalogue, definition, definitionIds } from "../engine/catalogue.js";
import { coveragePass, pollutionPass } from "../engine/civic.js";
import { utilitiesPass } from "../engine/utilities.js";
import { rules } from "../engine/rules.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_TICK } from "../engine/commands.js";
import { FLAG_POWERED, FLAG_WATERED, TICKS_PER_YEAR, ZONE_INDUSTRIAL } from "../engine/constants.js";
import { tileAt, distance } from "../shared/grid.js";
// For their side effects: without them a node test ticks a city whose reducer
// has no handlers and whose monthly passes do not exist, silently.
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import { NET_PRESENT } from "../engine/network.js";

const W = 40;
const at = (x, y) => tileAt(W, x, y);
const buildings = JSON.parse(readFileSync(join(repoRoot, "data", "buildings.json"), "utf8"));

function city() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 9 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  state.players[0].treasury = 1000000;
  state.quests.vars.push({ name: "rank", value: 4 });
  return state;
}

function place(state, def, x, y) {
  const result = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def, x, y });
  assert.equal(result.result, "ok", `${def} was refused: ${result.result}`);
  const spec = definition(def);
  for (let dy = 0; dy < spec.h; dy += 1) {
    for (let dx = 0; dx < spec.w; dx += 1) {
      state.tiles.flags[at(x + dx, y + dy)] |= FLAG_POWERED | FLAG_WATERED;
    }
  }
}

// --- the rows -----------------------------------------------------------------

test("the five rows are in the catalogue and the mirror agrees", () => {
  // The item's own `test/catalogue.test.js`, which this project has always kept
  // in `test/utilities.test.js` beside the other catalogue checks — asserted
  // again here for the five, because a mirror that drifts is the one failure
  // the engine cannot see (it may not read the JSON).
  for (const id of ["clinic", "policeHQ", "fireHQ", "reservoir", "wasteFacility"]) {
    assert.ok(definition(id), `${id} is not in the catalogue`);
    assert.deepEqual(catalogue()[id], buildings[id], `${id} has drifted from the JSON`);
  }
  assert.equal(definitionIds().length, 28, `${definitionIds().length} definitions`);
});

test("a clinic is a small hospital and an HQ is a big station", () => {
  const clinic = definition("clinic");
  const hospital = definition("hospital");
  assert.equal(clinic.service, "health");
  assert.equal(clinic.w, 1);
  assert.ok(clinic.radius < hospital.radius, "a clinic reaches as far as a hospital");
  assert.ok(clinic.cost < hospital.cost, "a clinic costs as much as a hospital");

  for (const [hq, station, service] of [["policeHQ", "policeStation", "police"],
    ["fireHQ", "fireStation", "fire"]]) {
    const big = definition(hq);
    const small = definition(station);
    assert.equal(big.service, service);
    assert.equal(big.w, 3);
    assert.ok(big.radius > small.radius, `${hq} reaches no further than ${station}`);
    assert.ok(big.upkeep > small.upkeep, `${hq} costs no more to run than ${station}`);
    // And NOT by carrying `capacity`, which nothing reads (Q127).
    assert.equal(big.capacity, undefined, `${hq} carries a capacity the simulation ignores`);
  }
});

test("a reservoir is water, not a promise of water", () => {
  // The item asked for `storage`, "like the tower". The tower's `storage` is
  // read by nothing (Q119): `supplyPass` allocates per month with no carry-over
  // for a store to fill. So the reservoir produces instead — and the test that
  // says so is a supply measurement, not a field check.
  const spec = definition("reservoir");
  assert.equal(spec.storage, undefined, "the reservoir carries a field nothing reads");
  assert.ok(spec.water > definition("groundwaterPump").water,
    "a reservoir yields no more than a groundwater pump");
  assert.notEqual(spec.needsSurfaceWater, true, "a reservoir needs a shore");

  const state = city();
  place(state, "reservoir", 10, 10);
  // On a pipe: `supplyPass` counts producers that touch a network, and a
  // reservoir in a field supplies nobody however much it holds.
  for (let y = 9; y <= 12; y += 1) state.tiles.pipe[at(9, y)] = NET_PRESENT;
  utilitiesPass(state);
  assert.ok(state.supply.water.capacity >= spec.water,
    `a reservoir added ${state.supply.water.capacity} of water`);
});

// --- what the waste facility does ---------------------------------------------

test("a waste facility cleans the ground around it, and stops", () => {
  const spec = definition("wasteFacility");
  assert.ok(spec.pollution < 0, "a waste facility pollutes");
  assert.ok(spec.pollutionRadius > spec.w, "its reach is its own footprint");

  // Dirty ground to clean: a block of industry, which is what the pollution
  // pass reads as a source.
  const build = (withFacility) => {
    const state = city();
    for (let x = 6; x < 20; x += 1) {
      for (let y = 6; y < 20; y += 1) {
        state.buildings.push({ id: 500 + y * W + x, def: "", zone: ZONE_INDUSTRIAL, x, y, w: 1, h: 1,
          owner: 1, level: 3, valueTier: 0, occupancy: 0, condition: 100, builtTick: 0, flags: 0 });
      }
    }
    if (withFacility) place(state, "wasteFacility", 12, 12);
    pollutionPass(state);
    return state;
  };
  const dirty = build(false);
  const cleaned = build(true);
  const near = at(12 + spec.pollutionRadius - 2, 12);
  assert.ok(dirty.tiles.pollution[near] > 0, "the fixture is not dirty, so this proves nothing");
  assert.ok(cleaned.tiles.pollution[near] < dirty.tiles.pollution[near],
    `the facility cleaned nothing: ${cleaned.tiles.pollution[near]} against ${dirty.tiles.pollution[near]}`);

  // And it stops: well outside the radius the two cities are the same.
  const far = at(12 + spec.pollutionRadius + 6, 12);
  assert.ok(distance(12, 12, 12 + spec.pollutionRadius + 6, 12) > spec.pollutionRadius);
  assert.equal(cleaned.tiles.pollution[far], dirty.tiles.pollution[far],
    "the facility cleans the whole map");
});

test("one mechanism for a source with a reach, whichever sign it has", () => {
  // T5's airport was the first building whose pollution carried past its
  // fence, under the name `noiseRadius`. The waste facility is the same
  // arithmetic with the sign the other way round, so the field is
  // `pollutionRadius` now — one idea, one name.
  const carrying = definitionIds().filter((id) => definition(id).pollutionRadius !== undefined).sort();
  assert.deepEqual(carrying, ["airport", "wasteFacility"]);
});

// --- coverage, through the machinery that already exists ----------------------

test("a clinic and an HQ deposit into the fields they name", () => {
  const state = city();
  place(state, "clinic", 10, 10);
  place(state, "policeHQ", 24, 10);
  coveragePass(state);
  // Nothing to assert on a layer — health and police are folded in rather than
  // stored (T6 gave layers to leisure and education only) — so this reads the
  // pass's own fields, which is what crime and health do.
  const fields = coveragePass(state);
  assert.ok(fields.health[at(11, 10)] > 0, "the clinic covers nobody");
  assert.ok(fields.police[at(25, 10)] > 0, "the headquarters covers nobody");
  assert.equal(fields.health[at(24, 10)], 0, "a clinic in one corner covers the other");
});

// --- the deputy ----------------------------------------------------------------

test("the deputy considers all five", () => {
  // Five rows nobody builds are five rows no gate city has, which is the shape
  // of B1a's fire service and T6's schools. A twenty-year city is the smallest
  // fixture that reaches the thresholds.
  const world = generateWorld(defaultOptions({ seed: 1003, width: 64, height: 64, seats: 1,
    waterStyle: "river" }));
  assert.ok(world.ok);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= TICKS_PER_YEAR * 25; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  const built = (id) => state.buildings.filter((b) => b.def === id).length;
  const got = Object.fromEntries(["clinic", "policeHQ", "fireHQ", "reservoir", "wasteFacility"]
    .map((id) => [id, built(id)]));
  assert.ok(got.clinic > 0, `no clinic in twenty-five years: ${JSON.stringify(got)}`);
  assert.ok(got.policeHQ + got.fireHQ > 0, `no headquarters: ${JSON.stringify(got)}`);
  assert.ok(got.wasteFacility > 0, `nothing to take the rubbish: ${JSON.stringify(got)}`);
});

// --- the mayor plants parks and builds police stations (H3; A99, Q133/Q111) --

test("a played city has parks and a police station in it", () => {
  // The fourth and fifth time this shape has been found: the fire station
  // before B1a, the school before T6, and now the park and the police station.
  // Before this slice a 25-year deputy city contained **0 parks** — the 1x1
  // that carries `landValueBonus`, 60 to build and 2 a month — and **0 police
  // stations**, so B3b's patrols were correct, tested, and invisible in every
  // headless city this project has ever measured.
  //
  // The reason is not the land value or the crime. It is that every balance
  // number in this project is measured on a city that has neither.
  const world = generateWorld(defaultOptions({ seed: 1003, width: 64, height: 64, seats: 1,
    waterStyle: "river" }));
  assert.ok(world.ok);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= TICKS_PER_YEAR * 25; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  const built = (id) => state.buildings.filter((b) => b.def === id).length;
  assert.ok(built("park") > 0, `no park in twenty-five years (${state.buildings.length} buildings)`);
  assert.ok(built("policeStation") > 0,
    `no police station in twenty-five years (${built("fireStation")} fire stations stand)`);

  // And the deputy did not SCATTER them, which is why T6 chose the plaza over
  // the park in the first place ("a park is 1x1 and the spot search would
  // scatter forty of them"). The ration itself is asserted continuously below —
  // at the END it cannot be, because a city that loses buildings to fire and
  // decay satisfies or breaks a ration it met when it bought them.
  const city = state.buildings.filter((b) => b.owner === 1).length;
  assert.ok(built("park") * 10 <= city,
    `${built("park")} parks in a city of ${city} buildings reads as scatter, not as parks`);
});

test("the ration holds all the way up, not only at the end", () => {
  // `(n + 1) * per <= others`, not `n * per < others`: the second is true the
  // moment a town has one building, which is how T7's clinic bought itself at a
  // town of one and bankrupted it. Checked at every turn rather than at the
  // end, because a city that shrinks can satisfy a ration it broke on the way.
  const world = generateWorld(defaultOptions({ seed: 1003, width: 64, height: 64, seats: 1,
    waterStyle: "river" }));
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, "expand");
  const cfg = rules().deputy;
  let worst = "";
  for (let tick = 1; tick <= TICKS_PER_YEAR * 10; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 !== 0) continue;
    deputyTurn(state, deputy);
    const mine = state.buildings.filter((b) => b.owner === 1);
    for (const [id, per] of [["park", cfg.buildingsPerPark], ["policeStation", cfg.buildingsPerPolice]]) {
      const n = mine.filter((b) => b.def === id).length;
      const others = mine.length - n;
      if (n * per > others) worst = `${n} ${id} against ${others} others at tick ${tick}`;
    }
  }
  assert.equal(worst, "", worst);
});

