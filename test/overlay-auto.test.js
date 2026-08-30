// "Auto": show me the layer I am working in (P29).
//
// The playtest that asked for this was really reporting three rendering bugs —
// zoning, power lines and water mains were not drawn at all — and those are
// fixed. Auto stays because the overlay answers a question the map cannot: not
// "is there a wire here" but "is this lot actually SUPPLIED", which is the
// question you have while holding the wire tool.

import test from "node:test";
import assert from "node:assert/strict";
import { AUTO, resolveOverlay, autoTarget, toolsWithOverlay } from "../client/ui/auto-overlay.js";
import { OVERLAY_NAMES } from "../client/ui/overlays.js";
import { TOOLS } from "../client/input/tools.js";

test("Auto follows the tool in hand", () => {
  assert.equal(resolveOverlay(AUTO, "zoneResidential"), "zoning");
  assert.equal(resolveOverlay(AUTO, "zoneCommercial"), "zoning");
  assert.equal(resolveOverlay(AUTO, "dezone"), "zoning");
  assert.equal(resolveOverlay(AUTO, "wire"), "power");
  assert.equal(resolveOverlay(AUTO, "pipe"), "water");
  assert.equal(resolveOverlay(AUTO, "road"), "traffic");
});

test("Auto shows nothing when nothing is held", () => {
  // Putting the tool down clears the map. An overlay that stayed on after the
  // work was done would be a filter the player has to remember to remove.
  assert.equal(resolveOverlay(AUTO, undefined), undefined);
  assert.equal(resolveOverlay(AUTO, "bulldoze"), undefined,
    "the bulldozer is about the ground itself, not a layer");
  assert.equal(resolveOverlay(AUTO, "building"), undefined);
});

test("a chosen overlay beats the tool", () => {
  // A player who asked for pollution wants pollution, whatever is in their
  // hand. Auto is the ONLY mode that follows the tool.
  assert.equal(resolveOverlay("pollution", "wire"), "pollution");
  assert.equal(resolveOverlay("crime", "zoneResidential"), "crime");
  assert.equal(resolveOverlay(undefined, "wire"), undefined,
    "no overlay chosen means no overlay, even with a tool held");
});

test("every layer Auto can pick is a real overlay", () => {
  // A mapping to an overlay that does not exist would draw nothing and look
  // exactly like a tool that has no layer.
  for (const tool of toolsWithOverlay()) {
    const target = autoTarget(tool);
    assert.ok(OVERLAY_NAMES.includes(target), `${tool} maps to '${target}', which is not an overlay`);
  }
});

test("every tool Auto knows about is a real tool", () => {
  // The other direction: a mapping for a renamed tool is dead weight that
  // looks like a working binding.
  for (const tool of toolsWithOverlay()) {
    assert.ok(Object.hasOwn(TOOLS, tool), `Auto maps '${tool}', which is not a tool`);
  }
});

test("Auto is not itself an overlay name", () => {
  // It is a MODE. If it collided with an overlay the menu would have two
  // entries that look the same and behave differently.
  assert.equal(OVERLAY_NAMES.includes(AUTO), false);
});

test("the tools that change supply all have a layer", () => {
  // The three the playtest named. A tool that changes what is supplied and
  // shows no layer is the gap Auto exists to close.
  for (const tool of ["wire", "pipe", "zoneResidential"]) {
    assert.notEqual(autoTarget(tool), undefined, `${tool} has no layer`);
  }
});
