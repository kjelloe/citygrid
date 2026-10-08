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
