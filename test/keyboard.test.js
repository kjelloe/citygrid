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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";

/** The controller's source. These are structural claims — that a binding
 * exists at all — and `a11y_smoke` presses the keys for real. */
const controller = readFileSync(join(repoRoot, "client", "input", "controller.js"), "utf8");

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

// --- the mouse (§13.4, P32) --------------------------------------------------

test("right and middle drag are handled, not dropped", () => {
  // They returned early: the comment said they panned and the code did nothing
  // at all, so right-drag had never worked (P32).
  assert.match(controller, /event\.button === 1 \|\| event\.button === 2/);
  assert.equal(/event\.button === 1 \|\| event\.button === 2\) return;/.test(controller), false,
    "right and middle button events are still dropped");
  assert.match(controller, /drag\.button/, "there is no drag state for the extra buttons");
});

test("right drag ORBITS: sideways turns, up and down tilts", () => {
  // P32 asked for pan and got snapped rotation (N27); P33 reported the button
  // dead and got pan (N28); P34 reported it as doing what the left button
  // already did and asked for rotation AND a changeable view angle. The right
  // button is the orbit, and it is the only control that can tilt the camera.
  const move = controller.slice(controller.indexOf("const onPointerMove"), controller.indexOf("const onPointerUp"));
  const right = move.slice(move.indexOf("if (drag.button === 2)"), move.indexOf("} else"));
  assert.ok(move.includes("if (drag.button === 2)"), "the right button has no branch of its own");
  assert.match(right, /yawBy\(renderer\.view, -dx/, "sideways does not turn the camera");
  assert.match(right, /pitchBy\(renderer\.view, -dy/, "up and down does not tilt the camera");
  assert.equal(/panBy/.test(right), false, "the right button still pans, which is the left button's job");
});

test("middle drag pans", () => {
  // The wheel button is the pan now that the right button orbits. Left, middle
  // and right therefore do three different things, which is the complaint P34
  // actually made.
  const move = controller.slice(controller.indexOf("const onPointerMove"), controller.indexOf("const onPointerUp"));
  const middle = move.slice(move.indexOf("} else {"));
  assert.match(middle, /panBy\(renderer\.view/, "middle drag does not pan");
  assert.match(middle, /clampToMap/, "a middle-drag pan can leave the map behind");
});

test("the keys still snap to the four comfortable angles", () => {
  // Ruling 006 as amended: free rotation on the mouse, the four angles on Q and
  // E. The controller does not do the snapping — `rotate` does — so what is
  // checked here is that the keys go through it and not through `yawBy`.
  assert.match(controller, /event\.key === "q".*rotate\(renderer\.view, -1\)/s);
  assert.match(controller, /event\.key === "e".*rotate\(renderer\.view, 1\)/s);
});

test("a button drag works with a tool in hand", () => {
  // The whole point: they are the desktop equivalent of the second finger, so
  // they must not require putting the tool down first.
  const down = controller.slice(controller.indexOf("const onPointerDown"), controller.indexOf("const onPointerMove"));
  assert.equal(/ui\.tool/.test(down), false, "the extra buttons consult the held tool");
});
