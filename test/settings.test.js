// The settings model.
//
// Preferences are about this person on this device, so they must NOT reach
// state: hashing them would make two players with different contrast settings
// disagree about the world. The tests below are mostly about that boundary and
// about a stored preference never being able to stop the game starting.

import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTING_ROWS, LANGUAGES, CONTRAST, MOTION,
  defaultSettings, sanitiseSettings, documentAttributes,
} from "../client/ui/settings-model.js";
import { LOCALES } from "../client/i18n.js";
import { OPTION_FIELDS } from "../engine/options.js";

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
  assert.deepEqual(SETTING_ROWS.map((r) => r.choices), [LANGUAGES, CONTRAST, MOTION]);
});
