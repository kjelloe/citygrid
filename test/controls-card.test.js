// The first-run controls card, and the two look paths behind it (slice K3, A58).
//
// Kjell asked for "freelook without buttons ... but add overlay for first time
// players". A scheme with no buttons in it has nothing on screen for ruling 027
// to point at, so the card IS the control's screen — and a card that names a
// binding the code does not have is worse than no card at all (the argument
// `test/help.test.js` already makes for the help sheet).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { POINTER_ROWS } from "../client/ui/controls-card.js";
import { CAMERA_BUTTONS } from "../client/ui/camera-model.js";
import { SETTING_ROWS, defaultSettings, sanitiseSettings } from "../client/ui/settings-model.js";

const read = (...parts) => readFileSync(join(repoRoot, ...parts), "utf8");
const controller = read("client", "input", "controller.js");
const cluster = read("client", "ui", "camera-cluster.js");
const catalogues = ["en", "no"].map((l) => ({
  locale: l, keys: JSON.parse(read("data", "i18n", `${l}.json`)),
}));

test("every string the card shows is in both catalogues", () => {
  const used = POINTER_ROWS.flatMap((row) => [row.keysKey, row.labelKey])
    .concat(["controls.title", "controls.dismiss", "controls.reopen"]);
  for (const { locale, keys } of catalogues) {
    for (const key of used) {
      assert.equal(typeof keys[key], "string", `${locale} has no "${key}"`);
    }
  }
});

test("the card can be put away for good and brought back", () => {
  // Both halves of Kjell's answer. The "don't show this again" is easy; the
  // way back is the half that is easy to leave out and impossible to discover
  // without.
  assert.equal(defaultSettings().controlsCard, true, "a fresh browser sees it once");
  assert.equal(sanitiseSettings({ controlsCard: false }).controlsCard, false,
    "a dismissal that does not survive sanitising is a card that comes back forever");
  assert.ok(SETTING_ROWS.some((row) => row.field === "controlsCard"),
    "there is no way back to the card from Settings");
});

test("the controller has both look paths, not one", () => {
  // Pointer Lock where it is granted, drag-look where it is not — and the
  // fallback reachable on purpose, or it could only be argued about.
  assert.match(controller, /requestPointerLock/, "nothing ever asks for the lock");
  assert.match(controller, /looksNow\(/, "the look decision is not the pure one");
  assert.match(controller, /movementX/, "a locked pointer has no offsetX; nothing reads movementX");
  assert.match(controller, /pointerlockchange/, "a lock lost to Escape is never noticed");
});

test("every camera button the cluster draws has a glyph of its own", () => {
  // The hand shipped as "•" for a slice, which is what a missing entry in the
  // glyph map looks like: a button that is on screen, reachable, labelled, and
  // says nothing. Two earlier glyphs rendered as tofu, so the map is where
  // this cluster's mistakes live.
  const map = cluster.slice(cluster.indexOf("const GLYPH = {"), cluster.indexOf("};", cluster.indexOf("const GLYPH = {")));
  for (const button of CAMERA_BUTTONS) {
    if (button.id === "pan") continue;   // the pad has its own four arrows
    assert.match(map, new RegExp(`["']?${button.id}["']?\\s*:`), `${button.id} has no glyph`);
  }
});
