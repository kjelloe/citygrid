// Ranks read (slice T5a; A69).
//
// `unlock` has been on every catalogue entry since the catalogue was written
// and nothing has ever read it — the same shape as the dead fields Q119 found,
// except this one is a whole progression. T5 makes it a rule, which means three
// readers have to agree: the reducer refuses, the build menu greys, and the
// deputy does not waste a command asking.
//
// The fourth thing that has to hold is that a rank the catalogue gates on is a
// rank some quest actually grants. An `unlock` above the highest reward is a
// building nobody can ever build, and it would look exactly like one nobody
// has earned yet.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { generateWorld } from "../engine/worldgen.js";
import { catalogue, setCatalogue, definition, definitionIds } from "../engine/catalogue.js";
import { rankOf, isUnlocked } from "../engine/unlock.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_TICK, CMD_PLACE_BUILDING, CMD_PLACE_ROAD } from "../engine/commands.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { buildMenu, menuDefs } from "../client/ui/build-model.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";

const W = 24;
const at = (x, y) => tileAt(W, x, y);

function city() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5, seats: 2 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  state.players[0].treasury = 1000000;
  state.players[1].treasury = 1000000;
  return state;
}

/** The rank, written the way `setVariable` writes it — quests are the only
 * thing that does in the game, and there is no command for it. */
function setRank(state, value) {
  for (const entry of state.quests.vars) {
    if (entry.name === "rank") { entry.value = value; return; }
  }
  state.quests.vars.push({ name: "rank", value });
  state.quests.vars.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const place = (state, def, x, y, actor = 1) =>
  apply(state, { type: CMD_PLACE_BUILDING, actor, def, x, y });

// --- the reducer -------------------------------------------------------------

test("a definition above the seat's rank is refused, and says which reason", () => {
  const state = city();
  assert.equal(rankOf(state), 0, "a new city starts at a rank");
  assert.equal(definition("cityHall").unlock, 2, "the city hall is not the rank-2 building");

  assert.equal(place(state, "cityHall", 5, 5).result, RESULT.LOCKED);
  setRank(state, 1);
  assert.equal(place(state, "cityHall", 5, 5).result, RESULT.LOCKED,
    "rank 1 built the rank-2 building");
  setRank(state, 2);
  assert.equal(place(state, "cityHall", 5, 5).result, RESULT.OK);
  assert.equal(state.buildings.length, 1);
});

test("the airport wants the top rank, and the city hall is not enough on its own", () => {
  const state = city();
  setRank(state, 2);
  assert.equal(definition("airport").unlock, 3);
  assert.equal(place(state, "airport", 5, 5).result, RESULT.LOCKED);
  setRank(state, 3);
  assert.equal(place(state, "airport", 5, 5).result, RESULT.OK);
});

test("everything a new mayor needs is unlocked at rank 0", () => {
  // The other direction, and the one that would ruin the game rather than leave
  // a building unreachable: power, water and a road have to be available to a
  // player who has completed nothing at all.
  const state = city();
  for (const def of ["coalPlant", "waterPump", "windTurbine", "fireStation", "park"]) {
    assert.ok(isUnlocked(state, def), `${def} is locked for a new mayor`);
  }
  assert.equal(isUnlocked(state, "nonesuch"), false, "an unknown definition is unlocked");
});

test("one city hall per seat, and the refusal is not 'that cannot go there'", () => {
  const state = city();
  setRank(state, 2);
  assert.equal(place(state, "cityHall", 5, 5).result, RESULT.OK);
  assert.equal(place(state, "cityHall", 12, 12).result, RESULT.ALREADY_BUILT);
  // The other seat's own hall is a different building.
  assert.equal(place(state, "cityHall", 12, 12, 2).result, RESULT.OK);
});

// --- the progression ---------------------------------------------------------

test("every rank the catalogue gates on is a rank some quest grants", () => {
  const dir = join(repoRoot, "data", "quests");
  const files = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  const granted = new Set([0]);
  for (const file of files) {
    for (const quest of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
      if (quest.reward?.rank) granted.add(quest.reward.rank);
      for (const choice of quest.choices ?? []) {
        if (choice.reward?.rank) granted.add(choice.reward.rank);
      }
    }
  }
  for (const id of definitionIds()) {
    const unlock = definition(id).unlock;
    assert.ok(granted.has(unlock),
      `${id} unlocks at rank ${unlock} and no quest grants that rank: ${[...granted].join(", ")}`);
  }
  assert.ok(readdirSync(dir).length >= 3, "the quest directory is not the one this test means");
});

test("placing the city hall is what grants the top rank", () => {
  // A69: the hall is the rank-3 milestone. The quest measures the CIVIC
  // category rather than the definition by name, the way every other quest
  // reads the catalogue (`countBy`).
  const quests = JSON.parse(readFileSync(join(repoRoot, "data", "quests", "growth.json"), "utf8"));
  const hall = quests.find((q) => q.reward?.rank === 3 && JSON.stringify(q.objective).includes("civic"));
  assert.ok(hall, "no quest grants rank 3 for a civic building");
  assert.equal(definition("cityHall").category, "civic");
});

// --- the menu ----------------------------------------------------------------

test("the build menu greys a locked entry and names the rank", () => {
  const early = buildMenu(catalogue(), 1);
  const items = early.flatMap((group) => group.items);
  const hall = items.find((item) => item.def === "cityHall");
  assert.ok(hall, "the city hall is not in the menu at all");
  assert.equal(hall.locked, true);
  assert.equal(hall.unlock, 2);
  assert.equal(items.find((item) => item.def === "railStation").locked, false);

  const later = buildMenu(catalogue(), 3).flatMap((group) => group.items);
  assert.equal(later.find((item) => item.def === "cityHall").locked, false);
  assert.equal(later.find((item) => item.def === "airport").locked, false);
});

test("a locked building is still shown, or the player never learns it exists", () => {
  assert.deepEqual(menuDefs(catalogue(), 0), menuDefs(catalogue(), 3));
  assert.ok(menuDefs().includes("airport"), "the airport is in no menu group");
});

test("both locales can say why a building is greyed", () => {
  const dir = join(repoRoot, "data", "i18n");
  for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const words = JSON.parse(readFileSync(join(dir, file), "utf8"));
    assert.ok(Object.hasOwn(words, "build.locked"), `${file} has no build.locked`);
    assert.match(words["build.locked"], /\{rank\}/, `${file}'s build.locked does not name the rank`);
  }
});

// --- the deputy --------------------------------------------------------------

test("the deputy does not ask for what its rank cannot have", () => {
  // The deputy builds nothing locked today, so the guard is exercised by
  // LOCKING something it does build: a green deputy's wind turbine. Without the
  // guard the reducer would still refuse — the difference is whether a command
  // was issued at all, which the sink can see.
  const saved = catalogue();
  try {
    setCatalogue({ ...saved, windTurbine: { ...saved.windTurbine, unlock: 2 } });
    const locked = playGreen(0);
    assert.equal(locked.turbines, 0, "a rank-0 deputy built a rank-2 turbine");
    assert.equal(locked.refusedLocked, 0,
      `the deputy issued ${locked.refusedLocked} commands it knew would be refused`);

    const allowed = playGreen(2);
    assert.ok(allowed.turbines > 0,
      "the rank-2 deputy built no turbine either, so this proves nothing");
  } finally {
    setCatalogue(saved);
  }
});

function playGreen(rank) {
  const world = generateWorld(defaultOptions({ seed: 1003, width: 48, height: 48, seats: 1,
    waterStyle: "river" }));
  assert.ok(world.ok, "the deputy's world did not generate");
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  setRank(state, rank);
  const deputy = makeDeputy(1, "green");
  let refusedLocked = 0;
  const sink = (outcome) => { if (outcome.result === RESULT.LOCKED) refusedLocked += 1; };
  for (let tick = 1; tick <= 6 * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy, sink);
  }
  return {
    refusedLocked,
    turbines: state.buildings.filter((b) => b.def === "windTurbine").length,
  };
}

// --- and it is the reducer's rule, not the menu's ----------------------------

test("a command that never went near the menu is still refused", () => {
  // Ruling: permission checks live in the reducer. A rank check that existed
  // only in the build menu would be a suggestion the next client build forgets.
  const state = city();
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([at(4, 4), at(5, 4)]) });
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 8, y: 8, def: "airport" }).result,
    RESULT.LOCKED);
  assert.equal(state.buildings.length, 0);
});
