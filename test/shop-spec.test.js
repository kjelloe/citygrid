// What makes one shop that shop (slice S16b).
//
// S16a divided a 40 m commercial lot into three shop units and the probe that
// followed found their `extras` list EMPTY: a shop has had no furniture at all,
// where a house has had a chimney, a porch, shutters and a downpipe since S9.
// Two things in the spec were already set and read by nobody —
// `storefronts[].awning` (facade-spec.js, since the grammar was written) and
// the interior behind the glass, which S21 left as a card the width of one
// opening, so at an angle a shopper sees past it and out the back of the shop.
//
// Pure in `(id, storeys, variant)` like `house-spec.js`, and tested the same
// way: a shop keeps its awning for life, and two players see one street.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { createModel } from "../client/world/model.js";
import { facadeSpec } from "../client/world/facade-spec.js";
import { buildingParams } from "../client/world/params.js";
import { PALETTES } from "../client/render/palettes.js";
import { shopParts, SHOP_BUDGET } from "../client/world/shop-spec.js";
import { tileAt, adjacencyMask } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";

/** A shop at (6,6) with the street on side `frontage`. */
function shop(frontage = 0, { level = 2, id = 1 } = {}) {
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  const road = state.tiles.road;
  const at = [[6, 5], [7, 6], [6, 7], [5, 6]][frontage];
  const line = frontage % 2 === 0
    ? Array.from({ length: 12 }, (unused, i) => [2 + i, at[1]])
    : Array.from({ length: 12 }, (unused, i) => [at[0], 2 + i]);
  for (const [x, y] of line) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of line) {
    road[tileAt(state.width, x, y)] = NET_PRESENT
      | adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  const building = {
    id, def: "", zone: 2, x: 6, y: 6, w: 1, h: 1, owner: 1,
    level, valueTier: 1, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
  };
  state.buildings.push(building);
  state.tiles.buildingId[tileAt(state.width, 6, 6)] = id;
  const model = createModel(state);
  const lot = model.lotOf(id);
  return { lot, spec: facadeSpec(lot, buildingParams(building, PALETTES.plain, 0x998877)) };
}

const kinds = (parts) => parts.map((p) => p.kind);

test("every shop has an interior behind its glass, whatever else it has", () => {
  // The one part that is not decoration: without it a parade of shops is a
  // carport with signs over it (S21's leftover).
  for (const frontage of [0, 1, 2, 3]) {
    for (const level of [1, 2, 3]) {
      const { spec } = shop(frontage, { level });
      const parts = shopParts(spec);
      assert.ok(kinds(parts).includes("interior"),
        `frontage ${frontage} level ${level}: a shop you can see through`);
    }
  }
});

test("the interior spans the whole frontage, not one opening", () => {
  // The defect it replaces: a card the width of its own hole, which a shopper
  // standing at an angle sees past and out the far side of the building.
  const { spec } = shop(0);
  const interior = shopParts(spec).find((p) => p.kind === "interior");
  const front = spec.edges.find((e) => e.street);
  assert.equal(interior.side, front.side);
  assert.ok(interior.u0 <= 0.5, "the interior starts inside the shopfront");
  assert.ok(interior.u1 >= front.length - 0.5, "the interior stops short of the far end");
  assert.ok(interior.depth > 0.2 && interior.depth < 2, `an interior ${interior.depth} m deep`);
});

test("an awning is drawn only where the storefront asks for one", () => {
  // `storefronts[].awning` has been set since the grammar was written and read
  // by nothing. It is a hash, so a street has some and not all of them.
  let withAwning = 0;
  let asked = 0;
  for (let id = 1; id <= 40; id += 1) {
    const { spec } = shop(0, { id });
    asked += spec.storefronts.filter((s) => s.awning).length;
    const awnings = shopParts(spec).filter((p) => p.kind === "awning");
    withAwning += awnings.length;
    for (const awning of awnings) {
      assert.ok(awning.depth >= 0.8 && awning.depth <= 1.4, `an awning ${awning.depth} m deep`);
      assert.ok(awning.u1 > awning.u0, "an awning with no width");
    }
  }
  assert.equal(withAwning, asked, "the awnings drawn and the awnings asked for are different sets");
  assert.ok(asked > 0 && asked < 40 * 3, `${asked} of 120 bays want an awning — a hash, not a constant`);
});

test("the roof carries its plant, inside the footprint", () => {
  const { lot, spec } = shop(0, { level: 3 });
  const plant = shopParts(spec).filter((p) => p.kind === "roofPlant");
  assert.ok(plant.length > 0, "a flat roof with nothing on it");
  for (const item of plant) {
    assert.ok(item.x > lot.x0 && item.x < lot.x1, "roof plant off the side of the building");
    assert.ok(item.z > lot.z0 && item.z < lot.z1, "roof plant off the back of the building");
    assert.ok(item.h > 0.2 && item.h < 2.2, `a ${item.h} m unit on the roof`);
  }
});

test("the back of the shop is a back: a delivery door and a bin store", () => {
  const { spec } = shop(0, { level: 2 });
  const parts = shopParts(spec);
  const front = spec.edges.find((e) => e.street);
  const back = parts.find((p) => p.kind === "deliveryDoor");
  assert.ok(back, "a shop with no way in for a lorry");
  assert.notEqual(back.side, front.side, "the delivery door is on the shop window");
  assert.ok(kinds(parts).includes("binStore"));
});

test("a shop is the same shop every time, and within its budget", () => {
  for (let id = 1; id <= 20; id += 1) {
    const { spec } = shop(0, { id });
    const once = JSON.stringify(shopParts(spec));
    assert.equal(JSON.stringify(shopParts(spec)), once, "a shop changed between two reads");
    assert.ok(shopParts(spec).length <= SHOP_BUDGET.parts,
      `${shopParts(spec).length} parts on one shop, over the ${SHOP_BUDGET.parts} this budget allows`);
  }
});
