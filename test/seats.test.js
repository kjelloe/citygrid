// What a seat is called, and whose ground this is (X3b, X5 item 1).
//
// `seatName` was extracted when three panels in one week had their own copy of
// the same four lines. `otherOwnerName` is the second question asked about a
// seat, and it exists because a refusal showed the player its own template:
// `result.notOwner` is "That belongs to {player}", `hud.js` renders every
// answer the reducer gives through `t(`result.${result}`)` with no values, and
// `t()` leaves an unfilled token in the output by design. The screenshot
// `smoke-X3b-territory.png` says *"That belongs to {player}"*.
//
// The name is derived here rather than in the HUD because the ground has two
// ways of belonging to somebody — the tile's owner, and, on the commons, the
// BUILDING's owner — and `engine/permissions.js` refuses on both.

import test from "node:test";
import assert from "node:assert/strict";
import { seatName, otherOwnerName } from "../client/ui/seats.js";
import { OWNER_NATURE, OWNER_COMMONS } from "../engine/constants.js";

const city = (owner, { players = [{ seat: 1, name: "Ada" }, { seat: 2, name: "Grace" }],
  buildings = [], buildingId = [] } = {}) =>
  ({ players, buildings, tiles: { owner, buildingId } });

test("a seat with a name is called it, and one without is still called something", () => {
  const state = city([]);
  assert.equal(seatName(state, 1), "Ada");
  assert.equal(seatName(state, 3), "Mayor 3");
});

test("the owner of the ground is the first tile in the stroke that is not yours", () => {
  // A drag is a rectangle and the world is not: bare land and your own ground
  // are in the selection too, and neither of them is who the refusal is about.
  const state = city([OWNER_NATURE, 1, 2, 2]);
  assert.equal(otherOwnerName(state, [0, 1, 2, 3], 1), "Grace");
});

test("ground nobody owns names nobody", () => {
  const state = city([OWNER_NATURE, OWNER_COMMONS, 0]);
  assert.equal(otherOwnerName(state, [0, 1, 2], 1), undefined);
});

test("your own ground names nobody, whichever seat you are", () => {
  const state = city([2, 2]);
  assert.equal(otherOwnerName(state, [0, 1], 2), undefined);
});

test("on the commons it is the BUILDING's owner, which is the other way to be refused", () => {
  // `canDemolish`: anyone may build on the commons and only the builder may
  // remove it. The tile says `OWNER_COMMONS` and the refusal is still about a
  // person, so a name taken from the tile alone would leave the brace on screen
  // in exactly the case §25's civil channel exists for.
  const state = city([OWNER_COMMONS], {
    buildingId: [7],
    buildings: [{ id: 7, owner: 2 }],
  });
  assert.equal(otherOwnerName(state, [0], 1), "Grace");
  // ...and the builder is not refused their own building.
  assert.equal(otherOwnerName(state, [0], 2), undefined);
});

test("a commons tile with nothing on it names nobody", () => {
  const state = city([OWNER_COMMONS], { buildingId: [0] });
  assert.equal(otherOwnerName(state, [0], 1), undefined);
});

test("no tiles at all is not a crash", () => {
  // `setResult` is given whatever the command carried, and a command with no
  // run-length-encoded tiles carries none.
  assert.equal(otherOwnerName(city([]), undefined, 1), undefined);
  assert.equal(otherOwnerName(city([]), [], 1), undefined);
});

// --- and the invariant that makes the fallback unnecessary (X5) --------------
//
// The first version of `valuesFor` in `hud.js` filled an unnamed owner with a
// catalogue word, "somebody else". That is a line nothing in the project can
// reach: `engine/permissions.js` answers `notOwner` only where a SEAT owns the
// ground, or owns the building standing on commons ground. A fallback nothing
// can force is a fallback no gate measures — so the word is gone and the claim
// it was hiding is made here instead, through the real reducer, for every path
// that can produce the refusal.

import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_PLACE_ROAD } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { canDemolish, canBuildOn, canConnectAcross } from "../engine/permissions.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { loadSystems } from "../tools/fixtures.mjs";

await loadSystems();

const W = 24;

/** Two seats in one region, and seat one's road — which is what makes the
 * ground theirs (`test/build.test.js`: "a road claims the ground for its
 * builder"). Joining alone owns nothing, which is how the first version of this
 * test came to assert about a city where nobody owned anything. */
function twoSeatsAndARoad() {
  // `openBorders: false`, so all three of the refusals below can actually
  // happen: with borders open, `canConnectAcross` answers OK for a neighbour's
  // ground and the third path would never be exercised — a test that passes
  // because its subject never occurred.
  const state = createState(defaultOptions({ width: W, height: W, seed: 5, seats: 4,
    mode: "sharedCity", openBorders: false }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  const cells = [tileAt(W, 4, 4), tileAt(W, 5, 4), tileAt(W, 6, 4)];
  const result = apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) }).result;
  assert.equal(result, RESULT.OK, `seat one could not build its road: ${result}`);
  return state;
}

test("every ground the reducer refuses as notOwner has somebody to name", () => {
  const state = twoSeatsAndARoad();
  const mine = [];
  for (let i = 0; i < state.tiles.owner.length; i += 1) {
    if (state.tiles.owner[i] === 1) mine.push(i);
  }
  assert.ok(mine.length > 0, "seat one owns nothing, so this test proves nothing");

  const refusals = [];
  for (const index of mine) {
    for (const [what, answer] of [
      ["demolish", canDemolish(state, 2, index)],
      ["build", canBuildOn(state, 2, index)],
      ["connect", canConnectAcross(state, 2, index)],
    ]) {
      if (answer !== RESULT.NOT_OWNER) continue;
      refusals.push(what);
      assert.equal(otherOwnerName(state, [index], 2), "Ada",
        `${what} on tile ${index} is notOwner and nobody can be named for it`);
    }
  }
  // The subject beside the failures: a city where none of the three refuses is
  // a city this test says nothing about.
  assert.ok(refusals.includes("demolish") && refusals.includes("build")
    && refusals.includes("connect"),
    `only these refused at all: ${[...new Set(refusals)].join(", ") || "none"}`);
});

test("a commons building refused to a stranger still names its builder", () => {
  // The path a name taken from the tile alone misses: `canDemolish` lets anyone
  // build on the commons and only the builder remove it, so the tile says
  // `OWNER_COMMONS` and the refusal is still about a person.
  // Built by hand rather than hunted for, because whether a generated region
  // happens to contain a commons building is worldgen's business and not this
  // claim's. The constant comes from the engine, not from a literal.
  const state = twoSeatsAndARoad();
  const index = tileAt(W, 9, 9);
  state.tiles.owner[index] = OWNER_COMMONS;
  state.tiles.buildingId[index] = 91;
  state.buildings.push({ id: 91, owner: 1, x: 9, y: 9 });
  assert.equal(canDemolish(state, 2, index), RESULT.NOT_OWNER,
    "the commons building was not refused, so this test proves nothing");
  assert.equal(otherOwnerName(state, [index], 2), "Ada");
  // ...and its builder is not refused their own.
  assert.equal(canDemolish(state, 1, index), RESULT.OK);
});
