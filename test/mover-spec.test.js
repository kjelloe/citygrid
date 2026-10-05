// A boat is a boat and a train is a train (slice S17).
//
// B3a gave the car three bodies, a glazed cabin and round wheels. Everything
// else that moves is a SLAB: `instances.js` makes the boat, the ferry and the
// carriage out of `slabGeometry`, so a marina is a row of white bricks on the
// water and a train is three grey bricks on the line. The aircraft (T5b) and
// the car are the exceptions — which is why this module is about the rest.
//
// Pure in `(id, config)`: a boat keeps its sail, and two players see one
// harbour.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS } from "../client/world/config.js";
import { moverSpec, MOVER_KINDS, moverCost, MOVER_CEILING } from "../client/world/mover-spec.js";

const partsOf = (spec) => spec.parts.map((p) => p.what);

test("every mover has a spec, and nothing is a bare box", () => {
  for (const kind of MOVER_KINDS) {
    const spec = moverSpec(kind, 1, DEFAULTS);
    assert.ok(spec.parts.length >= 3, `${kind} is ${spec.parts.length} part(s) — that is a slab`);
    assert.ok(spec.length > 0 && spec.width > 0 && spec.height > 0, `${kind} has no size`);
  }
});

test("a mover is the size the config says, because the bridge was measured against it", () => {
  // `boat.hullW/hullH` are in `data/cityviewer.json` because what passes under
  // S13's bridge has to fit under it (`test/boats.test.js` compares the two).
  // A kit that invents its own hull is a kit that can sail through a deck.
  const sail = moverSpec("sailBoat", 1, DEFAULTS);
  assert.equal(sail.width, DEFAULTS.boat.hullW);
  assert.equal(sail.length, DEFAULTS.boat.length);
  const ferry = moverSpec("ferry", 1, DEFAULTS);
  assert.equal(ferry.width, DEFAULTS.boat.ferryW);
  const carriage = moverSpec("carriage", 1, DEFAULTS);
  assert.equal(carriage.width, DEFAULTS.rail.carriageW);
  assert.equal(carriage.length, DEFAULTS.rail.carriageLen);
});

test("a sailing boat has a mast and a sail, above its deck", () => {
  const spec = moverSpec("sailBoat", 7, DEFAULTS);
  assert.ok(partsOf(spec).includes("mast"), "a sailing boat with no mast");
  assert.ok(partsOf(spec).includes("sail"), "a sailing boat with no sail");
  const deck = spec.parts.find((p) => p.what === "deck");
  for (const part of spec.parts.filter((p) => p.what === "mast" || p.what === "sail")) {
    assert.ok(part.y0 >= deck.y1 - 0.01, `the ${part.what} starts below the deck it stands on`);
  }
});

test("a ferry has a superstructure and a funnel, and a cargo ship has containers", () => {
  const ferry = moverSpec("ferry", 3, DEFAULTS);
  assert.ok(partsOf(ferry).includes("superstructure"));
  assert.ok(partsOf(ferry).includes("funnel"));
  const cargo = moverSpec("cargo", 3, DEFAULTS);
  const boxes = cargo.parts.filter((p) => p.what === "container");
  assert.ok(boxes.length >= 3, `a cargo ship with ${boxes.length} container(s)`);
  // Containers by hash, so two ships in one port are not the same ship.
  const other = moverSpec("cargo", 4, DEFAULTS).parts.filter((p) => p.what === "container");
  assert.notDeepEqual(boxes.map((b) => b.z0), other.map((b) => b.z0),
    "every cargo ship carries the same load");
});

test("a carriage stands on bogies and has windows down its side", () => {
  const spec = moverSpec("carriage", 2, DEFAULTS);
  const bogies = spec.parts.filter((p) => p.what === "bogie");
  assert.equal(bogies.length, 2, `a carriage on ${bogies.length} bogie(s)`);
  const body = spec.parts.find((p) => p.what === "body");
  for (const bogie of bogies) {
    assert.ok(bogie.y1 <= body.y0 + 0.01, "a bogie inside the carriage it carries");
    assert.ok(bogie.z0 > -spec.length / 2 && bogie.z1 < spec.length / 2, "a bogie off the end");
  }
  assert.ok(spec.parts.some((p) => p.what === "window"), "a carriage nobody can see out of");
  // And the locomotive is told apart from what it pulls.
  const loco = moverSpec("locomotive", 2, DEFAULTS);
  assert.notEqual(partsOf(loco).join(), partsOf(spec).join(), "the engine is a carriage");
  assert.ok(partsOf(loco).includes("cab"), "a locomotive with no cab");
});

test("nothing is outside its own size, and the cost is inside the ceiling", () => {
  for (const kind of MOVER_KINDS) {
    const spec = moverSpec(kind, 5, DEFAULTS);
    for (const part of spec.parts) {
      assert.ok(part.x0 >= -spec.width / 2 - 0.3 && part.x1 <= spec.width / 2 + 0.3,
        `${kind}: ${part.what} is wider than the ${kind} it is on`);
      assert.ok(part.z0 >= -spec.length / 2 - 0.3 && part.z1 <= spec.length / 2 + 0.3,
        `${kind}: ${part.what} hangs off the end`);
      assert.ok(part.y1 > part.y0, `${kind}: ${part.what} has no height`);
    }
    assert.ok(moverCost(spec) <= MOVER_CEILING[kind],
      `${kind} costs ${moverCost(spec)} triangles against a ceiling of ${MOVER_CEILING[kind]}`);
  }
});

test("a mover is the same mover every time", () => {
  for (const kind of MOVER_KINDS) {
    const once = JSON.stringify(moverSpec(kind, 11, DEFAULTS));
    assert.equal(JSON.stringify(moverSpec(kind, 11, DEFAULTS)), once, `${kind} changed between reads`);
  }
});
