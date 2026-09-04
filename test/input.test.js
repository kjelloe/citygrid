// Input: tile trails, run-length coalescing, and the gesture state machine.
//
// All three are pure, which is deliberate. The DOM half of input is a dozen
// lines of `addEventListener`; everything that can be wrong — a road with holes
// in it, a drag that sends four hundred commands, a pinch that also pans, a tap
// that registers as a drag — is here, and can be tested without a browser.

import test from "node:test";
import assert from "node:assert/strict";
import { tileIndex, lineTiles, rectTiles, toRuns, runsLength } from "../client/input/runs.js";
import { createGestures, down, move, up, cancel } from "../client/input/gestures.js";
import { TOOLS, toolCommand, isAreaTool } from "../client/input/tools.js";
import { AREA_COMMANDS, isAreaCommand } from "../engine/commands.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";

// --- tile trails ------------------------------------------------------------

test("a diagonal drag leaves no holes", () => {
  // Pointer events are SAMPLED. At speed a drag reports tiles five apart, and
  // a road built from the reported tiles alone has gaps in it that the player
  // did not ask for and cannot see until the traffic will not flow.
  const tiles = lineTiles(0, 0, 5, 3);
  assert.equal(tiles[0].x, 0);
  assert.equal(tiles[0].y, 0);
  assert.deepEqual(tiles[tiles.length - 1], { x: 5, y: 3 });
  for (let i = 1; i < tiles.length; i += 1) {
    const step = Math.abs(tiles[i].x - tiles[i - 1].x) + Math.abs(tiles[i].y - tiles[i - 1].y);
    assert.ok(step <= 2, `jumped from ${JSON.stringify(tiles[i - 1])} to ${JSON.stringify(tiles[i])}`);
  }
});

test("a line to itself is one tile, not zero", () => {
  assert.deepEqual(lineTiles(4, 4, 4, 4), [{ x: 4, y: 4 }]);
});

test("lines are symmetric", () => {
  const forward = lineTiles(1, 2, 7, 9).map((t) => `${t.x},${t.y}`).sort();
  const back = lineTiles(7, 9, 1, 2).map((t) => `${t.x},${t.y}`).sort();
  assert.deepEqual(forward, back);
});

test("a rectangle covers its corners whichever way it is dragged", () => {
  const a = rectTiles(5, 5, 3, 2);
  const b = rectTiles(3, 2, 5, 5);
  assert.equal(a.length, 3 * 4);
  assert.deepEqual(a.map((t) => `${t.x},${t.y}`).sort(), b.map((t) => `${t.x},${t.y}`).sort());
});

// --- run-length coalescing --------------------------------------------------

test("a straight horizontal drag is ONE run", () => {
  // The whole point. CLAUDE.md: drag-paint is coalesced into one run-length
  // encoded command, never one per tile crossed. A 40-tile road across the wire
  // is two numbers.
  const width = 128;
  const indices = [];
  for (let x = 10; x < 50; x += 1) indices.push(tileIndex(x, 7, width));
  const runs = toRuns(indices);
  assert.deepEqual(runs, [tileIndex(10, 7, width), 40]);
});

test("runs are sorted and deduplicated", () => {
  // A drag doubles back on itself constantly — the pointer wobbles, and the
  // same tile arrives many times. Sending it twice would charge for it twice.
  const runs = toRuns([9, 7, 8, 7, 7, 10]);
  assert.deepEqual(runs, [7, 4]);
});

test("a gap becomes a second run rather than being papered over", () => {
  const runs = toRuns([3, 4, 5, 20, 21]);
  assert.deepEqual(runs, [3, 3, 20, 2]);
});

test("an empty trail produces no runs", () => {
  assert.deepEqual(toRuns([]), []);
});

test("runs always come in start/length pairs the engine will accept", () => {
  // cellsFromRuns rejects an odd-length array or a run of length <= 0. A client
  // that can emit one has a bug the engine will only report as INVALID.
  const messy = [5, 5, 6, 100, 99, 98, 3];
  const runs = toRuns(messy);
  assert.equal(runs.length % 2, 0, "runs must be pairs");
  for (let i = 1; i < runs.length; i += 2) assert.ok(runs[i] > 0, "a run must have length");
  assert.equal(runsLength(runs), new Set(messy).size, "every distinct tile must survive");
});

test("a vertical drag is one run per row, not one run", () => {
  // Honest failure: indices are row-major, so a vertical line is NOT contiguous
  // and cannot be coalesced. Better that the test says so than that someone
  // later assumes every drag is cheap.
  const width = 64;
  const indices = [];
  for (let y = 0; y < 5; y += 1) indices.push(tileIndex(3, y, width));
  assert.equal(toRuns(indices).length, 10);
});

// --- tools ------------------------------------------------------------------

test("every tool maps to a command the engine actually has", () => {
  for (const [name, tool] of Object.entries(TOOLS)) {
    assert.ok(tool.command, `${name} has no command`);
    assert.equal(typeof tool.command, "string");
  }
});

test("area tools and area commands agree", () => {
  // Two lists that must not drift: a tool marked as area-painting whose command
  // takes a single tile sends runs to something that will not read them.
  for (const [name, tool] of Object.entries(TOOLS)) {
    if (tool.command === undefined) continue;
    assert.equal(isAreaTool(name), isAreaCommand(tool.command),
      `${name} is ${isAreaTool(name) ? "" : "not "}an area tool but its command is ${isAreaCommand(tool.command) ? "" : "not "}an area command`);
  }
});

test("there is a tool for every area command the design exposes", () => {
  const covered = new Set(Object.values(TOOLS).map((t) => t.command));
  const missing = AREA_COMMANDS.filter((c) => !covered.has(c));
  // Demolition requests and nuisance reports are multiplayer tools and arrive
  // with the multiplayer lane; everything a solo player needs is here.
  assert.deepEqual(missing, ["requestDemolition", "reportNuisance"]);
});

test("the road tool builds a road", () => {
  assert.equal(toolCommand("road"), "placeRoad");
  assert.equal(toolCommand("nonsense"), undefined);
});

// --- gestures ---------------------------------------------------------------

const P = (id, x, y) => ({ id, x, y });
const types = (intents) => intents.map((i) => i.type);

test("one pointer with a build tool paints, and a tap builds one tile", () => {
  const g = createGestures({ building: () => true });
  assert.deepEqual(types(down(g, P(1, 100, 100))), ["paintStart"]);
  assert.deepEqual(types(up(g, P(1, 100, 100))), ["paintEnd"]);
});

test("a drag with a build tool paints a trail, not a pan", () => {
  const g = createGestures({ building: () => true });
  down(g, P(1, 100, 100));
  const moved = move(g, P(1, 140, 100));
  assert.deepEqual(types(moved), ["paintTo"]);
  assert.equal(moved[0].x, 140);
  assert.deepEqual(types(up(g, P(1, 140, 100))), ["paintEnd"]);
});

test("one pointer with no build tool pans, and only after the slop", () => {
  // A hand resting on a phone moves a pixel or two. Panning on that makes the
  // map feel like it is sliding away from the player.
  const g = createGestures({ building: () => false, slop: 6 });
  down(g, P(1, 100, 100));
  assert.deepEqual(types(move(g, P(1, 102, 101))), [], "inside the slop nothing happens");
  const panned = move(g, P(1, 120, 100));
  assert.deepEqual(types(panned), ["panBy"]);
  assert.equal(panned[0].dx, 18, "the pan starts from where the slop was broken, not from the press");
});

test("a press and release without movement is a tap, not a pan", () => {
  const g = createGestures({ building: () => false });
  down(g, P(1, 100, 100));
  move(g, P(1, 101, 100));
  assert.deepEqual(types(up(g, P(1, 101, 100))), ["tap"]);
});

test("a second pointer ends painting rather than painting two lines", () => {
  // Pinching to zoom while a build tool is selected must not leave a stray
  // stroke behind, and must not send half a command.
  const g = createGestures({ building: () => true });
  down(g, P(1, 100, 100));
  assert.deepEqual(types(down(g, P(2, 200, 100))), ["paintEnd"]);
});

test("two pointers spreading apart zoom in", () => {
  const g = createGestures({ building: () => false });
  down(g, P(1, 100, 100));
  down(g, P(2, 200, 100));
  const intents = move(g, P(2, 300, 100));
  const zoom = intents.find((i) => i.type === "zoomBy");
  assert.ok(zoom, `expected a zoom, got ${types(intents)}`);
  assert.ok(zoom.factor > 1, "spreading apart should zoom in");
});

test("two pointers twisting past the threshold rotate exactly one step", () => {
  // The camera has four snapped yaw angles (ruling 006), so a twist is a
  // discrete event. Emitting one per frame would spin the world.
  const g = createGestures({ building: () => false, twist: Math.PI / 4 });
  down(g, P(1, 0, 0));
  down(g, P(2, 100, 0));
  const half = move(g, P(2, 71, 71));   // 45 degrees
  const rotations = half.filter((i) => i.type === "rotate");
  assert.equal(rotations.length, 1, `expected one rotate, got ${types(half)}`);
  const again = move(g, P(2, 72, 71));  // a hair further
  assert.equal(again.filter((i) => i.type === "rotate").length, 0, "a twist must not rotate every frame");
});

test("lifting one of two pointers does not jump the map", () => {
  // The classic pinch bug: the remaining finger's position is compared against
  // the two-finger centroid and the map leaps by half the pinch width.
  const g = createGestures({ building: () => false, slop: 6 });
  down(g, P(1, 100, 100));
  down(g, P(2, 300, 100));
  move(g, P(2, 320, 100));
  up(g, P(2, 320, 100));
  const after = move(g, P(1, 108, 100));
  const pan = after.find((i) => i.type === "panBy");
  assert.ok(!pan || Math.abs(pan.dx) < 20, `the map jumped by ${pan?.dx}`);
});

test("cancel ends a stroke so a lost pointer cannot leave one open", () => {
  const g = createGestures({ building: () => true });
  down(g, P(1, 100, 100));
  assert.deepEqual(types(cancel(g)), ["paintEnd"]);
  assert.deepEqual(types(cancel(g)), [], "cancelling twice must not end it twice");
});

test("a stroke that never started does not end", () => {
  const g = createGestures({ building: () => false });
  assert.deepEqual(types(up(g, P(9, 5, 5))), [], "an unknown pointer is ignored");
});

// --- the camera is an orbit now (P34) ----------------------------------------
//
// `camera.js` imports three, which node cannot resolve — the vendored copy is
// reached through the page's importmap. So these read the source, and
// `tools/play_smoke.mjs` drags the real mouse across the real canvas.

const camera = readFileSync(join(repoRoot, "client", "render", "camera.js"), "utf8");

test("the pitch belongs to the view, not to the module", () => {
  // Ruling 006 fixed the pitch at ~35.26°. The playtest asked to be able to
  // drop the camera towards the ground, which is a deliberate amendment: the
  // pitch moves, and the four snapped YAW angles stay on Q and E.
  assert.match(camera, /pitch: PITCH/, "a new view does not start at the isometric angle");
  const pose = camera.slice(camera.indexOf("export function applyPose("));
  const body = pose.slice(0, pose.indexOf("\n}"));
  assert.match(body, /view\.pitch/, "applyPose does not read the view's own pitch");
  assert.equal(/Math\.(sin|cos)\(PITCH\)/.test(body), false,
    "applyPose still poses the camera from the module constant");
});

test("the pitch is clamped at both ends", () => {
  // Straight down is a degenerate lookAt — the up vector and the view direction
  // are parallel — and flat on the ground is a city seen edge-on.
  assert.match(camera, /export function pitchBy\(/);
  assert.match(camera, /MIN_PITCH/);
  assert.match(camera, /MAX_PITCH/);
  const min = /const MIN_PITCH = ([^;]+);/.exec(camera);
  const max = /const MAX_PITCH = ([^;]+);/.exec(camera);
  assert.ok(min && max, "the limits are not readable");
  const value = (expression) => Number(new Function(`return ${expression}`)());
  assert.ok(value(min[1]) > 0, "the camera can reach the horizon");
  assert.ok(value(max[1]) < Math.PI / 2, "the camera can look straight down, which has no up vector");
});

test("the mouse turns the camera freely, the keys still snap", () => {
  // Both, deliberately. Free rotation is what the playtest asked the right
  // button for; the four comfortable angles of ruling 006 are what Q and E are
  // for, and pressing one from any free angle lands back on the grid.
  assert.match(camera, /export function yawBy\(/, "there is no free rotation");
  const rotate = camera.slice(camera.indexOf("export function rotate("));
  assert.match(rotate.slice(0, rotate.indexOf("\n}")), /Math\.round\(/,
    "a key press from a free angle does not land back on the four snapped ones");
});

test("turning past a full circle keeps the yaw finite", () => {
  const yawBy = camera.slice(camera.indexOf("export function yawBy("));
  assert.match(yawBy.slice(0, yawBy.indexOf("\n}")), /Math\.PI \* 2/,
    "the yaw is never wrapped, so it grows without bound");
});
