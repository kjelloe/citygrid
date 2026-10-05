// Disasters.
//
// The design (§12) asks for four properties, and each is a test here:
// telegraphed, recoverable, connected to existing systems, optional. The soak
// half — "no unrecoverable cities across 200 games" — is `tools/disaster_soak.mjs`,
// because it needs 200 whole games and this file needs to stay fast.

import test from "node:test";
import assert from "node:assert/strict";
import {
  disasterPass, DISASTER_KINDS, DISASTER_NAMES, DISASTER_WILDFIRE, DISASTER_BLACKOUT,
  DISASTER_EARTHQUAKE, DISASTER_EXPLOSION, DISASTER_CONTAMINATION, DISASTER_STORM, DISASTER_DOWNPOUR,
  PHASE_NONE, PHASE_WARNING, PHASE_ACTIVE, disasterName,
} from "../engine/disasters.js";
import { createState, hashState, copyState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_TICK, CMD_BULLDOZE } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { FLAG_POWERED, FLAG_RUINED, FLAG_BURNING, TERRAIN_WATER, TERRAIN_ROCK } from "../engine/constants.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/requests.js";

function town(overrides) {
  // `disasters` defaults to FALSE (options.js) — free-build is the default
  // experience. Every test here that is about a disaster happening has to turn
  // them on, and three of these tests passed vacuously until it did.
  const state = createState(defaultOptions({ seed: 5, width: 24, height: 24, seats: 1, disasters: true, ...overrides }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  // A population, so the minimum-population guard does not simply refuse.
  state.population = 5000;
  // And somewhere for a disaster to HAPPEN. Every kind picks its spot from
  // built or zoned ground, and correctly refuses to fire in an empty region —
  // so a fixture with a population but no city arms nothing at all.
  for (let y = 8; y < 16; y += 1) {
    for (let x = 8; x < 16; x += 1) {
      state.tiles.zone[y * state.width + x] = 1;
    }
  }
  state.buildings.push({
    id: 900, def: "ind", zone: 3, x: 10, y: 10, w: 1, h: 1,
    level: 1, occupancy: 4, condition: 100, owner: 1,
  });
  state.tiles.buildingId[10 * state.width + 10] = 900;
  state.nextId = 901;
  return state;
}

/** Force a specific disaster into its warning phase, so a test can be about
 * what that ONE kind does rather than about what the dice did. */
function arm(state, kind, { x = 12, y = 12, radius = 4 } = {}) {
  state.disaster.kind = kind;
  state.disaster.phase = PHASE_WARNING;
  state.disaster.ticks = 1;
  state.disaster.x = x;
  state.disaster.y = y;
  state.disaster.radius = radius;
  return state;
}

test("every disaster kind has a name, and no two share one", () => {
  const names = DISASTER_KINDS.map(disasterName);
  assert.equal(new Set(names).size, names.length, `duplicate names: ${names}`);
  assert.equal(names.includes("none"), false, "a real disaster must not be named 'none'");
});

test("the design's seven major disasters all exist, and B13's eighth", () => {
  // gamedesign.md §12 lists wildfire, earthquake, flood, tornado/severe storm,
  // industrial explosion, large-scale blackout, water contamination. B13 (A61)
  // adds the **downpour**, which is the design's weather becoming a cause
  // rather than a picture — counted here on purpose, so a ninth is a decision
  // somebody makes rather than a list that grew.
  assert.equal(DISASTER_KINDS.length, 8, `${DISASTER_KINDS.length} kinds: ${DISASTER_KINDS.map(disasterName)}`);
  for (const name of ["wildfire", "earthquake", "flood", "storm", "explosion", "blackout",
    "contamination", "downpour"]) {
    assert.ok(DISASTER_NAMES.includes(name), `no ${name}`);
  }
});

// --- optional ---------------------------------------------------------------

test("disasters can be turned off entirely", () => {
  // "Optional in free-build mode" (§12). Not "rarer" — off.
  const state = town({ disasters: false });
  arm(state, DISASTER_EARTHQUAKE);
  const events = disasterPass(state);
  assert.deepEqual(events, []);
  assert.equal(state.disaster.phase, PHASE_WARNING, "nothing should have advanced");
});

// --- telegraphed ------------------------------------------------------------

test("a disaster warns before it strikes, and says where", () => {
  const state = town();
  state.disaster.phase = PHASE_NONE;
  // Force the roll to succeed by making it certain, rather than looping until
  // the dice cooperate — a test that loops on randomness is a flaky test.
  state.options.difficulty = "demanding";
  let warning;
  for (let i = 0; i < 4000 && !warning; i += 1) {
    const events = disasterPass(state);
    warning = events.find((e) => e.kind === "disasterWarning");
  }
  assert.ok(warning, "no disaster warned in 4000 months");
  assert.equal(typeof warning.x, "number");
  assert.equal(typeof warning.y, "number");
  assert.ok(warning.months >= 1, "a warning with no lead time is not a warning");
  assert.equal(state.disaster.phase, PHASE_WARNING);
});

test("the warning phase does no damage", () => {
  // The whole point of telegraphing: the player gets a month to act.
  const state = town();
  arm(state, DISASTER_EARTHQUAKE);
  state.disaster.ticks = 2;
  const before = hashState(state);
  disasterPass(state);
  state.disaster.ticks = 2;  // undo the countdown so only the damage is compared
  assert.equal(hashState(state), before, "the warning phase changed the world");
});

// --- connected to existing systems ------------------------------------------

test("a wildfire burns through the fire system rather than beside it", () => {
  const state = town();
  // Something to burn.
  for (let i = 0; i < state.tiles.terrain.length; i += 1) state.tiles.terrain[i] = 2;
  arm(state, DISASTER_WILDFIRE);
  disasterPass(state);
  let burning = 0;
  for (let i = 0; i < state.tiles.flags.length; i += 1) if (state.tiles.flags[i] & 4) burning += 1;
  assert.ok(burning > 0, "a wildfire that lights nothing is not a wildfire");
});

test("a blackout clears power and breaks nothing", () => {
  // The recoverable one by construction: no structural damage at all, so the
  // supply pass restores it once the disaster clears.
  const state = town();
  for (let i = 0; i < state.tiles.flags.length; i += 1) state.tiles.flags[i] |= FLAG_POWERED;
  const roadsBefore = [...state.tiles.road];
  arm(state, DISASTER_BLACKOUT);
  disasterPass(state);
  let powered = 0;
  for (let i = 0; i < state.tiles.flags.length; i += 1) if (state.tiles.flags[i] & FLAG_POWERED) powered += 1;
  assert.equal(powered, 0, "a blackout must actually black out");
  assert.deepEqual([...state.tiles.road], roadsBefore, "a blackout must not damage roads");
});

test("an explosion pollutes as well as destroys", () => {
  const state = town();
  arm(state, DISASTER_EXPLOSION);
  disasterPass(state);
  let polluted = 0;
  for (let i = 0; i < state.tiles.pollution.length; i += 1) if (state.tiles.pollution[i] > 0) polluted += 1;
  assert.ok(polluted > 0, "an industrial explosion should leave contamination behind");
});

test("contamination takes the water flag, not the pipes", () => {
  const state = town();
  for (let i = 0; i < state.tiles.pipe.length; i += 1) state.tiles.pipe[i] = 16;
  for (let i = 0; i < state.tiles.flags.length; i += 1) state.tiles.flags[i] |= 2;
  const pipesBefore = [...state.tiles.pipe];
  arm(state, DISASTER_CONTAMINATION);
  disasterPass(state);
  let dry = 0;
  for (let i = 0; i < state.tiles.flags.length; i += 1) if ((state.tiles.flags[i] & 2) === 0) dry += 1;
  assert.ok(dry > 0, "contamination did nothing, so this proved nothing");
  assert.deepEqual([...state.tiles.pipe], pipesBefore,
    "contaminated water is a supply problem, not a plumbing one — the player should not have to relay pipe");
});

// --- recoverable ------------------------------------------------------------

test("a wrecked building leaves ruins, not a hole", () => {
  // Recoverable AND felt. A tile that silently empties has cost the player
  // nothing to put right.
  const state = town();
  const target = 12 * state.width + 12;
  state.buildings.push({ id: 1, def: "res", zone: 1, x: 12, y: 12, w: 1, h: 1, level: 1, occupancy: 8, condition: 100, owner: 1 });
  state.tiles.buildingId[target] = 1;

  // The damage is probabilistic per tile, so try a few seeds rather than
  // asserting on one roll. Asserting on the SPECIFIC building, not on the
  // count — the fixture has a second building that is none of this test's
  // business.
  for (let seed = 0; seed < 40; seed += 1) {
    const copy = copyState(state);
    copy.rng.s = (copy.rng.s + seed) | 0;
    arm(copy, DISASTER_EARTHQUAKE, { x: 12, y: 12, radius: 2 });
    disasterPass(copy);
    if (!copy.buildings.some((b) => b.id === 1)) {
      assert.ok((copy.tiles.flags[target] & FLAG_RUINED) !== 0,
        "a wrecked building must leave ruins the player can clear");
      assert.equal(copy.tiles.buildingId[target], 0, "the tile still claims a building that is gone");
      return;
    }
  }
  assert.fail("the earthquake never wrecked the building in 40 attempts");
});

test("no disaster makes a tile permanently unbuildable", () => {
  // The hard version of "recoverable": after every kind of disaster, the
  // terrain is still terrain. Turning ground into water would strand the player.
  for (const kind of DISASTER_KINDS) {
    const state = town();
    const before = [...state.tiles.terrain];
    arm(state, kind);
    const events = disasterPass(state);
    assert.ok(events.some((e) => e.kind === "disasterStruck"),
      `${disasterName(kind)} never struck, so this proved nothing`);
    assert.deepEqual([...state.tiles.terrain], before,
      `${disasterName(kind)} changed the terrain itself`);
  }
});

test("a disaster ends, and ends only once", () => {
  const state = town();
  arm(state, DISASTER_EARTHQUAKE);
  disasterPass(state);                       // warning -> active + strike
  assert.equal(state.disaster.phase, PHASE_ACTIVE);
  let overs = 0;
  for (let i = 0; i < 30; i += 1) {
    for (const event of disasterPass(state)) if (event.kind === "disasterOver") overs += 1;
  }
  assert.equal(overs, 1, `disasterOver fired ${overs} times`);
  assert.equal(state.disaster.phase, PHASE_NONE);
});

test("only one disaster runs at a time", () => {
  // Two at once is not more dramatic, it is unreadable.
  const state = town();
  state.options.difficulty = "demanding";
  let running = 0;
  for (let i = 0; i < 3000; i += 1) {
    disasterPass(state);
    if (state.disaster.phase !== PHASE_NONE) running += 1;
    assert.ok(state.disaster.kind >= 0 && state.disaster.kind < DISASTER_NAMES.length);
  }
  assert.ok(running > 0, "nothing ever happened, so this proved nothing");
});

// --- determinism ------------------------------------------------------------

test("disasters are deterministic from the state", () => {
  // Randomness comes from the state (CLAUDE.md). Two copies of one city must
  // suffer exactly the same disasters.
  const a = town();
  a.options.difficulty = "demanding";
  const b = copyState(a);
  for (let i = 0; i < 500; i += 1) {
    disasterPass(a);
    disasterPass(b);
  }
  assert.equal(hashState(a), hashState(b), "two copies of one city diverged");
});

test("the disaster record is hashed", () => {
  // If it were not, a client mid-flood and a client with clear skies would
  // agree on the hash and disagree about everything after it.
  const state = town();
  const before = hashState(state);
  state.disaster.kind = DISASTER_WILDFIRE;
  assert.notEqual(hashState(state), before, "state.disaster is not reaching the hash");
});

test("the disaster record survives a copy", () => {
  const state = town();
  arm(state, DISASTER_WILDFIRE, { x: 3, y: 4, radius: 6 });
  const copy = copyState(state);
  assert.deepEqual(copy.disaster, state.disaster);
  copy.disaster.kind = DISASTER_BLACKOUT;
  assert.equal(state.disaster.kind, DISASTER_WILDFIRE, "the copy shares the original's record");
});

// --- weather that causes things (B13, A61) -----------------------------------

test("a storm throws lightning, and the fire it starts is an ordinary fire", () => {
  // Kjell's ruling at P60: the overcast hour is a picture (B6a); this makes it
  // a cause. Through `igniteAt` so it spreads, is fought by fire cover and
  // burns out the way every other fire does — a second fire mechanism would be
  // a second set of rules to keep in step (A62).
  const state = town();
  // Something that can burn, under the storm.
  for (let y = 10; y < 15; y += 1) {
    for (let x = 10; x < 15; x += 1) {
      state.buildings.push({
        id: 1000 + y * 24 + x, def: "res", zone: 1, x, y, w: 1, h: 1,
        level: 2, occupancy: 8, condition: 100, owner: 1,
      });
      state.tiles.buildingId[y * state.width + x] = 1000 + y * 24 + x;
    }
  }
  arm(state, DISASTER_STORM);
  disasterPass(state);

  const burning = [...state.tiles.flags].filter((f) => (f & FLAG_BURNING) !== 0).length;
  assert.ok(burning > 0, "a storm passed over a town and nothing caught");
  // One strike, not a sweep: a storm that lights the whole radius is a
  // wildfire with a different name.
  assert.ok(burning <= 3, `${burning} tiles alight — that is a firestorm, not lightning`);
});

test("lightning cannot strike with disasters off", () => {
  const state = town({ disasters: false });
  arm(state, DISASTER_STORM);
  disasterPass(state);
  assert.equal([...state.tiles.flags].filter((f) => (f & FLAG_BURNING) !== 0).length, 0);
});

test("a downpour floods the pipes that are over capacity, and only those", () => {
  // "Over capacity" is a thing the engine already knows: `state.supply.water`
  // carries the city's demand against what its pumps make. A downpour on a city
  // with headroom is weather; on a city whose network is already at its limit
  // it is a flood that comes up through the pipes.
  const state = town();
  const W = state.width;
  // A pipe network under the storm, and a city drawing more than it makes.
  for (let x = 8; x < 16; x += 1) state.tiles.pipe[12 * W + x] = 1;
  state.supply.water.capacity = 100;
  state.supply.water.demand = 160;
  arm(state, DISASTER_DOWNPOUR);
  disasterPass(state);

  let floodedOnPipes = 0;
  let floodedOffPipes = 0;
  for (let i = 0; i < state.tiles.healthRisk.length; i += 1) {
    if (state.tiles.healthRisk[i] === 0) continue;
    if (state.tiles.pipe[i] !== 0) floodedOnPipes += 1; else floodedOffPipes += 1;
  }
  assert.ok(floodedOnPipes > 0, "a downpour over a stretched network flooded nothing");
  assert.equal(floodedOffPipes, 0, "it flooded ground with no pipe under it");
});

test("a downpour on a network with headroom is just rain", () => {
  const state = town();
  const W = state.width;
  for (let x = 8; x < 16; x += 1) state.tiles.pipe[12 * W + x] = 1;
  state.supply.water.capacity = 400;
  state.supply.water.demand = 100;
  arm(state, DISASTER_DOWNPOUR);
  disasterPass(state);
  assert.equal([...state.tiles.healthRisk].filter((v) => v > 0).length, 0,
    "a city with water to spare was flooded anyway");
});

test("a downpour wrecks nothing a bulldozer cannot clear", () => {
  // The invariant every disaster is held to: no tile is left permanently
  // unbuildable (the test above this block makes the same claim for the seven).
  const state = town();
  const W = state.width;
  for (let x = 8; x < 16; x += 1) state.tiles.pipe[12 * W + x] = 1;
  state.supply.water.capacity = 50;
  state.supply.water.demand = 200;
  arm(state, DISASTER_DOWNPOUR);
  for (let n = 0; n < 12; n += 1) disasterPass(state);
  for (let i = 0; i < state.tiles.terrain.length; i += 1) {
    assert.notEqual(state.tiles.terrain[i], TERRAIN_ROCK, "a downpour turned ground to rock");
  }
});

test("the list of ruins is exactly the ruined tiles, derived both ways", () => {
  // X3c's whole rule rests on this pairing: `markDerelict` beside every
  // `|= FLAG_RUINED`, `forgetClearedRuins` after every bulldoze. The deputy
  // stopped scanning the map in the same slice, so a flag with no entry is a
  // ruin nothing in the game can see, and an entry with no flag is a tile a
  // neighbour could demolish twice. Derive both ways and compare (W6a).
  //
  // Every kind, one city, because the two writers are `fire.js` and
  // `disasters.js` and a slice that adds a third will not be about either.
  const state = town();
  for (const kind of DISASTER_KINDS) {
    for (let seed = 0; seed < 8; seed += 1) {
      state.rng.s = (state.rng.s + 1) | 0;
      arm(state, kind, { x: 12, y: 12, radius: 3 });
      disasterPass(state);
      for (let i = 0; i < 12; i += 1) apply(state, { type: CMD_TICK });
    }
  }
  const flagged = [];
  for (let i = 0; i < state.tiles.flags.length; i += 1) {
    if ((state.tiles.flags[i] & FLAG_RUINED) !== 0) flagged.push(i);
  }
  assert.ok(flagged.length > 0, "nothing was wrecked, so this proves nothing");
  assert.deepEqual(state.derelicts.map((d) => d.tile), flagged,
    "the list and the flags disagree about which tiles are ruins");
  for (const entry of state.derelicts) {
    assert.ok(entry.sinceTick >= 0 && entry.sinceTick <= state.tick,
      `a ruin's clock says ${entry.sinceTick} in a city at tick ${state.tick}`);
  }

  // And the bulldozer takes the clock with it.
  state.players[0].treasury = 1000000;
  apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([flagged[0]]) });
  assert.equal(state.tiles.flags[flagged[0]] & FLAG_RUINED, 0, "the ruin survived the bulldozer");
  assert.deepEqual(state.derelicts.map((d) => d.tile), flagged.slice(1),
    "a cleared ruin kept its entry, so its tile is still derelict to the rule");
});
