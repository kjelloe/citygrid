// The generated facade spec (slice E5; spec §6.2).
//
// Union Square's facades are authored per building by research agents. City
// Grid has no research, so the spec is DERIVED — which means the thing to test
// is not "does it look right" but "does it say the same thing twice, and does
// it say something different for a shop than for a house". A window is 1.2 m
// wide however tall the building is and a storefront bay is 4 m however long
// the frontage: those are the facts the instanced kit cannot express and this
// exists to express, so they are what is asserted.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { buildingParams } from "../client/world/params.js";
import { facadeSpec, SHOP_NAMES } from "../client/world/facade-spec.js";
import { PALETTES } from "../client/render/palettes.js";
import { familyColour } from "../client/render/palette.js";

const T = DEFAULTS.tileM;
const ZONE = { residential: 1, commercial: 2, industrial: 3, civic: 0 };

function pave(state, tiles) {
  const road = state.tiles.road;
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);

/** One building of a given zone and size, on a street. */
function lotOf({ zone = 1, w = 1, h = 1, level = 2, id = 1 } = {}) {
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  pave(state, row(5, 1, 14));
  const building = {
    id, def: "", zone, x: 4, y: 6, w, h, owner: 1,
    level, valueTier: 1, occupancy: 20, condition: 100, builtTick: 0, flags: 0,
  };
  state.buildings.push(building);
  for (let y = building.y; y < building.y + h; y += 1) {
    for (let x = building.x; x < building.x + w; x += 1) state.tiles.buildingId[tileAt(state.width, x, y)] = id;
  }
  const model = createModel(state);
  const lot = model.lotOf(id);
  const params = buildingParams(building, PALETTES.plain, familyColour(building, PALETTES.plain, false, 0));
  return { state, model, lot, params, building };
}

const specOf = (opts) => {
  const { lot, params } = lotOf(opts);
  return { spec: facadeSpec(lot, params), lot, params };
};

// --- the frame ---------------------------------------------------------------

test("the spec carries the parameters, not a second opinion about them", () => {
  const { spec, params, lot } = specOf({ zone: ZONE.residential, level: 3 });
  assert.equal(spec.storeys, params.storeys);
  assert.equal(spec.floorH, params.floorH);
  assert.equal(spec.groundH, params.groundH);
  assert.equal(spec.wall, params.colour);
  assert.equal(spec.roof.colour, params.roof);
  assert.equal(spec.variant, params.variant);
  // The building the facade builds is the building the box stood on.
  assert.equal(spec.x0, lot.x0);
  assert.equal(spec.x1, lot.x1);
});

test("the same lot gives the same spec twice", () => {
  const { lot, params } = lotOf({ zone: ZONE.commercial, w: 2 });
  assert.deepEqual(facadeSpec(lot, params), facadeSpec(lot, params));
});

test("the street edge is the lot's frontage, and only one edge has a door", () => {
  const { spec, lot } = specOf({ zone: ZONE.residential });
  const street = spec.edges.filter((e) => e.street);
  assert.equal(street.length, 1);
  assert.equal(street[0].side, lot.frontage);
  assert.equal(spec.edges.length, 4, "a building has four walls whatever is on them");
  assert.equal(spec.edges.filter((e) => e.door).length, 1);
});

// --- the module, which is the whole point ------------------------------------

test("a window is the same width on a tall building as on a short one", () => {
  const short = specOf({ zone: ZONE.residential, level: 1 }).spec;
  const tall = specOf({ zone: ZONE.residential, level: 6 }).spec;
  assert.ok(tall.storeys > short.storeys, "the fixture must actually differ in height");
  for (const spec of [short, tall]) {
    for (const edge of spec.edges) assert.equal(edge.window.w, short.edges[0].window.w);
  }
});

test("bays are counted from the frontage, not from the tile", () => {
  const one = specOf({ zone: ZONE.commercial, w: 1 }).spec;
  const two = specOf({ zone: ZONE.commercial, w: 2 }).spec;
  const front = (s) => s.edges.find((e) => e.street);
  assert.ok(front(two).bays > front(one).bays,
    `${front(one).bays} bays on ${front(one).length.toFixed(1)} m, ${front(two).bays} on ${front(two).length.toFixed(1)} m`);
  // A bay is between two thirds and one and a half of its nominal width — the
  // frontage is divided into whole bays, and a bay that drifts outside that is
  // a window that has stretched, which is the thing L3 exists not to do.
  for (const spec of [one, two]) {
    const edge = front(spec);
    const bay = edge.length / edge.bays;
    assert.ok(bay > edge.bayW * 0.66 && bay < edge.bayW * 1.5, `a ${bay.toFixed(2)} m bay against ${edge.bayW} m`);
  }
});

test("a 20 m commercial frontage gets four bays", () => {
  // 20 m of frontage at the 5 m commercial bay width.
  const { spec } = specOf({ zone: ZONE.commercial, w: 1 });
  const edge = spec.edges.find((e) => e.street);
  assert.equal(Math.round(edge.length), T, `the fixture's frontage is ${edge.length} m`);
  assert.equal(edge.bays, 4);
});

// --- what each category is recognised by -------------------------------------

test("a shop has storefronts on its street edge and a house does not", () => {
  const shop = specOf({ zone: ZONE.commercial }).spec;
  const house = specOf({ zone: ZONE.residential }).spec;
  assert.ok(shop.storefronts.length > 0);
  assert.equal(house.storefronts.length, 0);
  for (const front of shop.storefronts) {
    assert.ok(front.to > front.from, "a storefront with no width is a storefront nobody drew");
    assert.ok(SHOP_NAMES.en.includes(front.sign), `"${front.sign}" is not in the name table`);
  }
});

test("a house gets a pitched roof and a shop gets a flat one with a parapet", () => {
  const house = specOf({ zone: ZONE.residential }).spec;
  const shop = specOf({ zone: ZONE.commercial }).spec;
  assert.ok(["gable", "hip", "mansard"].includes(house.roof.kind), house.roof.kind);
  assert.ok(house.roof.eave > 0, "a pitched roof without an overhang casts no shadow line");
  assert.equal(shop.roof.kind, "flat");
  assert.ok(shop.roof.parapet > 0);
});

test("industry is a shed with a sawtooth or a flat roof and no windows on the ground", () => {
  const { spec } = specOf({ zone: ZONE.industrial });
  assert.ok(["sawtooth", "flat"].includes(spec.roof.kind), spec.roof.kind);
  assert.equal(spec.edges.find((e) => e.street).groundWindows, false);
});

test("a civic building has a portico", () => {
  const { spec } = specOf({ zone: ZONE.civic });
  assert.ok(spec.extras.some((e) => e.kind === "portico"), JSON.stringify(spec.extras));
});

test("the name table is data, not a string in the code — in every locale", () => {
  const file = JSON.parse(readFileSync(join(repoRoot, "data", "names.json"), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(SHOP_NAMES)), file.shops);
  const locales = Object.keys(file.shops);
  assert.deepEqual(locales.sort(), ["en", "no"], "a locale has no shop names");
  for (const locale of locales) {
    assert.ok(file.shops[locale].length >= 12, `${locale} has ${file.shops[locale].length} names`);
    for (const name of file.shops[locale]) assert.equal(typeof name, "string");
  }
  // The SAME length in each, or the index a shop is picked by means something
  // different per language and a shop changes name AND neighbours (R2, A40).
  const lengths = new Set(locales.map((l) => file.shops[l].length));
  assert.equal(lengths.size, 1, `the lists are ${[...lengths]} long`);
});

test("a shop keeps its index across a language change (R2)", () => {
  const { lot, params } = lotOf({ zone: ZONE.commercial, w: 2 });
  const english = facadeSpec(lot, params, "en");
  const norsk = facadeSpec(lot, params, "no");
  assert.equal(english.storefronts.length, norsk.storefronts.length);
  for (let i = 0; i < english.storefronts.length; i += 1) {
    const at = SHOP_NAMES.en.indexOf(english.storefronts[i].sign);
    assert.ok(at >= 0);
    assert.equal(norsk.storefronts[i].sign, SHOP_NAMES.no[at],
      "the same shop is a different trade in Norwegian");
  }
  // An unknown locale falls back rather than throwing.
  assert.deepEqual(facadeSpec(lot, params, "fr"), english);
});

// --- what the facade must not do ---------------------------------------------

test("nothing in the spec reaches outside the lot", () => {
  for (const zone of Object.values(ZONE)) {
    const { spec, lot } = specOf({ zone, w: 2, h: 2 });
    for (const edge of spec.edges) {
      assert.ok(edge.length > 0);
      assert.ok(edge.length <= Math.max(lot.x1 - lot.x0, lot.z1 - lot.z0) + 1e-9);
    }
    // The eave is the one thing that hangs over, and the walkthrough gate
    // depends on it staying small enough that the pavement is still walkable.
    assert.ok(spec.roof.eave <= 1, `a ${spec.roof.eave} m eave`);
  }
});

// --- the promise that L2 and L3 are the same house ---------------------------

test("both levels take their colour from one function, not two copies of it", () => {
  const files = ["client/render/instances.js", "client/render/streets-l3.js"];
  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    assert.match(source, /familyColour\(/, `${file} does not go through familyColour`);
  }
  // And it says the same thing for a building whichever level asks.
  const { lot, params } = lotOf({ zone: ZONE.commercial, level: 4 });
  const family = familyColour(lot.building, PALETTES.plain, false, 0);
  const again = buildingParams(lot.building, PALETTES.plain, family);
  assert.equal(again.colour, params.colour);
  assert.equal(again.roof, params.roof);
  assert.equal(again.variant, params.variant);
  assert.equal(facadeSpec(lot, again).wall, again.colour);
});
