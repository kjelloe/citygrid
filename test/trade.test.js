// The ladder for commerce and industry (slice S16a).
//
// S10 gave the residential lane a form per level, because a 2×1 lot at level 1
// was drawn as one 37 m × 17 m slab. Commerce and industry kept the slab: in a
// 25-year played city (seed 1003, 96²) **45 of 61 trade buildings are at least
// 20 m across** and every one is a single box at L2 and a single facade at L3 —
// the median commercial lot is 40 m wide at LEVEL 1, which is one corner shop
// drawn as a department store.
//
// So the same shape as `homes.js`: a form is a pure function of the lot's size,
// its level and its zone, and the cases that matter are planted here rather
// than counted in a screenshot.

import test from "node:test";
import assert from "node:assert/strict";
import { tradeForm, tradeCount, tradeFormFor, tradeLots, TRADE_FORMS, UNIT } from "../client/world/trade.js";

const ZONE_COMMERCIAL = 2;
const ZONE_INDUSTRIAL = 3;

test("the ladder: a shop, a parade, a block — and a shed, units, a works", () => {
  assert.equal(tradeFormFor(40, 1, ZONE_COMMERCIAL), "shops");
  assert.equal(tradeFormFor(40, 2, ZONE_COMMERCIAL), "parade");
  assert.equal(tradeFormFor(40, 3, ZONE_COMMERCIAL), "block");
  assert.equal(tradeFormFor(40, 9, ZONE_COMMERCIAL), "block");
  assert.equal(tradeFormFor(36, 1, ZONE_INDUSTRIAL), "shed");
  assert.equal(tradeFormFor(36, 2, ZONE_INDUSTRIAL), "units");
  assert.equal(tradeFormFor(36, 3, ZONE_INDUSTRIAL), "works");
  for (const zone of [ZONE_COMMERCIAL, ZONE_INDUSTRIAL]) {
    for (const level of [0, 1, 2, 3, 4, 5]) {
      assert.ok(TRADE_FORMS.includes(tradeFormFor(40, level, zone)),
        `zone ${zone} level ${level} has no form`);
    }
  }
});

test("a unit is a unit-sized thing, in metres", () => {
  // The whole point. A form expressed only in fractions gives a 40 m lot a
  // 40 m shop, which is the slab S10 already paid for once.
  for (const [w, d] of [[20, 20], [40, 20], [36, 36], [20, 36]]) {
    for (const level of [1, 2]) {
      for (const zone of [ZONE_COMMERCIAL, ZONE_INDUSTRIAL]) {
        for (const unit of tradeForm(w, d, level, zone).units) {
          const wide = (unit.u1 - unit.u0) * w;
          assert.ok(wide >= UNIT.min - 0.01 && wide <= UNIT.max + 0.01,
            `${w}x${d} level ${level} zone ${zone}: a unit ${wide.toFixed(1)} m wide`);
        }
      }
    }
  }
});

test("the median commercial lot is a parade, not one shop", () => {
  // The measured premise: 40 m wide, level 1, eleven of them in one city.
  const { form, units } = tradeForm(40, 20, 1, ZONE_COMMERCIAL);
  assert.equal(form, "shops");
  assert.ok(units.length >= 3, `a 40 m high street came out ${units.length} shop(s)`);
  assert.ok(units.every((u) => u.storeys === 1), "a corner shop is one storey");
  // And they are JOINED: a high street has no gaps between the shops.
  assert.ok(units.every((u) => u.party), "the shops in a parade have no party walls");
});

test("a narrow lot still gets one unit rather than none", () => {
  for (const zone of [ZONE_COMMERCIAL, ZONE_INDUSTRIAL]) {
    assert.equal(tradeCount(12, 14, 1, zone), 1);
    assert.ok(tradeForm(12, 14, 1, zone).units[0].u1 > tradeForm(12, 14, 1, zone).units[0].u0);
  }
});

test("a level-3 lot is the one mass the kit has always drawn", () => {
  for (const zone of [ZONE_COMMERCIAL, ZONE_INDUSTRIAL]) {
    for (const level of [3, 4, 7]) {
      const { units } = tradeForm(40, 20, level, zone);
      assert.equal(units.length, 1, `zone ${zone} level ${level} is ${units.length} masses`);
      assert.ok(units[0].storeys >= 3, "a level-3 block is not taller than a parade");
    }
  }
});

test("an industrial shed keeps its yard, and a works does not pretend to", () => {
  // A shed with a loading yard is the silhouette; a shed filling its lot to
  // the kerb is a wall. The yard is the gap between `v1` and the lot line.
  const shed = tradeForm(36, 36, 1, ZONE_INDUSTRIAL).units;
  assert.ok(shed.every((u) => u.v1 <= 0.8), `a shed reaches ${shed[0].v1.toFixed(2)} of the lot`);
  assert.ok(shed.every((u) => u.v0 >= 0.1), "a shed stands on the kerb");
  const works = tradeForm(36, 36, 3, ZONE_INDUSTRIAL).units;
  assert.ok(works[0].v1 > 0.9, "a works does not fill the lot it was given");
});

test("no two units overlap, and none leaves the lot", () => {
  for (const [w, d] of [[20, 20], [40, 20], [36, 36], [20, 36], [12, 14], [56, 20]]) {
    for (const level of [0, 1, 2, 3, 4]) {
      for (const zone of [ZONE_COMMERCIAL, ZONE_INDUSTRIAL]) {
        const { units } = tradeForm(w, d, level, zone);
        const where = `${w}x${d} level ${level} zone ${zone}`;
        for (const u of units) {
          assert.ok(u.u0 >= 0 && u.u1 <= 1 && u.v0 >= 0 && u.v1 <= 1, `${where}: a unit left the lot`);
          assert.ok(u.u1 > u.u0 && u.v1 > u.v0, `${where}: a unit with no size`);
        }
        for (let i = 0; i < units.length; i += 1) {
          for (let j = i + 1; j < units.length; j += 1) {
            const a = units[i];
            const b = units[j];
            const apart = a.u1 <= b.u0 + 1e-9 || b.u1 <= a.u0 + 1e-9
              || a.v1 <= b.v0 + 1e-9 || b.v1 <= a.v0 + 1e-9;
            assert.ok(apart, `${where}: units ${i} and ${j} overlap`);
          }
        }
      }
    }
  }
});

test("the form is a pure function of its arguments", () => {
  // `client/world/` is re-derivable (ruling 032): no clock, no random, no state.
  const once = JSON.stringify(tradeForm(40, 20, 1, ZONE_COMMERCIAL));
  for (let i = 0; i < 5; i += 1) {
    assert.equal(JSON.stringify(tradeForm(40, 20, 1, ZONE_COMMERCIAL)), once);
  }
});

test("the sub-lots sit inside the lot, whichever way it faces", () => {
  // The mapping `homes.js` already had, shared rather than written twice
  // (`sublots.js`): `u` runs along the frontage and `v` back from the street,
  // so getting it backwards puts the delivery yard on the pavement.
  const T = 20;
  for (const frontage of [0, 1, 2, 3]) {
    const lot = {
      id: 7, building: { id: 7, zone: ZONE_COMMERCIAL, level: 1 },
      x0: 100, z0: 200, x1: 100 + 2 * T, z1: 200 + T,
      cx: 100 + T, cz: 200 + T / 2, frontage, frontageLen: 2 * T, seat: 1,
    };
    const { lots } = tradeLots(lot, 1, ZONE_COMMERCIAL);
    assert.ok(lots.length >= 2, `frontage ${frontage}: ${lots.length} unit(s) on a 40 m lot`);
    for (const unit of lots) {
      assert.ok(unit.x0 >= lot.x0 - 1e-6 && unit.x1 <= lot.x1 + 1e-6, `frontage ${frontage}: outside in x`);
      assert.ok(unit.z0 >= lot.z0 - 1e-6 && unit.z1 <= lot.z1 + 1e-6, `frontage ${frontage}: outside in z`);
      assert.equal(unit.building, lot.building, "a sub-lot lost its building");
      assert.equal(unit.frontage, lot.frontage);
    }
    // Each unit is its own thing downstream: the facade hashes on
    // `building.id * 8 + houseIndex`, so a shared index is a parade of clones.
    assert.equal(new Set(lots.map((u) => u.houseIndex)).size, lots.length);
    // The shops run ALONG the street, not back from it.
    const along = frontage === 0 || frontage === 2 ? "x" : "z";
    const spread = new Set(lots.map((u) => Math.round(u[`${along}0`]))).size;
    assert.equal(spread, lots.length, `frontage ${frontage}: the shops are stacked behind each other`);
  }
});

test("what the air sees and what the street sees are the same count", () => {
  // E5's rule: `instances.js` pushes one box per unit and `streets-l3.js` bakes
  // one facade per unit, both from this function.
  for (const [w, d, l, zone] of [[40, 20, 1, 2], [40, 20, 2, 2], [36, 36, 1, 3], [36, 36, 2, 3], [20, 20, 3, 2]]) {
    const lot = {
      id: 3, building: { id: 3, zone, level: l },
      x0: 0, z0: 0, x1: w, z1: d, cx: w / 2, cz: d / 2, frontage: 0, frontageLen: w, seat: 1,
    };
    assert.equal(tradeLots(lot, l, zone).lots.length, tradeCount(w, d, l, zone));
  }
});
