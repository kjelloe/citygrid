// A street of houses, not a row of sheds (S23, 2026-10-13).
//
// S8b re-aimed the compare sheet's terrace row at the densest residential block
// this project's own city has, and what it photographs is detached boxes with
// gaps — against a reference that is a district of terraced housing. Measured
// on the sheet's recipe: **66 residential buildings, 35 of them at level 1**,
// on lots one or two tiles wide, every one free-standing.
//
// The kit could draw a terrace all along — `formFor` returns one at level 2 on
// a lot 26 m wide — but the decision was per LOT, and a terrace is a property
// of a RUN: houses share walls with the houses next door, which are on other
// lots. So the model marks runs and the ladder reads them.

import test from "node:test";
import assert from "node:assert/strict";
import { markRows } from "../client/world/rows.js";
import { formFor, homeForm } from "../client/world/homes.js";

/** Lots in a row along z = 0, each `width` wide with `gap` between them. */
function row(count, { width = 30, gap = 2, frontage = 0, street = "a" } = {}) {
  return Array.from({ length: count }, (unused, i) => ({
    id: i + 1,
    building: { zone: 1, level: 1 },
    x0: i * (width + gap), x1: i * (width + gap) + width,
    z0: 0, z1: 20,
    frontage,
    street: { id: street },
  }));
}

test("lots that touch along one street are a row", () => {
  const lots = row(3);
  markRows(lots, { joinM: 4 });
  assert.deepEqual(lots.map((l) => l.row?.size), [3, 3, 3]);
  assert.deepEqual(lots.map((l) => [Boolean(l.row?.left), Boolean(l.row?.right)]),
    [[false, true], [true, true], [true, false]],
    "the ends of a row are joined on one side and the middle on both");
});

test("a gap wider than the join breaks the row", () => {
  const lots = row(3, { gap: 12 });
  markRows(lots, { joinM: 4 });
  assert.deepEqual(lots.map((l) => l.row?.size ?? 1), [1, 1, 1],
    "twelve metres between two houses is two houses, not a terrace");
});

test("a lot facing another way, or another street, is not in the row", () => {
  const lots = row(3);
  lots[1].frontage = 1;
  markRows(lots, { joinM: 4 });
  assert.equal(lots[0].row?.size ?? 1, 1, "a neighbour that faces the other way is not next door");
  const twoStreets = row(3);
  twoStreets[2].street = { id: "b" };
  markRows(twoStreets, { joinM: 4 });
  assert.equal(twoStreets[2].row?.size ?? 1, 1, "a lot on another street is on another street");
});

test("only houses join: a shop beside a house is not a terrace", () => {
  const lots = row(3);
  lots[1].building = { zone: 2, level: 1 };
  markRows(lots, { joinM: 4 });
  assert.equal(lots[0].row?.size ?? 1, 1);
  assert.equal(lots[2].row?.size ?? 1, 1);
});

test("a lot in a row builds a terrace, where the same lot alone builds a detached house", () => {
  // The whole point: the FORM is the run's, not the lot's.
  assert.equal(formFor(30, 1), "detached", "a lone lot at level 1 is still a detached house");
  assert.equal(formFor(30, 1, { left: true, right: true, size: 3 }), "terrace");
  assert.equal(formFor(30, 1, { left: false, right: true, size: 2 }), "terrace",
    "the end of a row is still in the row");
  // Above level 2 the kit's own answers stand: a city needs somewhere for
  // density to go, and flats and blocks are what the silhouettes are good at.
  assert.equal(formFor(30, 3, { left: true, right: true, size: 3 }), "flats");
  assert.equal(formFor(30, 4, { left: true, right: true, size: 3 }), "block");
});

test("a terrace in a row reaches the lot's edge on the joined side", () => {
  const joined = homeForm(30, 20, 1, { left: true, right: true, size: 3 });
  assert.equal(joined.form, "terrace");
  const first = joined.houses[0];
  const last = joined.houses[joined.houses.length - 1];
  assert.ok(first.u0 <= 0.001, `the row starts at ${first.u0}, not at the lot's edge`);
  assert.ok(last.u1 >= 0.999, `the row ends at ${last.u1}, not at the lot's edge`);
  assert.ok(joined.houses.every((h) => h.party), "a terrace's houses share walls");

  // An end lot keeps its garden on the open side.
  const end = homeForm(30, 20, 1, { left: false, right: true, size: 2 });
  assert.ok(end.houses[0].u0 > 0.001, "the open end of a row is not a party wall");
  assert.ok(end.houses[end.houses.length - 1].u1 >= 0.999, "the joined end reaches the edge");
});
