// Keyboard operation (gamedesign.md §30, slice 4.5).
//
// The pure halves: where an arrow key goes in a toolbar, and which tool a key
// selects. Both existed only as promises before this slice — four rows carried
// `role="toolbar"`, which announces one tab stop and arrow-key navigation, and
// had neither. A promise assistive technology repeats is worse than an absence.

import test from "node:test";
import assert from "node:assert/strict";
import { nextIndex } from "../client/ui/roving.js";
import { TOOLS, toolForKey } from "../client/input/tools.js";

test("the arrows walk a toolbar in both axes", () => {
  // A toolbar that wraps to two rows on a phone is read vertically by some
  // people and horizontally by others, so both pairs move.
  assert.equal(nextIndex(0, 5, "ArrowRight"), 1);
  assert.equal(nextIndex(0, 5, "ArrowDown"), 1);
  assert.equal(nextIndex(3, 5, "ArrowLeft"), 2);
  assert.equal(nextIndex(3, 5, "ArrowUp"), 2);
});

test("the arrows wrap rather than dead-ending", () => {
  // The part that is always subtly wrong, and the reason this is a pure
  // function rather than three lines inside a listener.
  assert.equal(nextIndex(4, 5, "ArrowRight"), 0);
  assert.equal(nextIndex(0, 5, "ArrowLeft"), 4);
});

test("Home and End jump to the ends", () => {
  assert.equal(nextIndex(3, 5, "Home"), 0);
  assert.equal(nextIndex(1, 5, "End"), 4);
});

test("a key the pattern does not own is left alone", () => {
  // Returning -1 rather than a position is what stops the handler swallowing
  // Tab and Enter in the name of fixing the toolbar.
  for (const key of ["Tab", "Enter", " ", "a", "Escape"]) {
    assert.equal(nextIndex(0, 5, key), -1, `${key} should not be handled`);
  }
  assert.equal(nextIndex(0, 0, "ArrowRight"), -1, "an empty toolbar has nowhere to go");
});

test("every frequent tool has a shortcut, and no two share one", () => {
  // §13.3 asks for shortcuts for frequent tools. `building` is deliberately
  // without one: which building it places is a parameter, so a single key
  // could not say.
  const keyed = Object.entries(TOOLS).filter(([, tool]) => tool.key !== undefined);
  assert.ok(keyed.length >= 8, `only ${keyed.length} tools have a shortcut`);
  const keys = keyed.map(([, tool]) => tool.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate shortcuts: ${keys.join(", ")}`);
  for (const [name, tool] of keyed) {
    assert.equal(tool.key, tool.key.toLowerCase(), `${name}'s shortcut is not lower case`);
    assert.equal(tool.key.length, 1, `${name}'s shortcut is not one character`);
  }
});

test("a shortcut is found whatever the shift state, and never with a modifier", () => {
  assert.equal(toolForKey("r"), "road");
  assert.equal(toolForKey("R"), "road", "caps lock is not a different keyboard");
  // Ctrl-R is the browser's reload and Cmd-P is print. Taking either would be
  // stealing a key the player expects to work.
  assert.equal(toolForKey("r", true), undefined);
  assert.equal(toolForKey("p", true), undefined);
});

test("an unbound key selects nothing rather than the first tool", () => {
  assert.equal(toolForKey("x"), undefined);
  assert.equal(toolForKey("Escape"), undefined, "a named key is not a one-character key");
  assert.equal(toolForKey(""), undefined);
  assert.equal(toolForKey(undefined), undefined);
});

test("the zone shortcuts are digits, not R, C and I", () => {
  // R, C and I are the demand bars everywhere in the design and in every
  // screenshot of it. A player pressing R means the road tool.
  assert.equal(toolForKey("r"), "road");
  assert.equal(TOOLS.zoneResidential.key, "1");
  assert.equal(TOOLS.zoneCommercial.key, "2");
  assert.equal(TOOLS.zoneIndustrial.key, "3");
});
