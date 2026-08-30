// The controls card (slice N21).
//
// A card that lies is worse than no card, so the tool half is DERIVED from
// `TOOLS` and the fixed half is asserted against the controller's own source.
// The same argument as ruling 027 for strings and 028 for roles: a promise the
// interface makes has to be one the code keeps.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { helpSections, toolKeys, CAMERA_KEYS, ACTION_KEYS } from "../client/ui/help-model.js";
import { TOOLS, toolForKey } from "../client/input/tools.js";

const controller = readFileSync(join(repoRoot, "client", "input", "controller.js"), "utf8");

test("every tool with a shortcut is on the card", () => {
  const listed = new Set(toolKeys().map((row) => row.keys[0].toLowerCase()));
  for (const [name, tool] of Object.entries(TOOLS)) {
    if (tool.key === undefined) continue;
    assert.ok(listed.has(tool.key), `${name} has shortcut '${tool.key}' and the card does not say so`);
  }
  assert.equal(listed.size, toolKeys().length, "the card lists a key twice");
});

test("every tool key the card claims actually selects that tool", () => {
  // The card is derived, so this can only fail if the derivation is wrong —
  // which is exactly the sort of thing that is wrong once.
  for (const row of toolKeys()) {
    assert.notEqual(toolForKey(row.keys[0]), undefined, `'${row.keys[0]}' selects nothing`);
  }
});

test("every fixed binding the card claims is in the controller", () => {
  // Asserted against the source rather than by simulating a browser: this is
  // about the card and the code agreeing, and `a11y_smoke` already presses the
  // keys for real.
  const claims = [
    ["ArrowLeft", /ArrowLeft/],
    ["Q", /event\.key === "q"/],
    ["E", /event\.key === "e"/],
    ["Escape", /event\.key === "Escape"/],
    ["Ctrl-Z", /event\.key === "z"/],
    ["Space", /event\.key === " "/],
    ["+", /event\.key === "\+"/],
    ["?", /event\.key === "\?"/],
  ];
  for (const [name, pattern] of claims) {
    assert.match(controller, pattern, `the card claims ${name} and the controller does not bind it`);
  }
});

test("the card covers the camera, the tools, the actions and the pointer", () => {
  const sections = helpSections();
  assert.equal(sections.length, 4);
  for (const section of sections) {
    assert.ok(section.titleKey, "a section has no title");
    assert.ok(section.rows.length > 0, `${section.titleKey} is empty`);
  }
  // The two things a first-time player is most likely to want.
  const labels = sections.flatMap((s) => s.rows.map((r) => r.labelKey));
  assert.ok(labels.includes("help.undo"));
  assert.ok(labels.includes("help.tapInspect"));
});

test("every string on the card is in both locales", () => {
  const dir = join(repoRoot, "data", "i18n");
  const locales = Object.fromEntries(
    readdirSync(dir).filter((n) => n.endsWith(".json"))
      .map((n) => [n.replace(".json", ""), JSON.parse(readFileSync(join(dir, n), "utf8"))]),
  );
  const keys = ["menu.help", ...helpSections().flatMap((s) => [s.titleKey, ...s.rows.map((r) => r.labelKey)])];
  for (const [name, catalogue] of Object.entries(locales)) {
    const missing = keys.filter((k) => !Object.hasOwn(catalogue, k));
    assert.deepEqual(missing, [], `${name} is missing: ${missing.join(", ")}`);
  }
});

test("double-click focuses, as §13.4 says", () => {
  assert.match(controller, /dblclick/, "§13.4 asks for double-click to focus and nothing binds it");
  assert.match(controller, /onFocusTile/);
});

test("the card names no key twice", () => {
  // Two rows claiming the same key means one of them is wrong, and the reader
  // has no way to tell which.
  const all = [...toolKeys(), ...CAMERA_KEYS, ...ACTION_KEYS]
    .flatMap((row) => row.keys ?? [])
    .map((k) => k.toLowerCase())
    // The arrow keys are one row of four; Ctrl is a modifier, not a binding.
    .filter((k) => !["↑", "↓", "←", "→", "ctrl"].includes(k));
  assert.equal(new Set(all).size, all.length, `a key is claimed twice: ${all.join(" ")}`);
});
