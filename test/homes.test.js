// The density ladder (slice S10; A71).
//
// The reviewer's histogram: most homes in a played city are one- and two-tile
// lots at level 1 or 2, and every one was drawn as a block filling its lot —
// so S9's chimneys and porches landed on a slab of flats. The form a lot takes
// is a pure function of its size and its level, which is what lets the cases
// that matter be planted here rather than counted in a screenshot.

import test from "node:test";
import assert from "node:assert/strict";
import { homeForm, houseCount, formFor, houseLots, FORMS, HOUSE } from "../client/world/homes.js";

const forms = (w, d, l) => homeForm(w, d, l);

test("a level-1 lot is houses, and a level-4 lot is the block it always was", () => {
  assert.equal(formFor(14, 1), "detached");
  assert.equal(formFor(14, 2), "semi");
  assert.equal(formFor(34, 2), "terrace", "a wide lot at level 2 is a terrace, not one wide semi");
  assert.equal(formFor(14, 3), "flats");
  assert.equal(formFor(14, 4), "block");
  assert.equal(formFor(14, 9), "block");
  for (const level of [0, 1, 2, 3, 4, 5]) {
    assert.ok(FORMS.includes(formFor(14, level)), `level ${level} has no form`);
  }
});

test("one house per tile of frontage at level 1", () => {
  // The item's rule. A 14 m lot is one house; 34 m is two; 34 m deep as well is
  // four, round a shared back.
  assert.equal(houseCount(14, 14, 1), 1);
  assert.equal(houseCount(34, 14, 1), 2);
  assert.equal(houseCount(14, 34, 1), 2, "a deep lot gets a second row");
  assert.equal(houseCount(34, 34, 1), 4);
});

test("a house is a house-sized thing, in metres", () => {
  // 9–11 m wide and 8–10 m deep, whatever the lot is. A form expressed only in
  // fractions would give a 34 m lot a 34 m house, which is the slab again.
  for (const [w, d] of [[14, 14], [34, 14], [34, 34], [14, 34]]) {
    for (const house of forms(w, d, 1).houses) {
      const wide = (house.u1 - house.u0) * w;
      const deep = (house.v1 - house.v0) * d;
      assert.ok(wide >= 9 && wide <= 11.5, `${w}x${d}: a house ${wide.toFixed(1)} m wide`);
      assert.ok(deep >= 7.5 && deep <= 10.5, `${w}x${d}: a house ${deep.toFixed(1)} m deep`);
    }
  }
});

test("no two houses on a lot overlap, and none leaves the lot", () => {
  // The defect a fraction-based form makes easy: two houses in the same place
  // is one house with z-fighting, and a house past the lot line is a wall
  // across the pavement (ruling 035).
  for (const [w, d, l] of [[14, 14, 1], [34, 14, 1], [14, 34, 1], [34, 34, 1], [14, 14, 2], [34, 14, 2]]) {
    const { houses } = forms(w, d, l);
    for (const h of houses) {
      assert.ok(h.u0 >= 0 && h.u1 <= 1 && h.v0 >= 0 && h.v1 <= 1,
        `${w}x${d} L${l}: a house at ${h.u0}..${h.u1} / ${h.v0}..${h.v1} is outside the lot`);
      assert.ok(h.u1 > h.u0 && h.v1 > h.v0, "an inside-out house");
    }
    for (let i = 0; i < houses.length; i += 1) {
      for (let j = i + 1; j < houses.length; j += 1) {
        const a = houses[i];
        const b = houses[j];
        const apart = a.u1 <= b.u0 + 1e-9 || b.u1 <= a.u0 + 1e-9
          || a.v1 <= b.v0 + 1e-9 || b.v1 <= a.v0 + 1e-9;
        assert.ok(apart, `${w}x${d} L${l}: houses ${i} and ${j} overlap`);
      }
    }
  }
});

test("a semi and a terrace are joined; detached houses are not", () => {
  // The party wall is the difference between two houses and a pair, and the
  // renderer needs to know which — a gap between semis is not a semi.
  const semi = forms(14, 14, 2);
  assert.equal(semi.houses.length, 2);
  assert.ok(semi.houses.every((h) => h.party), "a semi has no party wall");
  assert.ok(Math.abs(semi.houses[0].u1 - semi.houses[1].u0) < 1e-9, "the pair has a gap in it");
  const detached = forms(34, 14, 1);
  assert.ok(detached.houses.every((h) => !h.party), "detached houses are joined");
  assert.ok(detached.houses[1].u0 - detached.houses[0].u1 > 0.05, "there is no gap between them");
});

test("every level-1 and level-2 roof is pitched, and nothing below level 3 is three storeys", () => {
  // The item, twice over: "never flat" below level 3, and `storeys = 1 + level`
  // only from level 3 — which is where the slab came from.
  for (const level of [0, 1, 2]) {
    for (const [w, d] of [[14, 14], [34, 14], [34, 34]]) {
      for (const house of forms(w, d, level).houses) {
        assert.notEqual(house.roof, "flat", `level ${level} has a flat roof`);
        assert.ok(house.storeys <= 2, `level ${level} is ${house.storeys} storeys`);
      }
    }
  }
  assert.equal(forms(14, 14, 3).houses[0].storeys, 3);
  assert.equal(forms(14, 14, 5).houses[0].storeys, 6);
});

test("there is a front garden at every level a person walks up to", () => {
  // A house on the kerb is a shop. The path and the hedge (V6) live in this gap
  // and had nowhere to go while the building filled its lot.
  for (const level of [1, 2, 3]) {
    for (const house of forms(14, 14, level).houses) {
      assert.ok(house.v0 > 0.1, `level ${level} starts ${house.v0} from the street`);
    }
  }
});

test("the form is a pure function of the lot and the level", () => {
  for (const [w, d, l] of [[14, 14, 1], [34, 34, 1], [14, 14, 2], [20, 20, 3]]) {
    assert.deepEqual(forms(w, d, l), forms(w, d, l));
  }
  assert.ok(HOUSE.width >= 9 && HOUSE.width <= 11, "the house is not a house");
});

test("each house on a lot is its own house", () => {
  // Everything downstream hashes on the spec's id, and a lot's houses share a
  // building record — so a terrace came out four copies of one house: same
  // chimney, same shutters, same windows lit. The index is what varies them.
  const lot = {
    id: 7, building: { id: 7, level: 1 }, x0: 0, z0: 0, x1: 34, z1: 34,
    frontage: 0, seat: 0,
  };
  const { lots } = houseLots(lot, 1);
  assert.ok(lots.length >= 2, "this lot is supposed to hold several houses");
  assert.deepEqual(lots.map((l) => l.houseIndex), lots.map((_, i) => i));
  assert.equal(new Set(lots.map((l) => l.houseIndex)).size, lots.length);
});

test("a joined house says so, and a detached one does not", () => {
  // `party` is what tells the facade not to glaze a wall it shares with the
  // house next door. It was set and read by nothing until the omissions sweep.
  const lot = { id: 1, building: { id: 1, level: 2 }, x0: 0, z0: 0, x1: 14, z1: 14, frontage: 0, seat: 0 };
  assert.ok(houseLots(lot, 2).lots.every((l) => l.party === true), "a semi has no party wall");
  assert.ok(houseLots(lot, 1).lots.every((l) => l.party === false), "a detached house has one");
});
