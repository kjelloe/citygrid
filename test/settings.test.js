// The settings model.
//
// Preferences are about this person on this device, so they must NOT reach
// state: hashing them would make two players with different contrast settings
// disagree about the world. The tests below are mostly about that boundary and
// about a stored preference never being able to stop the game starting.

import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTING_ROWS, LANGUAGES, CONTRAST, MOTION, SOUND, LEVELS, SKINS, QUALITY, TIERS, CAMERA,
  defaultSettings, sanitiseSettings, documentAttributes, mixerSettings,
} from "../client/ui/settings-model.js";
import { LOCALES } from "../client/i18n.js";
import { OPTION_FIELDS } from "../engine/options.js";
import { getConfig } from "../client/world/config.js";
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
  assert.deepEqual(SETTING_ROWS.map((r) => r.choices),
    [QUALITY, CAMERA, SKINS, SOUND, LEVELS, LEVELS, LANGUAGES, CONTRAST, MOTION]);
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

// --- the quality tier (slice V2, ruling 040) --------------------------------

test("the tier is offered, and it is three choices", () => {
  const row = SETTING_ROWS.find((r) => r.field === "quality");
  assert.ok(row, "there is no quality row");
  assert.deepEqual(row.choices.map((c) => c.value), TIERS);
  assert.deepEqual(TIERS, ["low", "medium", "high"]);
});

test("the tier defaults from the device, and a phone does not get High", () => {
  // `deviceClass()` has existed and been unused since N12. The mapping is pure
  // and lives in config.js so this module never touches `navigator`.
  assert.equal(defaultSettings("en", "phone-weak").quality, "low");
  assert.equal(defaultSettings("en", "phone").quality, "medium");
  assert.equal(defaultSettings("en", "desktop-weak").quality, "medium");
  assert.equal(defaultSettings("en", "desktop").quality, "high");
  assert.equal(defaultSettings("en", "who-knows").quality, "medium",
    "an unknown device must not be given the most expensive tier");
});

test("a stored tier survives a round trip, and a bad one does not stop the game", () => {
  assert.equal(sanitiseSettings({ quality: "low" }, "en", "desktop").quality, "low");
  assert.equal(sanitiseSettings({ quality: "ultra" }, "en", "phone").quality, "medium",
    "an unknown tier fell through to something other than the device default");
  assert.equal(sanitiseSettings({}, "en", "phone-weak").quality, "low");
});

test("the tier is a preference, never a game option", () => {
  // Ruling 040: rendering only. A tier in the options record would be hashed,
  // and two players on different tiers would desync on the first month tick.
  assert.equal(OPTION_FIELDS.includes("quality"), false);
});

test("every tier names every knob, and they are ordered", () => {
  const { tiers } = getConfig();
  const knobs = ["budget", "pixelRatio", "antialias", "shadowMap", "shadows",
    "streetChunks", "carCap", "pedCap", "post", "frameMs"];
  for (const name of TIERS) {
    for (const knob of knobs) {
      assert.ok(Object.hasOwn(tiers[name], knob), `tier ${name} has no ${knob}`);
    }
  }
  assert.ok(tiers.low.budget < tiers.medium.budget && tiers.medium.budget < tiers.high.budget);
  assert.ok(tiers.low.streetChunks < tiers.medium.streetChunks);
  assert.equal(tiers.low.shadows, false, "the cheapest tier still pays for shadows");
  assert.equal(tiers.high.carCap, 0, "0 means uncapped (ruling 040)");
  assert.ok(tiers.high.frameMs < tiers.low.frameMs, "the high tier aims at a slower frame");
});

test("no tier knob is a simulation knob", () => {
  // The whole of ruling 040. Map size advice stays with deviceClass (011).
  const { tiers } = getConfig();
  for (const name of TIERS) {
    for (const knob of Object.keys(tiers[name])) {
      assert.equal(/size|seed|difficulty|sample|tick|traffic(?!Cap)/i.test(knob), false,
        `tier knob ${knob} sounds like the simulation`);
    }
  }
});

// --- the projection (slice V5, ruling 034) ----------------------------------

test("the projection is offered, and a coarse pointer gets the flat one", () => {
  // Ruling 034: perspective is the play camera, orthographic stays for the
  // phone. A perspective orbit on a small screen with a finger is harder to aim
  // than a diagram, and the diagram is what ruling 006 was protecting.
  const row = SETTING_ROWS.find((r) => r.field === "camera");
  assert.ok(row, "there is no camera row");
  assert.deepEqual(row.choices.map((c) => c.value), ["city", "ortho"]);
  assert.equal(defaultSettings("en", "desktop", false).camera, "city");
  assert.equal(defaultSettings("en", "phone", true).camera, "ortho");
  assert.equal(sanitiseSettings({ camera: "isometric" }, "en", "desktop", false).camera, "city",
    "an unknown projection did not fall back");
  assert.equal(sanitiseSettings({ camera: "ortho" }, "en", "desktop", false).camera, "ortho");
});

test("the projection is a preference, never a game option", () => {
  assert.equal(OPTION_FIELDS.includes("camera"), false);
});
