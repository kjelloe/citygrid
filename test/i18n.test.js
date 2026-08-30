// Ruling 008 — localisation from the first string.
//
// A missing key in one locale must be a red suite, not a runtime fallback.
// Fallbacks hide exactly the strings nobody looks at: error messages and
// edge-case tooltips, which is where a missing translation is most visible
// when it finally appears.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";

const dir = join(repoRoot, "data", "i18n");
const locales = Object.fromEntries(
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => [name.replace(".json", ""), JSON.parse(readFileSync(join(dir, name), "utf8"))]),
);

const names = Object.keys(locales);

test("both launch locales exist", () => {
  assert.ok(names.includes("en"), "English catalogue missing");
  assert.ok(names.includes("no"), "Norwegian catalogue missing");
});

test("locale catalogues have identical key sets", () => {
  const reference = Object.keys(locales.en).sort();
  for (const name of names) {
    const keys = Object.keys(locales[name]).sort();
    const missing = reference.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.includes(key));
    assert.deepEqual(missing, [], `${name} is missing: ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `${name} has keys en does not: ${extra.join(", ")}`);
  }
});

test("no catalogue value is empty", () => {
  for (const name of names) {
    for (const [key, value] of Object.entries(locales[name])) {
      assert.equal(typeof value, "string", `${name}:${key} is not a string`);
      assert.ok(value.trim().length > 0, `${name}:${key} is empty`);
    }
  }
});

test("interpolation tokens match across locales", () => {
  const tokensOf = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(locales.en)) {
    const reference = tokensOf(locales.en[key]);
    for (const name of names) {
      assert.deepEqual(
        tokensOf(locales[name][key]),
        reference,
        `${name}:${key} has different interpolation tokens than en`,
      );
    }
  }
});

test("keys are namespaced, so the catalogue stays navigable as it grows", () => {
  // Hyphens are allowed after the first segment because content ids are
  // kebab-case — `quest.first-road.title`. Renaming those ids to fit a key
  // scheme is not an option: `state.quests.completed` holds them and is hashed,
  // so a rename would move every save's checksum.
  for (const key of Object.keys(locales.en)) {
    assert.match(key, /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/, `${key} is not a dotted key`);
  }
});
