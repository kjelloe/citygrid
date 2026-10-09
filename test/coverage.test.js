// Leisure and education coverage (slice T6; A67, A70).
//
// Two more coverage fields in the fire/police/health shape, and the first two
// that get TILE LAYERS of their own — hashed, saved, and drawn as overlays,
// because they are what the landmark table has been asking for since T4 and a
// field that only exists inside one monthly pass cannot be looked at.
//
// The test that matters is not "the layer has numbers in it". It is that a
// school CHANGES something: a coverage layer nothing reads is the same shape as
// `landValueBonus`, which has been on the park since the catalogue was written
// and has never moved a single lot (Q119).

import test from "node:test";
import assert from "node:assert/strict";
import { createState, copyState, hashState, TILE_LAYERS } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { generateWorld } from "../engine/worldgen.js";
import { rules } from "../engine/rules.js";
import { definition, definitionIds } from "../engine/catalogue.js";
import { coveragePass, civicPass } from "../engine/civic.js";
import { computeDemand } from "../engine/development.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_PLACE_ROAD, CMD_TICK, CMD_PAINT_ZONE } from "../engine/commands.js";
import { FLAG_POWERED, FLAG_WATERED, TICKS_PER_YEAR, ZONE_RESIDENTIAL } from "../engine/constants.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { NET_PRESENT } from "../engine/network.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";

const W = 32;
const at = (x, y) => tileAt(W, x, y);

function city() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 7 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  state.players[0].treasury = 1000000;
  state.quests.vars.push({ name: "rank", value: 4 });
  return state;
}

/** A building, supplied, so it is not a station with the lights off. */
function place(state, def, x, y, { powered = true, watered = true } = {}) {
  const result = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def, x, y });
  assert.equal(result.result, "ok", `${def} was refused: ${result.result}`);
  const spec = definition(def);
  for (let dy = 0; dy < spec.h; dy += 1) {
    for (let dx = 0; dx < spec.w; dx += 1) {
      const tile = at(x + dx, y + dy);
      if (powered) state.tiles.flags[tile] |= FLAG_POWERED;
      if (watered) state.tiles.flags[tile] |= FLAG_WATERED;
    }
  }
  return result;
}

// --- the layers ---------------------------------------------------------------

test("leisure and education are tile layers, and the hash can see them", () => {
  const names = TILE_LAYERS.map((l) => l.name);
  for (const layer of ["leisure", "education"]) {
    assert.ok(names.includes(layer), `${layer} is not a tile layer`);
    assert.equal(TILE_LAYERS.find((l) => l.name === layer).kind, "u8");
  }
  // One source for the layers (`TILE_LAYERS`), so the hash follows the list —
  // and this is what proves it rather than assuming it.
  const state = city();
  const before = hashState(state);
  state.tiles.leisure[at(3, 3)] = 42;
  assert.notEqual(hashState(state), before, "the leisure layer is not hashed");
  const mid = hashState(state);
  state.tiles.education[at(3, 3)] = 42;
  assert.notEqual(hashState(state), mid, "the education layer is not hashed");
});

test("copyState deep-copies both layers", () => {
  const state = city();
  state.tiles.leisure[at(5, 5)] = 90;
  state.tiles.education[at(5, 5)] = 80;
  const copy = copyState(state);
  copy.tiles.leisure[at(5, 5)] = 0;
  copy.tiles.education[at(5, 5)] = 0;
  assert.equal(state.tiles.leisure[at(5, 5)], 90, "the leisure layer is shared, not copied");
  assert.equal(state.tiles.education[at(5, 5)], 80, "the education layer is shared, not copied");
});

// --- the deposit ---------------------------------------------------------------

test("coverage falls off with distance and stops at the radius", () => {
  const state = city();
  place(state, "school", 16, 16);
  coveragePass(state);
  const spec = definition("school");
  const near = state.tiles.education[at(16 + 1, 16)];
  const far = state.tiles.education[at(16 + spec.radius - 1, 16)];
  assert.ok(near > 0, "a school covers nothing at all");
  assert.ok(near > far, `coverage does not fall off: ${near} beside it, ${far} at the edge`);
  assert.equal(state.tiles.education[at(16 + spec.radius + 3, 16)], 0,
    "a school covers ground well outside its radius");
  // And it is education, not leisure: two layers that move together are one
  // layer with two names.
  assert.equal(state.tiles.leisure[at(16 + 1, 16)], 0, "a school fed the leisure layer");
});

test("a park feeds leisure, and is still not a department", () => {
  // The landmark table asks for parks to count as leisure (A67). `service` is
  // what a department is — it is what funding and the quests' `serviceBuildings`
  // count — and a park is not one, so the field a building deposits into is its
  // own: `coverage`.
  const state = city();
  place(state, "park", 16, 16);
  coveragePass(state);
  assert.ok(state.tiles.leisure[at(16, 16)] > 0, "a park covers no leisure");
  assert.equal(definition("park").service, undefined, "the park became a department");
  assert.equal(definition("park").coverage, "leisure");
});

test("an unsupplied school is half a school, and an unlit one half again", () => {
  const lit = city();
  place(lit, "school", 16, 16);
  coveragePass(lit);

  const dark = city();
  place(dark, "school", 16, 16, { powered: false });
  coveragePass(dark);

  const dry = city();
  place(dry, "school", 16, 16, { powered: false, watered: false });
  coveragePass(dry);

  const read = (s) => s.tiles.education[at(17, 16)];
  assert.ok(read(lit) > read(dark), `${read(lit)} lit against ${read(dark)} unpowered`);
  assert.ok(read(dark) > read(dry), `${read(dark)} unpowered against ${read(dry)} unsupplied`);
});

test("funding moves both layers, because they are departments too", () => {
  const lean = city();
  const rich = city();
  for (const state of [lean, rich]) {
    place(state, "school", 16, 16);
    place(state, "library", 10, 16);
  }
  lean.funding.education = 50;
  lean.funding.leisure = 50;
  rich.funding.education = 150;
  rich.funding.leisure = 150;
  coveragePass(lean);
  coveragePass(rich);
  assert.ok(rich.tiles.education[at(17, 16)] > lean.tiles.education[at(17, 16)],
    "funding does not reach education");
  assert.ok(rich.tiles.leisure[at(11, 16)] > lean.tiles.leisure[at(11, 16)],
    "funding does not reach leisure");
});

// --- what they are FOR ---------------------------------------------------------

test("a school raises the odds a home in range develops", () => {
  // The whole item. Two cities, identical but for one school, zoned and
  // supplied the same way, run the same number of months from the same seed.
  const build = (withSchool) => {
    const state = city();
    const cells = [];
    for (let x = 4; x < 28; x += 1) cells.push(at(x, 15));
    apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
    const zone = [];
    for (let x = 6; x < 26; x += 1) { zone.push(at(x, 14)); zone.push(at(x, 16)); }
    apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(zone), zone: ZONE_RESIDENTIAL });
    // Real carriers, not hand-set flags: `supplyPass` recomputes them from the
    // networks every month, so a city supplied by writing `FLAG_POWERED` grows
    // nothing and looks exactly like a city where the school did not help.
    // The fixture check below is what said so.
    place(state, "coalPlant", 4, 20);
    place(state, "groundwaterPump", 8, 20);
    for (let x = 4; x < 28; x += 1) {
      for (const y of [14, 15, 16, 20, 21]) {
        state.tiles.wire[at(x, y)] = NET_PRESENT;
        state.tiles.pipe[at(x, y)] = NET_PRESENT;
      }
    }
    for (let y = 14; y <= 21; y += 1) {
      state.tiles.wire[at(5, y)] = NET_PRESENT;
      state.tiles.pipe[at(5, y)] = NET_PRESENT;
    }
    if (withSchool) place(state, "school", 15, 18);
    for (let tick = 1; tick <= TICKS_PER_YEAR * 6; tick += 1) apply(state, { type: CMD_TICK });
    return state.buildings.filter((b) => b.zone === ZONE_RESIDENTIAL).length;
  };
  const without = build(false);
  const withIt = build(true);
  assert.ok(without > 0, "nothing developed at all, so this proves nothing");
  assert.ok(withIt > without,
    `a school changed nothing: ${withIt} homes with it, ${without} without`);
});

test("both layers reach land value and the demand pool", () => {
  const bare = city();
  const served = city();
  place(served, "library", 16, 16);
  place(served, "school", 10, 16);
  // Through the monthly pass, which is the only caller that has the coverage
  // and the density `landValuePass` takes.
  for (const state of [bare, served]) civicPass(state);
  assert.ok(served.tiles.landValue[at(16, 16)] > bare.tiles.landValue[at(16, 16)],
    "coverage does not reach land value");

  // And the pool: a city with schools and parks is a city more people want to
  // move to (A67). Measured on the residential term, which is the one the
  // design names.
  const pool = (state) => computeDemand(state).residential;
  assert.ok(pool(served) > pool(bare),
    `coverage does not reach demand: ${pool(served)} against ${pool(bare)}`);
});

// --- the catalogue --------------------------------------------------------------

test("the five buildings are the ones the item asks for", () => {
  const wanted = {
    stadium: { w: 4, h: 4, coverage: "leisure" },
    plaza: { w: 2, h: 2, coverage: "leisure" },
    library: { w: 2, h: 2, coverage: "leisure" },
    school: { w: 2, h: 2, coverage: "education" },
    university: { w: 4, h: 4, coverage: "education" },
  };
  for (const [id, spec] of Object.entries(wanted)) {
    const def = definition(id);
    assert.ok(def, `${id} is not in the catalogue`);
    assert.equal(def.w, spec.w, `${id} is ${def.w} wide`);
    assert.equal(def.h, spec.h, `${id} is ${def.h} deep`);
    assert.equal(def.coverage, spec.coverage, `${id} covers ${def.coverage}`);
    assert.ok(def.radius > 0, `${id} has no radius to cover with`);
  }
  assert.equal(definition("university").unlock, 4, "the university is not the rank-4 building");
  assert.ok(definitionIds().length >= 23, `${definitionIds().length} definitions`);
});

test("the deputy builds for both of them", () => {
  // A coverage layer nothing builds for is a layer every headless city reads as
  // zero — which is how B1a found that no gate city had ever had a fire service.
  const world = generateWorld(defaultOptions({ seed: 1003, width: 64, height: 64, seats: 1,
    waterStyle: "river" }));
  assert.ok(world.ok);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= TICKS_PER_YEAR * 20; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  const built = (id) => state.buildings.filter((b) => b.def === id).length;
  assert.ok(built("school") > 0, "twenty years and no school");
  assert.ok(built("park") + built("plaza") > 0, "twenty years and nowhere to sit");
  // And the layers are not zero in a city the deputy played.
  let covered = 0;
  for (let i = 0; i < state.tiles.education.length; i += 1) {
    if (state.tiles.education[i] > 0) covered += 1;
  }
  assert.ok(covered > 50, `only ${covered} tiles have any education coverage`);
});

// --- X4g: mutual aid, era 31 -------------------------------------------------
//
// "My fire station covers your street if it is in range. This is a gift, not a
// bug — it is what makes a neighbour worth having" (`specs/plan.md` §2.6,
// ruling 001). It was a gift nobody could decline: `coveragePass` deposited
// into the field with no idea whose ground it was, and `mutualAid` has been on
// `test/omissions.test.js`'s unread list since Wave 0.

/** Two seats, so there is a border for the aid to cross or stop at. */
function region() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 7, seats: 2 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  state.players[0].treasury = 1000000;
  state.players[1].treasury = 1000000;
  state.quests.vars.push({ name: "rank", value: 4 });
  state.quests.vars.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return state;
}

test("a station covers a neighbour's ground, or does not, by the lobby's option (X4g)", () => {
  // A BLOCK of their land, not one tile: the fields are smoothed at radius 1
  // after the deposit, so a single withheld tile surrounded by covered ones
  // reads 58 rather than 0 — the blur crosses a border one tile wide. The
  // interior of a block is what the rule is actually about, and the edge
  // bleeding a little is the same blur every other field has.
  const theirs = at(20, 16);
  const nobodys = at(16, 20);
  const read = (aid) => {
    const state = region();
    state.options.mutualAid = aid;
    place(state, "school", 16, 16);
    for (let y = 14; y <= 18; y += 1) {
      for (let x = 18; x <= 22; x += 1) state.tiles.owner[at(x, y)] = 2;
    }
    coveragePass(state);
    return { theirs: state.tiles.education[theirs], nobodys: state.tiles.education[nobodys] };
  };
  const given = read(true);
  const withheld = read(false);
  assert.ok(given.theirs > 0, "the gift was never given");
  assert.equal(withheld.theirs, 0, "aid was withheld and the neighbour was covered anyway");
  // **Unowned ground is nobody's and is still covered.** Withholding aid is
  // about a NEIGHBOUR, not about the map: a seat that could not cover the
  // commons could not cover ground it is about to claim.
  assert.ok(withheld.nobodys > 0, "withholding aid stopped a station covering the commons");
  assert.equal(given.nobodys, withheld.nobodys, "the option changed the wrong tiles");
});

test("withholding aid does not stop a seat covering its OWN ground (X4g)", () => {
  const state = region();
  state.options.mutualAid = false;
  const mine = at(19, 16);
  state.tiles.owner[mine] = 1;
  place(state, "school", 16, 16);
  coveragePass(state);
  assert.ok(state.tiles.education[mine] > 0, "a seat stopped covering its own street");
});
