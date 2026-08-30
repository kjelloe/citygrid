// The settings model.
//
// Preferences are about this person on this device, so they must NOT reach
// state: hashing them would make two players with different contrast settings
// disagree about the world. The tests below are mostly about that boundary and
// about a stored preference never being able to stop the game starting.

import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTING_ROWS, LANGUAGES, CONTRAST, MOTION, SOUND, LEVELS, SKINS,
  defaultSettings, sanitiseSettings, documentAttributes, mixerSettings,
} from "../client/ui/settings-model.js";
import { LOCALES } from "../client/i18n.js";
import { OPTION_FIELDS } from "../engine/options.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";

test("every language offered is a language that exists", () => {
  for (const language of LANGUAGES) {
    assert.ok(LOCALES.includes(language.value), `${language.value} has no catalogue`);
  }
  assert.equal(LANGUAGES.length, LOCALES.length, "a locale exists that cannot be chosen");
});

test("languages are named in their own language, never translated", () => {
  // Someone stranded in a language they cannot read is looking for the word
  // "Norsk". A picker that translates its own options is unusable to exactly
  // the person who needs it.
  for (const language of LANGUAGES) {
    assert.equal(typeof language.label, "string");
    assert.equal(language.labelKey, undefined, `${language.value} would be translated`);
  }
});

test("no setting is a game option in disguise", () => {
  // A preference that reached the options record would be hashed, and two
  // players with different settings would disagree about the world.
  for (const row of SETTING_ROWS) {
    assert.ok(!OPTION_FIELDS.includes(row.field),
      `${row.field} is a game option, not a preference — it belongs in the lobby`);
  }
});

test("a corrupt stored preference still starts the game", () => {
  // What comes out of localStorage was written by an older build, or by hand.
  assert.deepEqual(sanitiseSettings({ locale: "kl", contrast: "neon", motion: 7 }), defaultSettings());
  assert.deepEqual(sanitiseSettings(undefined), defaultSettings());
  assert.deepEqual(sanitiseSettings({}), defaultSettings());
});

test("the browser's language is the default, when it is one we speak", () => {
  assert.equal(defaultSettings("no").locale, "no");
  assert.equal(defaultSettings("de").locale, "en", "an unknown browser language falls back");
});

test("auto motion hands the question back to the operating system", () => {
  // The attribute has to be ABSENT, not set to something — the media query is
  // what decides, and any value at all would override it.
  assert.equal(documentAttributes({ ...defaultSettings(), motion: "auto" }).motion, "");
  assert.equal(documentAttributes({ ...defaultSettings(), motion: "reduced" }).motion, "reduced");
  assert.equal(documentAttributes({ ...defaultSettings(), motion: "full" }).motion, "full",
    "an explicit request for motion must be expressible, or it cannot beat the OS preference");
});

test("high contrast is off unless it is asked for", () => {
  assert.equal(documentAttributes(defaultSettings()).contrast, "");
  assert.equal(documentAttributes({ ...defaultSettings(), contrast: "high" }).contrast, "high");
});

test("every row has at least two choices and a label", () => {
  for (const row of SETTING_ROWS) {
    assert.ok(row.labelKey, `${row.field} has no label key`);
    assert.ok(row.choices.length >= 2, `${row.field} offers ${row.choices.length} choices`);
    for (const choice of row.choices) {
      assert.ok(choice.label ?? choice.labelKey, `a ${row.field} choice has no label`);
    }
  }
  assert.deepEqual(SETTING_ROWS.map((r) => r.choices), [SKINS, SOUND, LEVELS, LEVELS, LANGUAGES, CONTRAST, MOTION]);
});

// --- audio (slice 4.4) ------------------------------------------------------

test("the mixer is handed values, never the settings object or state", () => {
  // `plan-v1.md`'s gate: audio is derived from state only, and a muted client
  // and a loud one stay hash-identical. The narrow form of that here is that
  // what crosses into the mixer is four numbers and a boolean.
  const settings = { ...defaultSettings(), sound: false, volumeEffects: 100 };
  const forMixer = mixerSettings(settings);
  assert.deepEqual(Object.keys(forMixer).sort(),
    ["sound", "volumeAmbience", "volumeEffects", "volumeMaster"]);
  for (const [key, value] of Object.entries(forMixer)) {
    assert.ok(typeof value === "number" || typeof value === "boolean", `${key} is ${typeof value}`);
  }
  assert.equal(forMixer.sound, false);
});

test("sound is on by default, at a level that does not startle", () => {
  const base = defaultSettings();
  assert.equal(base.sound, true, "a browser blocks sound until a gesture anyway");
  assert.ok(base.volumeEffects > 0 && base.volumeEffects < 100);
  assert.ok(base.volumeAmbience < base.volumeEffects, "ambience sits under the feedback layer");
});

test("a corrupt volume falls back rather than deafening anyone", () => {
  assert.equal(sanitiseSettings({ volumeEffects: 9999 }).volumeEffects, defaultSettings().volumeEffects);
  assert.equal(sanitiseSettings({ sound: "yes" }).sound, true);
  assert.equal(sanitiseSettings({ volumeAmbience: -5 }).volumeAmbience, defaultSettings().volumeAmbience);
});

test("every volume step is a level the mixer can use", () => {
  for (const level of LEVELS) {
    assert.ok(Number.isInteger(level.value) && level.value >= 0 && level.value <= 100, String(level.value));
  }
  assert.equal(LEVELS[0].value, 0, "there must be a way to silence one bus without silencing all sound");
});

test("a skin is chrome only, and clean is the bare stylesheet", () => {
  // Kjell's call (P29): ruling 022 settled the WORLD style; a skin never
  // touches it. `clean` maps to no attribute so the default is the bare
  // `:root` rules rather than a second copy of them.
  assert.equal(documentAttributes({ ...defaultSettings(), skin: "clean" }).skin, "");
  assert.equal(documentAttributes({ ...defaultSettings(), skin: "dark" }).skin, "dark");
  assert.equal(documentAttributes({ ...defaultSettings(), skin: "nonesuch" }).skin, "");
  assert.equal(defaultSettings().skin, "clean");
});

test("every skin the panel offers has rules in the stylesheet", () => {
  // A skin in the menu with no CSS is a control that changes nothing.
  const css = readFileSync(join(repoRoot, "client", "style.css"), "utf8");
  for (const skin of SKINS) {
    if (skin.value === "clean") continue;   // the bare :root
    assert.match(css, new RegExp(`\\[data-skin="${skin.value}"\\]`), `no rules for the ${skin.value} skin`);
  }
});
