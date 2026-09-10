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
const controller = readFileSync(join(repoRoot, "client", "input", "controller.js"), "utf8");

test("the pitch belongs to the view, not to the module", () => {
  // Ruling 006 fixed the pitch at ~35.26°. The playtest asked to be able to
  // drop the camera towards the ground, which is a deliberate amendment: the
  // pitch moves, and the four snapped YAW angles stay on Q and E.
  assert.match(camera, /pitch: PITCH/, "a new view does not start at the isometric angle");
  // `applyPose` delegates the arithmetic to `client/world/orbit.js` since R1.6,
  // so the pitch is read there — and it has to be read from the VIEW in
  // whichever module does it.
  const orbit = readFileSync(join(repoRoot, "client", "world", "orbit.js"), "utf8");
  const eye = orbit.slice(orbit.indexOf("export function eyeOf("));
  const body = eye.slice(0, eye.indexOf("\n}"));
  assert.match(body, /view\.pitch/, "the eye is not posed from the view's own pitch");
  assert.equal(/Math\.(sin|cos)\(PITCH\)(?!\s*\?\?)/.test(body.replace(/view\.pitch \?\? PITCH/g, "")), false,
    "the eye is still posed from the module constant");
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

// --- one view, two projections (slice V5; ruling 034) ------------------------

test("the four snapped yaws survive the projection", () => {
  // Ruling 034 amends 006 and keeps the thing 006 was actually about: Q, E and
  // the twist land on the four comfortable angles in every mode. A camera that
  // snapped only in orthographic would make the promise "the same city, the
  // same four angles" false the moment anyone tilted.
  assert.match(camera, /export function setMode\(/, "there is no way to change projection");
  const rotate = camera.slice(camera.indexOf("export function rotate("));
  assert.match(rotate.slice(0, rotate.indexOf("\n}")), /Math\.round\(/,
    "rotate no longer snaps from wherever a drag left the camera");
  // `setYawStep` and `pitchBy` are mode-independent: they set the pose, and
  // `applyPose` is the only thing that knows which camera it is posing.
  const pose = camera.slice(camera.indexOf("export function applyPose("));
  assert.match(pose.slice(0, pose.indexOf("\n}")), /mode/,
    "applyPose does not know which projection it is posing");
});

test("the pitch is clamped in both projections", () => {
  // One clamp, applied in `pitchBy`, which neither camera can get around.
  assert.match(camera, /export function pitchBy\(/);
  const body = camera.slice(camera.indexOf("export function pitchBy("));
  assert.match(body.slice(0, body.indexOf("\n}")), /MIN_PITCH/);
  assert.match(body.slice(0, body.indexOf("\n}")), /MAX_PITCH/);
});

test("zoom means the same thing in both: span", () => {
  // `span` stays the single zoom control. Under perspective the eye distance is
  // derived from it, so switching projection does not jump the view — which is
  // what makes the setting a preference rather than a different game.
  // In `orbit.js` since R1.6, with the rest of the eye arithmetic.
  const orbit = readFileSync(join(repoRoot, "client", "world", "orbit.js"), "utf8");
  assert.match(orbit, /verticalSpan\(view\) \/ \(2 \* Math\.tan/,
    "the eye distance is not derived from span");
  // And `span` keeps its meaning: tiles across the SHORTER axis, which on a
  // portrait phone is the width. Deriving the distance as if it were the
  // vertical extent put the phone's camera at the wrong distance and every
  // drag on it missed (slice V5).
  assert.match(orbit, /export function verticalSpan\(/);
  assert.match(camera, /verticalSpan/, "camera.js no longer speaks of the span at all");
  const zoom = camera.slice(camera.indexOf("export function zoomBy("));
  assert.match(zoom.slice(0, zoom.indexOf("\n}")), /view\.span/);
});

test("a pan keeps the ground under the pointer where the pointer is", () => {
  // Under orthographic, pixels convert to tiles by a constant. Under
  // perspective they do not: the same drag moves the ground a long way at the
  // horizon and barely at all under the eye. The controller picks the tile at
  // the start of the drag and pans so it stays under the pointer.
  assert.match(controller, /grabbed/, "there is no grabbed point for a perspective pan");
  assert.match(controller, /mode === "ortho"|mode !== "city"/,
    "the pan does not distinguish the projections");
});

// --- photo mode (slice F1) ---------------------------------------------------
//
// The fourth mode. Source-read for the same reason as the rest of this section:
// `controller.js` is driven by a browser and `tools/play_smoke.mjs` presses the
// real keys on the real page. What is checked here is the shape of the rules —
// a build tool reachable from a camera mode is the defect, and it is one a
// screenshot cannot see.

test("photo mode is a mode everywhere, not a name in one file", () => {
  // Ruling 034: every mode goes through `client/world/orbit.js`, and a mode
  // half the arithmetic has never heard of is priced one way and drawn another.
  assert.match(camera, /MODES = \[[^\]]*"photo"/, "the camera does not know the mode exists");
  const orbit = readFileSync(join(repoRoot, "client", "world", "orbit.js"), "utf8");
  assert.match(orbit, /"photo"/, "eyeOf has no answer for the photo camera");
  const lod = readFileSync(join(repoRoot, "client", "render", "lod.js"), "utf8");
  assert.match(lod, /"photo"/, "the budget has no answer for the photo camera");
  const atmosphere = readFileSync(join(repoRoot, "client", "render", "atmosphere.js"), "utf8");
  assert.match(atmosphere, /"photo"/, "the fog has no answer for the photo camera");
});

test("photo mode owns the keyboard, so no tool can be reached from it", () => {
  // The same rule street mode has and for a stronger reason: a zoning drag from
  // a camera hanging over a roof is a district painted from an angle the player
  // cannot check. The branch returns before any tool key is read.
  const branch = controller.slice(controller.indexOf("if (photo() && !modified)"));
  const body = branch.slice(0, branch.indexOf("\n    }"));
  assert.ok(body.length > 0, "there is no photo branch in the keyboard handler");
  assert.match(body, /Escape/, "there is no way out with the keyboard");
  assert.match(body, /leavePhoto\(\)/, "Escape does not leave");
  assert.match(body, /walkKey\(/, "WASD does not fly the camera");
  assert.match(body, /return;\s*$/m, "the branch falls through to the build keys");
});

test("entering photo mode drops whatever was in hand", () => {
  const entry = controller.slice(controller.indexOf("function enterPhoto("));
  const body = entry.slice(0, entry.indexOf("\n  }"));
  assert.match(body, /setTool\(undefined\)/, "a tool survives into the camera mode");
  assert.match(body, /held\.clear\(\)/, "a held walk key survives into the camera mode");
});

test("the P key and the button do the same thing", () => {
  // Ruling 027: a key without a screen is a feature only the manual has. The
  // button is in `client/ui/hud.js` and both call the controller.
  assert.match(controller, /event\.key === "p" \|\| event\.key === "P"/, "there is no P key");
  const hud = readFileSync(join(repoRoot, "client", "ui", "hud.js"), "utf8");
  assert.match(hud, /onPhoto\?\.\(\)/, "there is no button");
  assert.match(hud, /onLeavePhoto\?\.\(\)/, "there is no way back on the screen");
  // And the way back has to STAY on the screen. Street mode's rule — the one
  // control left is the one that gets you out — and `reach_smoke` is why it is
  // a rule rather than a preference: an opener that hides itself cannot be the
  // toggle that closes it, and a player who cannot find Escape is stuck.
  const css = readFileSync(join(repoRoot, "client", "style.css"), "utf8");
  assert.match(css, /\[data-camera="photo"\] \.hud-top > \*:not\(\.hud-photo\)/,
    "photo mode hides the button that leaves it");
});

test("the four snapped yaws still snap after a mode change", () => {
  // Photo mode leaves a free yaw behind it, the way the mouse does. Q and E
  // have to land back on the four comfortable angles from wherever that is,
  // which is `rotate`'s rounding — asserted above, and asserted here to be
  // reachable from the way photo mode gives the view back.
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  const leave = scene.slice(scene.indexOf("function leavePhoto("));
  const body = leave.slice(0, leave.indexOf("\n  }"));
  assert.match(body, /setProjection\(/, "leaving photo mode does not restore a projection");
  assert.equal(/setProjection\("street"\)/.test(body), false,
    "leaving photo mode can drop the player into the street they never entered");
});

test("the near plane follows the eye, not the path the eye took", () => {
  // `budget_gate`'s photo row put the eye down at street level directly rather
  // than flying it there, and got the CITY's near plane — half a tile, which
  // clips the pavement the camera is standing on. The planes were being chosen
  // when the zoom changed and when a flight crossed the threshold, so any other
  // way of setting the eye left them stale: a jump, a shot list, a gate. They
  // are chosen in `applyPose` now, which every path goes through.
  const pose = camera.slice(camera.indexOf("export function applyPose("));
  assert.match(pose.slice(0, pose.indexOf("\n}")), /applyPlanes\(view\)/,
    "posing the camera does not choose its planes");
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  const fly = scene.slice(scene.indexOf("function flyPhoto("));
  assert.equal(/applyZoom/.test(fly.slice(0, fly.indexOf("\n  }"))), false,
    "flying still rebuilds the frustum by hand, so another path can forget to");
});

test("the photo camera is a rate, like everything else that is held", () => {
  // Ruling 042 §3, and D7's lesson applied before it could be made again: a
  // camera that moves per FRAME travels twice as far on a machine twice as
  // fast.
  const photo = readFileSync(join(repoRoot, "client", "world", "photo.js"), "utf8");
  const step = photo.slice(photo.indexOf("export function photoStep("));
  assert.match(step.slice(0, step.indexOf("\n}")), /\* dt/, "the step is not scaled by the delta");
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  assert.match(scene, /flyPhoto\(drawOptions\.move, dt\)/, "the frame loop does not fly the camera");
});
