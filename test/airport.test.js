// The airport (slice T5a; A69).
//
// The first building in the catalogue with an AXIS. A runway that runs the wrong
// way is not a bug the simulation can feel — the footprint is the same number of
// tiles either way — so the orientation is validated where it arrives and stored
// as the footprint the reducer actually claimed, rather than as a field the
// renderer is trusted to interpret.
//
// It is also the first building with a rule about the GROUND under it. The
// engine has no metres and no grade: `tiles.elevation` is a u8 per tile, so the
// rule is a maximum drop across the whole footprint, sampled per tile and not
// at the corners — a hump in the middle of a runway is the case corners cannot
// see.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { rules } from "../engine/rules.js";
import { definition, definitionIds } from "../engine/catalogue.js";
import { pollutionPass } from "../engine/civic.js";
import { gateStatus, gateTerms, gateFare } from "../engine/gates.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_PLACE_ROAD } from "../engine/commands.js";
import { FLAG_POWERED, ZONE_RESIDENTIAL } from "../engine/constants.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns, distance } from "../shared/grid.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/civic.js";

const W = 40;
const at = (x, y) => tileAt(W, x, y);
const SPEC = () => definition("airport");

function city() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  state.players[0].treasury = 1000000;
  state.quests.vars.push({ name: "rank", value: 3 });
  return state;
}

const build = (state, x, y, over = {}) =>
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "airport", x, y, ...over });

/** Power and a road for the airport, so it is a LIVE gate rather than a dead
 * one — the two reasons that are not about where it stands. */
function connect(state, building) {
  for (let dy = 0; dy < building.h; dy += 1) {
    for (let dx = 0; dx < building.w; dx += 1) {
      state.tiles.flags[at(building.x + dx, building.y + dy)] |= FLAG_POWERED;
    }
  }
  const cells = [];
  for (let dx = 0; dx < building.w; dx += 1) cells.push(at(building.x + dx, building.y - 1));
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
}

// --- the axis ----------------------------------------------------------------

test("the airport is the size the work item asks for, and it has an axis", () => {
  assert.equal(SPEC().w, 6);
  assert.equal(SPEC().h, 4);
  assert.equal(SPEC().orientable, true);
});

test("an orientation that is not one of the two is refused", () => {
  const state = city();
  assert.equal(build(state, 5, 5, { orientation: 2 }).result, RESULT.INVALID);
  assert.equal(build(state, 5, 5, { orientation: -1 }).result, RESULT.INVALID);
  assert.equal(build(state, 5, 5, { orientation: "1" }).result, RESULT.INVALID);
  assert.equal(build(state, 5, 5, { orientation: 1.5 }).result, RESULT.INVALID);
  assert.equal(state.buildings.length, 0, "a malformed orientation built something");
  assert.equal(build(state, 5, 5, { orientation: 0 }).result, RESULT.OK);
});

test("nothing else in the catalogue may be turned", () => {
  // A rotation the renderer does not draw is a footprint that does not match
  // the building. Only a definition that says it has an axis has one.
  const state = city();
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 5, y: 5, orientation: 1 }).result,
    RESULT.INVALID);
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 5, y: 5, orientation: 0 }).result,
    RESULT.OK, "orientation 0 is the only orientation a square thing has");
});

test("turning the airport turns its footprint, not only a field", () => {
  const state = city();
  assert.equal(build(state, 5, 5, { orientation: 1 }).result, RESULT.OK);
  const built = state.buildings[0];
  assert.equal(built.w, 4);
  assert.equal(built.h, 6);
  assert.equal(state.tiles.buildingId[at(8, 10)], built.id, "the long side did not run north");
  assert.equal(state.tiles.buildingId[at(10, 5)], 0, "the short side is still six tiles wide");
});

test("a turned airport fits where an untuned one does not", () => {
  // The rule that matters: the reducer tests the tiles it is about to claim,
  // so the map edge answers differently for the two orientations.
  const state = city();
  assert.equal(build(state, W - 5, 5, { orientation: 0 }).result, RESULT.INVALID, "six tiles fitted in five");
  assert.equal(build(state, W - 5, 5, { orientation: 1 }).result, RESULT.OK);
});

// --- the ground --------------------------------------------------------------

test("a footprint that is not flat enough is refused", () => {
  const state = city();
  const drop = rules().airport.maxDrop;
  assert.ok(drop > 0, "the flatness rule is off");
  for (let dx = 0; dx < 6; dx += 1) {
    for (let dy = 0; dy < 4; dy += 1) state.tiles.elevation[at(5 + dx, 5 + dy)] = dx * 4;
  }
  assert.ok(5 * 4 > drop, "the fixture's slope is inside the rule, so this proves nothing");
  assert.equal(build(state, 5, 5).result, RESULT.INVALID);

  // Flattened, the same tiles take it.
  for (let dx = 0; dx < 6; dx += 1) {
    for (let dy = 0; dy < 4; dy += 1) state.tiles.elevation[at(5 + dx, 5 + dy)] = 12;
  }
  assert.equal(build(state, 5, 5).result, RESULT.OK, "a flat plateau was refused");
});

test("a hump in the middle is refused, which is what corners cannot see", () => {
  const state = city();
  const drop = rules().airport.maxDrop;
  state.tiles.elevation[at(8, 6)] = drop + 1;
  assert.equal(build(state, 5, 5).result, RESULT.INVALID);
  state.tiles.elevation[at(8, 6)] = drop;
  assert.equal(build(state, 5, 5).result, RESULT.OK, "a drop exactly at the limit was refused");
});

test("the flatness rule reads the whole footprint, turned or not", () => {
  const state = city();
  // A ridge that the 6x4 footprint misses and the 4x6 one crosses.
  for (let x = 0; x < W; x += 1) state.tiles.elevation[at(x, 10)] = rules().airport.maxDrop + 2;
  assert.equal(build(state, 5, 5, { orientation: 0 }).result, RESULT.OK, "rows 5-8 are flat");
  assert.equal(build(state, 20, 5, { orientation: 1 }).result, RESULT.INVALID,
    "the turned footprint reaches row 10 and did not notice");
});

// --- the noise ---------------------------------------------------------------

test("the noise reaches past the fence, and stops", () => {
  const state = city();
  const spec = SPEC();
  assert.ok(spec.pollutionRadius > spec.w, "the noise does not reach past the footprint");
  assert.equal(build(state, 12, 12).result, RESULT.OK);
  pollutionPass(state);
  const cx = 12 + (spec.w >> 1);
  const cy = 12 + (spec.h >> 1);
  const onSite = state.tiles.pollution[at(cx, cy)];
  assert.ok(onSite > 0, "an airport makes no noise at all");

  // Monotone outward, and nothing left by the time the radius and the blur are
  // both spent — a field that never reaches zero is a map-wide offset, not a
  // noise radius.
  const near = state.tiles.pollution[at(cx + 2, cy)];
  const far = state.tiles.pollution[at(cx + spec.pollutionRadius - 1, cy)];
  assert.ok(near > far, `noise did not fall off: ${near} at 2 tiles, ${far} at the edge`);
  assert.ok(far > 0, "the noise does not reach its own radius");
  assert.equal(state.tiles.pollution[at(cx + spec.pollutionRadius + 3, cy)], 0,
    "the noise carries beyond its radius");
  assert.ok(distance(cx, cy, cx + spec.pollutionRadius + 3, cy) > spec.pollutionRadius);
});

test("the airport is the only thing in the catalogue that is LOUD", () => {
  // The airport is loud because it is an airport. A second definition carrying
  // the field would be a rule spreading by copy, which is how `landValueBonus`
  // ended up on four definitions that do not use it (Q119).
  const spread = definitionIds().filter((id) => (definition(id).pollution ?? 0) > 0
    && definition(id).pollutionRadius !== undefined);
  assert.deepEqual(spread, ["airport"]);
});

// --- the gate ----------------------------------------------------------------

test("the sky is always open: an airport needs no line and no shore", () => {
  const state = city();
  assert.equal(build(state, 12, 12).result, RESULT.OK);
  const airport = state.buildings[0];
  assert.equal(gateStatus(state, airport).reason, "unpowered", "an unpowered airport blamed the ground");
  connect(state, airport);
  const status = gateStatus(state, airport);
  assert.equal(status.gate, "air");
  assert.equal(status.live, true, `a connected airport is dead: ${status.reason}`);
});

test("the airport's terms are the largest there are", () => {
  const gate = rules().gate;
  for (const term of ["residential", "commercial", "industrial"]) {
    assert.ok(gate.air[term] >= gate.rail[term] && gate.air[term] >= gate.sea[term],
      `the airport's ${term} term is not the largest`);
  }
  const state = city();
  build(state, 12, 12);
  connect(state, state.buildings[0]);
  assert.deepEqual(gateTerms(state), {
    residential: gate.air.residential,
    commercial: gate.air.commercial,
    industrial: gate.air.industrial,
  });
});

test("the landing fee arrives whether or not anybody lives near it", () => {
  // Every other gate earns per resident in range. An airport earns from the
  // aircraft as well, which is a flat monthly term — so a live airport in an
  // empty region is still worth something, and a dead one is worth nothing.
  const state = city();
  build(state, 12, 12);
  const airport = state.buildings[0];
  assert.equal(gateFare(state, 1), 0, "a dead airport charged a landing fee");
  connect(state, airport);
  const fee = rules().gate.air.landingFee;
  assert.ok(fee > 0, "there is no landing fee");
  assert.equal(gateFare(state, 1), fee);

  state.buildings.push({ id: 900, def: "", zone: ZONE_RESIDENTIAL, x: 14, y: 20, w: 1, h: 1,
    owner: 1, level: 1, valueTier: 0, occupancy: 30, condition: 100, builtTick: 0, flags: 0 });
  assert.equal(gateFare(state, 1), fee + 30 * rules().gate.air.farePerResident);
});

test("asking about a gate twice leaves the state alone", () => {
  const state = city();
  build(state, 12, 12);
  connect(state, state.buildings[0]);
  const before = hashState(state);
  gateStatus(state, state.buildings[0]);
  gateTerms(state);
  gateFare(state, 1);
  assert.equal(hashState(state), before, "reading the Outside wrote to the state");
});

test("the airport is the dearest thing in the catalogue", () => {
  const spec = SPEC();
  assert.ok(spec.cost >= 10000, `the airport costs ${spec.cost}`);
  assert.ok(spec.upkeep > definition("coalPlant").upkeep);
});

test("no building stands on a plinth taller than the limit (A120, Q144)", () => {
  // The airport's own flatness rule is `airport.maxDrop` and is about a runway.
  // This is every building: a lot is seated on its lowest corner and a plinth
  // makes up the difference (ruling 038), so a 3x3 civic footprint across a
  // hillside is a building buried in it — on a played `hilly` 128 the worst are
  // a coal plant at 28 elevation steps (fourteen metres), a police headquarters
  // at 26 and a rail station at 22.
  const state = city();
  const limit = rules().development.maxPlinth;
  const ramp = (perTile) => {
    for (let y = 0; y < W; y += 1) {
      for (let x = 0; x < W; x += 1) state.tiles.elevation[at(x, y)] = 40 + x * perTile;
    }
  };
  // A 3x3 spans two tiles of ramp.
  ramp(limit / 2);
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 5, y: 5 }).result,
    RESULT.OK, "a plant on a plinth exactly at the limit was refused");
  ramp(limit / 2 + 1);
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 9, y: 5 }).result,
    RESULT.TOO_STEEP, "a plant on a plinth over the limit was accepted");
  // And flat ground takes it, so this is the rule and not the fixture.
  ramp(0);
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 13, y: 5 }).result,
    RESULT.OK);
});
