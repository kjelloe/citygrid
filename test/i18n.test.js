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

/**
 * Keys whose Norwegian is deliberately the same as its English.
 *
 * Each one is a word a Norwegian has looked at and kept, with the reason. This
 * is not somewhere to put a string that has not been translated yet: the whole
 * point of the check below is that "the catalogue is complete" and "the
 * catalogue is Norwegian" are different claims, and the first one has been true
 * since slice 4.2 while the second has not (A21).
 */
const SAME_IN_BOTH = {
  "app.title": "the game's name, a proper noun",
  "lobby.size.standard": "Standard is the same word in Norwegian",
  "lobby.size.region": "Region is the same word in Norwegian",
  "lobby.seedIs": "Region again, and the rest of the line is a token",
  "building.park": "Park is the same word in Norwegian",
  "disaster.storm": "Storm is the same word in Norwegian",
  "overlay.auto": "Auto is the same word in Norwegian",
  "hud.slot.auto": "Auto again",
  "skin.retro": "Retro is the same word in Norwegian",
  "alert.disasterStruck.named": "the whole string is one interpolation token",
  "camera.pad.fly": "Fly is the same word in Norwegian",
};

// --- the Norwegian pass (slice M4) -------------------------------------------
//
// Key parity has been enforced since slice 4.2, and it is the wrong question on
// its own: `t()` returns its own argument on a miss, so a catalogue can be
// complete and still be English. A21 has said "Norwegian is drafted, not
// reviewed" since N12, and nothing could see it.
//
// A value byte-identical to its English is either a word that is the same in
// both languages or a line nobody translated, and only a person can tell those
// apart — so the allow-list is the list of words a Norwegian has looked at and
// kept. It is not a way to make this test green.

test("no Norwegian string is its English twin, except where that was chosen", () => {
  const en = locales.en;
  const no = locales.no;
  const same = Object.keys(en).filter((key) => en[key] === no[key]);
  const unexplained = same.filter((key) => !Object.hasOwn(SAME_IN_BOTH, key));
  assert.deepEqual(unexplained, [],
    `untranslated, or the same word in both — say which in SAME_IN_BOTH: ${unexplained.join(", ")}`);
});

test("the allow-list has no entries for strings that have since been translated", () => {
  // The direction that rots. A key translated later must leave the list in the
  // same commit, or the list stops describing the catalogue.
  const stale = Object.keys(SAME_IN_BOTH).filter((key) => locales.en[key] !== locales.no[key]);
  assert.deepEqual(stale, [], `translated now, and still on the list: ${stale.join(", ")}`);
});

test("the allow-list has no entries for keys that are gone", () => {
  const missing = Object.keys(SAME_IN_BOTH).filter((key) => !Object.hasOwn(locales.en, key));
  assert.deepEqual(missing, [], `SAME_IN_BOTH names keys that no longer exist: ${missing.join(", ")}`);
});

test("every entry on the allow-list says why", () => {
  for (const [key, why] of Object.entries(SAME_IN_BOTH)) {
    assert.ok(typeof why === "string" && why.length > 8, `${key} has no reason on it`);
  }
});

test("the shop names are two different lists, not one copied twice", () => {
  // `data/names.json` is not in the i18n catalogue — R2 gave it `{en, no}` (A40)
  // and nothing checks it. A shop called the same thing in both languages is a
  // shop nobody named.
  const names = JSON.parse(readFileSync(join(repoRoot, "data", "names.json"), "utf8"));
  assert.equal(names.shops.en.length, names.shops.no.length, "the two lists are different lengths");
  const identical = names.shops.en.filter((name, i) => name === names.shops.no[i]);
  assert.ok(identical.length < names.shops.en.length / 3,
    `${identical.length} of ${names.shops.en.length} shop names are the same in both: ${identical.join(", ")}`);
});
