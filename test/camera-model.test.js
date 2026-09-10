// The camera cluster's table (slice K1, ruling 042).
//
// Ruling 042 §1: every camera movement has a button on the screen, in one
// cluster, in every mode, with an i18n key — and "the cluster's buttons and the
// keys drive the same intents; a button that does something a key cannot, or
// the reverse, is a defect."
//
// So this file checks the table that both halves read, and one thing the
// project has never checked at all: that no two live bindings claim the same
// key. F1 took `P` from the pipe tool and the suite stayed green, because
// `test/keyboard.test.js` compares `TOOLS` only against itself and has no idea
// the controller binds keys of its own.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import {
  CAMERA_BUTTONS, CAMERA_MODES, buttonsFor, labelFor, cameraKeys, collisions,
  PAN_SECONDS, TURN_PER_SECOND, ZOOM_PER_SECOND,
} from "../client/ui/camera-model.js";
import { TOOLS } from "../client/input/tools.js";
import { heldFor } from "../client/input/held.js";

const en = JSON.parse(readFileSync(join(repoRoot, "data", "i18n", "en.json"), "utf8"));
const no = JSON.parse(readFileSync(join(repoRoot, "data", "i18n", "no.json"), "utf8"));
const controller = readFileSync(join(repoRoot, "client", "input", "controller.js"), "utf8");

/** The build tools, in the shape `collisions()` wants. They are `city` scope:
 * street and photo mode return before any tool key is read. */
const toolKeys = () => Object.entries(TOOLS)
  .filter(([, tool]) => tool.key !== undefined)
  .map(([name, tool]) => ({ key: tool.key, scope: "city", id: `tool:${name}` }));

test("no two live bindings claim the same key", () => {
  // The check that would have caught F1 stealing `P` from the pipe tool. Scopes
  // are what make it honest rather than merely strict: `W` is the wire tool in
  // the city and forward in the street, which is two scopes and no collision.
  const clashes = collisions(toolKeys());
  assert.deepEqual(clashes, [], clashes.join("; "));
});

test("the hand did not take the key that pauses the game", () => {
  // The work item asked for `Space`. Space toggles the speed, is on the help
  // card and is the most-used key there is — so the hand is `h`, and this test
  // is the record of that being a decision rather than an oversight.
  assert.equal(cameraKeys().some((k) => k.key === " "), false,
    "the camera has taken the pause key");
  assert.ok(cameraKeys().some((k) => k.id === "hand" && k.key === "h"));
});

test("and the pipe tool still has its key", () => {
  // Named, because it is the one that was taken. A regression here is a key
  // that silently stops working, which is the quietest defect there is.
  assert.equal(TOOLS.pipe.key, "p");
  assert.equal(cameraKeys().some((k) => k.key === "p"), false,
    "the camera has taken the pipe tool's shortcut again");
});

test("every button has a label and a hint in both catalogues", () => {
  // Ruling 027. A button whose label falls back to its own key reads as
  // somebody's variable name in lower case with a dot in it.
  for (const button of CAMERA_BUTTONS) {
    const keys = [button.labelKey, button.hintKey,
      ...Object.values(button.labelPerMode ?? {}), ...Object.values(button.hintPerMode ?? {})];
    for (const key of keys) {
      assert.ok(en[key] !== undefined, `en is missing ${key} (${button.id})`);
      assert.ok(no[key] !== undefined, `no is missing ${key} (${button.id})`);
    }
  }
});

test("every button names the modes it appears in, and they are real modes", () => {
  for (const button of CAMERA_BUTTONS) {
    assert.ok(button.modes.length > 0, `${button.id} appears nowhere`);
    for (const mode of button.modes) {
      assert.ok(CAMERA_MODES.includes(mode), `${button.id} claims mode "${mode}"`);
    }
  }
});

test("every mode has a cluster worth showing", () => {
  // Ruling 042 §1 says "in every mode". A mode whose cluster is empty is a mode
  // where the camera is back to being keyboard folklore.
  for (const mode of CAMERA_MODES) {
    const shown = buttonsFor(mode);
    assert.ok(shown.length >= 4, `${mode} shows only ${shown.length} camera buttons`);
    assert.ok(shown.some((b) => b.intent === "pan"), `${mode} has no way to move`);
  }
});

test("a button that repeats says how fast, and one that does not says nothing", () => {
  // Ruling 042 §3: held is a rate, per second. A repeat with no rate is a
  // button whose speed is whatever the frame rate happens to be — the defect
  // D7 spent a slice removing from the traffic.
  for (const button of CAMERA_BUTTONS) {
    if (button.repeats) {
      assert.ok(typeof button.rate === "number" && button.rate > 0,
        `${button.id} repeats with rate ${button.rate}`);
    } else {
      assert.equal(button.rate, undefined, `${button.id} does not repeat but carries a rate`);
    }
  }
});

test("the rates are per second and in the units their intent uses", () => {
  // Named constants rather than numbers in the table, so the cluster and the
  // held keys (K2) cannot come to disagree about what "a pan" is.
  assert.ok(PAN_SECONDS > 1 && PAN_SECONDS < 20, `${PAN_SECONDS}s to cross the span`);
  assert.ok(TURN_PER_SECOND > 0 && TURN_PER_SECOND < Math.PI, `${TURN_PER_SECOND} rad/s`);
  assert.ok(ZOOM_PER_SECOND > 0 && ZOOM_PER_SECOND < 4, `${ZOOM_PER_SECOND} doublings/s`);
});

test("the pad is labelled for what it does in each mode", () => {
  // One control, three jobs: pan in the city, walk in the street, fly in photo.
  // The label is what changes, because it is the same intent about the same
  // hand — and a player who has learnt the pad in one mode has learnt it in all.
  const pad = CAMERA_BUTTONS.find((b) => b.id === "pan");
  assert.notEqual(labelFor(pad, "street"), labelFor(pad, "city"));
  assert.notEqual(labelFor(pad, "photo"), labelFor(pad, "city"));
  assert.equal(labelFor(pad, "ortho"), labelFor(pad, "city"));
});

test("every key the table claims is one the controller actually binds", () => {
  // Ruling 042 §1's "a button that does something a key cannot, or the reverse,
  // is a defect", from the key's side. `controller.js` is driven by a browser,
  // so this reads the source — the same way the rest of the input tests do.
  const bound = (key) => {
    // Held keys live in `client/input/held.js` since K2 — a table the controller
    // asks, the way the mouse buttons are a table it asks. That IS the binding,
    // and `test/input.test.js` checks the two tables agree about every one.
    if (heldFor(key)) return true;
    // Named keys reach the source either quoted (`event.key === "Home"`) or as
    // an object key in a lookup (`ArrowLeft: [-1, 0]`), and both are bindings.
    if (key.length === 1) return new RegExp(`"\\${key}"|"${key}"`, "i").test(controller);
    return controller.includes(`"${key}"`) || new RegExp(`\\b${key}\\s*:`).test(controller);
  };
  const missing = cameraKeys().map((k) => k.key).filter((k) => !bound(k));
  assert.deepEqual([...new Set(missing)], [], `the controller binds none of: ${missing.join(", ")}`);
});

test("the cluster covers every movement the camera has", () => {
  // The audit ruling 042 was written after: pan, rotate, tilt, zoom, home,
  // street, photo. If the camera grows a movement, it grows a button.
  const intents = new Set(CAMERA_BUTTONS.map((b) => b.intent));
  assert.deepEqual([...intents].sort(),
    ["hand", "home", "pan", "photo", "rotate", "street", "tilt", "zoom"]);
});

test("the table is data — no functions, nothing to remember", () => {
  for (const button of CAMERA_BUTTONS) {
    for (const [key, value] of Object.entries(button)) {
      const kind = Array.isArray(value) ? "array" : typeof value;
      assert.ok(["string", "number", "boolean", "array", "object"].includes(kind),
        `${button.id}.${key} is a ${kind}`);
      assert.notEqual(kind, "function", `${button.id}.${key} is a function`);
    }
  }
});
