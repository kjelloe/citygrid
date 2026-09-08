// The reference compare sheet's camera specs (slice D4).
//
// The sheet itself is a picture and is judged by eye, on purpose — it is a
// measure of how far the target is, not a pass or a fail. What *can* be checked
// is that each capture is aimed at something: a view that names a reference
// nobody has, or a pitch outside the camera's own limits, produces a sheet whose
// left half and right half are not comparable, and the sheet cannot say so.
//
// The other half of this file is the check the reachability sweep taught: a
// reference added to `debugging/` and matched by no view is a picture nobody
// looked at, and it looks exactly like a picture that passed.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VIEWS } from "../tools/compare_sheet.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const references = () => readdirSync(join(root, "debugging"))
  .filter((name) => /^transport-world-.*\.png$/.test(name));

test("every reference in debugging/ is matched by exactly one view", () => {
  // The lane's whole point is the comparison. A reference Kjell added and
  // nothing aims at is the same failure as a command with no control
  // (ruling 026): absent, and silent about it.
  const matched = VIEWS.map((v) => v.reference).sort();
  assert.deepEqual(matched, references().sort());
});

test("every view names a reference that is actually there", () => {
  for (const view of VIEWS) {
    assert.ok(existsSync(join(root, "debugging", view.reference)),
      `${view.id} names ${view.reference}, which does not exist`);
  }
});

test("the pitch is inside the camera's own limits", () => {
  // `client/render/camera.js` clamps to 12°–82°. A view outside that is not a
  // view, it is the clamp — and the sheet would report the angle it asked for.
  for (const view of VIEWS) {
    assert.ok(view.pitch >= 12 && view.pitch <= 82, `${view.id}: pitch ${view.pitch}`);
  }
});

test("the span and the focus fit the map the view shoots on", () => {
  // A span wider than the map is a picture of the void around it, and D1 already
  // spent a step learning that two spans past the map's width are one
  // measurement printed twice.
  for (const view of VIEWS) {
    assert.ok(view.span >= 8 && view.span <= view.size, `${view.id}: span ${view.span} on ${view.size}`);
    assert.ok(view.fx > 0 && view.fx < view.size && view.fy > 0 && view.fy < view.size,
      `${view.id}: focus ${view.fx},${view.fy} on ${view.size}`);
  }
});

test("the shot holds long enough for the streets to fill", () => {
  // The local traffic sim spawns one car per link per frame and the harness
  // draws `frames` of them. Ninety was a second and a half and came back with
  // four cars in shot beside a reference full of them.
  for (const view of VIEWS) {
    assert.ok(view.frames >= 120, `${view.id}: ${view.frames} frames`);
  }
});

test("the city is played, not seeded", () => {
  // The saturated fixture's buildings are 1,129 copies of one `res` definition,
  // pushed straight into the array because zoning growth produced none (Q72).
  // It is the right fixture for what a frame COSTS and the wrong one for what
  // the game looks like, which is the only thing this sheet is about.
  for (const view of VIEWS) {
    assert.ok(view.years >= 25, `${view.id}: ${view.years} years is not a town yet`);
  }
});

test("the views are the real camera's modes and the real styles", () => {
  for (const view of VIEWS) {
    assert.ok(["city", "ortho"].includes(view.mode), `${view.id}: mode ${view.mode}`);
    assert.ok(["plain", "painted", "pixel"].includes(view.style), `${view.id}: style ${view.style}`);
    assert.ok(["day", "dusk", "night", "dawn"].includes(view.time), `${view.id}: time ${view.time}`);
  }
});

test("each view says in words what it is pointed at", () => {
  // The caption is the half of the sheet a reader uses. A row with no note is a
  // picture beside a picture with nothing said about why they are next to each
  // other.
  const ids = VIEWS.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, ids.join(", "));
  for (const view of VIEWS) {
    assert.ok(view.note.length > 20, `${view.id}: "${view.note}"`);
  }
});

test("the specs are data — nothing to run, nothing to remember", () => {
  for (const view of VIEWS) {
    for (const [key, value] of Object.entries(view)) {
      assert.ok(["string", "number", "boolean"].includes(typeof value),
        `${view.id}.${key} is a ${typeof value}`);
    }
  }
});
